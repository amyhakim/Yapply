-- Supabase exposes tables in the public schema through its Data API. The app
-- connects directly to PostgreSQL, so API roles need no access to these tables.
-- With no policies, RLS denies anon/authenticated API requests. The table owner
-- used by the server connection retains its normal access.
BEGIN;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.language_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pronunciation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_feedback_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rating_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocab_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_vocab ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_vocab_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sanctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pronunciation_attempts ENABLE ROW LEVEL SECURITY;

COMMIT;
