
BEGIN;

-- ---------------------------------------------------------------- types ----

CREATE TYPE cefr_level AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');      -- ordered: A1 < ... < C2

CREATE TYPE match_type AS ENUM ('random', 'friend', 'ai');                 -- §4
CREATE TYPE game_mode  AS ENUM ('casual', 'ranked', 'challenge');          -- §3.1

-- §15. 'queued' exists for friend invites / pre-pairing rows; anonymous queueing itself is in Redis.
CREATE TYPE match_status AS ENUM (
  'queued', 'matched', 'connecting', 'ready', 'playing', 'processing', 'results', 'complete',
  'cancelled', 'disconnected', 'abandoned', 'moderation_ended'
);

CREATE TYPE participant_exit_reason AS ENUM ('finished', 'left', 'skipped', 'disconnected', 'moderation');

-- §5
CREATE TYPE challenge_type AS ENUM (
  'secret_word', 'question_master', 'no_english', 'grammar_quest', 'persuasion', 'roleplay',
  'describe_it', 'twenty_questions', 'story_chain', 'speed_round', 'vocabulary_duel',
  'imposter', 'pronunciation_battle'
);
CREATE TYPE challenge_source AS ENUM ('curated', 'generated');             -- §25

-- §24
CREATE TYPE speaking_speed AS ENUM ('slow', 'normal', 'native', 'fast');
CREATE TYPE helpfulness    AS ENUM ('tutor', 'friendly', 'natural', 'unforgiving');

CREATE TYPE feedback_kind    AS ENUM ('mistake', 'pronunciation', 'tip', 'strong_moment');  -- §10, §23
CREATE TYPE rating_dimension AS ENUM ('overall', 'conversation', 'pronunciation');           -- §22
CREATE TYPE vocab_status     AS ENUM ('new', 'seen', 'used', 'repeated', 'mastered');       -- §26

CREATE TYPE friendship_status AS ENUM ('pending', 'accepted');
CREATE TYPE invite_status     AS ENUM ('pending', 'accepted', 'declined', 'expired', 'cancelled');

CREATE TYPE abuse_category AS ENUM (
  'harassment', 'hate_speech', 'sexual_content', 'spam', 'underage', 'cheating', 'other'
);
CREATE TYPE report_status     AS ENUM ('open', 'reviewed', 'actioned', 'dismissed');
CREATE TYPE moderation_action AS ENUM ('none', 'warning', 'match_terminated', 'report_filed', 'account_action');
CREATE TYPE sanction_kind     AS ENUM ('warning', 'mute', 'temp_ban', 'permanent_ban');

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- users ----

CREATE TABLE users (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject       text        UNIQUE,                 -- id from the auth provider
  email              text        NOT NULL,
  username           text        NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{3,20}$'),
  display_name       text,
  avatar_url         text,
  country_code       char(2),                            -- coarse region for latency-aware matching
  birth_date         date,                               -- age-aware matchmaking / restrictions (§19)
  reputation_score   integer     NOT NULL DEFAULT 100 CHECK (reputation_score BETWEEN 0 AND 100),
  save_audio_opt_in  boolean     NOT NULL DEFAULT false, -- raw audio is discarded unless the user opts in (§20)
  banned_at          timestamptz,                        -- fast flag; audit trail is user_sanctions
  deleted_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key    ON users (lower(email));
CREATE UNIQUE INDEX users_username_key ON users (lower(username));
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------ languages ----

CREATE TABLE languages (
  code          text    PRIMARY KEY CHECK (code = lower(code)),   -- ISO 639-1 (what ElevenLabs takes)
  name          text    NOT NULL,
  native_name   text    NOT NULL,
  azure_locale  text,                                             -- e.g. 'es-ES'; NULL = no Azure pronunciation scoring
  enabled       boolean NOT NULL DEFAULT false                    -- MVP: English <-> Spanish (§29)
);

-- §18 LanguageProfile. One row per user per language: native or learning, plus that
-- language's ratings, which never affect other languages (§12).
CREATE TABLE language_profiles (
  user_id                uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language_code          text        NOT NULL REFERENCES languages(code),
  is_native              boolean     NOT NULL DEFAULT false,
  cefr_level             cefr_level,                             -- self-reported at signup, later estimated; NULL for natives
  cefr_division          smallint    CHECK (cefr_division BETWEEN 1 AND 3),   -- "B1 III" -> B1, 3
  overall_rating         integer     NOT NULL DEFAULT 1000,
  conversation_rating    integer     NOT NULL DEFAULT 1000,
  pronunciation_rating   integer     NOT NULL DEFAULT 1000,
  rating_deviation       real        NOT NULL DEFAULT 350 CHECK (rating_deviation > 0),  -- Glicko-style confidence (§21)
  xp                     bigint      NOT NULL DEFAULT 0 CHECK (xp >= 0),
  games_played           integer     NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  game_streak            integer     NOT NULL DEFAULT 0 CHECK (game_streak >= 0),
  best_game_streak       integer     NOT NULL DEFAULT 0 CHECK (best_game_streak >= 0),
  last_played_at         timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, language_code)
);
CREATE INDEX language_profiles_leaderboard_idx ON language_profiles (language_code, overall_rating DESC)
  WHERE NOT is_native;
CREATE TRIGGER language_profiles_updated_at BEFORE UPDATE ON language_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------- social -----

-- One row per pair; (user_low < user_high) makes the pair canonical.
CREATE TABLE friendships (
  user_low      uuid              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high     uuid              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by  uuid              NOT NULL,
  status        friendship_status NOT NULL DEFAULT 'pending',
  created_at    timestamptz       NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  PRIMARY KEY (user_low, user_high),
  CHECK (user_low < user_high),
  CHECK (requested_by IN (user_low, user_high))
);
CREATE INDEX friendships_high_idx ON friendships (user_high);

CREATE TABLE user_blocks (
  blocker_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

-- ------------------------------------------------------------ AI partners --

-- §4.3 personas + §24 difficulty knobs. The vocabulary knob is just `level`.
CREATE TABLE ai_personas (
  id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text           NOT NULL UNIQUE,
  name              text           NOT NULL,
  emoji             text,
  language_code     text           NOT NULL REFERENCES languages(code),
  level             cefr_level     NOT NULL,
  style             text           NOT NULL,                     -- "Slow and patient"
  system_prompt     text           NOT NULL,
  voice_id          text,                                        -- ElevenLabs voice
  speaking_speed    speaking_speed NOT NULL DEFAULT 'normal',
  helpfulness       helpfulness    NOT NULL DEFAULT 'friendly',
  waits_patiently   boolean        NOT NULL DEFAULT true,
  asks_followups    boolean        NOT NULL DEFAULT true,
  interrupts        boolean        NOT NULL DEFAULT false,
  uses_slang        boolean        NOT NULL DEFAULT false,
  corrects_mistakes boolean        NOT NULL DEFAULT false,
  enabled           boolean        NOT NULL DEFAULT true,
  created_at        timestamptz    NOT NULL DEFAULT now(),
  updated_at        timestamptz    NOT NULL DEFAULT now()
);
CREATE INDEX ai_personas_pick_idx ON ai_personas (language_code, level) WHERE enabled;
CREATE TRIGGER ai_personas_updated_at BEFORE UPDATE ON ai_personas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------- challenges ----

-- §5 / §18. Predefined first; the LLM can generate more later (§25).
CREATE TABLE challenges (
  id                     uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                   text             NOT NULL UNIQUE,
  type                   challenge_type   NOT NULL,
  language_code          text             REFERENCES languages(code),     -- NULL = any language
  min_level              cefr_level       NOT NULL DEFAULT 'A1',
  max_level              cefr_level       NOT NULL DEFAULT 'C2',
  title                  text             NOT NULL,
  prompt                 text             NOT NULL,                       -- shown to players
  bonus_objectives       jsonb            NOT NULL DEFAULT '[]'
                           CHECK (jsonb_typeof(bonus_objectives) = 'array'),   -- [{key, description, target}]
  scoring_rules          jsonb            NOT NULL DEFAULT '{}',          -- machine-checkable rules, e.g. {"min_questions": 3}
  grader_notes           text             NOT NULL,                       -- what "completed" means, for the LLM grader
  target_words           text[]           NOT NULL DEFAULT '{}',
  bonus_xp               integer          NOT NULL DEFAULT 10 CHECK (bonus_xp >= 0),
  source                 challenge_source NOT NULL DEFAULT 'curated',
  generated_for_user_id  uuid             REFERENCES users(id) ON DELETE CASCADE,   -- personalised challenge (§25)
  enabled                boolean          NOT NULL DEFAULT true,
  created_at             timestamptz      NOT NULL DEFAULT now(),
  updated_at             timestamptz      NOT NULL DEFAULT now(),
  CHECK (min_level <= max_level)
);
CREATE INDEX challenges_pick_idx ON challenges (language_code, type, min_level, max_level)
  WHERE enabled AND generated_for_user_id IS NULL;
CREATE TRIGGER challenges_updated_at BEFORE UPDATE ON challenges
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------- matches ----

CREATE TABLE matches (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  match_type        match_type   NOT NULL,
  mode              game_mode    NOT NULL,
  language_code     text         NOT NULL REFERENCES languages(code),     -- language spoken in this match
  level             cefr_level   NOT NULL,
  challenge_id      uuid         REFERENCES challenges(id) ON DELETE SET NULL,
  livekit_room      text         NOT NULL UNIQUE,
  status            match_status NOT NULL DEFAULT 'matched',
  duration_secs     integer      NOT NULL DEFAULT 120 CHECK (duration_secs > 0),
  series_id         uuid,                                                 -- groups rounds / rematches of the same pair
  round_number      smallint     NOT NULL DEFAULT 1 CHECK (round_number >= 1),
  trace_id          text,                                                 -- distributed trace (§27)
  created_at        timestamptz  NOT NULL DEFAULT now(),                  -- = matched
  started_at        timestamptz,                                          -- entered PLAYING
  ended_at          timestamptz,
  purge_after       timestamptz,                                          -- transcript retention (§20)
  -- Score-engine job state; status = 'processing' is the work queue.
  scoring_attempts  smallint     NOT NULL DEFAULT 0,
  scoring_error     text,
  scored_at         timestamptz,
  CHECK (started_at IS NULL OR ended_at IS NULL OR ended_at >= started_at),
  CHECK (started_at IS NOT NULL OR status NOT IN ('playing', 'processing', 'results', 'complete')),
  CHECK (ended_at   IS NOT NULL OR status NOT IN ('processing', 'results', 'complete'))
);
CREATE INDEX matches_language_created_idx ON matches (language_code, created_at DESC);
CREATE INDEX matches_processing_idx       ON matches (ended_at) WHERE status = 'processing';
CREATE INDEX matches_series_idx           ON matches (series_id, round_number) WHERE series_id IS NOT NULL;

CREATE TABLE match_participants (
  id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id           uuid        NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seat               smallint    NOT NULL CHECK (seat IN (1, 2)),
  user_id            uuid        REFERENCES users(id),
  ai_persona_id      uuid        REFERENCES ai_personas(id),
  rating_before      integer,                        -- overall rating snapshot at match time
  challenge_payload  jsonb       NOT NULL DEFAULT '{}',   -- per-player: secret word, imposter prompt, ...
  ai_settings        jsonb,                          -- AI difficulty as adapted during the match (§24)
  joined_at          timestamptz NOT NULL DEFAULT now(),
  left_at            timestamptz,
  exit_reason        participant_exit_reason,        -- leaving must never be punished by rating alone (§19)
  UNIQUE (match_id, seat),
  UNIQUE (match_id, user_id),                        -- NULLs (AI seats) don't collide
  UNIQUE (id, match_id),                             -- target for composite FKs below
  CHECK ((user_id IS NULL) <> (ai_persona_id IS NULL))   -- exactly one: human or AI
);
CREATE INDEX match_participants_user_idx ON match_participants (user_id, joined_at DESC);

CREATE TABLE match_invites (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id     uuid        REFERENCES users(id) ON DELETE CASCADE,  -- NULL = open room code / share link
  room_code      text        NOT NULL UNIQUE CHECK (room_code ~ '^[A-Z0-9]{4,12}$'),
  -- Custom settings for friend matches (§4.2)
  language_code  text        NOT NULL REFERENCES languages(code),
  level          cefr_level  NOT NULL,
  mode           game_mode   NOT NULL DEFAULT 'casual',
  duration_secs  integer     NOT NULL DEFAULT 120 CHECK (duration_secs > 0),
  challenge_id   uuid        REFERENCES challenges(id) ON DELETE SET NULL,
  status         invite_status NOT NULL DEFAULT 'pending',
  match_id       uuid        REFERENCES matches(id) ON DELETE SET NULL,
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (invitee_id IS NULL OR inviter_id <> invitee_id)
);
CREATE INDEX match_invites_invitee_idx ON match_invites (invitee_id, created_at DESC) WHERE status = 'pending';

-- ------------------------------------------------------- conversation data --

-- §18 TranscriptTurn. Final STT segments merged into speaking turns. Either seat can speak,
-- so the speaker is a participant (AI turns included). Transcripts are personal data (§20).
CREATE TABLE transcript_turns (
  id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id           uuid        NOT NULL,
  participant_id     bigint      NOT NULL,
  text               text        NOT NULL,
  detected_language  text,                                    -- drives "target language %" and No English
  start_ms           integer     NOT NULL CHECK (start_ms >= 0),   -- offset from matches.started_at
  end_ms             integer     NOT NULL,
  word_count         integer     CHECK (word_count >= 0),
  confidence         real        CHECK (confidence BETWEEN 0 AND 1),
  stt_provider       text        DEFAULT 'elevenlabs',        -- NULL for AI-generated turns
  created_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (participant_id, match_id) REFERENCES match_participants(id, match_id) ON DELETE CASCADE,
  CHECK (end_ms >= start_ms)
);
CREATE INDEX transcript_turns_match_time_idx ON transcript_turns (match_id, start_ms);

-- §18 PronunciationResult. Acoustic assessment (Azure), not derived from the transcript.
-- phoneme IS NULL -> word-level row. Only notable rows need persisting; whole-match
-- aggregates live in match_scores. audio_url only when the user opted in (§20).
CREATE TABLE pronunciation_results (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id    uuid        NOT NULL,
  user_id     uuid        NOT NULL,
  word        text        NOT NULL,
  phoneme     text,
  score       real        NOT NULL CHECK (score BETWEEN 0 AND 100),
  error_type  text,                                            -- Azure: Mispronunciation, Omission, ...
  at_ms       integer     CHECK (at_ms >= 0),
  audio_url   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (match_id, user_id) REFERENCES match_participants(match_id, user_id) ON DELETE CASCADE
);
CREATE INDEX pronunciation_results_match_idx ON pronunciation_results (match_id, user_id, score);
CREATE INDEX pronunciation_results_word_idx  ON pronunciation_results (user_id, word);   -- recurring problem words

-- Challenge signals captured while playing (§3.2): secret word said, question asked,
-- language switch (No English), bonus objective ticked, ...
CREATE TABLE challenge_events (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id        uuid        NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  participant_id  bigint,
  event_type      text        NOT NULL,
  at_ms           integer     CHECK (at_ms >= 0),
  payload         jsonb       NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (participant_id, match_id) REFERENCES match_participants(id, match_id) ON DELETE CASCADE
);
CREATE INDEX challenge_events_match_idx ON challenge_events (match_id, at_ms);

-- --------------------------------------------------------------- scores ----

-- §6, §17, §18 Score. One row per human player. Decomposable so scores stay explainable.
-- Challenge completion awards XP only; it is deliberately not part of `overall`.
CREATE TABLE match_scores (
  match_id             uuid         NOT NULL,
  user_id              uuid         NOT NULL,

  -- Dimensions, 0-100. `pronunciation` is NULL when Azure can't score the language; the
  -- engine then renormalises `weights` over the remaining dimensions.
  overall              numeric(5,2) NOT NULL CHECK (overall       BETWEEN 0 AND 100),
  conversation         numeric(5,2) NOT NULL CHECK (conversation  BETWEEN 0 AND 100),
  fluency              numeric(5,2) NOT NULL CHECK (fluency       BETWEEN 0 AND 100),
  pronunciation        numeric(5,2)          CHECK (pronunciation BETWEEN 0 AND 100),
  grammar              numeric(5,2) NOT NULL CHECK (grammar       BETWEEN 0 AND 100),
  vocabulary           numeric(5,2) NOT NULL CHECK (vocabulary    BETWEEN 0 AND 100),

  -- Raw Azure aggregates for the match (inputs to pronunciation / fluency)
  pron_accuracy        numeric(5,2) CHECK (pron_accuracy BETWEEN 0 AND 100),
  pron_fluency         numeric(5,2) CHECK (pron_fluency  BETWEEN 0 AND 100),
  pron_prosody         numeric(5,2) CHECK (pron_prosody  BETWEEN 0 AND 100),

  -- Secondary metrics (§7). Shown, but not necessarily scored.
  target_language_pct  numeric(5,2) NOT NULL DEFAULT 0 CHECK (target_language_pct BETWEEN 0 AND 100),
  speaking_ms          integer      NOT NULL DEFAULT 0 CHECK (speaking_ms >= 0),
  turn_count           integer      NOT NULL DEFAULT 0 CHECK (turn_count >= 0),
  avg_response_ms      integer      CHECK (avg_response_ms >= 0),
  word_count           integer      NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  unique_words         integer      NOT NULL DEFAULT 0 CHECK (unique_words >= 0),
  new_words_attempted  integer      NOT NULL DEFAULT 0 CHECK (new_words_attempted >= 0),
  follow_up_questions  integer      NOT NULL DEFAULT 0 CHECK (follow_up_questions >= 0),
  words_per_minute     real         CHECK (words_per_minute >= 0),
  pause_count          integer      CHECK (pause_count >= 0),
  filler_count         integer      CHECK (filler_count >= 0),

  -- Challenge + XP
  challenge_completed  boolean      NOT NULL DEFAULT false,
  bonus_objectives_met jsonb        NOT NULL DEFAULT '[]',
  challenge_bonus_xp   integer      NOT NULL DEFAULT 0 CHECK (challenge_bonus_xp >= 0),
  xp_earned            integer      NOT NULL DEFAULT 0 CHECK (xp_earned >= challenge_bonus_xp),  -- total, includes the bonus

  -- Provenance
  weights              jsonb        NOT NULL,     -- formula snapshot, e.g. {"conversation":0.25,"fluency":0.20,...}
  grader_model         text         NOT NULL,
  grader_version       text         NOT NULL,     -- rubric/prompt version, for benchmarking against human graders
  grader_output        jsonb,                     -- raw structured LLM response
  integrity_flags      text[]       NOT NULL DEFAULT '{}',   -- anti-cheat signals (§21)
  created_at           timestamptz  NOT NULL DEFAULT now(),

  PRIMARY KEY (match_id, user_id),
  FOREIGN KEY (match_id, user_id) REFERENCES match_participants(match_id, user_id) ON DELETE CASCADE
);
CREATE INDEX match_scores_user_idx ON match_scores (user_id, created_at DESC);

-- §10 mistakes / strong moments, §23 "3 things to improve". Rows, not JSON, so recurring
-- weaknesses can be found across matches (drives personalised challenges, §25).
CREATE TABLE match_feedback_items (
  id           bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id     uuid          NOT NULL,
  user_id      uuid          NOT NULL,
  kind         feedback_kind NOT NULL,
  original     text,                                 -- "Yo fue" / the mispronounced word / a strong quote
  correction   text,                                 -- "Yo fui"
  explanation  text,
  category     text,                                 -- stable tag, e.g. 'preterite', 'ser_estar'
  rank         smallint      CHECK (rank >= 1),      -- 1..3 = shown on the results screen
  created_at   timestamptz   NOT NULL DEFAULT now(),
  FOREIGN KEY (match_id, user_id) REFERENCES match_participants(match_id, user_id) ON DELETE CASCADE
);
CREATE INDEX match_feedback_items_match_idx ON match_feedback_items (match_id, user_id, rank);
CREATE INDEX match_feedback_items_weakness_idx ON match_feedback_items (user_id, category, created_at DESC)
  WHERE kind = 'mistake';

-- §11 lightweight partner feedback. Feeds reputation / rematch suggestions only; it must
-- never be read by the score engine.
CREATE TABLE partner_feedback (
  match_id              uuid        NOT NULL,
  from_user_id          uuid        NOT NULL,
  to_user_id            uuid        NOT NULL,
  easy_to_understand    boolean     NOT NULL DEFAULT false,
  fun_conversation      boolean     NOT NULL DEFAULT false,
  would_talk_again      boolean     NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, from_user_id),
  FOREIGN KEY (match_id, from_user_id) REFERENCES match_participants(match_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (match_id, to_user_id)   REFERENCES match_participants(match_id, user_id) ON DELETE CASCADE,
  CHECK (from_user_id <> to_user_id)
);
CREATE INDEX partner_feedback_to_idx ON partner_feedback (to_user_id);

-- Rating movement per dimension. Rows exist only for ranked matches (§21).
CREATE TABLE rating_history (
  id             bigint           GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        uuid             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language_code  text             NOT NULL REFERENCES languages(code),
  match_id       uuid             NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  dimension      rating_dimension NOT NULL,
  rating_before  integer          NOT NULL,
  rating_after   integer          NOT NULL,
  created_at     timestamptz      NOT NULL DEFAULT now(),
  UNIQUE (match_id, user_id, dimension)
);
CREATE INDEX rating_history_user_idx ON rating_history (user_id, language_code, dimension, created_at DESC);

-- ---------------------------------------------------------------- vocab ----

CREATE TABLE vocab_items (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  language_code   text        NOT NULL REFERENCES languages(code),
  lemma           text        NOT NULL,
  pos             text        NOT NULL DEFAULT 'X',      -- Universal POS tag; 'X' = unknown
  cefr_level      cefr_level,
  UNIQUE (language_code, lemma, pos)
);

-- §26 personal vocabulary graph: NEW -> SEEN -> USED -> REPEATED -> MASTERED.
CREATE TABLE user_vocab (
  user_id                    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vocab_item_id              bigint      NOT NULL REFERENCES vocab_items(id),
  status                     vocab_status NOT NULL DEFAULT 'new',
  times_seen                 integer     NOT NULL DEFAULT 0 CHECK (times_seen >= 0),                 -- encountered
  times_understood           integer     NOT NULL DEFAULT 0 CHECK (times_understood >= 0),
  times_used                 integer     NOT NULL DEFAULT 0 CHECK (times_used >= 0),
  times_used_correctly       integer     NOT NULL DEFAULT 0 CHECK (times_used_correctly >= 0),
  times_misused              integer     NOT NULL DEFAULT 0 CHECK (times_misused >= 0),
  times_pronounced_correctly integer     NOT NULL DEFAULT 0 CHECK (times_pronounced_correctly >= 0),
  first_match_id             uuid        REFERENCES matches(id) ON DELETE SET NULL,
  first_seen_at              timestamptz NOT NULL DEFAULT now(),
  last_seen_at               timestamptz NOT NULL DEFAULT now(),
  last_used_at               timestamptz,
  mastered_at                timestamptz,
  PRIMARY KEY (user_id, vocab_item_id),
  CHECK (times_used_correctly + times_misused <= times_used)
);
CREATE INDEX user_vocab_reinforce_idx ON user_vocab (user_id, status, last_used_at);

-- Per-match event counts; user_vocab is the running aggregate of these.
CREATE TABLE match_vocab_usage (
  match_id                   uuid    NOT NULL,
  user_id                    uuid    NOT NULL,
  vocab_item_id              bigint  NOT NULL REFERENCES vocab_items(id),
  times_encountered          integer NOT NULL DEFAULT 0 CHECK (times_encountered >= 0),   -- heard from partner
  times_used                 integer NOT NULL DEFAULT 0 CHECK (times_used >= 0),
  times_used_correctly       integer NOT NULL DEFAULT 0 CHECK (times_used_correctly >= 0),
  times_misused              integer NOT NULL DEFAULT 0 CHECK (times_misused >= 0),
  times_pronounced_correctly integer NOT NULL DEFAULT 0 CHECK (times_pronounced_correctly >= 0),
  PRIMARY KEY (match_id, user_id, vocab_item_id),
  FOREIGN KEY (match_id, user_id) REFERENCES match_participants(match_id, user_id) ON DELETE CASCADE,
  CHECK (times_used_correctly + times_misused <= times_used)
);

-- ----------------------------------------------------------- moderation ----

CREATE TABLE reports (
  id           bigint         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id     uuid           REFERENCES matches(id) ON DELETE SET NULL,
  reporter_id  uuid           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_id  uuid           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category     abuse_category NOT NULL,
  details      text,
  status       report_status  NOT NULL DEFAULT 'open',
  created_at   timestamptz    NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  CHECK (reporter_id <> reported_id)
);
CREATE INDEX reports_open_idx     ON reports (created_at) WHERE status = 'open';
CREATE INDEX reports_reported_idx ON reports (reported_id, created_at DESC);   -- repeated-harassment detection

-- Automated detection on realtime transcripts (§19): classifier hit -> warning / match termination.
CREATE TABLE moderation_events (
  id          bigint            GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id    uuid              REFERENCES matches(id) ON DELETE SET NULL,
  user_id     uuid              NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- the flagged speaker
  category    abuse_category    NOT NULL,
  confidence  real              CHECK (confidence BETWEEN 0 AND 1),
  action      moderation_action NOT NULL DEFAULT 'none',
  excerpt     text,
  created_at  timestamptz       NOT NULL DEFAULT now()
);
CREATE INDEX moderation_events_user_idx ON moderation_events (user_id, created_at DESC);

-- Account-level enforcement audit trail. users.banned_at is the fast-path flag.
CREATE TABLE user_sanctions (
  id          bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        sanction_kind NOT NULL,
  reason      text          NOT NULL,
  report_id   bigint        REFERENCES reports(id) ON DELETE SET NULL,
  starts_at   timestamptz   NOT NULL DEFAULT now(),
  expires_at  timestamptz,                                  -- NULL = permanent
  revoked_at  timestamptz,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at > starts_at)
);
CREATE INDEX user_sanctions_user_idx ON user_sanctions (user_id, starts_at DESC);

-- ---------------------------------------------------------------- views ----

-- Language-specific ranking (§12). Needs 5 games so one lucky match can't top the board.
CREATE VIEW leaderboard AS
SELECT p.language_code,
       p.user_id,
       u.username,
       u.display_name,
       p.cefr_level,
       p.cefr_division,
       p.overall_rating,
       p.conversation_rating,
       p.pronunciation_rating,
       p.games_played,
       RANK() OVER (PARTITION BY p.language_code ORDER BY p.overall_rating DESC) AS rank
FROM language_profiles p
JOIN users u ON u.id = p.user_id
WHERE NOT p.is_native
  AND p.games_played >= 5
  AND u.banned_at IS NULL
  AND u.deleted_at IS NULL;

-- Profile stats per user and language.
CREATE VIEW user_language_stats AS
SELECT s.user_id,
       m.language_code,
       count(*)                                         AS matches_scored,
       round(avg(s.overall), 2)                         AS avg_overall,
       max(s.overall)                                   AS best_overall,
       round(avg(s.conversation), 2)                    AS avg_conversation,
       round(avg(s.fluency), 2)                         AS avg_fluency,
       round(avg(s.pronunciation), 2)                   AS avg_pronunciation,
       round(avg(s.grammar), 2)                         AS avg_grammar,
       round(avg(s.vocabulary), 2)                      AS avg_vocabulary,
       round(avg(s.target_language_pct), 2)             AS avg_target_language_pct,
       sum(s.speaking_ms) / 1000                        AS total_speaking_seconds,
       sum(s.xp_earned)                                 AS total_xp,
       round(avg(s.challenge_completed::int), 3)        AS challenge_completion_rate,
       max(s.created_at)                                AS last_played_at
FROM match_scores s
JOIN matches m ON m.id = s.match_id
GROUP BY s.user_id, m.language_code;

-- Weakness targeting (§25): mistake categories in the last 30 days, worst first.
CREATE VIEW user_recent_weaknesses AS
SELECT f.user_id,
       m.language_code,
       f.category,
       count(*)          AS mistake_count,
       max(f.created_at) AS last_seen_at
FROM match_feedback_items f
JOIN matches m ON m.id = f.match_id
WHERE f.kind = 'mistake'
  AND f.category IS NOT NULL
  AND f.created_at > now() - interval '30 days'
GROUP BY f.user_id, m.language_code, f.category;

COMMIT;
