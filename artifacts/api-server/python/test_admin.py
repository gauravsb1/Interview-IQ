import os
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import app as api
import storage


ADMIN_EMAIL = "owner@example.test"
ADMIN_PASSWORD = "a-long-admin-password-for-tests"


class AdminApiTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()
        test_ip = uuid.uuid4().int
        self.client.environ_base["REMOTE_ADDR"] = (
            f"198.51.{(test_ip >> 8) % 256}.{test_ip % 256}"
        )
        self.env = patch.dict(
            os.environ,
            {
                "INTERVIEWIQ_ADMIN_EMAIL": ADMIN_EMAIL,
                "INTERVIEWIQ_ADMIN_PASSWORD": ADMIN_PASSWORD,
            },
        )
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_admin_data_is_blocked_until_separate_admin_login(self):
        with patch.object(storage, "admin_overview") as overview:
            response = self.client.get("/api/admin/overview", base_url="https://localhost")
        self.assertEqual(response.status_code, 401)
        overview.assert_not_called()

        response = self.client.post(
            "/api/admin/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            base_url="https://localhost",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["authenticated"])
        cookie = response.headers["Set-Cookie"]
        self.assertIn("HttpOnly", cookie)
        self.assertIn("Secure", cookie)
        self.assertIn("SameSite=Strict", cookie)
        self.assertIn("Path=/api/admin", cookie)

        with patch.object(
            api, "ensure_db"
        ), patch.object(storage, "admin_overview", return_value={
            "totalUsers": 3,
            "totalSessions": 4,
            "completedSessions": 3,
            "totalAnswers": 12,
            "averageScore": 76.5,
            "sessionsByMonth": [],
            "performanceByCategory": [],
        }) as overview:
            response = self.client.get("/api/admin/overview", base_url="https://localhost")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["totalUsers"], 3)
        overview.assert_called_once()

        self.client.post("/api/admin/logout", base_url="https://localhost")
        response = self.client.get("/api/admin/overview", base_url="https://localhost")
        self.assertEqual(response.status_code, 401)

    def test_wrong_admin_credentials_never_create_a_session(self):
        response = self.client.post(
            "/api/admin/login",
            json={"email": "other@example.test", "password": ADMIN_PASSWORD},
            base_url="https://localhost",
        )
        self.assertEqual(response.status_code, 401)
        response = self.client.get("/api/admin/session", base_url="https://localhost")
        self.assertFalse(response.json["authenticated"])

    def test_candidate_audience_cookie_cannot_open_admin_routes(self):
        now = datetime.now(timezone.utc)
        token = api.jwt.encode(
            {
                "sub": ADMIN_EMAIL,
                "aud": "interviewiq",
                "iat": now,
                "exp": now + timedelta(hours=1),
            },
            api.secret,
            algorithm="HS256",
        )
        self.client.set_cookie("iq_admin_session", token, secure=True)
        response = self.client.get("/api/admin/session", base_url="https://localhost")
        self.assertFalse(response.json["authenticated"])
        response = self.client.get("/api/admin/users", base_url="https://localhost")
        self.assertEqual(response.status_code, 401)

    def test_admin_endpoints_return_database_records_only_after_authentication(self):
        self.client.post(
            "/api/admin/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            base_url="https://localhost",
        )
        page = {
            "users": [{
                "id": "user-1",
                "name": "Candidate",
                "email": "candidate@example.test",
                "createdAt": "",
                "lastLoginAt": "",
                "totalSessions": 1,
                "totalAnswers": 2,
                "averageScore": 81,
            }],
            "total": 1,
            "limit": 25,
            "offset": 0,
        }
        detail = {
            "user": page["users"][0],
            "profile": {"filename": "resume.pdf", "text": "Stored resume text"},
            "sessions": [{"id": "session-1", "answers": [{"text": "Stored answer", "score": 81}]}],
            "transcripts": [],
        }
        with patch.object(api, "ensure_db"), patch.object(
            storage, "admin_users", return_value=page
        ) as get_users, patch.object(
            storage, "admin_user_detail", return_value=detail
        ) as get_detail:
            users = self.client.get(
                "/api/admin/users?limit=25&offset=0&q=Candidate",
                base_url="https://localhost",
            )
            user_detail = self.client.get(
                "/api/admin/users/user-1",
                base_url="https://localhost",
            )
        self.assertEqual(users.status_code, 200)
        self.assertEqual(users.json["users"][0]["email"], "candidate@example.test")
        self.assertEqual(user_detail.status_code, 200)
        self.assertEqual(user_detail.json["profile"]["text"], "Stored resume text")
        self.assertNotIn("password_hash", user_detail.json)
        self.assertNotIn("token_version", user_detail.json)
        get_users.assert_called_once_with(limit=25, offset=0, search="Candidate")
        get_detail.assert_called_once_with("user-1")

    def test_admin_user_pagination_is_bounded(self):
        self.client.post(
            "/api/admin/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            base_url="https://localhost",
        )
        with patch.object(api, "ensure_db"), patch.object(storage, "admin_users") as get_users:
            response = self.client.get(
                "/api/admin/users?limit=1000",
                base_url="https://localhost",
            )
        self.assertEqual(response.status_code, 400)
        get_users.assert_not_called()

    def test_traffic_summary_requires_admin_and_returns_aggregates(self):
        response = self.client.get("/api/admin/traffic", base_url="https://localhost")
        self.assertEqual(response.status_code, 401)

        self.client.post(
            "/api/admin/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            base_url="https://localhost",
        )
        traffic = {
            "windowDays": 30,
            "pageViews": 42,
            "uniqueVisitors": 11,
            "daily": [],
            "topPages": [],
        }
        with patch.object(api, "ensure_db"), patch.object(
            storage, "admin_traffic", return_value=traffic
        ) as get_traffic:
            response = self.client.get("/api/admin/traffic", base_url="https://localhost")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["uniqueVisitors"], 11)
        get_traffic.assert_called_once()

    def test_admin_login_requires_both_configuration_values(self):
        with patch.dict(os.environ, {"INTERVIEWIQ_ADMIN_PASSWORD": ""}):
            response = self.client.post(
                "/api/admin/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                base_url="https://localhost",
            )
        self.assertEqual(response.status_code, 503)


class PageviewTrackingTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()

    def test_pageviews_store_only_hashed_ids_and_normalized_paths(self):
        visitor_id = str(uuid.uuid4())
        with patch.object(api, "ensure_db"), patch.object(
            storage, "record_pageview"
        ) as save_pageview:
            response = self.client.post(
                "/api/analytics/pageview",
                json={"visitorId": visitor_id, "pagePath": "/interview/session-123?token=private"},
                base_url="https://localhost",
            )
        self.assertEqual(response.status_code, 202)
        self.assertTrue(response.json["accepted"])
        visitor_hash, page_path = save_pageview.call_args.args
        self.assertEqual(len(visitor_hash), 64)
        self.assertNotEqual(visitor_hash, visitor_id)
        self.assertEqual(page_path, "/interview/:id")

    def test_admin_pages_are_excluded_from_traffic(self):
        with patch.object(api, "ensure_db") as ensure_db, patch.object(
            storage, "record_pageview"
        ) as save_pageview:
            response = self.client.post(
                "/api/analytics/pageview",
                json={"visitorId": str(uuid.uuid4()), "pagePath": "/admin"},
                base_url="https://localhost",
            )
        self.assertEqual(response.status_code, 202)
        self.assertFalse(response.json["accepted"])
        ensure_db.assert_not_called()
        save_pageview.assert_not_called()

    def test_invalid_visitor_id_is_rejected(self):
        response = self.client.post(
            "/api/analytics/pageview",
            json={"visitorId": "not-a-uuid", "pagePath": "/"},
            base_url="https://localhost",
        )
        self.assertEqual(response.status_code, 400)


class AdminSerializationTests(unittest.TestCase):
    def test_user_summary_is_allowlisted_and_legacy_dates_are_unknown(self):
        summary = storage._admin_summary({
            "id": "user-1",
            "name": "Candidate",
            "email": "candidate@example.test",
            "created_at": None,
            "last_login_at": None,
            "total_sessions": 0,
            "total_answers": 0,
            "average_score": None,
            "password_hash": "must-not-leak",
            "token_version": 99,
        })
        self.assertEqual(summary["createdAt"], "")
        self.assertEqual(summary["lastLoginAt"], "")
        self.assertNotIn("password_hash", summary)
        self.assertNotIn("token_version", summary)


class AdminTrafficStorageTests(unittest.TestCase):
    def test_traffic_summary_fills_missing_days_and_returns_only_aggregates(self):
        today = datetime.now(timezone.utc).date().isoformat()
        connection = MagicMock()
        cursor = MagicMock()
        connection.__enter__.return_value = connection
        connection.cursor.return_value.__enter__.return_value = cursor
        cursor.fetchone.return_value = {"page_views": 10, "unique_visitors": 3}
        cursor.fetchall.side_effect = [
            [{"date": today, "page_views": 10, "unique_visitors": 3}],
            [{"page_path": "/practice", "page_views": 6, "unique_visitors": 2}],
        ]
        with patch.object(storage, "connect", return_value=connection):
            traffic = storage.admin_traffic()

        self.assertEqual(traffic["windowDays"], 30)
        self.assertEqual(traffic["pageViews"], 10)
        self.assertEqual(traffic["uniqueVisitors"], 3)
        self.assertEqual(len(traffic["daily"]), 30)
        self.assertEqual(traffic["daily"][-1]["date"], today)
        self.assertEqual(traffic["daily"][-1]["pageViews"], 10)
        self.assertEqual(traffic["daily"][0]["pageViews"], 0)
        self.assertEqual(traffic["topPages"][0]["pagePath"], "/practice")
        self.assertNotIn("visitor_hash", traffic["topPages"][0])


if __name__ == "__main__":
    unittest.main()
