
-- ============ FIX F-06: PROJECT / INVENTORY VISIBILITY WAS WIDE OPEN ============
-- Migration 20260730231509 replaced inv_select and projects_select with
-- USING (true), so any authenticated account -- including a brand-new
-- self-signup with no role at all -- could list every project and every
-- inventory movement in the company. This reverts both to can_see_project,
-- matching the Users page's own "Admins & Warehouse Managers see every
-- project" copy (i.e. everyone else should see only their assigned
-- projects, as originally designed).
--
-- The one legitimate consumer of the wide-open projects_select was the
-- borrow-requests "Borrow from" picker (src/routes/_authenticated/borrow-requests.tsx),
-- which intentionally needs to name a project the requester does *not*
-- manage (that's the point of borrowing). Every other project picker in
-- the app (PO/slip/ticket creation, the Projects page) only ever needs
-- projects the user can already see/write, so those get strictly more
-- correct, not broken, by this revert. v_borrow_project_options preserves
-- just that one picker: a plain view (unrestricted by design, same
-- mechanism already used by v_project_inventory) exposing only
-- id/mkj_number/name -- no status, contract info, or inventory data.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

DROP POLICY IF EXISTS inv_select ON public.inventory_adjustments;
CREATE POLICY inv_select ON public.inventory_adjustments FOR SELECT TO authenticated
USING (public.can_see_project(auth.uid(), project_id));

DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select ON public.projects FOR SELECT TO authenticated
USING (public.can_see_project(auth.uid(), id));

CREATE OR REPLACE VIEW public.v_borrow_project_options AS
SELECT id, mkj_number, name FROM public.projects;
GRANT SELECT ON public.v_borrow_project_options TO authenticated;

COMMIT;
