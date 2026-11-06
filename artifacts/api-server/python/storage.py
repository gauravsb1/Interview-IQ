"""MySQL is authoritative; local FastEmbed vectors are derived and not persisted."""
import json
import os
import ssl
from datetime import datetime, timezone
from pathlib import Path
import pymysql


def connect():
    tls = ssl.create_default_context()
    # Public CA supplied by the database owner; not a credential.
    # Keep hostname and certificate verification enabled.
    tls.load_verify_locations(cafile=str(Path(__file__).parent / "certs" / "aiven-ca.pem"))
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
                token_version INT NOT NULL DEFAULT 0,
                created_at DATETIME NULL, last_login_at DATETIME NULL)""")
            cur.execute("""CREATE TABLE IF NOT EXISTS iq_records (
                id VARCHAR(80) PRIMARY KEY, user_id VARCHAR(36) NOT NULL,
                kind VARCHAR(20) NOT NULL, body JSON NOT NULL,
                INDEX iq_owner_kind (user_id,kind))""")
            for column in ("created_at", "last_login_at"):
                cur.execute("SHOW COLUMNS FROM iq_users LIKE %s", (column,))
                if not cur.fetchone():
                    cur.execute(f"ALTER TABLE iq_users ADD COLUMN {column} DATETIME NULL")
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


def _iso_datetime(value):
    if not value:
        return ""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()
    return str(value)


def _decode_json(value):
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8")
    return json.loads(value) if isinstance(value, str) else value


def _admin_summary(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "createdAt": _iso_datetime(row.get("created_at")),
        "lastLoginAt": _iso_datetime(row.get("last_login_at")),
        "totalSessions": int(row.get("total_sessions") or 0),
        "totalAnswers": int(row.get("total_answers") or 0),
        "averageScore": (
            round(float(row["average_score"]), 1)
            if row.get("average_score") is not None else None
        ),
    }


def admin_overview():
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS total_users FROM iq_users")
            total_users = int(cur.fetchone()["total_users"])
            cur.execute("""
                SELECT COUNT(*) AS total_sessions,
                       COALESCE(SUM(JSON_UNQUOTE(JSON_EXTRACT(body, '$.status')) = 'completed'), 0) AS completed_sessions,
                       COALESCE(SUM(JSON_LENGTH(JSON_EXTRACT(body, '$.answers'))), 0) AS total_answers,
                        AVG(CASE
                         WHEN JSON_UNQUOTE(JSON_EXTRACT(body, '$.status')) = 'completed'
                         THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(body, '$.score')) AS DECIMAL(10,2))
                        END) AS average_score
                FROM iq_records WHERE kind = 'session'
            """)
            totals = cur.fetchone()
            cur.execute("""
                SELECT LEFT(JSON_UNQUOTE(JSON_EXTRACT(body, '$.createdAt')), 7) AS month,
                       COUNT(*) AS sessions,
                       COALESCE(SUM(JSON_LENGTH(JSON_EXTRACT(body, '$.answers'))), 0) AS answers
                FROM iq_records
                WHERE kind = 'session'
                  AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.createdAt')) IS NOT NULL
                GROUP BY month
                ORDER BY month DESC
                LIMIT 12
            """)
            monthly = list(reversed(cur.fetchall()))
            cur.execute("""
                SELECT JSON_UNQUOTE(JSON_EXTRACT(body, '$.category')) AS category,
                       COUNT(*) AS sessions,
                       COALESCE(AVG(CASE
                         WHEN JSON_UNQUOTE(JSON_EXTRACT(body, '$.status')) = 'completed'
                         THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(body, '$.score')) AS DECIMAL(10,2))
                       END), 0) AS average_score
                FROM iq_records
                 WHERE kind = 'session'
                   AND JSON_UNQUOTE(JSON_EXTRACT(body, '$.status')) = 'completed'
                GROUP BY category
                ORDER BY sessions DESC
            """)
            categories = cur.fetchall()
    return {
        "totalUsers": total_users,
        "totalSessions": int(totals.get("total_sessions") or 0),
        "completedSessions": int(totals.get("completed_sessions") or 0),
        "totalAnswers": int(totals.get("total_answers") or 0),
        "averageScore": (
            round(float(totals["average_score"]), 1)
            if totals.get("average_score") is not None else None
        ),
        "sessionsByMonth": [
            {"month": row.get("month") or "", "sessions": int(row.get("sessions") or 0),
             "answers": int(row.get("answers") or 0)}
            for row in monthly
        ],
        "performanceByCategory": [
            {"category": row.get("category") or "Other", "sessions": int(row.get("sessions") or 0),
             "averageScore": round(float(row.get("average_score") or 0), 1)}
            for row in categories
        ],
    }


def admin_users(limit=25, offset=0, search=""):
    filters = ""
    params = []
    if search:
        filters = "WHERE u.name LIKE %s OR u.email LIKE %s"
        pattern = f"%{search}%"
        params.extend([pattern, pattern])
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) AS total FROM iq_users u {filters}", params)
            total = int(cur.fetchone()["total"])
            cur.execute(f"""
                SELECT u.id, u.name, u.email, u.created_at, u.last_login_at,
                       COUNT(s.id) AS total_sessions,
                       COALESCE(SUM(JSON_LENGTH(JSON_EXTRACT(s.body, '$.answers'))), 0) AS total_answers,
                        AVG(CASE
                         WHEN JSON_UNQUOTE(JSON_EXTRACT(s.body, '$.status')) = 'completed'
                         THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(s.body, '$.score')) AS DECIMAL(10,2))
                        END) AS average_score
                FROM iq_users u
                LEFT JOIN iq_records s ON s.user_id = u.id AND s.kind = 'session'
                {filters}
                GROUP BY u.id, u.name, u.email, u.created_at, u.last_login_at
                ORDER BY COALESCE(u.last_login_at, u.created_at) DESC, u.email ASC
                LIMIT %s OFFSET %s
            """, [*params, limit, offset])
            users = [_admin_summary(row) for row in cur.fetchall()]
    return {"users": users, "total": total, "limit": limit, "offset": offset}


def admin_user_detail(uid):
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT u.id, u.name, u.email, u.created_at, u.last_login_at,
                       COUNT(s.id) AS total_sessions,
                       COALESCE(SUM(JSON_LENGTH(JSON_EXTRACT(s.body, '$.answers'))), 0) AS total_answers,
                        AVG(CASE
                         WHEN JSON_UNQUOTE(JSON_EXTRACT(s.body, '$.status')) = 'completed'
                         THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(s.body, '$.score')) AS DECIMAL(10,2))
                        END) AS average_score
                FROM iq_users u
                LEFT JOIN iq_records s ON s.user_id = u.id AND s.kind = 'session'
                WHERE u.id = %s
                GROUP BY u.id, u.name, u.email, u.created_at, u.last_login_at
            """, (uid,))
            row = cur.fetchone()
            if not row:
                return None
            cur.execute("""
                SELECT kind, body FROM iq_records
                WHERE user_id = %s AND kind IN ('profile', 'session', 'transcript')
                ORDER BY id ASC
            """, (uid,))
            records = cur.fetchall()
    profile_data = {}
    sessions = []
    transcripts = []
    for record in records:
        body = _decode_json(record["body"])
        if record["kind"] == "profile":
            profile_data = body
        elif record["kind"] == "session":
            sessions.append(body)
        elif record["kind"] == "transcript":
            transcripts.append(body)
    sessions.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
    transcripts.sort(key=lambda item: item.get("id", ""))
    return {
        "user": _admin_summary(row),
        "profile": profile_data,
        "sessions": sessions,
        "transcripts": transcripts,
    }
