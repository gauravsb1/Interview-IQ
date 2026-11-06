import functools
import json
import logging
import os
import re
import tempfile
import threading
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import bcrypt
import jwt
from flask import Flask, g, jsonify, request
from flask_limiter import Limiter
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
import pymysql
import intelligence
import storage

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
app.config["MAX_CONTENT_LENGTH"] = 12 * 1024 * 1024
logging.basicConfig(level=logging.INFO)
secret = os.environ["SESSION_SECRET"]
limiter = Limiter(key_func=lambda: request.remote_addr or "unknown", app=app,
                  default_limits=["120 per minute"], storage_uri="memory://")
_schema_ready = False
_schema_lock = threading.Lock()
_session_locks = [threading.Lock() for _ in range(64)]


@app.after_request
def private_response(response):
    # The same endpoint can return public examples or private candidate results.
    # Neither browser caches nor intermediary caches may reuse these responses.
    response.headers["Cache-Control"] = "no-store, private"
    response.headers["Pragma"] = "no-cache"
    response.vary.add("Cookie")
    return response


def ensure_db():
    global _schema_ready
    if not _schema_ready:
        with _schema_lock:
            if not _schema_ready:
                storage.initialize()
                _schema_ready = True


@app.before_request
def guard():
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("Origin")
        if origin and urlparse(origin).netloc != request.host:
            return jsonify(error="Cross-origin requests are not allowed."), 403
    g.user = None
    token = request.cookies.get("iq_session")
    if token:
        try:
            claims = jwt.decode(token, secret, algorithms=["HS256"], audience="interviewiq",
                                options={"require": ["exp", "sub", "aud", "iat"]})
            ensure_db()
            with storage.connect() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT id,email,name,token_version FROM iq_users WHERE id=%s", (claims["sub"],))
                    user = cur.fetchone()
                    if user and user["token_version"] == claims.get("version"):
                        g.user = user
        except jwt.InvalidTokenError:
            pass


def protected(fn):
    @functools.wraps(fn)
    def wrapped(*args, **kwargs):
        if not g.user:
            return jsonify(error="Please sign in to continue."), 401
        return fn(*args, **kwargs)
    return wrapped


def public_user(user):
    return {key: user[key] for key in ("id", "name", "email")}


def sign_in(user):
    token = jwt.encode({"sub": user["id"], "aud": "interviewiq", "version": user.get("token_version", 0),
                        "iat": datetime.now(timezone.utc), "exp": datetime.now(timezone.utc) + timedelta(hours=12)},
                       secret, algorithm="HS256")
    response = jsonify(public_user(user))
    response.set_cookie("iq_session", token, httponly=True, secure=True, samesite="Lax", max_age=43200, path="/")
    return response


@app.errorhandler(Exception)
def error(exc):
    if isinstance(exc, HTTPException):
        return jsonify(error=exc.description), exc.code
    if isinstance(exc, ValueError):
        return jsonify(error=str(exc)), 400
    # Do not log connection strings, submitted answers, or upstream response bodies.
    app.logger.error("Request failed: %s", type(exc).__name__)
    if isinstance(exc, pymysql.MySQLError):
        return jsonify(error="The MySQL database is unavailable. Check the database connection settings and network access."), 503
    return jsonify(error="This operation could not be completed. Please retry."), 503


@app.get("/api/healthz")
def health():
    return jsonify(status="ok")


@app.get("/api/auth/me")
@protected
def me():
    return jsonify(public_user(g.user))


@app.post("/api/auth/register")
@limiter.limit("5 per minute")
def register():
    data = request.get_json()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    name = str(data.get("name", "")).strip()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 254:
        raise ValueError("Enter a valid email address.")
    if not 10 <= len(password.encode()) <= 72:
        raise ValueError("Use a password between 10 and 72 bytes.")
    if not 1 <= len(name) <= 120:
        raise ValueError("Enter your name (up to 120 characters).")
    ensure_db()
    user = {"id": str(uuid.uuid4()), "name": name, "email": email}
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    try:
        with storage.connect() as conn:
            with conn.cursor() as cur:
                cur.execute("INSERT INTO iq_users(id,email,name,password_hash) VALUES(%s,%s,%s,%s)",
                            (user["id"], email, name, hashed))
            conn.commit()
    except pymysql.IntegrityError:
        return jsonify(error="An account with this email already exists. Please sign in."), 409
    return sign_in(user)


@app.post("/api/auth/login")
@limiter.limit("10 per minute")
def login():
    data = request.get_json()
    password = str(data.get("password", ""))
    if len(password.encode()) > 72:
        return jsonify(error="Invalid email or password."), 401
    ensure_db()
    with storage.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM iq_users WHERE email=%s", (str(data.get("email", "")).strip().lower(),))
            user = cur.fetchone()
    if not user or not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        return jsonify(error="Invalid email or password."), 401
    return sign_in(user)


@app.post("/api/auth/logout")
def logout():
    if g.user:
        with storage.connect() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE iq_users SET token_version=token_version+1 WHERE id=%s", (g.user["id"],))
            conn.commit()
    response = jsonify(ok=True)
    response.delete_cookie("iq_session", path="/", secure=True, httponly=True, samesite="Lax")
    return response


def profile():
    return storage.get_record(g.user["id"], "profile", "profile-" + g.user["id"])


@app.route("/api/profile", methods=["GET", "POST"])
@protected
@limiter.limit("10 per hour", methods=["POST"])
def resume():
    if request.method == "GET":
        result = profile() or dict(filename="", skills=[], projects=[], education=[], certifications=[], experience=[])
    else:
        file = request.files.get("file")
        if not file:
            raise ValueError("Choose a resume file.")
        result = intelligence.extract_resume(file)
        storage.save(g.user["id"], "profile", "profile-" + g.user["id"], result)
        intelligence.clear_index(g.user["id"])
    return jsonify({k: v for k, v in result.items() if k != "text"})


def owned_session(sid):
    result = storage.get_record(g.user["id"], "session", sid)
    if not result:
        from werkzeug.exceptions import NotFound
        raise NotFound("Interview not found.")
    return result


def persist(interview):
    answers = interview["answers"]
    interview["score"] = round(sum(sum(a["scores"].values()) / 4 for a in answers) / len(answers), 1) if answers else 0
    storage.save(g.user["id"], "session", interview["id"], interview)
    return jsonify(interview)


@app.route("/api/sessions", methods=["GET", "POST"])
@protected
@limiter.limit("20 per hour", methods=["POST"])
def sessions():
    if request.method == "GET":
        return jsonify(sorted(storage.records(g.user["id"], "session"), key=lambda s: s["createdAt"], reverse=True))
    data = request.get_json()
    p = profile()
    if not p:
        raise ValueError("Upload your resume before starting an interview.")
    category, role = data.get("category"), str(data.get("role", "")).strip()
    count = data.get("questionCount", 5)
    if category not in ("technical", "hr", "behavioral", "company-specific") or not 2 <= len(role) <= 200:
        raise ValueError("Choose a category and a target role.")
    if not isinstance(count, int) or not 3 <= count <= 10:
        raise ValueError("Choose between 3 and 10 questions.")
    company = str(data.get("company", "")).strip()[:150]
    if category == "company-specific" and not company:
        raise ValueError("Enter the target company.")
    interview = dict(id=str(uuid.uuid4()), role=role, category=category, company=company,
                     createdAt=datetime.now(timezone.utc).isoformat(), status="active",
                     questionCount=count, answers=[], ratings=[], score=0, currentQuestion="")
    interview["currentQuestion"] = intelligence.question(g.user["id"], p, interview)
    return persist(interview)


@app.route("/api/sessions/<sid>", methods=["GET", "DELETE"])
@protected
def session(sid):
    with _session_locks[hash(sid) % 64]:
        result = owned_session(sid)
        if request.method == "DELETE":
            storage.delete(g.user["id"], "session", sid)
            return jsonify(ok=True)
        return jsonify(result)


@app.post("/api/sessions/<sid>/answers")
@protected
@limiter.limit("60 per hour")
def answer(sid):
    with _session_locks[hash(sid) % 64]:
        interview = owned_session(sid)
        data = request.get_json()
        text = str(data.get("text", "")).strip()
        if interview["status"] != "active" or data.get("questionIndex") != len(interview["answers"]):
            return jsonify(error="This question has already been answered. Refresh the interview."), 409
        if not 2 <= len(text) <= 12000:
            raise ValueError("Enter an answer between 2 and 12,000 characters.")
        result = intelligence.evaluate(interview, text)
        result.update(question=interview["currentQuestion"], text=text)
        if data.get("transcriptId"):
            speech = storage.get_record(g.user["id"], "transcript", data["transcriptId"])
            if speech:
                result["speech"] = speech
        interview["answers"].append(result)
        if len(interview["answers"]) >= interview["questionCount"]:
            interview.update(status="completed", currentQuestion="", nextQuestionPending=False)
            return persist(interview)

        # Commit the evaluated answer before asking Gemini for another question.
        # A provider outage must not make the candidate submit (and pay to score)
        # the same answer again.
        interview["currentQuestion"] = ""
        interview["nextQuestionPending"] = True
        persist(interview)
        try:
            interview["currentQuestion"] = intelligence.question(g.user["id"], profile(), interview)
            interview["nextQuestionPending"] = False
        except Exception as exc:
            app.logger.warning("Next interview question unavailable: %s", type(exc).__name__)
            return jsonify(interview)
        return persist(interview)


@app.post("/api/sessions/<sid>/next-question")
@protected
@limiter.limit("20 per hour")
def retry_next_question(sid):
    with _session_locks[hash(sid) % 64]:
        interview = owned_session(sid)
        if interview["status"] != "active" or not interview.get("nextQuestionPending"):
            return jsonify(error="There is no pending question to retry."), 409
        try:
            interview["currentQuestion"] = intelligence.question(g.user["id"], profile(), interview)
            interview["nextQuestionPending"] = False
        except Exception as exc:
            app.logger.warning("Next interview question retry unavailable: %s", type(exc).__name__)
            return jsonify(error="The answer is saved, but the next question is unavailable. Please retry."), 503
        return persist(interview)


@app.post("/api/sessions/<sid>/finish")
@protected
def finish(sid):
    with _session_locks[hash(sid) % 64]:
        interview = owned_session(sid)
        interview.update(status="completed", currentQuestion="", nextQuestionPending=False)
        return persist(interview)


@app.post("/api/transcribe")
@protected
@limiter.limit("30 per hour")
def transcribe():
    file = request.files.get("file")
    if not file:
        raise ValueError("Record an answer first.")
    with tempfile.NamedTemporaryFile(suffix=".webm") as temp:
        file.save(temp.name)
        result = intelligence.transcribe_audio(temp.name)
    result["id"] = str(uuid.uuid4())
    storage.save(g.user["id"], "transcript", result["id"], result)
    return jsonify(result)


@app.post("/api/sessions/<sid>/ratings")
@protected
def ratings(sid):
    with _session_locks[hash(sid) % 64]:
        interview = owned_session(sid)
        data = request.get_json()
        index = data.get("answerIndex")
        if not isinstance(index, int) or not 0 <= index < len(interview["answers"]):
            raise ValueError("Choose a valid answer.")
        if not str(data.get("rater", "")).strip() or len(str(data["rater"])) > 120:
            raise ValueError("Enter the independent rater's label.")
        scores = data.get("scores", {})
        for key in ("technicalAccuracy", "clarity", "completeness", "star"):
            if isinstance(scores.get(key), bool) or not isinstance(scores.get(key), (int, float)) or not 0 <= scores[key] <= 100:
                raise ValueError("Every rating must be from 0 to 100.")
        rating = dict(answerIndex=index, rater=str(data["rater"]), scores={k: scores[k] for k in ("technicalAccuracy", "clarity", "completeness", "star")},
                      notes=str(data.get("notes", ""))[:2000])
        interview["ratings"] = [r for r in interview["ratings"] if not (r["answerIndex"] == index and r["rater"] == rating["rater"])] + [rating]
        return persist(interview)


@app.get("/api/dashboard")
def dashboard():
    if not g.user:
        return jsonify(demo=True, totalSessions=12, averageScore=82, totalAnswers=60, improvement=18,
                       trends=[dict(date=f"2026-10-{day:02}", score=score) for day, score in [(1,64),(5,69),(10,72),(15,70),(20,78),(25,82)]],
                       skills=[dict(name=name, score=score) for name, score in [("Technical accuracy",85),("Clarity",82),("Completeness",78),("STAR structure",74)]],
                       recentSessions=[dict(id="sample-"+str(i),category=cat,role=role,company=company,createdAt=f"2026-10-{25-i:02}T10:00:00Z",status="completed",questionCount=5,currentQuestion="",answers=[],score=score,ratings=[]) for i,(cat,role,company,score) in enumerate([("technical","Frontend Developer","",85),("behavioral","Software Engineer","",78),("company-specific","Product Engineer","Google",82)])])
    all_sessions = sorted(storage.records(g.user["id"], "session"), key=lambda s: s["createdAt"])
    completed = [s for s in all_sessions if s["status"] == "completed" and s["answers"]]
    answers = [a for s in completed for a in s["answers"]]
    skills = {}
    for a in answers:
        skills.setdefault(a["skill"], []).append(sum(a["scores"].values()) / 4)
    return jsonify(demo=False, totalSessions=len(all_sessions), totalAnswers=len(answers),
                   averageScore=round(sum(s["score"] for s in completed)/len(completed),1) if completed else 0,
                   improvement=round(completed[-1]["score"]-completed[0]["score"],1) if len(completed)>1 else 0,
                   trends=[dict(date=s["createdAt"], score=s["score"]) for s in completed],
                   skills=[dict(name=k, score=round(sum(v)/len(v),1)) for k,v in skills.items()],
                   recentSessions=list(reversed(all_sessions))[:5])
