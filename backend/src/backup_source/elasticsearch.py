import base64
import json
import os
import tarfile
import tempfile
from datetime import datetime
from typing import Optional

import requests

from src.base import BaseBackupManager, Credentials
from src.logger import get_logger

logger = get_logger()


class ElasticsearchBackupManager(BaseBackupManager):
    """Backs up and restores Elasticsearch indices using the REST API directly.

    Supports:
      - ES 7.x: scroll-based pagination
      - ES 8.x / 9.x: Point-In-Time (PIT) + search_after pagination

    The version is selected via self.version (e.g. "7.x", "8.x", "9.x").
    When version is None or not "7.x", PIT strategy is used (safe default for modern ES).
    """

    def __init__(self, credentials: Credentials, version=None) -> None:
        super().__init__(credentials, version)
        self._session = requests.Session()
        self._base_url = credentials.url.rstrip("/")

        if credentials.api_key:
            self._session.headers["Authorization"] = f"ApiKey {credentials.api_key}"
        elif credentials.login and credentials.password:
            encoded = base64.b64encode(
                f"{credentials.login}:{credentials.password}".encode()
            ).decode()
            self._session.headers["Authorization"] = f"Basic {encoded}"

    def _use_scroll(self) -> bool:
        """ES 7.x uses scroll; ES 8.x/9.x or unspecified use PIT + search_after."""
        return bool(self.version and self.version.startswith("7"))

    def _list_index_names(self) -> list[str]:
        resp = self._session.get(f"{self._base_url}/*/_settings", timeout=30)
        resp.raise_for_status()
        return [name for name in resp.json().keys() if not name.startswith(".")]

    def _get_settings(self, index: str) -> dict:
        resp = self._session.get(f"{self._base_url}/{index}/_settings", timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _get_mappings(self, index: str) -> dict:
        resp = self._session.get(f"{self._base_url}/{index}/_mapping", timeout=30)
        resp.raise_for_status()
        return resp.json()

    def _paginate_scroll(self, index: str) -> list[dict]:
        """ES 7.x: scroll-based pagination."""
        docs = []
        resp = self._session.get(
            f"{self._base_url}/{index}/_search",
            params={"scroll": "2m", "size": 1000},
            json={"query": {"match_all": {}}},
            timeout=60,
        )
        resp.raise_for_status()
        body = resp.json()
        scroll_id = body.get("_scroll_id")

        try:
            while body["hits"]["hits"]:
                for hit in body["hits"]["hits"]:
                    docs.append({"_id": hit["_id"], "_source": hit["_source"]})
                resp = self._session.post(
                    f"{self._base_url}/_search/scroll",
                    json={"scroll": "2m", "scroll_id": scroll_id},
                    timeout=60,
                )
                resp.raise_for_status()
                body = resp.json()
                scroll_id = body.get("_scroll_id", scroll_id)
        finally:
            if scroll_id:
                self._session.delete(
                    f"{self._base_url}/_search/scroll",
                    json={"scroll_id": scroll_id},
                    timeout=10,
                )
        return docs

    def _paginate_pit(self, index: str) -> list[dict]:
        """ES 8.x/9.x: Point-In-Time + search_after pagination."""
        resp = self._session.post(
            f"{self._base_url}/{index}/_pit",
            params={"keep_alive": "2m"},
            timeout=30,
        )
        resp.raise_for_status()
        pit_id = resp.json()["id"]

        docs = []
        search_after = None

        try:
            while True:
                body: dict = {
                    "size": 1000,
                    "query": {"match_all": {}},
                    "sort": [{"_shard_doc": "asc"}],
                    "pit": {"id": pit_id, "keep_alive": "2m"},
                }
                if search_after:
                    body["search_after"] = search_after

                resp = self._session.post(
                    f"{self._base_url}/_search",
                    json=body,
                    timeout=60,
                )
                resp.raise_for_status()
                result = resp.json()
                hits = result["hits"]["hits"]
                if not hits:
                    break
                for hit in hits:
                    docs.append({"_id": hit["_id"], "_source": hit["_source"]})
                search_after = hits[-1]["sort"]
                pit_id = result.get("pit_id", pit_id)
        finally:
            self._session.delete(
                f"{self._base_url}/_pit",
                json={"id": pit_id},
                timeout=10,
            )
        return docs

    def create_backup(
        self, tenant_id: str, backup_source_id: int, schedule_id: Optional[int] = None
    ) -> str:
        temp_dir = tempfile.mkdtemp()
        try:
            indices = self._list_index_names()

            if not indices:
                raise ValueError("No non-system indices found in Elasticsearch cluster")

            for index_name in indices:
                logger.info("elasticsearch_backing_up_index", index=index_name)
                index_data = {
                    "settings": self._get_settings(index_name),
                    "mappings": self._get_mappings(index_name),
                    "documents": (
                        self._paginate_scroll(index_name)
                        if self._use_scroll()
                        else self._paginate_pit(index_name)
                    ),
                }
                index_file = os.path.join(temp_dir, f"{index_name}.json")
                with open(index_file, "w") as f:
                    json.dump(index_data, f, default=str)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = (
                f"elasticsearch_backup_usr={tenant_id}_sch={schedule_id}"
                f"_src={backup_source_id}_created_at={timestamp}.tar.gz"
            )
            with tarfile.open(backup_path, "w:gz") as tar:
                tar.add(temp_dir, arcname="elasticsearch_backup")

            return backup_path
        finally:
            for f in os.listdir(temp_dir):
                os.remove(os.path.join(temp_dir, f))
            os.rmdir(temp_dir)

    def test_connection(self) -> bool:
        try:
            resp = self._session.get(f"{self._base_url}/", timeout=10)
            resp.raise_for_status()
            return True
        except Exception as e:
            logger.info(f"elasticsearch_connection_test_failed: {e}")
            return False

    def restore_from_backup(self, backup_path: str) -> None:
        if not os.path.exists(backup_path):
            raise FileNotFoundError(f"Backup file not found: {backup_path}")

        temp_dir = tempfile.mkdtemp()
        try:
            with tarfile.open(backup_path, "r:gz") as tar:
                tar.extractall(temp_dir)

            backup_dir = os.path.join(temp_dir, "elasticsearch_backup")

            for json_file in os.listdir(backup_dir):
                if not json_file.endswith(".json"):
                    continue

                index_name = json_file.replace(".json", "")
                logger.info("elasticsearch_restoring_index", index=index_name)

                with open(os.path.join(backup_dir, json_file)) as f:
                    index_data = json.load(f)

                # Delete existing index (ignore 404)
                self._session.delete(f"{self._base_url}/{index_name}", timeout=15)

                settings_wrapper = index_data.get("settings", {})
                mappings_wrapper = index_data.get("mappings", {})
                index_settings = (
                    settings_wrapper.get(index_name, {}).get("settings", {})
                    if isinstance(settings_wrapper, dict)
                    else {}
                )
                index_mappings = (
                    mappings_wrapper.get(index_name, {}).get("mappings", {})
                    if isinstance(mappings_wrapper, dict)
                    else {}
                )

                create_body: dict = {}
                if index_settings:
                    create_body["settings"] = index_settings
                if index_mappings:
                    create_body["mappings"] = index_mappings

                resp = self._session.put(
                    f"{self._base_url}/{index_name}",
                    json=create_body,
                    timeout=15,
                )
                resp.raise_for_status()

                documents = index_data.get("documents", [])
                if documents:
                    for i in range(0, len(documents), 1000):
                        batch = documents[i : i + 1000]
                        ndjson_lines = []
                        for doc in batch:
                            meta = {
                                "index": {
                                    "_index": index_name,
                                    "_id": doc.get("_id"),
                                }
                            }
                            ndjson_lines.append(json.dumps(meta))
                            ndjson_lines.append(json.dumps(doc["_source"]))
                        ndjson_body = "\n".join(ndjson_lines) + "\n"
                        resp = self._session.post(
                            f"{self._base_url}/_bulk",
                            data=ndjson_body,
                            headers={"Content-Type": "application/x-ndjson"},
                            timeout=60,
                        )
                        resp.raise_for_status()

                logger.info("elasticsearch_restore_index_completed", index=index_name)
        finally:
            for root, dirs, files in os.walk(temp_dir, topdown=False):
                for name in files:
                    os.remove(os.path.join(root, name))
                for name in dirs:
                    os.rmdir(os.path.join(root, name))
            os.rmdir(temp_dir)
