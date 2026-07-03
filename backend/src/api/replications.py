from src import configure_logger, get_logger, tenant_context
from sqlalchemy import create_engine
import os
from fastapi.routing import APIRouter
from fastapi import Depends, Query, HTTPException, status
import sqlmodel
from datetime import datetime
from src.models import *
from src import *
from src.utils import get_db_session, get_user_info
from src.replication_manager import ReplicationManager
from src.services.worker import run_replication

engine = create_engine(os.environ["DATABASE_URL"])
configure_logger(engine, service_name="api.replications")
logger = get_logger("api.replications")

router = APIRouter(prefix="/replications", tags=["Replication Management"])


@router.post("/add", response_model=ApiResponse)
def add_replication(
    request: AddReplicationRequest,
    db_session: sqlmodel.Session = Depends(get_db_session),
    user_info: UserInfo = Depends(get_user_info),
):
    with tenant_context(tenant_id=user_info.tenant_id, service_name="api.replications"):
        logger.info(
            "add_replication_request_received",
            source_id=request.source_id,
            target_source_ids=request.target_source_ids,
            destination_id=request.destination_id,
            schedule=request.schedule,
        )

        try:
            replication_manager = ReplicationManager(db_session)
            replication = replication_manager.create_replication(
                tenant_id=user_info.tenant_id,
                name=request.name
                or f"Replication created at: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                source_id=request.source_id,
                target_source_ids=request.target_source_ids,
                destination_id=request.destination_id,
                keep_n=request.keep_n,
                schedule=request.schedule,
                is_active=True,
            )
            logger.info(
                "replication_created_success", replication_id=replication.id
            )
            return ApiResponse(
                message="Replication added successfully",
                data={"replication_id": replication.id},
            )
        except ValueError as e:
            logger.warning("add_replication_validation_error", error=str(e))
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        except Exception as e:
            logger.error(
                "failed_to_add_replication", error=str(e), exc_info=True
            )
            raise


@router.get("/list", response_model=ApiResponse)
def list_replications(
    db_session: sqlmodel.Session = Depends(get_db_session),
    user_info: UserInfo = Depends(get_user_info),
):
    with tenant_context(tenant_id=user_info.tenant_id, service_name="api.replications"):
        logger.info("list_replications_request_received")

        try:
            replication_manager = ReplicationManager(db_session)
            replications = replication_manager.list_replications(
                tenant_id=user_info.tenant_id
            )
            return ApiResponse(
                message="Replications retrieved successfully",
                data={"replications": replications},
            )
        except Exception as e:
            logger.error("list_replications_failed", error=str(e), exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to retrieve replications",
            )


@router.post("/update", response_model=ApiResponse)
def update_replication(
    request: UpdateReplicationRequest,
    db_session: sqlmodel.Session = Depends(get_db_session),
    user_info: UserInfo = Depends(get_user_info),
):
    with tenant_context(tenant_id=user_info.tenant_id, service_name="api.replications"):
        logger.info(
            "update_replication_request_received",
            replication_id=request.replication_id,
        )

        try:
            replication_manager = ReplicationManager(db_session)
            existing = replication_manager.get_replication(
                replication_id=request.replication_id,
                tenant_id=user_info.tenant_id,
            )
            if not existing:
                raise HTTPException(status_code=404, detail="Replication not found")

            replication_manager.update_replication(
                replication_id=request.replication_id,
                tenant_id=user_info.tenant_id,
                name=request.name,
                source_id=request.source_id,
                target_source_ids=request.target_source_ids,
                destination_id=request.destination_id,
                keep_n=request.keep_n,
                schedule=request.schedule,
                is_active=request.is_active,
            )
            logger.info(
                "replication_updated_success",
                replication_id=request.replication_id,
            )
            return ApiResponse(message="Replication updated successfully")
        except HTTPException:
            raise
        except ValueError as e:
            logger.warning("update_replication_validation_error", error=str(e))
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        except Exception as e:
            logger.error(
                "failed_to_update_replication",
                replication_id=request.replication_id,
                error=str(e),
                exc_info=True,
            )
            raise


@router.delete("/delete", response_model=ApiResponse)
def delete_replication(
    replication_id: int = Query(),
    db_session: sqlmodel.Session = Depends(get_db_session),
    user_info: UserInfo = Depends(get_user_info),
):
    with tenant_context(tenant_id=user_info.tenant_id, service_name="api.replications"):
        logger.info(
            "delete_replication_request_received", replication_id=replication_id
        )

        try:
            replication_manager = ReplicationManager(db_session)
            ok = replication_manager.delete_replication(
                replication_id, user_info.tenant_id
            )
            if not ok:
                raise HTTPException(status_code=404, detail="Replication not found")
            logger.info(
                "replication_deleted_success", replication_id=replication_id
            )
            return ApiResponse(message="Replication deleted successfully")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                "failed_to_delete_replication",
                replication_id=replication_id,
                error=str(e),
                exc_info=True,
            )
            raise


@router.post("/toggle", response_model=ApiResponse)
def toggle_replication(
    replication_id: int = Query(),
    db_session: sqlmodel.Session = Depends(get_db_session),
    user_info: UserInfo = Depends(get_user_info),
):
    with tenant_context(tenant_id=user_info.tenant_id, service_name="api.replications"):
        logger.info(
            "toggle_replication_request_received", replication_id=replication_id
        )

        try:
            replication_manager = ReplicationManager(db_session)
            replication = replication_manager.toggle_replication(
                replication_id, user_info.tenant_id
            )
            if not replication:
                raise HTTPException(status_code=404, detail="Replication not found")
            return ApiResponse(
                message="Replication toggled successfully",
                data={"is_active": replication.is_active},
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(
                "failed_to_toggle_replication",
                replication_id=replication_id,
                error=str(e),
                exc_info=True,
            )
            raise


@router.put("/run", response_model=ApiResponse)
def run_replication_now(
    replication_id: int = Query(),
    db_session: sqlmodel.Session = Depends(get_db_session),
    user_info: UserInfo = Depends(get_user_info),
):
    with tenant_context(tenant_id=user_info.tenant_id, service_name="api.replications"):
        logger.info(
            "run_replication_request_received", replication_id=replication_id
        )

        replication_manager = ReplicationManager(db_session)
        replication = replication_manager.get_replication(
            replication_id, user_info.tenant_id
        )
        if not replication:
            raise HTTPException(status_code=404, detail="Replication not found")

        try:
            task = run_replication.apply_async(
                kwargs={
                    "replication_id": replication_id,
                    "tenant_id": user_info.tenant_id,
                    "triggered_by": "manual",
                },
                ignore_result=True,
            )
            logger.info(
                "replication_task_queued",
                task_id=task.id,
                replication_id=replication_id,
                trigger_type="manual",
                persist_db=True,
            )
            return ApiResponse(message="Replication is being executed")
        except Exception as e:
            logger.error(
                "run_replication_failed",
                replication_id=replication_id,
                error=str(e),
                exc_info=True,
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to queue replication",
            )
