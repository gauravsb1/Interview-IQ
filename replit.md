# InterviewIQ

Resume-grounded interview practice with Gemini, spoken answers and longitudinal feedback.

## Run & Operate

- The managed API workflow runs `uv run python artifacts/api-server/python/run.py`.
- The managed web workflow runs `pnpm --filter @workspace/interviewiq run dev`.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- MySQL uses MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD. The public Aiven CA is bundled at artifacts/api-server/python/certs/aiven-ca.pem; replace it with Aiven's updated CA bundle on rotation. The older MYSQL_SSL_CA secret is no longer used. Never disable TLS verification.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Flask + Gunicorn; the scaffold Express files are not the active service.
- DB: user-requested external MySQL via PyMySQL. No application data is stored in the scaffold PostgreSQL package.
- Authentication: user-requested JWT in secure HTTP-only cookies and Bcrypt; logout revokes tokens through token versions.
- API codegen: Orval (from OpenAPI spec)
- Python dependencies: pyproject.toml + uv.lock.

## Where things live

Frontend: artifacts/interviewiq. Backend: artifacts/api-server/python. API contract: lib/api-spec/openapi.yaml.

## Architecture decisions

- Resume and audio file bytes are processed transiently, not retained. Extracted resume text and transcripts are stored in MySQL.
- Chroma is a rebuildable in-memory embedding index, with MySQL as the durable source. This avoids relying on deployment-local storage for user data.
- One threaded Gunicorn worker owns the Chroma/Whisper caches and session mutation locks. Scale-out requires shared locking and rate-limit storage.
- Human comparisons are manually supplied ratings, not a claim of independent validation. Webcam coaching must never infer emotion, stress or employability.

## Product

Resume extraction; technical, HR, behavioral and company-specific mock interviews; Gemini questions and evaluations; faster-whisper speech transcription; history, skill analysis and human-rating comparisons.

## User preferences

Requested stack: React, Python Flask, MySQL, ChromaDB, Gemini, JWT and Bcrypt, faster-whisper, client-side MediaPipe.

## Gotchas

Public dashboard sample data is labeled and never represents a signed-in user's results. A failing database must produce an explicit error, not an in-memory persistence fallback.
Whisper and Chroma's embedding model download on first use; allow time and memory for CPU inference. Audio timing is approximate word-alignment feedback, not a physiological measure.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
