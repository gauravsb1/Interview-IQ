import uuid

import storage


class ChatAccessError(Exception):
    pass


class ChatValidationError(Exception):
    pass


def chat_rooms_for_user(user_id):
    with storage.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT r.id, r.name, r.description, r.is_public, r.created_at,
                       member.user_id AS member_user_id,
                       other_user.id AS other_user_id,
                       other_user.name AS other_user_name,
                       (SELECT CASE
                           WHEN m.message_text = '' THEN 'Image'
                           WHEN m.image_url IS NOT NULL THEN CONCAT(m.message_text, ' · image')
                           ELSE m.message_text
                        END
                        FROM messages m
                        WHERE m.room_id = r.id
                        ORDER BY m.created_at DESC, m.id DESC
                        LIMIT 1) AS last_message,
                       (SELECT m.created_at
                        FROM messages m
                        WHERE m.room_id = r.id
                        ORDER BY m.created_at DESC, m.id DESC
                        LIMIT 1) AS last_message_at
                FROM chat_rooms r
                LEFT JOIN room_members member
                       ON member.room_id = r.id AND member.user_id = %s
                LEFT JOIN room_members other_member
                       ON r.is_public = 0 AND other_member.room_id = r.id
                      AND other_member.user_id <> %s
                LEFT JOIN iq_users other_user ON other_user.id = other_member.user_id
                WHERE r.is_public = 1 OR member.user_id = %s
                ORDER BY r.is_public DESC,
                         COALESCE(last_message_at, r.created_at) DESC,
                         r.name ASC
            """, (user_id, user_id, user_id))
            rows = cur.fetchall()
    return [_serialize_room(row) for row in rows]


def chat_room_for_user(user_id, room_id):
    return next((room for room in chat_rooms_for_user(user_id) if room["id"] == room_id), None)


def search_chat_students(user_id, query):
    with storage.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, name
                FROM iq_users
                WHERE id <> %s AND INSTR(LOWER(name), LOWER(%s)) > 0
                ORDER BY name ASC
                LIMIT 20
            """, (user_id, query))
            rows = cur.fetchall()
    return [{"id": row["id"], "name": row["name"]} for row in rows]


def chat_friends_for_user(user_id):
    friends = []
    incoming = []
    outgoing = []
    with storage.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT request.id, request.sender_id, request.recipient_id,
                       request.status, request.created_at,
                       sender.name AS sender_name,
                       recipient.name AS recipient_name
                FROM friend_requests request
                JOIN iq_users sender ON sender.id = request.sender_id
                JOIN iq_users recipient ON recipient.id = request.recipient_id
                WHERE request.sender_id=%s OR request.recipient_id=%s
                ORDER BY request.created_at DESC, request.id DESC
            """, (user_id, user_id))
            rows = cur.fetchall()

    for row in rows:
        sender_id = row["sender_id"]
        recipient_id = row["recipient_id"]
        status = row["status"]
        if status == "accepted":
            friend_id = recipient_id if sender_id == user_id else sender_id
            friend_name = row["recipient_name"] if sender_id == user_id else row["sender_name"]
            friends.append({"id": friend_id, "name": friend_name})
            continue
        if status != "pending":
            continue
        is_incoming = recipient_id == user_id
        request = {
            "id": row["id"],
            "userId": sender_id if is_incoming else recipient_id,
            "name": row["sender_name"] if is_incoming else row["recipient_name"],
            "createdAt": storage._iso_datetime(row.get("created_at")),
        }
        (incoming if is_incoming else outgoing).append(request)

    friends.sort(key=lambda friend: friend["name"].casefold())
    return {
        "friends": friends,
        "incomingRequests": incoming,
        "outgoingRequests": outgoing,
    }


def send_friend_request(user_id, other_user_id):
    if user_id == other_user_id:
        raise ChatValidationError("You cannot add yourself as a friend.")
    pair_key = direct_room_key(user_id, other_user_id)

    with storage.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM iq_users WHERE id=%s", (other_user_id,))
            if not cur.fetchone():
                return None

            cur.execute("""
                SELECT id, sender_id, recipient_id, status
                FROM friend_requests
                WHERE pair_key=%s
                FOR UPDATE
            """, (pair_key,))
            row = cur.fetchone()
            if not row:
                request_id = str(uuid.uuid4())
                cur.execute("""
                    INSERT IGNORE INTO friend_requests
                        (id, pair_key, sender_id, recipient_id, status)
                    VALUES (%s, %s, %s, %s, 'pending')
                """, (request_id, pair_key, user_id, other_user_id))
                cur.execute("""
                    SELECT id, sender_id, recipient_id, status
                    FROM friend_requests
                    WHERE pair_key=%s
                    FOR UPDATE
                """, (pair_key,))
                row = cur.fetchone()
                if not row:
                    raise RuntimeError("Unable to create friend request.")

            if row["status"] == "accepted":
                result = {"status": "friends", "requestId": row["id"]}
            elif row["status"] == "pending":
                result = {
                    "status": "pending" if row["sender_id"] == user_id else "incoming",
                    "requestId": row["id"],
                }
                if result["status"] == "pending":
                    result["notifyUserId"] = other_user_id
            else:
                cur.execute("""
                    UPDATE friend_requests
                    SET sender_id=%s, recipient_id=%s, status='pending',
                        created_at=CURRENT_TIMESTAMP, responded_at=NULL
                    WHERE id=%s
                """, (user_id, other_user_id, row["id"]))
                result = {
                    "status": "pending",
                    "requestId": row["id"],
                    "notifyUserId": other_user_id,
                }
        conn.commit()
    return result


def respond_to_friend_request(user_id, request_id, action):
    if action not in {"accepted", "declined"}:
        raise ChatValidationError("Choose accept or decline.")
    with storage.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, sender_id, recipient_id, status
                FROM friend_requests
                WHERE id=%s
                FOR UPDATE
            """, (request_id,))
            row = cur.fetchone()
            if not row:
                return None

            if row["status"] == action and row["recipient_id"] == user_id:
                return {
                    "ok": True,
                    "status": action,
                    "notifyUserIds": [],
                }
            if row["recipient_id"] != user_id:
                raise ChatAccessError("Only the recipient can respond to this request.")
            if row["status"] != "pending":
                raise ChatValidationError("This friend request is no longer pending.")

            cur.execute("""
                UPDATE friend_requests
                SET status=%s, responded_at=CURRENT_TIMESTAMP
                WHERE id=%s AND status='pending' AND recipient_id=%s
            """, (action, request_id, user_id))
            if cur.rowcount != 1:
                raise ChatValidationError("This friend request has already been handled.")
            notify_user_ids = [row["sender_id"], row["recipient_id"]]
        conn.commit()
    return {
        "ok": True,
        "status": action,
        "notifyUserIds": notify_user_ids,
    }


def create_direct_room(user_id, other_user_id):
    if user_id == other_user_id:
        raise ChatValidationError("You cannot start a chat with yourself.")

    direct_key = direct_room_key(user_id, other_user_id)
    new_room_id = str(uuid.uuid4())

    with storage.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM iq_users WHERE id=%s", (other_user_id,))
            other_user = cur.fetchone()
            if not other_user:
                return None

            cur.execute("""
                INSERT IGNORE INTO chat_rooms
                    (id, name, description, is_public, direct_key, created_by)
                VALUES (%s, 'Direct message', '', 0, %s, %s)
            """, (new_room_id, direct_key, user_id))
            cur.execute("SELECT id FROM chat_rooms WHERE direct_key=%s", (direct_key,))
            room = cur.fetchone()
            if not room:
                raise RuntimeError("Unable to create direct chat room.")
            room_id = room["id"]
            cur.executemany("""
                INSERT IGNORE INTO room_members (room_id, user_id)
                VALUES (%s, %s)
            """, ((room_id, user_id), (room_id, other_user_id)))
        conn.commit()

    return chat_room_for_user(user_id, room_id)


def direct_room_key(user_id, other_user_id):
    first_id, second_id = sorted((user_id, other_user_id))
    return f"{first_id}:{second_id}"


def join_public_room(user_id, room_id):
    with storage.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT is_public FROM chat_rooms WHERE id=%s", (room_id,))
            room = cur.fetchone()
            if not room:
                return "not_found"
            if not room["is_public"]:
                return "not_public"
            cur.execute("""
                INSERT IGNORE INTO room_members (room_id, user_id)
                VALUES (%s, %s)
            """, (room_id, user_id))
        conn.commit()
    return "ok"


def leave_public_room(user_id, room_id):
    with storage.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT is_public FROM chat_rooms WHERE id=%s", (room_id,))
            room = cur.fetchone()
            if not room:
                return "not_found"
            if not room["is_public"]:
                return "not_public"
            cur.execute(
                "DELETE FROM room_members WHERE room_id=%s AND user_id=%s",
                (room_id, user_id),
            )
        conn.commit()
    return "ok"


def is_room_member(user_id, room_id):
    with storage.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 1 FROM room_members
                WHERE room_id=%s AND user_id=%s
                LIMIT 1
            """, (room_id, user_id))
            return cur.fetchone() is not None


def chat_messages(user_id, room_id, limit=100):
    if not is_room_member(user_id, room_id):
        return None
    with storage.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT m.id, m.room_id, m.sender_id, u.name AS sender_name,
                       m.message_text, m.image_url, m.created_at
                FROM messages m
                JOIN iq_users u ON u.id = m.sender_id
                WHERE m.room_id=%s
                ORDER BY m.created_at DESC, m.id DESC
                LIMIT %s
            """, (room_id, limit))
            rows = cur.fetchall()
    rows.reverse()
    return [_serialize_message(row) for row in rows]


def create_chat_message(user_id, room_id, text, image_id=None):
    text = text.strip() if isinstance(text, str) else ""
    if len(text) > 4000:
        raise ChatValidationError("Messages must be 4,000 characters or fewer.")
    if not text and not image_id:
        raise ChatValidationError("Write a message or attach an image.")

    message_id = str(uuid.uuid4())
    image_url = f"/api/chat/images/{image_id}" if image_id else None

    with storage.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 1 FROM room_members
                WHERE room_id=%s AND user_id=%s
                LIMIT 1
            """, (room_id, user_id))
            if not cur.fetchone():
                raise ChatAccessError("You are not a member of this chat.")

            if image_id:
                cur.execute("""
                    SELECT image_id FROM chat_uploads
                    WHERE image_id=%s AND room_id=%s AND uploader_id=%s
                      AND message_id IS NULL
                    FOR UPDATE
                """, (image_id, room_id, user_id))
                if not cur.fetchone():
                    raise ChatValidationError("This image upload is unavailable.")

            cur.execute("""
                INSERT INTO messages
                    (id, room_id, sender_id, message_text, image_url)
                VALUES (%s, %s, %s, %s, %s)
            """, (message_id, room_id, user_id, text, image_url))

            if image_id:
                cur.execute("""
                    UPDATE chat_uploads SET message_id=%s
                    WHERE image_id=%s AND room_id=%s AND uploader_id=%s
                      AND message_id IS NULL
                """, (message_id, image_id, room_id, user_id))
                if cur.rowcount != 1:
                    raise ChatValidationError("This image upload has already been used.")
        conn.commit()

    return chat_message_by_id(room_id, message_id)


def chat_message_by_id(room_id, message_id):
    with storage.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT m.id, m.room_id, m.sender_id, u.name AS sender_name,
                       m.message_text, m.image_url, m.created_at
                FROM messages m
                JOIN iq_users u ON u.id = m.sender_id
                WHERE m.room_id=%s AND m.id=%s
                LIMIT 1
            """, (room_id, message_id))
            row = cur.fetchone()
    return _serialize_message(row) if row else None


def create_chat_upload(user_id, room_id, image_id, storage_name, content_type):
    with storage.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 1 FROM room_members
                WHERE room_id=%s AND user_id=%s
                LIMIT 1
            """, (room_id, user_id))
            if not cur.fetchone():
                return False
            cur.execute("""
                INSERT INTO chat_uploads
                    (image_id, room_id, uploader_id, storage_name, content_type)
                VALUES (%s, %s, %s, %s, %s)
            """, (image_id, room_id, user_id, storage_name, content_type))
        conn.commit()
    return True


def chat_image_for_user(user_id, image_id):
    with storage.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT image_id, room_id, uploader_id, storage_name,
                       content_type, message_id
                FROM chat_uploads
                WHERE image_id=%s
                LIMIT 1
            """, (image_id,))
            image = cur.fetchone()
            if not image:
                return None
            cur.execute("""
                SELECT 1 FROM room_members
                WHERE room_id=%s AND user_id=%s
                LIMIT 1
            """, (image["room_id"], user_id))
            is_member = cur.fetchone() is not None

    if image["message_id"] is None and image["uploader_id"] != user_id:
        return None
    if not is_member:
        return None
    return image


def _serialize_room(row):
    room = {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"] or "",
        "isPublic": bool(row["is_public"]),
        "isMember": row.get("member_user_id") is not None,
        "createdAt": storage._iso_datetime(row.get("created_at")),
    }
    if row.get("last_message") is not None:
        room["lastMessage"] = str(row["last_message"])[:160]
    if row.get("last_message_at"):
        room["lastMessageAt"] = storage._iso_datetime(row["last_message_at"])
    if row.get("other_user_id"):
        room["otherUser"] = {
            "id": row["other_user_id"],
            "name": row["other_user_name"] or "InterviewIQ member",
        }
        room["name"] = row["other_user_name"] or "InterviewIQ member"
    return room


def _serialize_message(row):
    return {
        "id": row["id"],
        "roomId": row["room_id"],
        "senderId": row["sender_id"],
        "senderName": row["sender_name"],
        "text": row["message_text"] or "",
        **({"imageUrl": row["image_url"]} if row.get("image_url") else {}),
        "createdAt": storage._iso_datetime(row.get("created_at")),
    }
