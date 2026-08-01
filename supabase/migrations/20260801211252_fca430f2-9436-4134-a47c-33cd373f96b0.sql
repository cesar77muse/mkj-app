
-- ============ SHIPPING TICKET NUMBERING REFACTOR ============
-- New format: S<project_number>-<3-digit-seq>, e.g. S2403-001. Mirrors the
-- purchase_orders numbering refactor (see migration 20260730013211) exactly:
-- per-project sequence, row-locked to avoid races, project_number snapshotted
-- at creation time so a later project rename never changes an already-issued
-- ticket number.
--
-- Existing tickets keep their historical global 'S#####' ticket_number text
-- unchanged (gen_ticket_number()'s old sequence-based numbers stay valid,
-- real signed paperwork already references them) — this migration only
-- back-fills project_number/ticket_sequence bookkeeping on old rows and
-- changes how NEW tickets are numbered going forward.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor: every step is guarded so re-running this script is a no-op.

BEGIN;

-- 1. Add columns (no-op if they already exist).
ALTER TABLE public.shipping_tickets ADD COLUMN IF NOT EXISTS project_number TEXT;
ALTER TABLE public.shipping_tickets ADD COLUMN IF NOT EXISTS ticket_sequence INTEGER;

-- 2. Backfill project_number from the related project — only rows that
--    don't have one yet.
UPDATE public.shipping_tickets st
SET project_number = pr.mkj_number
FROM public.projects pr
WHERE st.project_id = pr.id
  AND st.project_number IS NULL;

-- 3. Backfill ticket_sequence per project, in creation order — only rows
--    that don't have one yet. Existing ticket_number text is left exactly
--    as-is; this only establishes each project's starting point so newly
--    created tickets continue the per-project count correctly.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at) AS rn
  FROM public.shipping_tickets
  WHERE ticket_sequence IS NULL
)
UPDATE public.shipping_tickets st
SET ticket_sequence = ranked.rn
FROM ranked
WHERE st.id = ranked.id;

-- 4. Lock the columns down now that every existing row has a value.
ALTER TABLE public.shipping_tickets ALTER COLUMN project_number SET NOT NULL;
ALTER TABLE public.shipping_tickets ALTER COLUMN ticket_sequence SET NOT NULL;

-- 5. Hard uniqueness guarantee, same pattern as purchase_orders_project_sequence_key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipping_tickets_project_sequence_key'
  ) THEN
    ALTER TABLE public.shipping_tickets
      ADD CONSTRAINT shipping_tickets_project_sequence_key UNIQUE (project_id, ticket_sequence);
  END IF;
END $$;

-- 6. Atomic, backend-level number generation — copies create_purchase_order()'s
--    pattern exactly: FOR UPDATE row lock on the project serializes concurrent
--    ticket creations for the SAME project, so two people can never get the
--    same sequence number. Other projects are unaffected.
CREATE OR REPLACE FUNCTION public.create_shipping_ticket(
  _project_id UUID,
  _ship_date DATE,
  _deliver_to_name TEXT,
  _deliver_to_address TEXT,
  _contact_name TEXT,
  _contact_phone TEXT,
  _ship_by TEXT
) RETURNS public.shipping_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _project_number TEXT;
  _next_seq INTEGER;
  _ticket_number TEXT;
  _new_ticket public.shipping_tickets;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the same check the st_write policy
  -- would have made is re-applied explicitly here.
  IF NOT public.can_write_project(auth.uid(), _project_id) THEN
    RAISE EXCEPTION 'Not permitted to create a shipping ticket for this project';
  END IF;

  SELECT mkj_number INTO _project_number
  FROM public.projects
  WHERE id = _project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  SELECT COALESCE(MAX(ticket_sequence), 0) + 1 INTO _next_seq
  FROM public.shipping_tickets
  WHERE project_id = _project_id;

  _ticket_number := 'S' || _project_number || '-' || LPAD(_next_seq::TEXT, 3, '0');

  INSERT INTO public.shipping_tickets (
    project_id, project_number, ticket_sequence, ticket_number,
    ship_date, deliver_to_name, deliver_to_address, contact_name, contact_phone,
    ship_by, status, created_by
  ) VALUES (
    _project_id, _project_number, _next_seq, _ticket_number,
    _ship_date, _deliver_to_name, _deliver_to_address, _contact_name, _contact_phone,
    _ship_by, 'ready', auth.uid()
  )
  RETURNING * INTO _new_ticket;

  RETURN _new_ticket;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_shipping_ticket(UUID, DATE, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_shipping_ticket(UUID, DATE, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ============ SHIPPING TICKET PDF CACHE ============
-- Same design as purchase_order_pdfs (see migration 20260801001827): a
-- separate table rather than columns on shipping_tickets, so caching a PDF
-- never bumps shipping_tickets.updated_at (trg_st_upd fires on any update to
-- that table). Read-only for clients; only the shipping-ticket-pdf edge
-- function (service_role) writes here.
CREATE TABLE IF NOT EXISTS public.shipping_ticket_pdfs (
  ticket_id UUID PRIMARY KEY REFERENCES public.shipping_tickets(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID REFERENCES auth.users(id)
);

GRANT SELECT ON public.shipping_ticket_pdfs TO authenticated;
GRANT ALL ON public.shipping_ticket_pdfs TO service_role;
ALTER TABLE public.shipping_ticket_pdfs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shipping_ticket_pdfs_select" ON public.shipping_ticket_pdfs;
CREATE POLICY "shipping_ticket_pdfs_select" ON public.shipping_ticket_pdfs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.shipping_tickets t
    WHERE t.id = ticket_id AND public.can_see_project(auth.uid(), t.project_id)
  )
);

-- ============ STORAGE BUCKET ============
-- NOTE: on this project, INSERT INTO storage.buckets from the SQL Editor has
-- previously not taken effect even when the rest of the script committed
-- successfully (see purchase-order-pdfs / app-assets). If the bucket doesn't
-- show up after running this, create it manually via the Storage tab:
-- id "shipping-ticket-pdfs", private, ~10MB limit, application/pdf only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('shipping-ticket-pdfs', 'shipping-ticket-pdfs', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Read policy mirrors po_pdfs_read (migration 20260801131217): a client may
-- read a generated PDF directly from storage only if a matching cache row
-- exists and they can see the ticket's project. Writes stay service_role-only
-- (no INSERT/UPDATE/DELETE policy here) — only the edge function writes.
DROP POLICY IF EXISTS shipping_ticket_pdfs_read ON storage.objects;
CREATE POLICY shipping_ticket_pdfs_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'shipping-ticket-pdfs'
    AND EXISTS (
      SELECT 1
      FROM public.shipping_ticket_pdfs pd
      JOIN public.shipping_tickets t ON t.id = pd.ticket_id
      WHERE pd.storage_path = storage.objects.name
        AND public.can_see_project(auth.uid(), t.project_id)
    )
  );

COMMIT;
