"""add replications and replication_targets tables

Revision ID: d4a1b8f7e920
Revises: c7f91a3e2b08
Create Date: 2026-07-03 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4a1b8f7e920"
down_revision: Union[str, Sequence[str], None] = "c7f91a3e2b08"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "replications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("destination_id", sa.Integer(), nullable=False),
        sa.Column("keep_n", sa.Integer(), nullable=False),
        sa.Column("schedule", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_run", sa.DateTime(), nullable=True),
        sa.Column("next_run", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["backup_sources.id"]),
        sa.ForeignKeyConstraint(["destination_id"], ["backup_destinations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_replications_tenant_id"),
        "replications",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_replications_name"),
        "replications",
        ["name"],
        unique=False,
    )

    op.create_table(
        "replication_targets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("replication_id", sa.Integer(), nullable=False),
        sa.Column("target_source_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["replication_id"], ["replications.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["target_source_id"], ["backup_sources.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_replication_targets_replication_id"),
        "replication_targets",
        ["replication_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f("ix_replication_targets_replication_id"),
        table_name="replication_targets",
    )
    op.drop_table("replication_targets")
    op.drop_index(op.f("ix_replications_name"), table_name="replications")
    op.drop_index(op.f("ix_replications_tenant_id"), table_name="replications")
    op.drop_table("replications")
