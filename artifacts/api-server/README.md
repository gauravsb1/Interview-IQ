# InterviewIQ API retrieval

## Local semantic retrieval

The API uses FastEmbed with `BAAI/bge-small-en-v1.5` (384-dimensional, MIT-licensed ONNX model) for local CPU embeddings. ChromaDB is intentionally not used. The model is downloaded on first retrieval to `generated-artifacts/models/fastembed/`; that directory is excluded from Git and deployment bundles.

MySQL remains the authoritative store for each user's resume and interview session. The API loads a resume through its owner-filtered query and builds a temporary vector ranking from that user's resume chunks, the built-in interview guide, and any company/job context supplied for that session. It rebuilds from MySQL when needed rather than maintaining a shared index, so one user's embedding set cannot be returned for another user.

Retrieved excerpts and source labels are saved with the active question and its evaluation. They are shown in the interview and results views. Resume and candidate-provided context excerpts are still included in Gemini prompts for question generation and evaluation; local embedding inference does not make those prompts local.

Company/job material is candidate-provided and is labeled as such. The app does not fetch company data from the web or treat a company name alone as evidence of company facts.
