"""MySQL is authoritative; local FastEmbed vectors are derived and not persisted."""
import json
import os
import ssl
from datetime import datetime, timedelta, timezone
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
            cur.execute("""CREATE TABLE IF NOT EXISTS iq_traffic_daily (
                visit_date DATE NOT NULL,
                visitor_hash CHAR(64) NOT NULL,
                page_path VARCHAR(120) NOT NULL,
                page_views INT UNSIGNED NOT NULL DEFAULT 0,
                PRIMARY KEY (visit_date, visitor_hash, page_path),
                INDEX iq_traffic_date (visit_date))""")
            cur.execute("""CREATE TABLE IF NOT EXISTS chat_rooms (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                description VARCHAR(255) NOT NULL DEFAULT '',
                is_public TINYINT(1) NOT NULL DEFAULT 1,
                direct_key VARCHAR(73) NULL UNIQUE,
                created_by VARCHAR(36) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX chat_rooms_public (is_public, created_at))""")
            cur.execute("""CREATE TABLE IF NOT EXISTS room_members (
                room_id VARCHAR(36) NOT NULL,
                user_id VARCHAR(36) NOT NULL,
                joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (room_id, user_id),
                INDEX room_members_user (user_id, room_id),
                CONSTRAINT room_members_room_fk FOREIGN KEY (room_id)
                    REFERENCES chat_rooms(id) ON DELETE CASCADE,
                CONSTRAINT room_members_user_fk FOREIGN KEY (user_id)
                    REFERENCES iq_users(id) ON DELETE CASCADE)""")
            cur.execute("""CREATE TABLE IF NOT EXISTS messages (
                id VARCHAR(36) PRIMARY KEY,
                room_id VARCHAR(36) NOT NULL,
                sender_id VARCHAR(36) NOT NULL,
                message_text TEXT NOT NULL,
                image_url VARCHAR(255) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX messages_room_time (room_id, created_at, id),
                INDEX messages_sender_time (sender_id, created_at),
                CONSTRAINT messages_room_fk FOREIGN KEY (room_id)
                    REFERENCES chat_rooms(id) ON DELETE CASCADE,
                CONSTRAINT messages_sender_fk FOREIGN KEY (sender_id)
                    REFERENCES iq_users(id) ON DELETE CASCADE)""")
            cur.execute("""CREATE TABLE IF NOT EXISTS chat_uploads (
                image_id VARCHAR(36) PRIMARY KEY,
                room_id VARCHAR(36) NOT NULL,
                uploader_id VARCHAR(36) NOT NULL,
                storage_name VARCHAR(80) NOT NULL UNIQUE,
                content_type VARCHAR(50) NOT NULL,
                message_id VARCHAR(36) NULL UNIQUE,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX chat_uploads_room (room_id, created_at),
                CONSTRAINT chat_uploads_room_fk FOREIGN KEY (room_id)
                    REFERENCES chat_rooms(id) ON DELETE CASCADE,
                CONSTRAINT chat_uploads_uploader_fk FOREIGN KEY (uploader_id)
                    REFERENCES iq_users(id) ON DELETE CASCADE,
                CONSTRAINT chat_uploads_message_fk FOREIGN KEY (message_id)
                    REFERENCES messages(id) ON DELETE SET NULL)""")
            cur.execute("""CREATE TABLE IF NOT EXISTS friend_requests (
                id VARCHAR(36) PRIMARY KEY,
                pair_key VARCHAR(73) NOT NULL UNIQUE,
                sender_id VARCHAR(36) NOT NULL,
                recipient_id VARCHAR(36) NOT NULL,
                status VARCHAR(16) NOT NULL DEFAULT 'pending',
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                responded_at DATETIME NULL,
                INDEX friend_requests_recipient_status (recipient_id, status, created_at),
                INDEX friend_requests_sender_status (sender_id, status, created_at),
                CONSTRAINT friend_requests_sender_fk FOREIGN KEY (sender_id)
                    REFERENCES iq_users(id) ON DELETE CASCADE,
                CONSTRAINT friend_requests_recipient_fk FOREIGN KEY (recipient_id)
                    REFERENCES iq_users(id) ON DELETE CASCADE)""")
            cur.executemany("""INSERT INTO chat_rooms
                (id, name, description, is_public, direct_key, created_by)
                VALUES (%s, %s, %s, 1, NULL, NULL)
                ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description)""", [
                ("00000000-0000-4000-8000-000000000001", "General", "Introductions, questions, and community updates."),
                ("00000000-0000-4000-8000-000000000002", "Interview Prep", "Practice answers, share tips, and help each other prepare."),
                ("00000000-0000-4000-8000-000000000003", "Career Support", "Discuss roles, applications, and the job search."),
            ])
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


def record_pageview(visitor_hash, page_path):
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""DELETE FROM iq_traffic_daily
                WHERE visit_date < UTC_DATE() - INTERVAL 180 DAY LIMIT 1000""")
            cur.execute("""INSERT INTO iq_traffic_daily
                (visit_date, visitor_hash, page_path, page_views)
                VALUES (UTC_DATE(), %s, %s, 1)
                ON DUPLICATE KEY UPDATE page_views = page_views + 1""",
                (visitor_hash, page_path))
        conn.commit()


def admin_traffic():
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""SELECT COALESCE(SUM(page_views), 0) AS page_views,
                                   COUNT(DISTINCT visitor_hash) AS unique_visitors
                FROM iq_traffic_daily
                WHERE visit_date >= UTC_DATE() - INTERVAL 29 DAY""")
            totals = cur.fetchone()
            cur.execute("""SELECT DATE_FORMAT(visit_date, '%Y-%m-%d') AS date,
                                   SUM(page_views) AS page_views,
                                   COUNT(DISTINCT visitor_hash) AS unique_visitors
                FROM iq_traffic_daily
                WHERE visit_date >= UTC_DATE() - INTERVAL 29 DAY
                GROUP BY visit_date ORDER BY visit_date ASC""")
            daily_rows = cur.fetchall()
            cur.execute("""SELECT page_path, SUM(page_views) AS page_views,
                                   COUNT(DISTINCT visitor_hash) AS unique_visitors
                FROM iq_traffic_daily
                WHERE visit_date >= UTC_DATE() - INTERVAL 29 DAY
                GROUP BY page_path
                ORDER BY page_views DESC, unique_visitors DESC, page_path ASC
                LIMIT 8""")
            top_pages = cur.fetchall()

    daily_by_date = {
        row["date"]: {
            "date": row["date"],
            "pageViews": int(row.get("page_views") or 0),
            "uniqueVisitors": int(row.get("unique_visitors") or 0),
        }
        for row in daily_rows
    }
    today = datetime.now(timezone.utc).date()
    daily = [
        daily_by_date.get((today - timedelta(days=days_ago)).isoformat(), {
            "date": (today - timedelta(days=days_ago)).isoformat(),
            "pageViews": 0,
            "uniqueVisitors": 0,
        })
        for days_ago in range(29, -1, -1)
    ]
    return {
        "windowDays": 30,
        "pageViews": int(totals.get("page_views") or 0),
        "uniqueVisitors": int(totals.get("unique_visitors") or 0),
        "daily": daily,
        "topPages": [
            {
                "pagePath": row["page_path"],
                "pageViews": int(row.get("page_views") or 0),
                "uniqueVisitors": int(row.get("unique_visitors") or 0),
            }
            for row in top_pages
        ],
    }
