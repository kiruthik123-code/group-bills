-- Ensure views run with the querying user's privileges (avoid SECURITY DEFINER views)
DO $$
BEGIN
  -- If the view exists, force security invoker behavior (Postgres 15+)
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'safe_profiles' AND c.relkind = 'v'
  ) THEN
    EXECUTE 'ALTER VIEW public.safe_profiles SET (security_invoker = true)';
  END IF;
END $$;