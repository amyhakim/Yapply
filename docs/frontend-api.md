# Frontend and API integration

The homepage offers **Create room** and **Join room** above the original UI demo. These controls call the existing Next.js API on the same origin. No separate API URL or browser database credentials are needed.

| Frontend action | API |
| --- | --- |
| Establish or reuse a guest session | `POST /api/session` |
| Create a room | `POST /api/matches` with `{ language: "es" }` |
| Join a friend | `POST /api/invites/join` with `{ code: "..." }` |
| Read room state | `GET /api/matches/:id` |
| Join the LiveKit call | `POST /api/matches/:id/token` |
| Start / end a round | `POST /api/matches/:id/start` or `/end` |
| Submit optional speech analysis | `POST /api/matches/:id/assess` |
| Read pronunciation attempts | `GET /api/matches/:id/results` |
| Read overall score and feedback | `GET /api/matches/:id/score` |

Create/join opens `/match/:id`. Players explicitly join the call and then enable their camera/microphone; media is off by default. Camera tracks fill the partner and self-preview boxes. The creator starts the round once both seats have joined. Overall feedback polls the score API after completion, including pending and insufficient-speech states.

## Railway services

- **Yapply app:** repository root, branch containing this integration, build `npm run build`, start `npm run start -- --hostname 0.0.0.0`. Set `DATABASE_URL`, `SESSION_SECRET`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`. Optional speech analysis additionally requires `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`.
- **Postgres:** apply migrations `0001`, `0002`, then seed data and `0003` (skip migrations already applied). The existing create-room API requires seeded pronunciation challenges. Railway does not execute local Docker initialization mounts when deploying the app.
- **Scoring worker:** a second service from the same repository with root directory `/backend`, install development dependencies as well (the current start command uses `tsx`), start `npm start`, no public domain. Set the same `DATABASE_URL` plus `ANTHROPIC_API_KEY` and a valid `GRADER_MODEL` for your account. See `backend/README.md`. Without this worker, overall scores stay pending; calls and Azure assessments can still operate.

The scoring worker is not an HTTP API: it reads and writes Postgres. The browser calls the Next.js API, never the worker or Postgres directly. Do not prefix secrets with `NEXT_PUBLIC_`.

## Verification

Run `npm run typecheck`, `npm test`, and `npm run build` without service credentials. With a local test database, migrations/seeds, a session secret, and LiveKit credentials configured, run `npm run smoke` against the local development server. This creates test guest users and a match.

A full call requires two browser profiles/devices, HTTPS outside localhost, and camera/microphone consent. Test create, join, camera/mute, start, leave, and results. Only enable Azure speech analysis when configured. Current authentication is guest-only, not recoverable production accounts.
