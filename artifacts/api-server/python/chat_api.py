import os
import re
import threading
import uuid
from pathlib import Path

import jwt
from flask import g, jsonify, request, send_file
from flask_socketio import disconnect, emit, join_room, leave_room

import chat_storage
import storage


UPLOAD_DIR = Path(__file__).parent / "chat_uploads"
MAX_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_TYPES = {
    "image/jpeg": ("jpg", lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/png": ("png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": ("webp", lambda data: len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"),
    "image/gif": ("gif", lambda data: data.startswith((b"GIF87a", b"GIF89a"))),
}
_socket_users = {}
_socket_lock = threading.Lock()
_socketio = None
_jwt_secret = None
_ensure_db = None


def register_chat_routes(app, socketio, protected, ensure_db, secret):
    global _socketio, _jwt_secret, _ensure_db
    _socketio = socketio
    _jwt_secret = secret
    _ensure_db = ensure_db

    @app.get("/api/chat/rooms")
    @protected
    def get_chat_rooms():
        ensure_db()
        return jsonify(rooms=chat_storage.chat_rooms_for_user(g.user["id"]))

    @app.get("/api/chat/friends")
    @protected
    def get_chat_friends():
        ensure_db()
        return jsonify(chat_storage.chat_friends_for_user(g.user["id"]))

    @app.get("/api/chat/students")
    @protected
    def search_chat_students():
        query = (request.args.get("q") or "").strip()
        if len(query) < 2 or len(query) > 80:
            return jsonify(error="Search with 2 to 80 characters."), 400
        ensure_db()
        return jsonify(students=chat_storage.search_chat_students(g.user["id"], query))

    @app.post("/api/chat/friend-requests")
    @protected
    def post_friend_request():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify(error="A valid student userId is required."), 400
        other_user_id = _uuid_or_none(payload.get("userId"))
        if not other_user_id:
            return jsonify(error="A valid student userId is required."), 400
        ensure_db()
        try:
            result = chat_storage.send_friend_request(g.user["id"], other_user_id)
        except chat_storage.ChatValidationError as exc:
            return jsonify(error=str(exc)), 400
        if not result:
            return jsonify(error="Student not found."), 404
        notify_user_id = result.pop("notifyUserId", None)
        if notify_user_id:
            socketio.emit("chat:friend-update", {}, to=f"chat-user:{notify_user_id}")
        return jsonify(result), 200

    def respond_to_friend_request(request_id, action):
        request_id = _uuid_or_none(request_id)
        if not request_id:
            return jsonify(error="Friend request not found."), 404
        ensure_db()
        try:
            result = chat_storage.respond_to_friend_request(
                g.user["id"], request_id, action
            )
        except chat_storage.ChatAccessError as exc:
            return jsonify(error=str(exc)), 403
        except chat_storage.ChatValidationError as exc:
            return jsonify(error=str(exc)), 409
        if not result:
            return jsonify(error="Friend request not found."), 404
        for user_id in result.pop("notifyUserIds", []):
            socketio.emit("chat:friend-update", {}, to=f"chat-user:{user_id}")
        return jsonify(result), 200

    @app.post("/api/chat/friend-requests/<request_id>/accept")
    @protected
    def accept_friend_request(request_id):
        return respond_to_friend_request(request_id, "accepted")

    @app.post("/api/chat/friend-requests/<request_id>/decline")
    @protected
    def decline_friend_request(request_id):
        return respond_to_friend_request(request_id, "declined")

    @app.post("/api/chat/rooms/direct")
    @protected
    def create_direct_chat():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify(error="A valid student userId is required."), 400
        other_user_id = _uuid_or_none(payload.get("userId"))
        if not other_user_id:
            return jsonify(error="A valid student userId is required."), 400
        ensure_db()
        try:
            room = chat_storage.create_direct_room(g.user["id"], other_user_id)
        except chat_storage.ChatValidationError as exc:
            return jsonify(error=str(exc)), 400
        if not room:
            return jsonify(error="Student not found."), 404
        return jsonify(room), 200

    @app.post("/api/chat/rooms/<room_id>/join")
    @protected
    def join_chat_room(room_id):
        room_id = _uuid_or_none(room_id)
        if not room_id:
            return jsonify(error="Room not found."), 404
        ensure_db()
        result = chat_storage.join_public_room(g.user["id"], room_id)
        if result == "not_found":
            return jsonify(error="Room not found."), 404
        if result == "not_public":
            return jsonify(error="Direct messages do not use community membership."), 403
        room = chat_storage.chat_room_for_user(g.user["id"], room_id)
        return jsonify(room), 200

    @app.post("/api/chat/rooms/<room_id>/leave")
    @protected
    def leave_chat_room(room_id):
        room_id = _uuid_or_none(room_id)
        if not room_id:
            return jsonify(error="Room not found."), 404
        ensure_db()
        result = chat_storage.leave_public_room(g.user["id"], room_id)
        if result == "not_found":
            return jsonify(error="Room not found."), 404
        if result == "not_public":
            return jsonify(error="Direct conversations cannot be left here."), 403
        disconnect_user_from_room(g.user["id"], room_id)
        return jsonify(ok=True), 200

    @app.get("/api/chat/rooms/<room_id>/messages")
    @protected
    def get_chat_messages(room_id):
        room_id = _uuid_or_none(room_id)
        if not room_id:
            return jsonify(error="Room not found."), 404
        ensure_db()
        room = chat_storage.chat_room_for_user(g.user["id"], room_id)
        if not room:
            return jsonify(error="Room not found."), 404
        if not room["isMember"]:
            return jsonify(error="Join this community channel to read its messages."), 403
        messages = chat_storage.chat_messages(g.user["id"], room_id)
        return jsonify(messages=messages or []), 200

    @app.post("/api/chat/rooms/<room_id>/messages")
    @protected
    def post_chat_message(room_id):
        room_id = _uuid_or_none(room_id)
        if not room_id:
            return jsonify(error="Room not found."), 404
        payload = request.get_json(silent=True) or {}
        text = payload.get("text", "")
        image_url = payload.get("imageUrl")
        if not isinstance(text, str) or (image_url is not None and not isinstance(image_url, str)):
            return jsonify(error="Message text or image is invalid."), 400
        image_id = _image_id_from_url(image_url) if image_url else None
        if image_url and not image_id:
            return jsonify(error="Only images uploaded to this chat can be attached."), 400
        ensure_db()
        try:
            message = chat_storage.create_chat_message(
                g.user["id"], room_id, text, image_id
            )
        except chat_storage.ChatAccessError as exc:
            return jsonify(error=str(exc)), 403
        except chat_storage.ChatValidationError as exc:
            return jsonify(error=str(exc)), 400
        if not message:
            return jsonify(error="Unable to save this message."), 500
        socketio.emit("chat:message", message, to=room_id)
        return jsonify(message), 201

    @app.post("/api/chat/rooms/<room_id>/images")
    @protected
    def upload_chat_image(room_id):
        room_id = _uuid_or_none(room_id)
        if not room_id:
            return jsonify(error="Room not found."), 404
        ensure_db()
        room = chat_storage.chat_room_for_user(g.user["id"], room_id)
        if not room:
            return jsonify(error="Room not found."), 404
        if not room["isMember"]:
            return jsonify(error="Join this community channel before attaching an image."), 403

        upload = request.files.get("image")
        if not upload or not upload.filename:
            return jsonify(error="Choose an image to upload."), 400
        content_type = (upload.mimetype or "").lower()
        image_format = IMAGE_TYPES.get(content_type)
        if not image_format:
            return jsonify(error="Use a JPEG, PNG, WebP, or GIF image."), 415

        data = upload.stream.read(MAX_IMAGE_BYTES + 1)
        if len(data) > MAX_IMAGE_BYTES:
            return jsonify(error="Images must be 5 MB or smaller."), 413
        extension, signature_check = image_format
        if not signature_check(data):
            return jsonify(error="The uploaded file is not a valid supported image."), 400

        image_id = str(uuid.uuid4())
        storage_name = f"{image_id}.{extension}"
        UPLOAD_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
        image_path = UPLOAD_DIR / storage_name
        try:
            descriptor = os.open(image_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "wb") as file_handle:
                file_handle.write(data)
            if not chat_storage.create_chat_upload(
                g.user["id"], room_id, image_id, storage_name, content_type
            ):
                image_path.unlink(missing_ok=True)
                return jsonify(error="You are not a member of this chat."), 403
        except Exception:
            image_path.unlink(missing_ok=True)
            raise

        return jsonify(imageUrl=f"/api/chat/images/{image_id}"), 201

    @app.get("/api/chat/images/<image_id>")
    @protected
    def get_chat_image(image_id):
        image_id = _uuid_or_none(image_id)
        if not image_id:
            return jsonify(error="Image not found."), 404
        ensure_db()
        image = chat_storage.chat_image_for_user(g.user["id"], image_id)
        if not image:
            return jsonify(error="Image not found."), 404
        image_path = (UPLOAD_DIR / image["storage_name"]).resolve()
        if image_path.parent != UPLOAD_DIR.resolve() or not image_path.is_file():
            return jsonify(error="Image not found."), 404
        response = send_file(
            image_path,
            mimetype=image["content_type"],
            conditional=True,
            max_age=0,
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = "default-src 'none'; sandbox"
        return response

    @socketio.on("connect")
    def chat_socket_connect(auth=None):
        user_id = _authenticated_socket_user()
        if not user_id:
            return False
        with _socket_lock:
            _socket_users[request.sid] = user_id
        join_room(f"chat-user:{user_id}")
        return True

    @socketio.on("disconnect")
    def chat_socket_disconnect(reason=None):
        with _socket_lock:
            _socket_users.pop(request.sid, None)

    @socketio.on("chat:join")
    def chat_socket_join(payload):
        user_id = _socket_event_user()
        if not user_id:
            return {"ok": False, "error": "Sign in to join this chat."}
        payload = payload if isinstance(payload, dict) else {}
        room_id = _uuid_or_none(payload.get("roomId"))
        if not room_id:
            return {"ok": False, "error": "Room not found."}
        ensure_db()
        room = chat_storage.chat_room_for_user(user_id, room_id)
        if not room or not room["isMember"]:
            return {"ok": False, "error": "You are not a member of this chat."}
        join_room(room_id)
        return {"ok": True}

    @socketio.on("chat:leave")
    def chat_socket_leave(payload):
        if not _socket_event_user():
            return {"ok": False, "error": "Sign in to continue."}
        payload = payload if isinstance(payload, dict) else {}
        room_id = _uuid_or_none(payload.get("roomId"))
        if not room_id:
            return {"ok": False, "error": "Room not found."}
        leave_room(room_id)
        return {"ok": True}

    @socketio.on("chat:send")
    def chat_socket_send(payload):
        user_id = _socket_event_user()
        if not user_id:
            return {"ok": False, "error": "Sign in to send messages."}
        payload = payload if isinstance(payload, dict) else {}
        room_id = _uuid_or_none(payload.get("roomId"))
        text = payload.get("text", "")
        image_url = payload.get("imageUrl")
        if not room_id or not isinstance(text, str):
            return {"ok": False, "error": "Message is invalid."}
        if image_url is not None and not isinstance(image_url, str):
            return {"ok": False, "error": "Image attachment is invalid."}
        image_id = _image_id_from_url(image_url) if image_url else None
        if image_url and not image_id:
            return {"ok": False, "error": "Only images uploaded to this chat can be attached."}
        ensure_db()
        try:
            message = chat_storage.create_chat_message(user_id, room_id, text, image_id)
        except chat_storage.ChatAccessError as exc:
            return {"ok": False, "error": str(exc)}
        except chat_storage.ChatValidationError as exc:
            return {"ok": False, "error": str(exc)}
        if not message:
            return {"ok": False, "error": "Unable to save this message."}
        socketio.emit("chat:message", message, to=room_id)
        return {"ok": True, "messageId": message["id"]}


def disconnect_user_sockets(user_id):
    if not _socketio:
        return
    with _socket_lock:
        sids = [
            sid for sid, connected_user_id in _socket_users.items()
            if connected_user_id == user_id
        ]
        for sid in sids:
            _socket_users.pop(sid, None)
    for sid in sids:
        try:
            _socketio.server.disconnect(sid, namespace="/")
        except Exception:
            pass


def disconnect_user_from_room(user_id, room_id):
    if not _socketio:
        return
    with _socket_lock:
        sids = [
            sid for sid, connected_user_id in _socket_users.items()
            if connected_user_id == user_id
        ]
    for sid in sids:
        try:
            _socketio.server.leave_room(sid, room_id, namespace="/")
        except Exception:
            pass


def _authenticated_socket_user():
    token = request.cookies.get("iq_session")
    if not token or not _jwt_secret or not _ensure_db:
        return None
    try:
        claims = jwt.decode(
            token,
            _jwt_secret,
            algorithms=["HS256"],
            audience="interviewiq",
            options={"require": ["exp", "sub", "aud", "iat"]},
        )
        _ensure_db()
        with storage.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id,token_version FROM iq_users WHERE id=%s",
                    (claims["sub"],),
                )
                user = cur.fetchone()
        if not user or user["token_version"] != claims.get("version"):
            return None
        return user["id"]
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        return None


def _socket_event_user():
    with _socket_lock:
        connected_user_id = _socket_users.get(request.sid)
    authenticated_user_id = _authenticated_socket_user()
    if not connected_user_id or authenticated_user_id != connected_user_id:
        disconnect()
        return None
    return connected_user_id


def _uuid_or_none(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def _image_id_from_url(image_url):
    if not isinstance(image_url, str):
        return None
    match = re.fullmatch(r"/api/chat/images/([0-9a-fA-F-]{36})", image_url)
    return _uuid_or_none(match.group(1)) if match else None
