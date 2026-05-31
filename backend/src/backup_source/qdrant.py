import os
import tarfile
import tempfile
import requests
from datetime import datetime
from typing import Optional, Dict, Any

from qdrant_client import QdrantClient
from src.logger import get_logger
from qdrant_client.http import models 

from src.base import BaseBackupManager, Credentials

logger = get_logger()

class QdrantBackupManager(BaseBackupManager):
    def __init__(self, credentials: Credentials) -> None:
        super().__init__(credentials)
        self.credentials = credentials

        if credentials.api_key:
            self.client = QdrantClient(
                url=credentials.url, api_key=credentials.api_key, timeout=36000
            )
        elif credentials.login and credentials.password:
            self.client = QdrantClient(
                url=credentials.url, api_key=credentials.login, timeout=36000
            )
        else:
            self.client = QdrantClient(url=credentials.url, timeout=36000)

    def test_connection(self) -> bool:
        """Test whether the Qdrant instance is reachable"""
        try:
            self.client.get_collections()
            return True
        except Exception as e:
            logger.info(f"Connection test failed: {str(e)}")
            return False

    def _get_request_headers(self) -> Dict[str, str]:
        """Helper to construct headers for direct API calls (requests)"""
        headers = {}
        if self.credentials.api_key:
            headers["api-key"] = self.credentials.api_key
        return headers
    
    def _get_base_url(self) -> str:
        """Helper to ensure clean base URL"""
        return self.credentials.url.rstrip("/")

    def create_backup(
        self, tenant_id: str, backup_source_id: int, schedule_id: Optional[int] = None
    ) -> str:
        """Create backup of all Qdrant collections using the Snapshots API."""
        temp_dir = tempfile.mkdtemp()
        base_url = self._get_base_url()
        headers = self._get_request_headers()

        try:
            collections_response = self.client.get_collections()

            if not collections_response.collections:
                raise ValueError("No collections found in Qdrant")

            for collection in collections_response.collections:
                collection_name = collection.name
                logger.info(f"Processing collection: {collection_name}")

                snapshot_info = self.client.create_snapshot(collection_name=collection_name)
                snapshot_name = snapshot_info.name

                download_url = f"{base_url}/collections/{collection_name}/snapshots/{snapshot_name}"
                local_snapshot_path = os.path.join(temp_dir, f"{collection_name}.snapshot")

                auth = None
                if not self.credentials.api_key and self.credentials.login:
                    auth = (self.credentials.login, self.credentials.password)

                with requests.get(download_url, headers=headers, auth=auth, stream=True) as r:
                    r.raise_for_status()
                    with open(local_snapshot_path, 'wb') as f:
                        for chunk in r.iter_content(chunk_size=8192):
                            f.write(chunk)

                self.client.delete_snapshot(collection_name, snapshot_name)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = f"qdrant_backup_usr={tenant_id}_sch={schedule_id}_src={backup_source_id}_created_at={timestamp}.tar.gz"

            with tarfile.open(backup_path, "w:gz") as tar:
                tar.add(temp_dir, arcname="qdrant_backup")

            return backup_path

        finally:
            for file in os.listdir(temp_dir):
                os.remove(os.path.join(temp_dir, file))
            os.rmdir(temp_dir)

    def restore_from_backup(self, backup_path: str) -> None:
            import shutil
            import tarfile
            import json

            temp_dir = tempfile.mkdtemp()
            base_url = self._get_base_url()
            headers = self._get_request_headers()

            try:
                with tarfile.open(backup_path, "r:*") as tar:
                    tar.extractall(temp_dir)

                snapshot_files = []
                for root, _, files in os.walk(temp_dir):
                    for f in files:
                        if f.endswith(".snapshot"):
                            snapshot_files.append(os.path.join(root, f))

                if not snapshot_files:
                    raise ValueError(f"No .snapshot files found in archive: {backup_path}")

                for snapshot_path in snapshot_files:
                    filename = os.path.basename(snapshot_path)
                    collection_name = filename.replace(".snapshot", "")
                    
                    logger.info(f"Analyzing snapshot for: {collection_name}")

                    # Read vector config from collection_config.json inside the snapshot tarball
                    vector_config = None
                    try:
                        with tarfile.open(snapshot_path, "r") as s_tar:
                            config_file = s_tar.extractfile("collection_config.json")
                            if config_file:
                                config_data = json.loads(config_file.read())
                                vector_config = config_data.get("params", {}).get("vectors")
                                logger.info(f"Detected schema for {collection_name}: {vector_config}")
                    except Exception as e:
                        logger.warning(f"Could not sniff config for {collection_name}, falling back: {e}")

                    if not vector_config:
                        vector_config = models.VectorParams(size=1024, distance=models.Distance.COSINE)

                    auth = None
                    if not self.credentials.api_key and self.credentials.login:
                        auth = (self.credentials.login, self.credentials.password)

                    try:
                        self.client.delete_collection(collection_name)
                    except Exception:
                        pass

                    self.client.create_collection(
                        collection_name=collection_name,
                        vectors_config=vector_config
                    )

                    upload_url = f"{base_url}/collections/{collection_name}/snapshots/upload"
                    with open(snapshot_path, "rb") as f:
                        response = requests.post(
                            upload_url,
                            headers=headers,
                            auth=auth,
                            files={"snapshot": (filename, f)},
                            params={"priority": "snapshot"}
                        )
                        
                        if response.status_code != 200:
                            logger.error(f"Restore failed for {collection_name}: {response.text}")
                        response.raise_for_status()
                        logger.info(f"Successfully restored: {collection_name}")

            finally:
                shutil.rmtree(temp_dir, ignore_errors=True)

                