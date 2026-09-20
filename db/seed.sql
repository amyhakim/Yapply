-- Reference data. Idempotent: safe to re-run.
-- Challenges and AI personas are intentionally NOT seeded yet; both tables start empty.
-- matches.challenge_id is optional, so games run without a challenge.

-- MVP is English <-> Spanish (§29); the rest are loaded but disabled.
-- azure_locale: verify per-locale feature support (especially prosody) in the Azure
-- pronunciation assessment docs; NULL disables pronunciation scoring for that language.
INSERT INTO languages (code, name, native_name, azure_locale, enabled) VALUES
  ('en', 'English',    'English',   'en-US', true),
  ('es', 'Spanish',    'Español',   'es-ES', true),
  ('fr', 'French',     'Français',  'fr-FR', false),
  ('de', 'German',     'Deutsch',   'de-DE', false),
  ('it', 'Italian',    'Italiano',  'it-IT', false),
  ('pt', 'Portuguese', 'Português', 'pt-BR', false),
  ('ja', 'Japanese',   '日本語',     'ja-JP', false),
  ('ko', 'Korean',     '한국어',     'ko-KR', false),
  ('zh', 'Chinese',    '中文',       'zh-CN', false)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, native_name = EXCLUDED.native_name,
      azure_locale = EXCLUDED.azure_locale, enabled = EXCLUDED.enabled;

INSERT INTO challenges
  (slug, type, language_code, title, prompt, grader_notes, target_words)
VALUES
  ('pronunciation-es-a1', 'pronunciation_battle', 'es',
   'Pronunciation Battle', 'El perro corre por el parque.',
   'Assess the spoken phrase against the prompt with Azure Speech.',
   ARRAY['perro', 'corre', 'parque']),
  ('pronunciation-en-a1', 'pronunciation_battle', 'en',
   'Pronunciation Battle', 'The little bird sings in the morning.',
   'Assess the spoken phrase against the prompt with Azure Speech.',
   ARRAY['little', 'bird', 'morning'])
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title, prompt = EXCLUDED.prompt,
  grader_notes = EXCLUDED.grader_notes, target_words = EXCLUDED.target_words;
