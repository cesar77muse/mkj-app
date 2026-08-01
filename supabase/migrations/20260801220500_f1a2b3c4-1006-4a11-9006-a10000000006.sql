
-- ============ FIX F-07: REMOVING A PROJECT MANAGER DIDN'T REVOKE ACCESS ============
-- sync_project_manager_assignment() (migration 20260730230303) inserted
-- the new manager into project_managers whenever projects.project_manager_id
-- changed, but never removed the previous one. can_write_project reads
-- project_managers, so a replaced manager kept full write access to the
-- project's POs, slips and tickets indefinitely.
--
-- This adds the missing revoke: on UPDATE where project_manager_id
-- actually changed, delete the *old* manager's project_managers row for
-- this project before inserting the new one.
--
-- Deliberately not bulk-cleaning existing project_managers rows here: the
-- Users page lets admins add extra managers into that table directly,
-- independent of the primary project_manager_id column, so there's no safe
-- way to tell "stale row from a past reassignment" apart from
-- "intentionally added manager" without risking revoking legitimate
-- access. Admins should spot-check current assignments on /users if they
-- suspect stale access from a past manager swap.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_project_manager_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.project_manager_id IS NOT NULL
     AND OLD.project_manager_id IS DISTINCT FROM NEW.project_manager_id
  THEN
    DELETE FROM public.project_managers
    WHERE project_id = NEW.id AND user_id = OLD.project_manager_id;
  END IF;

  IF NEW.project_manager_id IS NOT NULL THEN
    INSERT INTO public.project_managers (user_id, project_id)
    VALUES (NEW.project_manager_id, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

COMMIT;
