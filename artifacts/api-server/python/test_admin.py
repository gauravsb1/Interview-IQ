import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import app as api
import storage


ADMIN_EMAIL = "owner@example.test"
ADMIN_PASSWORD = "a-long-admin-password-for-tests"


class AdminApiTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()
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

    def test_admin_login_requires_both_configuration_values(self):
        with patch.dict(os.environ, {"INTERVIEWIQ_ADMIN_PASSWORD": ""}):
            response = self.client.post(
                "/api/admin/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                base_url="https://localhost",
            )
        self.assertEqual(response.status_code, 503)


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


if __name__ == "__main__":
    unittest.main()
