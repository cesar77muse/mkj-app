
-- ============ FIX F-28: MULTIPLE ROLES SILENTLY DROPPED ============
-- users.tsx reads rs[0] -- the first role from an unordered query result --
-- to decide what a user's role "is." The schema (UNIQUE(user_id, role) only)
-- permits several roles per user; set_user_role() (F-18) always leaves
-- exactly one via delete-then-insert when used through the app, but the
-- admin-only RLS policy on user_roles still allowed a second role to be
-- inserted directly (SQL editor, raw API), silently ignored by every
-- screen that assumes one role per user.
--
-- This is the same "a user has exactly one role" decision F-18's fix
-- already committed to -- enforced here structurally with
-- UNIQUE(user_id), so a second role becomes impossible to insert at all
-- rather than something the UI has to guess how to display. Existing
-- multi-role users (if any) are de-duplicated first, keeping the highest-
-- privilege role per the same precedence src/lib/roles.ts's highestRole()
-- already uses (admin > warehouse_manager > manager > engineer) -- the
-- most defensible choice given no other signal exists for which role was
-- "meant."
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY CASE role
        WHEN 'admin' THEN 1
        WHEN 'warehouse_manager' THEN 2
        WHEN 'manager' THEN 3
        WHEN 'engineer' THEN 4
        ELSE 5
      END
    ) AS rn
  FROM public.user_roles
)
DELETE FROM public.user_roles
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_key'
  ) THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

COMMIT;
