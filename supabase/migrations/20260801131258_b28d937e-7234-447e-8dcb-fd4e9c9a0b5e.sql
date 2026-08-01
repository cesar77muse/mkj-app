DROP VIEW IF EXISTS public.profiles_directory;

CREATE TABLE IF NOT EXISTS public.user_directory (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_directory TO authenticated;
GRANT ALL ON public.user_directory TO service_role;

ALTER TABLE public.user_directory ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_directory_select ON public.user_directory
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.sync_user_directory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_directory (id, full_name, updated_at)
  VALUES (NEW.id, NEW.full_name, now())
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = now();
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.sync_user_directory() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_sync_user_directory ON public.profiles;
CREATE TRIGGER profiles_sync_user_directory
AFTER INSERT OR UPDATE OF full_name ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_user_directory();

INSERT INTO public.user_directory (id, full_name)
SELECT id, full_name FROM public.profiles
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;