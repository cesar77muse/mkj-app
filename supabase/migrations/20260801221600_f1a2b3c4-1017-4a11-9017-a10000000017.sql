
-- ============ FIX F-20: PACKING SLIP NUMBERING REFACTOR ============
-- Mirrors the purchase_orders (20260730013211) and shipping_tickets
-- (20260801211252) numbering refactors exactly: per-project sequence,
-- row-locked to avoid races, project_number snapshotted at creation time so
-- a later project rename never changes an already-issued slip number.
--
-- gen_ps_number() previously minted numbers from a single GLOBAL sequence
-- (ps_seq) in a separate round trip before the insert -- not per-project
-- like PO/ticket numbers, and if the subsequent insert failed for any
-- reason, that number was already burned. create_packing_slip() folds both
-- steps into one atomic call.
--
-- Existing slips keep their historical global '<mkj>-PS-####' slip_number
-- text unchanged -- this only back-fills project_number/ps_sequence
-- bookkeeping on old rows and changes how NEW slips are numbered going
-- forward.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor: every step is guarded so re-running this script is a no-op.

BEGIN;

-- 1. Add columns (no-op if they already exist).
ALTER TABLE public.packing_slips ADD COLUMN IF NOT EXISTS project_number TEXT;
ALTER TABLE public.packing_slips ADD COLUMN IF NOT EXISTS ps_sequence INTEGER;

-- 2. Backfill project_number from the related project — only rows that
--    don't have one yet.
UPDATE public.packing_slips ps
SET project_number = pr.mkj_number
FROM public.projects pr
WHERE ps.project_id = pr.id
  AND ps.project_number IS NULL;

-- 3. Backfill ps_sequence per project, in creation order — only rows that
--    don't have one yet. Existing slip_number text is left exactly as-is;
--    this only establishes each project's starting point so newly created
--    slips continue the per-project count correctly.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at) AS rn
  FROM public.packing_slips
  WHERE ps_sequence IS NULL
)
UPDATE public.packing_slips ps
SET ps_sequence = ranked.rn
FROM ranked
WHERE ps.id = ranked.id;

-- 4. Lock the columns down now that every existing row has a value.
ALTER TABLE public.packing_slips ALTER COLUMN project_number SET NOT NULL;
ALTER TABLE public.packing_slips ALTER COLUMN ps_sequence SET NOT NULL;

-- 5. Hard uniqueness guarantee, same pattern as purchase_orders_project_sequence_key
--    and shipping_tickets_project_sequence_key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'packing_slips_project_sequence_key'
  ) THEN
    ALTER TABLE public.packing_slips
      ADD CONSTRAINT packing_slips_project_sequence_key UNIQUE (project_id, ps_sequence);
  END IF;
END $$;

-- 6. Atomic, backend-level number generation — copies create_purchase_order()/
--    create_shipping_ticket()'s pattern exactly: FOR UPDATE row lock on the
--    project serializes concurrent slip creations for the SAME project, so
--    two receipts can never get the same sequence number, and the number is
--    never minted separately from the row it belongs to.
CREATE OR REPLACE FUNCTION public.create_packing_slip(
  _po_id UUID,
  _project_id UUID,
  _received_date DATE,
  _carrier TEXT,
  _vendor_slip_number TEXT,
  _notes TEXT,
  _status TEXT
) RETURNS public.packing_slips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _project_number TEXT;
  _next_seq INTEGER;
  _slip_number TEXT;
  _new_slip public.packing_slips;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the same check the ps_insert policy
  -- would have made is re-applied explicitly here.
  IF NOT public.can_write_project(auth.uid(), _project_id) THEN
    RAISE EXCEPTION 'Not permitted to create a packing slip for this project';
  END IF;

  IF _status NOT IN ('received', 'partially_received') THEN
    RAISE EXCEPTION 'Invalid slip status: %', _status;
  END IF;

  SELECT mkj_number INTO _project_number
  FROM public.projects
  WHERE id = _project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  SELECT COALESCE(MAX(ps_sequence), 0) + 1 INTO _next_seq
  FROM public.packing_slips
  WHERE project_id = _project_id;

  _slip_number := _project_number || '-PS-' || LPAD(_next_seq::TEXT, 4, '0');

  INSERT INTO public.packing_slips (
    po_id, project_id, project_number, ps_sequence, slip_number,
    received_date, received_by, carrier, vendor_slip_number, notes, status
  ) VALUES (
    _po_id, _project_id, _project_number, _next_seq, _slip_number,
    _received_date, auth.uid(), _carrier, _vendor_slip_number, _notes, _status
  )
  RETURNING * INTO _new_slip;

  RETURN _new_slip;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_packing_slip(UUID, UUID, DATE, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_packing_slip(UUID, UUID, DATE, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 7. gen_ps_number() is fully superseded by create_packing_slip() above
--    (old format, global sequence, no longer called from the app).
DROP FUNCTION IF EXISTS public.gen_ps_number(TEXT);

COMMIT;
