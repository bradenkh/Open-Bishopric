import os
import sqlite3
from pathlib import Path

DB_PATH = os.environ.get("DB_PATH", "alma.db")
MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _ensure_migrations_table(conn):
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        "  filename TEXT PRIMARY KEY,"
        "  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        ")"
    )
    conn.commit()


def run_migrations():
    conn = get_db()
    _ensure_migrations_table(conn)

    applied = {
        row[0]
        for row in conn.execute("SELECT filename FROM schema_migrations").fetchall()
    }

    for sql_file in sorted(MIGRATIONS_DIR.glob("*.sql")):
        if sql_file.name in applied:
            continue
        sql = sql_file.read_text()
        for statement in sql.split(";"):
            statement = statement.strip()
            if not statement:
                continue
            conn.execute(statement)
        conn.execute(
            "INSERT INTO schema_migrations (filename) VALUES (?)", (sql_file.name,)
        )
        conn.commit()
        print(f"Applied migration: {sql_file.name}")

    conn.close()
