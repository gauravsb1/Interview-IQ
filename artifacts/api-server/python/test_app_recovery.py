import copy
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from flask import g

import app as api


def sample_scores():
    return {
        "scores": {"technicalAccuracy": 80, "clarity": 75, "completeness": 70, "star": 65},
        "feedback": "Specific feedback.",
        "improvement": "Add a result metric.",
        "skill": "Communication",
    }


def sample_interview():
    return {
        "id": "session-1",
        "status": "active",
        "questionCount": 3,
        "currentQuestion": "How did you design the service?",
        "currentContext": [],
        "answers": [],
        "ratings": [],
        "role": "Backend Engineer",
        "category": "technical",
        "company": "",
        "score": 0,
    }


class AnswerRecoveryTests(unittest.TestCase):
    def test_one_minute_session_receives_a_sixty_second_deadline(self):
        with api.app.test_request_context(
            "/api/sessions",
            method="POST",
            json={
                "category": "technical",
                "role": "Backend Engineer",
                "questionCount": 3,
                "timeLimitMinutes": 1,
                "recordingLimitMinutes": 12,
            },
        ):
            g.user = {"id": "candidate-1"}
            with patch.object(api, "profile", return_value={"text": "Resume text"}), patch.object(
                api.intelligence, "question", return_value={"question": "Question?", "context": []}
            ), patch.object(api.storage, "save"):
                response = api.app.view_functions["sessions"]()

        payload = response.get_json()
        started = datetime.fromisoformat(payload["startedAt"])
        deadline = datetime.fromisoformat(payload["deadlineAt"])
        self.assertEqual(payload["timeLimitMinutes"], 1)
        self.assertEqual(payload["recordingLimitMinutes"], 12)
        self.assertEqual((deadline - started).total_seconds(), 60)

    def test_expired_session_saves_final_answer_without_requesting_another_question(self):
        interview = sample_interview()
        interview["deadlineAt"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()

        with api.app.test_request_context(
            "/api/sessions/session-1/answers",
            method="POST",
            json={"text": "final candidate answer", "questionIndex": 0},
        ):
            g.user = {"id": "candidate-1"}
            with patch.object(api, "owned_session", return_value=interview), patch.object(
                api.intelligence, "evaluate", return_value=sample_scores()
            ), patch.object(api.intelligence, "question") as next_question, patch.object(
                api.storage, "save"
            ):
                response = api.app.view_functions["answer"]("session-1")

        payload = response.get_json()
        self.assertEqual(payload["status"], "completed")
        self.assertEqual(payload["answers"][0]["text"], "final candidate answer")
        self.assertFalse(payload["nextQuestionPending"])
        next_question.assert_not_called()

    def test_answer_is_persisted_before_next_question_failure(self):
        interview = sample_interview()
        saved = []

        def save(uid, kind, record_id, body):
            saved.append(copy.deepcopy(body))

        def next_question(uid, profile, updated_interview):
            self.assertEqual(len(saved), 1)
            self.assertEqual(saved[0]["answers"][0]["text"], "candidate answer")
            self.assertTrue(saved[0]["nextQuestionPending"])
            raise RuntimeError("provider unavailable")

        with api.app.test_request_context(
            "/api/sessions/session-1/answers",
            method="POST",
            json={"text": "candidate answer", "questionIndex": 0, "transcriptId": "transcript-1"},
        ):
            g.user = {"id": "candidate-1"}
            with patch.object(api, "owned_session", return_value=interview), patch.object(
                api.intelligence, "evaluate", return_value=sample_scores()
            ), patch.object(api.intelligence, "question", side_effect=next_question), patch.object(
                api, "profile", return_value={"text": "Resume text"}
            ), patch.object(
                api.storage, "get_record", return_value={"speakingRate": 125, "pauses": 2, "silenceDuration": 1.5, "fillerWords": 1}
            ), patch.object(api.storage, "save", side_effect=save):
                response = api.app.view_functions["answer"]("session-1")

        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(payload["answers"]), 1)
        self.assertTrue(payload["nextQuestionPending"])
        self.assertEqual(payload["answers"][0]["speech"]["speakingRate"], 125)
        self.assertEqual(saved[0]["answers"][0]["speech"]["pauses"], 2)
        self.assertEqual(len(saved), 1)

    def test_retry_adds_question_without_evaluating_saved_answer_again(self):
        interview = sample_interview()
        interview["answers"] = [{"text": "saved answer", "scores": sample_scores()["scores"]}]
        interview["currentQuestion"] = ""
        interview["nextQuestionPending"] = True

        with api.app.test_request_context("/api/sessions/session-1/next-question", method="POST"):
            g.user = {"id": "candidate-1"}
            with patch.object(api, "owned_session", return_value=interview), patch.object(
                api.intelligence, "question", return_value={"question": "Next question?", "context": []}
            ), patch.object(api, "profile", return_value={"text": "Resume text"}), patch.object(
                api.storage, "save"
            ) as save:
                response = api.app.view_functions["retry_next_question"]("session-1")

        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(payload["answers"]), 1)
        self.assertEqual(payload["currentQuestion"], "Next question?")
        self.assertFalse(payload["nextQuestionPending"])
        save.assert_called_once()


class ResumeDeletionTests(unittest.TestCase):
    def test_resume_deletion_is_blocked_while_a_session_is_active(self):
        with api.app.test_request_context("/api/profile", method="DELETE"):
            g.user = {"id": "candidate-1"}
            with patch.object(api.storage, "records", return_value=[{"status": "active"}]), patch.object(
                api.storage, "delete"
            ) as delete:
                response = api.app.make_response(api.app.view_functions["resume"]())

        self.assertEqual(response.status_code, 409)
        delete.assert_not_called()

    def test_resume_deletion_is_owner_scoped_when_no_session_is_active(self):
        with api.app.test_request_context("/api/profile", method="DELETE"):
            g.user = {"id": "candidate-1"}
            with patch.object(api.storage, "records", return_value=[]), patch.object(
                api.storage, "delete"
            ) as delete:
                response = api.app.view_functions["resume"]()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"ok": True})
        delete.assert_called_once_with("candidate-1", "profile", "profile-candidate-1")


class BlindRatingTests(unittest.TestCase):
    def test_rating_requires_blind_review_confirmation(self):
        interview = sample_interview()
        interview["answers"] = [{"text": "candidate answer", "scores": sample_scores()["scores"]}]
        data = {
            "answerIndex": 0,
            "rater": "Peer A",
            "scores": sample_scores()["scores"],
        }
        with api.app.test_request_context("/api/sessions/session-1/ratings", method="POST", json=data):
            g.user = {"id": "candidate-1"}
            with patch.object(api, "owned_session", return_value=interview):
                with self.assertRaisesRegex(ValueError, "without seeing the AI scores"):
                    api.app.view_functions["ratings"]("session-1")

    def test_blind_rating_is_saved_as_exploratory_data(self):
        interview = sample_interview()
        interview["answers"] = [{"text": "candidate answer", "scores": sample_scores()["scores"]}]
        data = {
            "answerIndex": 0,
            "rater": "Peer A",
            "scores": sample_scores()["scores"],
            "blindReviewed": True,
            "notes": "Example-specific and clear.",
        }
        with api.app.test_request_context("/api/sessions/session-1/ratings", method="POST", json=data):
            g.user = {"id": "candidate-1"}
            with patch.object(api, "owned_session", return_value=interview), patch.object(api.storage, "save"):
                response = api.app.view_functions["ratings"]("session-1")

        rating = response.get_json()["ratings"][0]
        self.assertTrue(rating["blindReviewed"])
        self.assertEqual(rating["rater"], "Peer A")


if __name__ == "__main__":
    unittest.main()
