"""MySQL is authoritative; Chroma indexes are rebuilt from saved resume text."""
import json
import os
import ssl
import pymysql


def connect():
    tls = ssl.create_default_context()
    if os.environ.get("MYSQL_SSL_CA"):
        tls.load_verify_locations(cadata=os.environ["MYSQL_SSL_CA"])
    return pymysql.connect(
        host=os.environ["MYSQL_HOST"], port=int(os.environ["MYSQL_PORT"]),
        user=os.environ["MYSQL_USER"], password=os.environ["MYSQL_PASSWORD"],
        database=os.environ["MYSQL_DATABASE"], charset="utf8mb4",
        ssl=tls, connect_timeout=10,
        read_timeout=30, write_timeout=30,
        cursorclass=pymysql.cursors.DictCursor,
    )


def initialize():
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS iq_users (
                id VARCHAR(36) PRIMARY KEY, email VARCHAR(254) UNIQUE NOT NULL,
                name VARCHAR(120) NOT NULL, password_hash VARCHAR(100) NOT NULL,
                token_version INT NOT NULL DEFAULT 0)""")
            cur.execute("""CREATE TABLE IF NOT EXISTS iq_records (
                id VARCHAR(80) PRIMARY KEY, user_id VARCHAR(36) NOT NULL,
                kind VARCHAR(20) NOT NULL, body JSON NOT NULL,
                INDEX iq_owner_kind (user_id,kind))""")
        conn.commit()


def get_record(uid, kind, rid):
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT body FROM iq_records WHERE id=%s AND user_id=%s AND kind=%s",
                        (rid, uid, kind))
            row = cur.fetchone()
            return json.loads(row["body"]) if row else None


def records(uid, kind):
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT body FROM iq_records WHERE user_id=%s AND kind=%s", (uid, kind))
            return [json.loads(row["body"]) for row in cur.fetchall()]


def save(uid, kind, rid, body):
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""INSERT INTO iq_records (id,user_id,kind,body) VALUES (%s,%s,%s,%s)
                ON DUPLICATE KEY UPDATE body=VALUES(body)""", (rid, uid, kind, json.dumps(body)))
        conn.commit()


def delete(uid, kind, rid):
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM iq_records WHERE id=%s AND user_id=%s AND kind=%s",
                        (rid, uid, kind))
        conn.commit()
