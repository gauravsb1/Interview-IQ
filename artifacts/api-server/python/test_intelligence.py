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


class FakeCollection:
    def __init__(self, name):
        self.name = name
        self.rows = []

    def delete(self, where):
        self.rows = [row for row in self.rows if row["metadata"]["owner_id"] != where["owner_id"]]

    def add(self, ids, documents, embeddings, metadatas):
        self.rows.extend(
            {"id": item_id, "document": document, "embedding": embedding, "metadata": metadata}
            for item_id, document, embedding, metadata in zip(ids, documents, embeddings, metadatas)
        )

    def query(self, query_embeddings, n_results, where):
        query = query_embeddings[0]
        rows = [row for row in self.rows if row["metadata"]["owner_id"] == where["owner_id"]]
        rows.sort(
            key=lambda row: sum(a * b for a, b in zip(query, row["embedding"])),
            reverse=True,
        )
        rows = rows[:n_results]
        return {
            "documents": [[row["document"] for row in rows]],
            "metadatas": [[row["metadata"] for row in rows]],
            "distances": [[1.0 - sum(a * b for a, b in zip(query, row["embedding"])) for row in rows]],
        }


class FakeChromaClient:
    def __init__(self):
        self.collections = {}

    def get_or_create_collection(self, name, metadata):
        return self.collections.setdefault(name, FakeCollection(name))

    def list_collections(self):
        return list(self.collections.values())

    def delete_collection(self, name):
        del self.collections[name]


class RetrievalTests(unittest.TestCase):
    def test_company_context_is_ranked_and_labeled(self):
        with patch.object(intelligence, "_get_embedding_model", return_value=FakeEmbeddingModel()), patch.object(
            intelligence, "_get_chroma_client", return_value=FakeChromaClient()
        ):
            results = intelligence.retrieve(
                "candidate-1",
                {"text": "Built a Python API and improved response times."},
                "role-specific question",
                "Candidate company context: the team operates payment infrastructure.",
                session_id="session-1",
            )

        self.assertTrue(results)
        company_source = next(
            item for item in results if item["source"].startswith("Provided company/job context")
        )
        self.assertIn("Candidate company context", company_source["text"])
        self.assertGreater(company_source["similarity"], 0.9)

    def test_retrieval_never_mixes_profiles(self):
        client = FakeChromaClient()
        with patch.object(intelligence, "_get_embedding_model", return_value=FakeEmbeddingModel()), patch.object(
            intelligence, "_get_chroma_client", return_value=client
        ):
            first = intelligence.retrieve(
                "candidate-1", {"text": "Candidate one built a Python API."}, "interview question",
                session_id="session-1",
            )
            second = intelligence.retrieve(
                "candidate-2", {"text": "Candidate two built a Rust compiler."}, "interview question",
                session_id="session-2",
            )

        first_text = " ".join(item["text"] for item in first)
        second_text = " ".join(item["text"] for item in second)
        self.assertIn("Candidate one", first_text)
        self.assertNotIn("Candidate two", first_text)
        self.assertIn("Candidate two", second_text)
        self.assertNotIn("Candidate one", second_text)
        self.assertEqual(len(client.collections), 2)

    def test_collection_name_is_private_per_user_and_session(self):
        first = intelligence._collection_name("user-1", "session-1")
        self.assertNotEqual(first, intelligence._collection_name("user-2", "session-1"))
        self.assertNotEqual(first, intelligence._collection_name("user-1", "session-2"))
        self.assertTrue(first.startswith("iq"))

    def test_question_returns_the_sources_sent_to_gemini(self):
        context = [{"source": "Resume · segment 1", "text": "Built a Python API.", "similarity": 0.8}]
        interview = {
            "role": "Backend engineer",
            "category": "technical",
            "company": "",
            "companyContext": "",
            "id": "session-1",
            "answers": [],
        }
        with patch.object(intelligence, "retrieve", return_value=context) as retrieve, patch.object(
            intelligence, "generate", return_value={"question": "How did you test the API?"}
        ) as generate:
            result = intelligence.question("candidate-1", {"text": "Built an API."}, interview)

        self.assertEqual(result, {"question": "How did you test the API?", "context": context})
        self.assertEqual(generate.call_args.args[1]["context"], context)
        self.assertEqual(retrieve.call_args.args[-1], "session-1")

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
