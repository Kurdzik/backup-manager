from src.backup_source.elasticsearch import ElasticsearchBackupManager
from src.backup_source.minio import MinIOBackupManager
from src.backup_source.mongodb import MongoDBBackupManager
from src.backup_source.mysql import MySQLBackupManager
from src.backup_source.neo4j import Neo4jBackupManager
from src.backup_source.postgres import PostgresBackupManager
from src.backup_source.qdrant import QdrantBackupManager
from src.backup_source.vault import VaultBackupManager
from src.base import BaseBackupManager, Credentials
from typing import Optional


class BackupManager:
    def __init__(self, credentials: Credentials, version: Optional[str] = None):
        self.credentials = credentials
        self.version = version

    def create_from_type(self, source_type: str) -> BaseBackupManager:
        map_ = {
            "vault": VaultBackupManager,
            "qdrant": QdrantBackupManager,
            "postgres": PostgresBackupManager,
            "elasticsearch": ElasticsearchBackupManager,
            "mysql": MySQLBackupManager,
            "mongodb": MongoDBBackupManager,
            "minio": MinIOBackupManager,
            "neo4j": Neo4jBackupManager,
        }

        return map_[source_type](self.credentials, self.version)
