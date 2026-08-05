
-- ============ FIX F-18: LAST-ADMIN LOCKOUT ============
-- setRoleMut (users.tsx) deleted all of a user's roles then inserted one,
-- with no atomicity (a failure between the two left the user with no role
-- at all) and no guard against removing the only admin -- since
-- user_roles writes are admin-only and the "first user becomes admin"
-- trigger only fires when the table is completely empty, that has no
-- recovery path at all.
--
-- set_user_role() re-checks the caller is admin (mirrors the existing RLS
-- rule this bypasses via SECURITY DEFINER), does the delete+insert
-- atomically in one call, and -- the actual fix -- if the target user
-- currently holds admin and the new role isn't admin, checks whether
-- they're the *only* admin left and rejects if so. Covers demoting
-- yourself or someone else demoting the last other admin, not just
-- self-demotion. FOR UPDATE on the admin rows serializes this against a
-- concurrent demotion of a different admin, so two simultaneous calls
-- can't both see "more than one admin" and both proceed.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_user_role(_user_id UUID, _role public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor UUID := auth.uid();
  _is_admin_target BOOLEAN;
  _admin_count INTEGER;
BEGIN
  IF NOT public.is_admin(_actor) THEN
    RAISE EXCEPTION 'Not permitted to change user roles';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin') INTO _is_admin_target;

  IF _is_admin_target AND _role <> 'admin' THEN
    PERFORM 1 FROM public.user_roles WHERE role = 'admin' FOR UPDATE;
    SELECT COUNT(*) INTO _admin_count FROM public.user_roles WHERE role = 'admin';
    IF _admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove admin from the last remaining admin';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_user_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, public.app_role) TO authenticated;

COMMIT;
