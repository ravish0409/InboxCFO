from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from . import models  # noqa: F401  (register tables)
from .config import DATABASE_URL

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# Columns added after the initial schema. create_all() never ALTERs existing
# tables, so we backfill them by hand for databases seeded before the change.
_ADDED_COLUMNS = {
    "source": {"content_hash": "VARCHAR"},
    "subscription": {
        "norm_key": "VARCHAR NOT NULL DEFAULT ''",
        "is_trial": "BOOLEAN NOT NULL DEFAULT 0",
        "trial_end_date": "DATE",
        "cancel_url": "VARCHAR NOT NULL DEFAULT ''",
        "auto_renews": "BOOLEAN NOT NULL DEFAULT 1",
        "previous_amount": "FLOAT",
        "price_change_at": "DATE",
        "last_invoice_at": "DATE",
    },
    "bill": {"norm_key": "VARCHAR NOT NULL DEFAULT ''"},
    "transaction": {"dedup_key": "VARCHAR NOT NULL DEFAULT ''"},
    "chatmessage": {
        "charts_json": "VARCHAR NOT NULL DEFAULT '[]'",
        "actions_json": "VARCHAR NOT NULL DEFAULT '[]'",
    },
}


def _ensure_columns() -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, columns in _ADDED_COLUMNS.items():
            if table not in existing_tables:
                continue
            present = {c["name"] for c in inspector.get_columns(table)}
            for col, ddl in columns.items():
                if col not in present:
                    # Quote the table name — "transaction" is a reserved SQL keyword.
                    conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN {col} {ddl}'))


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    _ensure_columns()


def get_session():
    with Session(engine) as session:
        yield session
