# Yapply backend

A worker service that scores finished matches. It shares Postgres with the Next.js app and
picks up where the Azure clip code stops: the app records who said what and how it sounded,
this service turns that into a score.

```
Next.js app (browser-facing API)             backend/ (this service)
  guest sessions, rooms, LiveKit tokens        polls Postgres for finished matches
  Azure clips -> transcript_turns,             waits out late clips, then:
    pronunciation_attempts/results               Claude grades grammar / vocabulary / conversation
                  \                              Azure data -> pronunciation + fluency
                   \____ Postgres ____/          combine (25/20/20/20/15), XP, feedback
                                                 write match_scores, feedback, XP, ratings
```

The two services never call each other. Postgres is the contract: `matches.scored_at IS NULL`
on a finished match means "score me".

## Run it

```sh
cd backend
npm install
cp .env.example .env      # set DATABASE_URL and ANTHROPIC_API_KEY
npm start                 # or `npm run dev` to restart on changes
npm test                  # in-memory Postgres, no services or keys needed
npm run typecheck
```

`DATABASE_URL` is the same database as the app, with `db/migrations/0001` and `0002` and
`db/seed.sql` applied. Node 22.22+.

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | required | |
| `GRADER` | `anthropic` | `mock` gives **fake** scores, for local dev only |
| `ANTHROPIC_API_KEY` | | or use `ant auth login`; the SDK finds either |
| `GRADER_MODEL` | `claude-opus-5` | any Claude model id |
| `GRADER_EFFORT` | `medium` | `low` to `max`; lower is faster and cheaper |
| `SCORING_GRACE_SECS` | `35` | the app accepts clips for 30s after a match ends |
| `SCORING_MAX_ATTEMPTS` | `3` | then it stops and leaves `scoring_error` |
| `MIN_WORDS_TO_SCORE` | `5` | a player who said less is not scored |

Latency: the design doc wants results in about 3 seconds. Opus at medium effort will
usually be slower than that. If it matters, set `GRADER_MODEL` to a smaller model or drop
`GRADER_EFFORT` to `low`. It is one env var and needs no code change.

## What gets scored

Per player, from `design doc §6`:

| Dimension | Weight | Source |
|---|---|---|
| Conversation | 25% | Claude |
| Fluency | 20% | Azure fluency; falls back to speaking pace if Azure gave none |
| Pronunciation | 20% | Azure, duration-weighted over all of the player's clips |
| Grammar | 20% | Claude |
| Vocabulary | 15% | Claude |

If Azure produced no pronunciation score, that dimension is dropped and the rest are
renormalised, so nobody is scored as zero for a provider gap. The weights used are stored
on every `match_scores` row.

- **One grader call per match**, not per player, so both players are judged by the same
  rubric. Players are sent as `P1`/`P2`; no user ids reach the model.
- **Prompt injection:** the transcript is player speech. It is sent as escaped JSON inside
  a delimited block, the prompt says to treat it as data, and every model output is
  clamped and validated before use.
- **Pronunciation Battle** completion is decided by Azure (a scripted clip scoring 70+),
  not by the model. Scripted phrase clips are kept out of the conversation transcript;
  their scores still count toward pronunciation.
- **Challenges award XP, not score** (§6): `overall` never includes challenge completion.
- **Ratings** change only for `mode = 'ranked'` with two scored players. Casual and
  challenge matches still earn XP and count as a game played.
- **Nothing to score?** A player under `MIN_WORDS_TO_SCORE` gets no row. A match nobody
  spoke in is closed with `scoring_error = 'not enough speech to score'`.
- **Failures** (API outage, refusal, malformed output) are stored in `matches.scoring_error`
  and retried with backoff up to `SCORING_MAX_ATTEMPTS`. A failed attempt writes no
  partial scores. Everything a match needs is in the database, so the worker can be
  restarted at any time. Run one instance.
- **Abandoned matches:** if both players close the tab, nobody ends the match. The worker
  closes any `playing` match whose timer expired, the same transition `getMatch()` does.

The worker never changes `matches.status` except that one transition. The app's UI keys
on `complete`, so the schema's `processing -> results` states are left unused for now.

## Reading the results

Whoever builds the results screen can read a player's scores like this (the app needs a
route for it; none exists yet):

```sql
SELECT overall, conversation, fluency, pronunciation, grammar, vocabulary,
       target_language_pct, speaking_ms, turn_count, follow_up_questions,
       challenge_completed, challenge_bonus_xp, xp_earned
  FROM match_scores WHERE match_id = $1 AND user_id = $2;

SELECT kind, original, correction, explanation, category, rank
  FROM match_feedback_items WHERE match_id = $1 AND user_id = $2
 ORDER BY rank NULLS LAST, id;   -- rank 1-3 = "3 things to improve"
```

No `match_scores` row and `matches.scored_at` set means "not enough speech"; no row and
`scored_at` null means "still scoring".

## Not built yet

Random matchmaking (Redis), AI opponents, ElevenLabs transcription, production auth,
moderation, and the vocabulary graph (`new_words_attempted` stays 0). Server-side refusal
fallbacks are not enabled on the grader: a refused transcript is recorded as a failure
rather than re-run on another model.
