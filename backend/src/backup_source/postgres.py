import os
import subprocess
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

import psycopg2

from src import get_logger
from src.base import BaseBackupManager, Credentials

logger = get_logger("postgres_backup")

_SUBPROCESS_TIMEOUT = int(os.environ.get("BACKUP_TASK_TIMEOUT_SECONDS", 14400)) - 120


class PostgresBackupManager(BaseBackupManager):
    def __init__(self, credentials: Credentials, version=None) -> None:
        super().__init__(credentials, version)
        self.connection_params = self._parse_connection_params()

    def _parse_connection_params(self) -> dict:
        """Parse connection parameters from credentials

        Returns:
            dict: Connection parameters for psycopg2
        """
        parsed_url = urlparse(self.credentials.url)

        params = {
            "host": parsed_url.hostname or "localhost",
            "port": parsed_url.port or 5432,
            "user": self.credentials.login or parsed_url.username or "postgres",
            "password": self.credentials.password or parsed_url.password,
            "database": parsed_url.path.lstrip("/") or "postgres",
        }

        return {k: v for k, v in params.items() if v is not None}

    def _get_db_size_bytes(self) -> Optional[int]:
        try:
            conn = psycopg2.connect(**self.connection_params)
            cursor = conn.cursor()
            cursor.execute("SELECT pg_database_size(current_database())")
            size = cursor.fetchone()[0]
            cursor.close()
            conn.close()
            return size
        except Exception:
            return None

    def create_backup(
        self, tenant_id: str, backup_source_id: int, schedule_id: Optional[int] = None
    ) -> str:
        """Create backup of all Postgres databases using pg_dump

        Returns:
            str: Path to the locally created backup file
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = f"/mnt/backups/postgres_backup_usr={tenant_id}_sch={schedule_id}_src={backup_source_id}_created_at={timestamp}.sql"

        db_size_bytes = self._get_db_size_bytes()
        if db_size_bytes is not None:
            db_size_gb = db_size_bytes / (1024 ** 3)
            estimated_minutes = db_size_gb * 20  # ~20 min per GB at typical network/disk speeds
            logger.info(
                "backup_size_estimate",
                db_size_gb=round(db_size_gb, 2),
                estimated_minutes=round(estimated_minutes),
            )

        # Build pg_dump command
        env = os.environ.copy()
        if self.connection_params.get("password"):
            env["PGPASSWORD"] = self.connection_params["password"]

        cmd = [
            "pg_dump",
            "-h",
            self.connection_params.get("host", "localhost"),
            "-p",
            str(self.connection_params.get("port", 5432)),
            "-U",
            self.connection_params.get("user", "postgres"),
            "-F",
            "c",  # Custom format for better compression and restoration
            "--no-owner",
            "--no-privileges",
            "-v",
            "-f",
            backup_path,
            self.connection_params.get("database", "postgres"),
        ]

        try:
            result = subprocess.run(
                cmd, env=env, capture_output=True, text=True, check=True,
                timeout=_SUBPROCESS_TIMEOUT,
            )

            if not os.path.exists(backup_path):
                raise RuntimeError(f"Backup file was not created: {result.stderr}")

            return backup_path

        except subprocess.TimeoutExpired:
            raise RuntimeError(
                f"pg_dump timed out after {_SUBPROCESS_TIMEOUT}s. "
                f"Raise BACKUP_TASK_TIMEOUT_SECONDS to allow more time."
            )
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"pg_dump failed: {e.stderr}")

    def test_connection(self) -> bool:
        """Test whether the Postgres database is reachable

        Returns:
            bool: True if connection is successful, False otherwise
        """
        try:
            conn = psycopg2.connect(**self.connection_params)
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.close()
            conn.close()
            return True
        except psycopg2.Error as e:
            print(f"Connection test failed: {str(e)}")
            return False
        except Exception as e:
            print(f"Connection test failed: {str(e)}")
            return False

    def restore_from_backup(self, backup_path: str) -> None:
        """Restore PostgreSQL database from backup

        Uses pg_restore with --clean and --if-exists flags to drop and
        recreate database objects before restoring. This is the PostgreSQL
        recommended approach.

        Args:
            backup_path: Path to the backup file (custom format)
        """
        if not os.path.exists(backup_path):
            raise FileNotFoundError(f"Backup file not found: {backup_path}")

        target_db = self.connection_params.get("database", "postgres")

        env = os.environ.copy()
        if self.connection_params.get("password"):
            env["PGPASSWORD"] = self.connection_params["password"]

        cmd = [
            "pg_restore",
            "-h",
            self.connection_params.get("host", "localhost"),
            "-p",
            str(self.connection_params.get("port", 5432)),
            "-U",
            self.connection_params.get("user", "postgres"),
            "-d",
            target_db,
            "--clean",
            "--if-exists",
            "--no-owner",
            "--no-privileges",
            "-v",
            backup_path,
        ]

        try:
            subprocess.run(cmd, env=env, capture_output=True, text=True, check=True)
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"pg_restore failed: {e.stderr}")
