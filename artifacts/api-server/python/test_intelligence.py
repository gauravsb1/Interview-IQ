import unittest
from unittest.mock import patch

import intelligence


class Vector(list):
    def tolist(self):
        return list(self)


class FakeEmbeddingModel:
    def embed(self, documents, batch_size=32):
        for document in documents:
            if "candidate company context" in document.casefold():
                yield Vector([1.0, 0.0])
            else:
                yield Vector([0.0, 1.0])

    def query_embed(self, query):
        yield Vector([1.0, 0.0])


class RetrievalTests(unittest.TestCase):
    def test_company_context_is_ranked_and_labeled(self):
        with patch.object(intelligence, "_get_embedding_model", return_value=FakeEmbeddingModel()):
            results = intelligence.retrieve(
                "candidate-1",
                {"text": "Built a Python API and improved response times."},
                "role-specific question",
                "Candidate company context: the team operates payment infrastructure.",
            )

        self.assertTrue(results)
        company_source = next(
            item for item in results if item["source"].startswith("Provided company/job context")
        )
        self.assertIn("Candidate company context", company_source["text"])
        self.assertGreater(company_source["similarity"], 0.9)

    def test_retrieval_never_mixes_profiles(self):
        with patch.object(intelligence, "_get_embedding_model", return_value=FakeEmbeddingModel()):
            first = intelligence.retrieve(
                "candidate-1", {"text": "Candidate one built a Python API."}, "interview question",
            )
            second = intelligence.retrieve(
                "candidate-2", {"text": "Candidate two built a Rust compiler."}, "interview question",
            )

        first_text = " ".join(item["text"] for item in first)
        second_text = " ".join(item["text"] for item in second)
        self.assertIn("Candidate one", first_text)
        self.assertNotIn("Candidate two", first_text)
        self.assertIn("Candidate two", second_text)
        self.assertNotIn("Candidate one", second_text)

    def test_question_returns_the_sources_sent_to_gemini(self):
        context = [{"source": "Resume · segment 1", "text": "Built a Python API.", "similarity": 0.8}]
        interview = {
            "role": "Backend engineer",
            "category": "technical",
            "company": "",
            "companyContext": "",
            "answers": [],
        }
        with patch.object(intelligence, "retrieve", return_value=context), patch.object(
            intelligence, "generate", return_value={"question": "How did you test the API?"}
        ) as generate:
            result = intelligence.question("candidate-1", {"text": "Built an API."}, interview)

        self.assertEqual(result, {"question": "How did you test the API?", "context": context})
        self.assertEqual(generate.call_args.args[1]["context"], context)

    def test_evaluation_receives_context_used_for_question(self):
        context = [{"source": "Provided company/job context", "text": "Build payment services.", "similarity": 0.7}]
        interview = {
            "currentQuestion": "How would you design a payment service?",
            "currentContext": context,
            "role": "Backend engineer",
            "category": "company-specific",
        }
        scores = {
            "scores": {"technicalAccuracy": 80, "clarity": 80, "completeness": 80, "star": 80},
            "feedback": "Clear.",
            "improvement": "Add a failure case.",
            "skill": "System design",
        }
        with patch.object(intelligence, "generate", return_value=scores) as generate:
            result = intelligence.evaluate(interview, "I would make the endpoint idempotent.")

        self.assertEqual(result, scores)
        self.assertEqual(generate.call_args.args[1]["context"], context)


if __name__ == "__main__":
    unittest.main()
