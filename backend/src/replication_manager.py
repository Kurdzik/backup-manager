from datetime import datetime
from typing import Dict, List, Optional

from sqlmodel import Session, select

from src.models import Replication as ReplicationModel
from src.models import ReplicationTarget, Source
from src.backup_schedule_manager import notify_scheduler_reload


class ReplicationManager:
    def __init__(self, session: Session) -> None:
        self.session = session

    def _notify_scheduler_reload(self) -> None:
        notify_scheduler_reload()

    def _validate_targets(
        self,
        tenant_id: str,
        source_id: int,
        target_source_ids: List[int],
    ) -> Source:
        if not target_source_ids:
            raise ValueError("At least one replication target is required")

        source = self.session.exec(
            select(Source).where(
                (Source.id == source_id) & (Source.tenant_id == tenant_id)
            )
        ).first()
        if not source:
            raise ValueError(f"Source {source_id} not found")

        seen: set[int] = set()
        for target_id in target_source_ids:
            if target_id == source_id:
                raise ValueError("Replication target cannot be the same as the source")
            if target_id in seen:
                raise ValueError(f"Duplicate replication target: {target_id}")
            seen.add(target_id)

            target = self.session.exec(
                select(Source).where(
                    (Source.id == target_id) & (Source.tenant_id == tenant_id)
                )
            ).first()
            if not target:
                raise ValueError(f"Target source {target_id} not found")
            if target.source_type != source.source_type:
                raise ValueError(
                    f"Target {target_id} has type {target.source_type}, "
                    f"expected {source.source_type}"
                )

        return source

    def create_replication(
        self,
        tenant_id: str,
        name: str,
        source_id: int,
        target_source_ids: List[int],
        destination_id: int,
        keep_n: int,
        schedule: str,
        is_active: bool = True,
    ) -> ReplicationModel:
        self._validate_targets(tenant_id, source_id, target_source_ids)

        replication = ReplicationModel(
            tenant_id=tenant_id,
            name=name,
            source_id=source_id,
            destination_id=destination_id,
            keep_n=keep_n,
            schedule=schedule,
            is_active=is_active,
        )
        self.session.add(replication)
        self.session.commit()
        self.session.refresh(replication)

        for target_id in target_source_ids:
            self.session.add(
                ReplicationTarget(
                    replication_id=replication.id,
                    target_source_id=target_id,
                )
            )
        self.session.commit()

        self._notify_scheduler_reload()
        return replication

    def get_replication(
        self, replication_id: int, tenant_id: str
    ) -> Optional[ReplicationModel]:
        statement = select(ReplicationModel).where(
            (ReplicationModel.id == replication_id)
            & (ReplicationModel.tenant_id == tenant_id)
        )
        return self.session.exec(statement).first()

    def get_target_ids(self, replication_id: int) -> List[int]:
        rows = self.session.exec(
            select(ReplicationTarget).where(
                ReplicationTarget.replication_id == replication_id
            )
        ).all()
        return [row.target_source_id for row in rows]

    def list_replications(
        self, tenant_id: str, is_active: Optional[bool] = None
    ) -> List[Dict]:
        statement = select(ReplicationModel).where(
            ReplicationModel.tenant_id == tenant_id
        )
        if is_active is not None:
            statement = statement.where(ReplicationModel.is_active == is_active)

        replications = self.session.exec(statement).all()

        results: List[Dict] = []
        for replication in replications:
            target_ids = self.get_target_ids(replication.id)
            results.append(
                {
                    "id": replication.id,
                    "name": replication.name,
                    "source_id": replication.source_id,
                    "target_source_ids": target_ids,
                    "destination_id": replication.destination_id,
                    "keep_n": replication.keep_n,
                    "schedule": replication.schedule,
                    "is_active": replication.is_active,
                    "last_run": replication.last_run,
                    "next_run": replication.next_run,
                    "created_at": replication.created_at,
                    "updated_at": replication.updated_at,
                }
            )
        return results

    def update_replication(
        self,
        replication_id: int,
        tenant_id: str,
        name: Optional[str] = None,
        source_id: Optional[int] = None,
        target_source_ids: Optional[List[int]] = None,
        destination_id: Optional[int] = None,
        keep_n: Optional[int] = None,
        schedule: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> Optional[ReplicationModel]:
        replication = self.get_replication(replication_id, tenant_id)
        if not replication:
            return None

        effective_source_id = source_id if source_id is not None else replication.source_id
        if target_source_ids is not None or source_id is not None:
            targets_to_check = (
                target_source_ids
                if target_source_ids is not None
                else self.get_target_ids(replication_id)
            )
            self._validate_targets(tenant_id, effective_source_id, targets_to_check)

        if name is not None:
            replication.name = name
        if source_id is not None:
            replication.source_id = source_id
        if destination_id is not None:
            replication.destination_id = destination_id
        if keep_n is not None:
            replication.keep_n = keep_n
        if schedule is not None:
            replication.schedule = schedule
        if is_active is not None:
            replication.is_active = is_active

        replication.updated_at = datetime.now()
        self.session.add(replication)
        self.session.commit()
        self.session.refresh(replication)

        if target_source_ids is not None:
            existing = self.session.exec(
                select(ReplicationTarget).where(
                    ReplicationTarget.replication_id == replication_id
                )
            ).all()
            for row in existing:
                self.session.delete(row)
            self.session.commit()
            for target_id in target_source_ids:
                self.session.add(
                    ReplicationTarget(
                        replication_id=replication_id,
                        target_source_id=target_id,
                    )
                )
            self.session.commit()

        self._notify_scheduler_reload()
        return replication

    def delete_replication(self, replication_id: int, tenant_id: str) -> bool:
        replication = self.get_replication(replication_id, tenant_id)
        if not replication:
            return False

        targets = self.session.exec(
            select(ReplicationTarget).where(
                ReplicationTarget.replication_id == replication_id
            )
        ).all()
        for target in targets:
            self.session.delete(target)

        self.session.delete(replication)
        self.session.commit()
        self._notify_scheduler_reload()
        return True

    def toggle_replication(
        self, replication_id: int, tenant_id: str
    ) -> Optional[ReplicationModel]:
        replication = self.get_replication(replication_id, tenant_id)
        if not replication:
            return None

        replication.is_active = not replication.is_active
        replication.updated_at = datetime.now()
        self.session.add(replication)
        self.session.commit()
        self.session.refresh(replication)
        self._notify_scheduler_reload()
        return replication

    def update_last_run(
        self, replication_id: int, tenant_id: str, last_run: datetime
    ) -> Optional[ReplicationModel]:
        replication = self.get_replication(replication_id, tenant_id)
        if not replication:
            return None

        replication.last_run = last_run
        replication.updated_at = datetime.now()
        self.session.add(replication)
        self.session.commit()
        self.session.refresh(replication)
        return replication
