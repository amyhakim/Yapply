# Yapply

A two-person language practice prototype with LiveKit voice rooms and Azure Speech pronunciation assessment.

## Set up

1. Create a [LiveKit project](https://docs.livekit.io/intro/cloud/) and an [Azure Speech resource](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/overview). Copy `.env.example` to `.env.local` and fill in the credentials. Set `SESSION_SECRET` to at least 32 random characters. Keep both provider secrets on the server.
2. Use Node.js 22.22 or newer (`nvm use` if you use nvm). Run `npm ci` and `docker compose up -d`. Yapply uses host port 5433 for PostgreSQL by default; set `YAPPLY_POSTGRES_PORT` if that port is occupied, and use the same port in `DATABASE_URL`.
3. Run `npm run dev` and open `http://localhost:3000`.
4. Create a room in one browser profile. Copy its 10-character code into another profile or private window to join. Each profile gets a separate guest session. Allow microphone access, start the match, then click **Start pronunciation analysis**.

The database init scripts run only when the Docker volume is new. If you already started the database before this code was added, apply the new migration and challenge seed manually:

```sh
docker compose exec -T postgres psql -U app -d langgame < db/migrations/0002_pronunciation_attempts.sql
docker compose exec -T postgres psql -U app -d langgame < db/seed.sql
docker compose exec -T postgres psql -U app -d langgame < db/migrations/0003_enable_rls.sql
```

For a new Supabase database, use its SQL Editor to run `db/migrations/0001_init.sql`,
`db/migrations/0002_pronunciation_attempts.sql`, `db/seed.sql`, and
`db/migrations/0003_enable_rls.sql` in that order. The last migration blocks
Supabase's `anon` and `authenticated` API roles from accessing the app's tables;
the server continues to use its direct PostgreSQL connection.

## What the integration does

- A server-issued, room-scoped LiveKit token lets only match participants join their room. LiveKit carries the human conversation directly. The room is closed when the match ends.
- The browser reads only its **local** microphone track. An AudioWorklet detects short turns and streams mono 16 kHz PCM to the server while the user speaks. Browsers without streaming request support send a completed WAV clip instead. The prompted **Pronunciation Battle** can also be recorded on demand.
- The server validates match membership, clip length, locale, and assessment count and feeds streamed audio to Azure as it arrives. Scripted attempts use the seeded challenge phrase as reference text; spontaneous turns use unscripted assessment.
- Azure aggregate scores go into `pronunciation_attempts`; notable word and phoneme errors go into `pronunciation_results`. Azure-recognized text goes into `transcript_turns`. `match_scores` remains for the separate full conversation grader described in the design document.
- Raw audio is held only while scoring and is discarded. The app does not yet offer saved recordings, even when `save_audio_opt_in` is true.
- Match transcripts are marked for deletion after 30 days. Schedule `npm run db:purge-transcripts` daily to clear expired text; pronunciation scores remain.
- Prosody is requested only for `en-US`, following Azure's current locale support.

## Checks

Run `npm run typecheck`, `npm test`, and `npm run build`. The WAV and Azure result tests do not require provider credentials. A live end-to-end call and assessment require valid LiveKit and Azure credentials.

## Current product scope

The app provides guest sessions and share-code rooms so the two integrations can be used now. Guest sessions last in that browser for 30 days; there is no account recovery. Random matchmaking, AI opponents, production authentication, moderation, ElevenLabs transcription, and the full match score engine are separate features in `language_learning_game_design.md`.
