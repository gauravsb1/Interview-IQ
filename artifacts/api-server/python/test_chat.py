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


class FakeFriendDatabase:
    def __init__(self, users):
        self.users = set(users)
        self.requests = {}

    def connect(self):
        return FakeFriendConnection(self)


class FakeFriendCursor:
    def __init__(self, database):
        self.database = database
        self.row = None
        self.rows = []
        self.rowcount = 0

    def execute(self, query, params=None):
        statement = " ".join(query.split()).lower()
        self.row = None
        self.rows = []
        self.rowcount = 0
        if statement.startswith("select id from iq_users where id=%s"):
            if params[0] in self.database.users:
                self.row = {"id": params[0]}
        elif statement.startswith("select id, sender_id, recipient_id, status"):
            if "where pair_key=%s" in statement:
                row = self.database.requests.get(params[0])
                self.row = dict(row) if row else None
            elif "where id=%s" in statement:
                self.row = next(
                    (dict(row) for row in self.database.requests.values()
                     if row["id"] == params[0]),
                    None,
                )
        elif statement.startswith("insert ignore into friend_requests"):
            request_id, pair_key, sender_id, recipient_id = params
            if pair_key not in self.database.requests:
                self.database.requests[pair_key] = {
                    "id": request_id,
                    "sender_id": sender_id,
                    "recipient_id": recipient_id,
                    "status": "pending",
                }
                self.rowcount = 1
        elif statement.startswith("update friend_requests set sender_id=%s"):
            sender_id, recipient_id, request_id = params
            row = next(
                (row for row in self.database.requests.values()
                 if row["id"] == request_id),
                None,
            )
            if row:
                row.update({
                    "sender_id": sender_id,
                    "recipient_id": recipient_id,
                    "status": "pending",
                })
                self.rowcount = 1
        elif statement.startswith("update friend_requests set status=%s"):
            status, request_id, recipient_id = params
            row = next(
                (row for row in self.database.requests.values()
                 if row["id"] == request_id),
                None,
            )
            if row and row["recipient_id"] == recipient_id and row["status"] == "pending":
                row["status"] = status
                self.rowcount = 1

    def fetchone(self):
        return dict(self.row) if self.row else None

    def fetchall(self):
        return list(self.rows)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class FakeFriendConnection:
    def __init__(self, database):
        self.database = database

    def cursor(self):
        return FakeFriendCursor(self.database)

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

    def test_friend_list_is_protected_and_contains_request_sections(self):
        friend_data = {
            "friends": [{"id": self.other_user_id, "name": "Another Candidate"}],
            "incomingRequests": [],
            "outgoingRequests": [],
        }
        with self.authenticated_db(), patch.object(
            chat_storage, "chat_friends_for_user", return_value=friend_data,
        ) as get_friends:
            response = self.client.get(
                "/api/chat/friends",
                base_url="https://localhost",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, friend_data)
        self.assertNotIn("email", response.json["friends"][0])
        get_friends.assert_called_once_with(self.user_id)

    def test_friend_request_notifies_target_and_hides_internal_fields(self):
        request_id = str(uuid.uuid4())
        with self.authenticated_db(), patch.object(
            chat_storage,
            "send_friend_request",
            return_value={
                "status": "pending",
                "requestId": request_id,
                "notifyUserId": self.other_user_id,
            },
        ), patch.object(api.socketio, "emit") as notify:
            response = self.client.post(
                "/api/chat/friend-requests",
                json={"userId": self.other_user_id},
                base_url="https://localhost",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json,
            {"status": "pending", "requestId": request_id},
        )
        notify.assert_called_once_with(
            "chat:friend-update", {}, to=f"chat-user:{self.other_user_id}"
        )

    def test_accept_endpoint_notifies_both_friend_request_participants(self):
        request_id = str(uuid.uuid4())
        with self.authenticated_db(), patch.object(
            chat_storage,
            "respond_to_friend_request",
            return_value={
                "ok": True,
                "status": "accepted",
                "notifyUserIds": [self.other_user_id, self.user_id],
            },
        ), patch.object(api.socketio, "emit") as notify:
            response = self.client.post(
                f"/api/chat/friend-requests/{request_id}/accept",
                base_url="https://localhost",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"ok": True, "status": "accepted"})
        self.assertEqual(notify.call_count, 2)
        self.assertEqual(
            {call.kwargs["to"] for call in notify.call_args_list},
            {f"chat-user:{self.user_id}", f"chat-user:{self.other_user_id}"},
        )

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

    def test_authenticated_socket_receives_user_scoped_friend_updates(self):
        with self.authenticated_db():
            client = api.socketio.test_client(
                api.app,
                flask_test_client=self.client,
            )
            self.assertTrue(client.is_connected())
            api.socketio.emit(
                "chat:friend-update",
                {"updated": True},
                to=f"chat-user:{self.user_id}",
            )
            received = client.get_received()
            client.disconnect()
        self.assertEqual(received[0]["name"], "chat:friend-update")
        self.assertEqual(received[0]["args"][0], {"updated": True})

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

    def test_friend_request_pair_is_unique_and_reverse_request_is_incoming(self):
        database = FakeFriendDatabase((self.user_id, self.other_user_id))
        with patch.object(storage, "connect", side_effect=database.connect):
            first = chat_storage.send_friend_request(self.user_id, self.other_user_id)
            repeated = chat_storage.send_friend_request(self.user_id, self.other_user_id)
            reversed_request = chat_storage.send_friend_request(
                self.other_user_id, self.user_id
            )
        self.assertEqual(first["status"], "pending")
        self.assertEqual(first["requestId"], repeated["requestId"])
        self.assertEqual(reversed_request["status"], "incoming")
        self.assertEqual(reversed_request["requestId"], first["requestId"])
        self.assertEqual(len(database.requests), 1)

    def test_only_friend_request_recipient_can_accept(self):
        database = FakeFriendDatabase((self.user_id, self.other_user_id))
        with patch.object(storage, "connect", side_effect=database.connect):
            pending = chat_storage.send_friend_request(self.user_id, self.other_user_id)
            accepted = chat_storage.respond_to_friend_request(
                self.other_user_id, pending["requestId"], "accepted"
            )
            with self.assertRaises(chat_storage.ChatAccessError):
                chat_storage.respond_to_friend_request(
                    self.user_id, pending["requestId"], "accepted"
                )
        self.assertTrue(accepted["ok"])
        self.assertEqual(accepted["status"], "accepted")


if __name__ == "__main__":
    unittest.main()
