# Backup Manager

A self-hosted, multi-tenant backup management platform with a web UI. Supports backing up databases and services to multiple storage destinations on a schedule, with optional compression and encryption.

An evolution of [PG-backup-manager](https://github.com/Kurdzik/PG-backup-manager).

---

## Features

### Backup Sources

Connect to any of the following services and trigger on-demand or scheduled backups:

| Source | Method |
|---|---|
| PostgreSQL | `pg_dump` via subprocess |
| MySQL | `mysqldump` via subprocess |
| MongoDB | `mongodump` via subprocess |
| Elasticsearch | Scroll API — exports all indices as JSON |
| Qdrant | Snapshots API — downloads `.snapshot` files per collection |
| MinIO | Object-level copy via MinIO client |
| Neo4j | Cypher export |
| HashiCorp Vault | Secrets engine dump |

### Backup Destinations

Completed backups are uploaded to a configurable destination:

| Destination | Notes |
|---|---|
| Local filesystem | Directory on the host / mounted volume |
| S3-compatible | AWS S3, MinIO, Cloudflare R2, etc. |
| SFTP | SSH key or password auth |
| SMB | Windows shares |

### Scheduling

- Cron-based scheduling per backup pair (source → destination)
- Schedules are stored in the database and managed dynamically by Celery Beat — no restart required
- `keep_n` retention policy per schedule: oldest backups beyond the limit are automatically deleted

### Encryption & Compression

- Per-tenant RSA key pairs stored in the database
- Backup artifacts can be compressed (gzip) and encrypted (AES-256-GCM, key wrapped in RSA)
- Private key required at restore time for encrypted backups

### Restore

- On-demand restore from any stored backup artifact
- For Qdrant: vector schema is sniffed from inside the snapshot file to recreate collections faithfully
- For Elasticsearch: index settings, mappings, and documents are fully restored

### Multi-Tenancy

- Each user account is an isolated tenant
- All data (sources, destinations, schedules, backups, logs) is scoped to the tenant
- Separate encryption keys per tenant

### Audit Logging

- All backup and restore operations are logged to the database with structured context
- Logs are viewable in the UI and subject to configurable retention policies per tenant

---

## Architecture

```
Frontend (Next.js)  →  Backend API (FastAPI)
                              │
                         RabbitMQ
                              │
                    Celery Worker + Celery Beat
                              │
                         PostgreSQL
```

- **Frontend**: Next.js 15, Mantine UI, served on port 3333
- **Backend**: FastAPI, served on port 8080. Handles auth, CRUD, and dispatches tasks.
- **Worker**: Celery worker executing backup/restore jobs
- **Scheduler**: Celery Beat with a dynamic scheduler — picks up schedule changes from the database without restarting
- **Database**: PostgreSQL — stores app state, task results, and logs
- **Broker**: RabbitMQ — task queue between API and workers

---

## Quick Start

```bash
cp .env.example .env
# Edit .env — set SECRET_KEY, database credentials, NEXT_PUBLIC_BACKEND_URL

docker compose up -d
```

The UI is available at `http://localhost:3333`. Register an account on first run.

---

## Configuration

All configuration is via environment variables. See `.env.example` for the full list. Key variables:

| Variable | Description |
|---|---|
| `SECRET_KEY` | Used for session auth and credential encryption |
| `DATABASE_URL` | PostgreSQL connection string |
| `CELERY_BROKER_URL` | RabbitMQ URL |
| `NEXT_PUBLIC_BACKEND_URL` | Backend URL as seen from the browser |

---

## Ports

| Service | Host |
|---|---|
| Frontend | `3333` |
| Backend API | `8080` |
| RabbitMQ management | `15672` |
| PostgreSQL | `5678` |
