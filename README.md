# InterviewIQ

InterviewIQ is a web-based interview practice and coaching platform. Candidates can prepare with role-aware questions, get AI-generated feedback, review their interview history, and practice with other students in real time.

## Features

- Resume-supported interview practice with role and candidate-provided company/job context.
- AI-generated questions and answer feedback, supported by local FastEmbed retrieval over resume excerpts and curated interview guides.
- Browser-based spoken-answer transcription and webcam coaching.
- Interview history, performance summaries, and optional human ratings.
- A separate owner-authenticated dashboard for account and aggregate traffic analytics.
- Community chat rooms, one-to-one messaging, image attachments, and friend requests.

AI feedback is for practice and coaching. It is not a scientifically validated hiring assessment or a recommendation about a candidate's suitability.

## Architecture

This is a pnpm monorepo with a Python API:

| Path | Purpose |
| --- | --- |
| `artifacts/interviewiq` | React, Vite, and TypeScript web application |
| `artifacts/api-server/python` | Flask API, Socket.IO events, MySQL storage, AI and retrieval logic |
| `lib/api-spec` | Shared OpenAPI contract |
| `lib/api-client-react` | Generated React Query client |
| `lib/api-zod` | Generated API schemas and validators |
| `artifacts/mockup-sandbox` | Component preview and design sandbox |

MySQL is the authoritative store for accounts, resumes, interview sessions, ratings, and chat. The API creates or updates its tables during initialization; the database user needs permission to create and alter tables.

Resume retrieval uses FastEmbed locally and rebuilds user-scoped vectors from MySQL and curated guides. Gemini is used for question generation and feedback. Candidate resume and context excerpts included in prompts are sent to the configured Gemini service; local embeddings do not make those prompts local. See [`artifacts/api-server/README.md`](artifacts/api-server/README.md) for retrieval details.

## Requirements

- Node.js 24 and pnpm
- Python 3.11 or later and `uv`
- A reachable MySQL database
- A Gemini API integration or credentials
- The MySQL provider's CA certificate for verified TLS

The checked-in `artifacts/api-server/python/certs/aiven-ca.pem` is a public CA trust certificate for this workspace's Aiven MySQL connection. It is not a database password or private key. For another MySQL provider, replace it with that provider's trusted CA. Do not disable certificate or hostname verification.

## Local setup

Install dependencies from the repository root:

```sh
pnpm install --frozen-lockfile
uv sync --frozen
cp .env.example .env
```

Fill in `.env` with your own values. Keep it local; it is ignored by Git. Then export its values in each terminal before starting services:

```sh
set -a
. ./.env
set +a
```

Start the API in one terminal:

```sh
cd artifacts/api-server
uv run python python/run.py
```

Start the web app in a second terminal from the repository root:

```sh
pnpm --filter @workspace/interviewiq run dev
```

The API health endpoint is `/api/healthz`. Socket.IO uses `/socket.io`. In this Replit workspace, the web and API workflows are configured separately; use those workflows to run the preview.

## Environment variables

| Variable | Required for | Notes |
| --- | --- | --- |
| `MYSQL_HOST` | API | MySQL host name |
| `MYSQL_PORT` | API | MySQL port |
| `MYSQL_DATABASE` | API | Database name |
| `MYSQL_USER` | API | Database user with schema permissions |
| `MYSQL_PASSWORD` | API | Store in Replit Secrets or local `.env`; never commit it |
| `SESSION_SECRET` | API | Long, random value used to sign sessions |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | AI features | Keep private |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | AI features | Gemini integration endpoint |
| `INTERVIEWIQ_ADMIN_EMAIL` | Owner dashboard | Owner account identifier |
| `INTERVIEWIQ_ADMIN_PASSWORD` | Owner dashboard | Store as a secret |
| `PORT` | API | Defaults to `8080` for local development |
| `BASE_PATH` | Web build | Use `/` for local builds |

In Replit, add runtime values through the Secrets and environment-variable tools rather than committing them. The repository intentionally does not include the workspace's `.replit` file or `replit.md`, which contain local Replit settings.

## Checks and tests

Run the frontend type check:

```sh
pnpm --filter @workspace/interviewiq run typecheck
```

Run the Python API tests:

```sh
cd artifacts/api-server/python
uv run python -m unittest discover -v
```

Build the frontend:

```sh
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/interviewiq run build
```

When changing the OpenAPI contract, regenerate clients and validators before checking the workspace:

```sh
pnpm run --filter @workspace/api-spec codegen
pnpm run typecheck:libs
```

## Privacy and security

- Do not commit `.env`, passwords, API keys, session secrets, database contents, uploaded chat images, generated models, or candidate data.
- Keep TLS verification enabled and use the database provider's CA certificate.
- Resume and interview content is private user data. Never add production records or real resumes to fixtures or screenshots.
- The owner dashboard uses separate authentication; do not make candidate records public.
- Spoken audio is sent for transcription; follow the in-app notice and do not include recordings in repository assets.

## License

This project is licensed under the MIT License. See [`LICENSE`](LICENSE).
