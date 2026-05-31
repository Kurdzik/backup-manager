"""add version to backup_sources

Revision ID: c7f91a3e2b08
Revises: 8f13e8e2d4a5
Create Date: 2026-05-31 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c7f91a3e2b08"
down_revision: Union[str, Sequence[str], None] = "8f13e8e2d4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "backup_sources",
        sa.Column("version", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("backup_sources", "version")
