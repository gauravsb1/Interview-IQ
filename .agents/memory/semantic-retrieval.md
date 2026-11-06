---
name: Safe semantic retrieval
description: Security and provenance constraints for InterviewIQ resume and company-context retrieval.
---

For InterviewIQ, keep vector retrieval local to the API process, owner-scoped, and rebuildable from MySQL. Do not reintroduce ChromaDB unless its vulnerable dependency chain is resolved and independently audited. Treat company/job context as candidate-provided, label it as unverified, and do not infer company facts from a name alone.

**Why:** ChromaDB's available release had known dependency vulnerabilities, while the app has no verified company-data source. Resume content and retrieved excerpts are sensitive.

**How to apply:** Re-audit any retrieval/index library before adoption, preserve per-user source isolation, and keep source labels attached to generated questions and evaluations.
