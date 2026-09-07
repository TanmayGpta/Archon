import sqlite3
import os

class DatabaseConnection:
    def __init__(self):
        self.db_path = os.getenv("DB_PATH", "store.db")

    def query(self, sql: str, *args):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(sql, args)
        res = cursor.fetchall()
        conn.close()
        return len(res)

def init_db():
    print("[DB] Database initialized.")
