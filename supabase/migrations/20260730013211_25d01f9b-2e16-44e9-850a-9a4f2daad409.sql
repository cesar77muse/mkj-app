
-- ============ PURCHASE ORDER NUMBERING REFACTOR ============
-- New format: MKJ<project_number>EX<po_sequence>, e.g. MKJ2403EX003.
-- po_sequence increments independently per project (previously a single
-- global sequence, public.po_seq, shared by every project).
--
-- Written to be safe to run manually, more than once, via the Lovable
-- SQL Editor: every step is guarded so re-running this script after a
-- partial or full success is a no-op rather than an error.

BEGIN;

-- 1. Add columns (no-op if they already exist).
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS project_number TEXT;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS po_sequence INTEGER;

-- 2. Backfill project_number from the related project — only rows that
--    don't have one yet, so re-running never overwrites an already-set
--    historical value even if the project has since been renamed.
UPDATE public.purchase_orders po
SET project_number = pr.mkj_number
FROM public.projects pr
WHERE po.project_id = pr.id
  AND po.project_number IS NULL;

-- 3. Backfill po_sequence per project, in creation order — again only
--    rows that don't have one yet. Existing po_number text is left
--    exactly as-is (already-issued PO numbers are not renamed); this
--    only establishes each project's starting point so newly created
--    POs continue the per-project count correctly.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at) AS rn
  FROM public.purchase_orders
  WHERE po_sequence IS NULL
)
UPDATE public.purchase_orders po
SET po_sequence = ranked.rn
FROM ranked
WHERE po.id = ranked.id;

-- 4. Lock the columns down now that every existing row has a value.
--    (Re-running SET NOT NULL on an already-NOT-NULL column is a no-op.)
ALTER TABLE public.purchase_orders ALTER COLUMN project_number SET NOT NULL;
ALTER TABLE public.purchase_orders ALTER COLUMN po_sequence SET NOT NULL;

-- 5. Hard uniqueness guarantee: no project may have two POs with the same
--    sequence number. (po_number keeps its own pre-existing UNIQUE
--    constraint.) Postgres has no native ADD CONSTRAINT IF NOT EXISTS,
--    so this is guarded manually.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_project_sequence_key'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_project_sequence_key UNIQUE (project_id, po_sequence);
  END IF;
END $$;

-- 6. Atomic, backend-level number generation. Combines what used to be two
--    client round-trips (gen_po_number() to mint a string, then a separate
--    insert) into a single statement, so two concurrent PO creations for
--    the SAME project can never race for the same sequence number — the
--    `FOR UPDATE` row lock on the project serializes them. Other projects
--    are unaffected since the lock is per-project-row.
--    CREATE OR REPLACE is inherently safe to re-run.
CREATE OR REPLACE FUNCTION public.create_purchase_order(
  _project_id UUID,
  _supplier_id UUID,
  _bill_to TEXT,
  _ship_to TEXT,
  _delivery_date DATE,
  _ship_via TEXT,
  _payment_terms TEXT,
  _description TEXT
) RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _project_number TEXT;
  _next_seq INTEGER;
  _po_number TEXT;
  _new_po public.purchase_orders;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the same check the po_write policy
  -- would have made is re-applied explicitly here.
  IF NOT public.can_write_project(auth.uid(), _project_id) THEN
    RAISE EXCEPTION 'Not permitted to create a purchase order for this project';
  END IF;

  SELECT mkj_number INTO _project_number
  FROM public.projects
  WHERE id = _project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  SELECT COALESCE(MAX(po_sequence), 0) + 1 INTO _next_seq
  FROM public.purchase_orders
  WHERE project_id = _project_id;

  _po_number := 'MKJ' || _project_number || 'EX' || LPAD(_next_seq::TEXT, 3, '0');

  INSERT INTO public.purchase_orders (
    project_id, project_number, po_sequence, po_number,
    supplier_id, bill_to, ship_to, delivery_date, ship_via, payment_terms, description, created_by
  ) VALUES (
    _project_id, _project_number, _next_seq, _po_number,
    _supplier_id, _bill_to, _ship_to, _delivery_date, _ship_via, _payment_terms, _description, auth.uid()
  )
  RETURNING * INTO _new_po;

  RETURN _new_po;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_purchase_order(UUID, UUID, TEXT, TEXT, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(UUID, UUID, TEXT, TEXT, DATE, TEXT, TEXT, TEXT) TO authenticated;

-- 7. gen_po_number() is fully superseded by create_purchase_order() above
--    (old format, global sequence, no longer called from the app).
DROP FUNCTION IF EXISTS public.gen_po_number(TEXT);

COMMIT;
