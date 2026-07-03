from pydantic import BaseModel
from typing import Any, List, Optional, Literal
from pydantic import Field
from src.models import Credentials


class ApiResponse(BaseModel):
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    detail: str
    request_id: Optional[str] = None


class RegisterUserRequest(BaseModel):
    username: str
    password: str
    password2: str


class LoginUserRequest(BaseModel):
    username: str
    password: str


class ResetPasswordRequest(BaseModel):
    username: str
    old_password: str
    new_password: str
    new_password2: str


class UpdateUserSettingsRequest(BaseModel):
    log_retention_period_d: int = Field(ge=1)
    log_size: int = Field(ge=1)
    compression_enabled: bool
    encryption_enabled: bool
    gotify_enabled: bool
    gotify_url: Optional[str] = None
    gotify_token: Optional[str] = None


class SaveEncryptionKeyRequest(BaseModel):
    public_key: str


class RestoreBackupRequest(BaseModel):
    backup_source_id: int
    backup_destination_id: int
    backup_path: str
    private_key: Optional[str] = None


class AddBackupSourceRequest(BaseModel):
    source_type: Literal[
        "vault",
        "qdrant",
        "postgres",
        "elasticsearch",
        "mysql",
        "mongodb",
        "minio",
        "neo4j",
    ]
    source_name: Optional[str] = None
    version: Optional[str] = None
    credentials: Credentials


class UpdateBackupSourceRequest(BaseModel):
    source_id: int
    source_name: Optional[str] = None
    version: Optional[str] = None
    credentials: Optional[Credentials] = None


class AddBackupDestinationRequest(BaseModel):
    destination_type: Literal["s3", "local_fs", "sftp", "smb"]
    destination_name: Optional[str] = None
    credentials: Credentials
    config: Optional[dict[str, str]] = None


class UpdateBackupDestinationRequest(BaseModel):
    destination_id: int
    destination_name: Optional[str] = None
    credentials: Optional[Credentials] = None
    config: Optional[dict[str, str]] = None


class CreateScheduleBackupRequest(BaseModel):
    schedule_name: str
    backup_source_id: int
    backup_destination_id: int
    backup_schedule: str
    keep_n: int


class UpdateScheduleBackupRequest(BaseModel):
    schedule_id: int
    schedule_name: str
    backup_source_id: int
    backup_destination_id: int
    backup_schedule: str
    is_active: bool
    keep_n: int


class AddReplicationRequest(BaseModel):
    name: str
    source_id: int
    target_source_ids: List[int] = Field(min_length=1)
    destination_id: int
    schedule: str
    keep_n: int = Field(ge=1)


class UpdateReplicationRequest(BaseModel):
    replication_id: int
    name: Optional[str] = None
    source_id: Optional[int] = None
    target_source_ids: Optional[List[int]] = None
    destination_id: Optional[int] = None
    schedule: Optional[str] = None
    keep_n: Optional[int] = Field(default=None, ge=1)
    is_active: Optional[bool] = None
