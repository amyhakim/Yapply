-- Assessments are staged here until the full match score engine fills match_scores.
-- Audio is processed in memory and discarded; only derived data is stored.
CREATE TABLE IF NOT EXISTS pronunciation_attempts (
  id              uuid PRIMARY KEY,
  match_id        uuid NOT NULL,
  user_id         uuid NOT NULL,
  mode            text NOT NULL CHECK (mode IN ('scripted', 'unscripted')),
  locale          text NOT NULL,
  reference_text  text,
  recognized_text text,
  at_ms           integer NOT NULL CHECK (at_ms >= 0),
  duration_ms     integer NOT NULL CHECK (duration_ms > 0),
  status          text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'complete', 'failed')),
  pron_score      numeric(5,2) CHECK (pron_score BETWEEN 0 AND 100),
  accuracy        numeric(5,2) CHECK (accuracy BETWEEN 0 AND 100),
  fluency         numeric(5,2) CHECK (fluency BETWEEN 0 AND 100),
  prosody         numeric(5,2) CHECK (prosody BETWEEN 0 AND 100),
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  FOREIGN KEY (match_id, user_id) REFERENCES match_participants(match_id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS pronunciation_attempts_match_idx
  ON pronunciation_attempts (match_id, user_id, at_ms);

ALTER TABLE pronunciation_results
  ADD COLUMN IF NOT EXISTS attempt_id uuid REFERENCES pronunciation_attempts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS pronunciation_results_attempt_idx
  ON pronunciation_results (attempt_id);

CREATE INDEX IF NOT EXISTS matches_purge_after_idx
  ON matches (purge_after) WHERE purge_after IS NOT NULL;
