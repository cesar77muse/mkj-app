
-- ============ FIX F-31: UNBOUNDED inventory_adjustments SCAN FOR "LAST UPDATED" ============
-- inventory.tsx pulled every row of inventory_adjustments (project_id,
-- created_at, no limit) purely to find each project's most recent
-- timestamp client-side. That's an ever-growing full-table transfer for a
-- single MAX() per project. A small aggregate view does the same
-- computation in the database instead.
--
-- Same visibility model as v_project_inventory (F-06): gated by
-- has_any_role so it stays "every real user, every project" for this
-- summary-level data, not scoped per-project like the raw ledger.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

CREATE OR REPLACE VIEW public.v_project_last_updated AS
SELECT project_id, MAX(created_at) AS last_updated
FROM public.inventory_adjustments
WHERE public.has_any_role(auth.uid())
GROUP BY project_id;
GRANT SELECT ON public.v_project_last_updated TO authenticated;

COMMIT;
