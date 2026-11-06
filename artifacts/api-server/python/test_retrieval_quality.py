import unittest
from unittest.mock import patch

import intelligence


class Vector(list):
    def tolist(self):
        return list(self)


class FixtureEmbeddingModel:
    def embed(self, documents, batch_size=32):
        for document in documents:
            text = document.casefold()
            yield Vector([1.0, 0.0] if "backend api experience" in text else [0.0, 1.0])

    def query_embed(self, query):
        yield Vector([1.0, 0.0])


class RetrievalQualityTests(unittest.TestCase):
    def test_relevant_synthetic_resume_ranks_as_a_grounding_source(self):
        with patch.object(intelligence, "_get_embedding_model", return_value=FixtureEmbeddingModel()):
            results = intelligence.retrieve(
                "candidate-a",
                {"text": "Candidate resume: backend API experience with service reliability."},
                "backend engineer role responsibilities",
                category="technical",
                role="Backend Engineer",
            )

        resume = next(item for item in results if item["source"].startswith("Resume · segment"))
        self.assertGreaterEqual(resume["similarity"], intelligence.MIN_RESUME_SIMILARITY)
        self.assertTrue(any("backend and platform engineering" in item["source"] for item in results))

    def test_unrelated_resume_is_rejected_even_when_company_context_matches(self):
        with patch.object(intelligence, "_get_embedding_model", return_value=FixtureEmbeddingModel()):
            with self.assertRaisesRegex(ValueError, "strong match between this resume and the selected role"):
                intelligence.retrieve(
                    "candidate-b",
                    {"text": "Unrelated resume: pastry production and kitchen shift management."},
                    "backend engineer role responsibilities",
                    "Backend API experience and distributed systems requirements.",
                    category="company-specific",
                    role="Backend Engineer",
                )

    def test_guides_include_category_and_matched_role_material(self):
        guides = intelligence._guide_chunks("Backend Engineer", "technical")

        self.assertTrue(any(item["source"].startswith("Interview guide: technical") for item in guides))
        role_guide = next(item for item in guides if "backend and platform engineering" in item["source"])
        self.assertIn("API contracts", role_guide["text"])
        self.assertTrue(any("problem framing" in item["source"] for item in guides))

    def test_all_practice_categories_have_curated_material(self):
        expectations = {
            "technical": "problem framing",
            "hr": "motivation and collaboration",
            "behavioral": "STAR and ownership",
            "company-specific": "provided context",
        }
        for category, topic in expectations.items():
            with self.subTest(category=category):
                guides = intelligence._guide_chunks("Backend Engineer", category)
                self.assertTrue(any(topic in item["source"] for item in guides))

    def test_role_guides_cover_data_and_product_roles(self):
        data_guides = intelligence._guide_chunks("Data Scientist", "technical")
        product_guides = intelligence._guide_chunks("Product Manager", "behavioral")

        self.assertTrue(any("data and machine learning" in item["source"] for item in data_guides))
        self.assertTrue(any("product management" in item["source"] for item in product_guides))


if __name__ == "__main__":
    unittest.main()
