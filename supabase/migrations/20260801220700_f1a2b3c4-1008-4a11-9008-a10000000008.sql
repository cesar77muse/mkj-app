
-- ============ FIX F-06 FOLLOW-UP: PROJECT NAMES BLANK IN BORROW LIST / INVENTORY ============
-- Reverting projects_select to can_see_project (migration 20260801220400)
-- correctly locked down full project records, but broke two spots that
-- embed `projects` purely to label rows with a name: the borrow-requests
-- list (source/target project columns) and the Inventory page (project
-- column). Anyone viewing a request or inventory row for a project they
-- aren't personally on now sees a blank name instead of "MKJ1234".
--
-- Also: v_project_inventory (the on-hand aggregate powering the Inventory
-- page and the borrow on-hand checks) is a plain view, and plain views in
-- Postgres run with the view owner's privileges for RLS purposes, not the
-- caller's -- so it has always shown every project's stock to every
-- authenticated user regardless of inv_select, including a zero-role
-- signup. That actually matches the intended product behavior (any real
-- user should see stock everywhere, to know where they could borrow from)
-- except for that last part: a brand-new signup with no role at all
-- shouldn't see it either, per the original F-06 concern.
--
-- has_any_role() plugs that gap without reintroducing per-project
-- restriction: "does this user have *any* row in user_roles at all"
-- (doesn't matter which role). v_project_inventory gets that guard baked
-- in. v_borrow_project_options is replaced with v_project_directory (same
-- id/mkj_number/name-only shape, same guard) since its job now extends
-- beyond the borrow picker to labeling rows in both of the spots above --
-- full project records (description, contract #, status, PM, etc.) are
-- deliberately not part of this view and stay behind can_see_project.
--
-- Detailed ledger movements (individual inventory_adjustments rows -- the
-- "Last updated" stamp and "Recent borrow movements" history) are
-- deliberately left as-is, still scoped to can_see_project: this migration
-- only widens the aggregate on-hand total and project names, not the
-- underlying movement history.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id) $$;

CREATE OR REPLACE VIEW public.v_project_inventory AS
SELECT project_id, product_id, SUM(delta) AS on_hand
FROM public.inventory_adjustments
WHERE public.has_any_role(auth.uid())
GROUP BY project_id, product_id;
GRANT SELECT ON public.v_project_inventory TO authenticated;

DROP VIEW IF EXISTS public.v_borrow_project_options;

CREATE OR REPLACE VIEW public.v_project_directory AS
SELECT id, mkj_number, name
FROM public.projects
WHERE public.has_any_role(auth.uid());
GRANT SELECT ON public.v_project_directory TO authenticated;

COMMIT;
