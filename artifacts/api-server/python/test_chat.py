import io
import os
import tempfile
import unittest
import uuid
from contextlib import ExitStack, contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import jwt
import app as api
import chat_api
import chat_storage
import storage


class FakeAuthCursor:
    def __init__(self, user_id):
        self.user_id = user_id
        self.row = None

    def execute(self, query, params=None):
        if "FROM iq_users WHERE id=%s" in query and params:
            self.row = (
                {"id": self.user_id, "email": "member@example.test",
                 "name": "Interview Member", "token_version": 0}
                if params[0] == self.user_id else None
            )

    def fetchone(self):
        return self.row

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class FakeAuthConnection:
    def __init__(self, user_id):
        self.user_id = user_id

    def cursor(self):
        return FakeAuthCursor(self.user_id)

    def commit(self):
        return None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class ChatApiTests(unittest.TestCase):
    def setUp(self):
        self.client = api.app.test_client()
        self.user_id = str(uuid.uuid4())
        self.other_user_id = str(uuid.uuid4())
        self.room_id = str(uuid.uuid4())
        self.image_id = str(uuid.uuid4())
        self.test_ip = uuid.uuid4().int
        self.client.environ_base["REMOTE_ADDR"] = (
            f"198.51.{(self.test_ip >> 8) % 256}.{self.test_ip % 256}"
        )

        now = datetime.now(timezone.utc)
        token = jwt.encode({
            "sub": self.user_id,
            "aud": "interviewiq",
            "version": 0,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(hours=1)).timestamp()),
        }, api.secret, algorithm="HS256")
        self.client.set_cookie("iq_session", token)

    @contextmanager
    def authenticated_db(self):
        with ExitStack() as stack:
            stack.enter_context(patch.object(api, "_schema_ready", True))
            stack.enter_context(patch.object(storage, "initialize"))
            stack.enter_context(patch.object(
                storage, "connect",
                side_effect=lambda: FakeAuthConnection(self.user_id),
            ))
            yield

    def test_chat_routes_require_existing_user_session(self):
        anonymous = api.app.test_client()
        with patch.object(chat_storage, "chat_rooms_for_user") as list_rooms:
            response = anonymous.get("/api/chat/rooms", base_url="https://localhost")
        self.assertEqual(response.status_code, 401)
        list_rooms.assert_not_called()

    def test_public_room_history_requires_membership(self):
        with self.authenticated_db(), patch.object(
            chat_storage, "chat_room_for_user",
            return_value={"id": self.room_id, "isPublic": True, "isMember": False},
        ), patch.object(chat_storage, "chat_messages") as list_messages:
            response = self.client.get(
                f"/api/chat/rooms/{self.room_id}/messages",
                base_url="https://localhost",
            )
        self.assertEqual(response.status_code, 403)
        list_messages.assert_not_called()

    def test_private_room_history_is_hidden_from_nonmembers(self):
        with self.authenticated_db(), patch.object(
            chat_storage, "chat_room_for_user", return_value=None,
        ), patch.object(chat_storage, "chat_messages") as list_messages:
            response = self.client.get(
                f"/api/chat/rooms/{self.room_id}/messages",
                base_url="https://localhost",
            )
        self.assertEqual(response.status_code, 404)
        list_messages.assert_not_called()

    def test_student_search_returns_names_only(self):
        with self.authenticated_db(), patch.object(
            chat_storage,
            "search_chat_students",
            return_value=[{"id": self.other_user_id, "name": "Another Candidate"}],
        ) as search:
            response = self.client.get(
                "/api/chat/students?q=Candidate",
                base_url="https://localhost",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["students"], [
            {"id": self.other_user_id, "name": "Another Candidate"}
        ])
        self.assertNotIn("email", response.json["students"][0])
        search.assert_called_once_with(self.user_id, "Candidate")

    def test_rest_message_uses_authenticated_sender_and_broadcasts(self):
        message = {
            "id": str(uuid.uuid4()),
            "roomId": self.room_id,
            "senderId": self.user_id,
            "senderName": "Interview Member",
            "text": "Hello there",
            "createdAt": "2026-11-06T10:00:00+00:00",
        }
        with self.authenticated_db(), patch.object(
            chat_storage, "create_chat_message", return_value=message,
        ) as save_message, patch.object(api.socketio, "emit") as broadcast:
            response = self.client.post(
                f"/api/chat/rooms/{self.room_id}/messages",
                json={"text": "Hello there"},
                base_url="https://localhost",
            )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json, message)
        save_message.assert_called_once_with(
            self.user_id, self.room_id, "Hello there", None
        )
        broadcast.assert_called_once_with("chat:message", message, to=self.room_id)

    def test_image_upload_rejects_content_that_does_not_match_its_type(self):
        room = {"id": self.room_id, "isPublic": True, "isMember": True}
        with tempfile.TemporaryDirectory() as folder, \
                self.authenticated_db(), \
                patch.object(chat_api, "UPLOAD_DIR", Path(folder) / "uploads"), \
                patch.object(chat_storage, "chat_room_for_user", return_value=room), \
                patch.object(chat_storage, "create_chat_upload") as save_upload:
            response = self.client.post(
                f"/api/chat/rooms/{self.room_id}/images",
                data={"image": (io.BytesIO(b"not a png"), "photo.png", "image/png")},
                base_url="https://localhost",
            )
        self.assertEqual(response.status_code, 400)
        save_upload.assert_not_called()

    def test_valid_image_upload_returns_a_private_chat_url(self):
        room = {"id": self.room_id, "isPublic": True, "isMember": True}
        png = b"\x89PNG\r\n\x1a\n" + b"test"
        with tempfile.TemporaryDirectory() as folder, \
                self.authenticated_db(), \
                patch.object(chat_api, "UPLOAD_DIR", Path(folder) / "uploads"), \
                patch.object(chat_storage, "chat_room_for_user", return_value=room), \
                patch.object(chat_storage, "create_chat_upload", return_value=True) as save_upload:
            response = self.client.post(
                f"/api/chat/rooms/{self.room_id}/images",
                data={"image": (io.BytesIO(png), "photo.png", "image/png")},
                base_url="https://localhost",
            )
            self.assertEqual(response.status_code, 201)
            image_url = response.json["imageUrl"]
            self.assertRegex(image_url, r"^/api/chat/images/[0-9a-f-]{36}$")
            save_upload.assert_called_once()
            stored_name = save_upload.call_args.args[3]
            image_path = os.path.join(folder, "uploads", stored_name)
            self.assertTrue(os.path.isfile(image_path))
            self.assertEqual(os.stat(image_path).st_mode & 0o777, 0o600)

    def test_socket_connection_is_rejected_without_jwt(self):
        client = api.socketio.test_client(api.app)
        self.assertFalse(client.is_connected())

    def test_socket_room_join_rechecks_membership(self):
        with self.authenticated_db(), patch.object(
            chat_storage,
            "chat_room_for_user",
            return_value={"id": self.room_id, "isPublic": True, "isMember": False},
        ):
            client = api.socketio.test_client(
                api.app,
                flask_test_client=self.client,
            )
            self.assertTrue(client.is_connected())
            result = client.emit(
                "chat:join",
                {"roomId": self.room_id},
                callback=True,
            )
            self.assertFalse(result["ok"])
            client.disconnect()

    def test_socket_message_is_saved_and_broadcast(self):
        message = {
            "id": str(uuid.uuid4()),
            "roomId": self.room_id,
            "senderId": self.user_id,
            "senderName": "Interview Member",
            "text": "Live message",
            "createdAt": "2026-11-06T10:00:00+00:00",
        }
        with self.authenticated_db(), patch.object(
            chat_storage, "create_chat_message", return_value=message,
        ) as save_message, patch.object(api.socketio, "emit") as broadcast:
            client = api.socketio.test_client(
                api.app,
                flask_test_client=self.client,
            )
            result = client.emit(
                "chat:send",
                {"roomId": self.room_id, "text": "Live message"},
                callback=True,
            )
            self.assertTrue(result["ok"])
            save_message.assert_called_once_with(
                self.user_id, self.room_id, "Live message", None
            )
            broadcast.assert_called_once_with(
                "chat:message", message, to=self.room_id
            )
            client.disconnect()

    def test_private_image_is_hidden_when_user_is_not_a_room_member(self):
        with self.authenticated_db(), patch.object(
            chat_storage, "chat_image_for_user", return_value=None,
        ):
            response = self.client.get(
                f"/api/chat/images/{self.image_id}",
                base_url="https://localhost",
            )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json["error"], "Image not found.")

    def test_direct_room_key_is_order_independent(self):
        self.assertEqual(
            chat_storage.direct_room_key(self.user_id, self.other_user_id),
            chat_storage.direct_room_key(self.other_user_id, self.user_id),
        )


if __name__ == "__main__":
    unittest.main()
