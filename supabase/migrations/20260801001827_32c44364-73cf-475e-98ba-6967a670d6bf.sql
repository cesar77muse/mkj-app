
-- ============ PURCHASE ORDER PDF CACHE ============
-- Generated PO PDFs are rendered by the `po-pdf` edge function and stored in
-- Supabase Storage (bucket: purchase-order-pdfs). This table only holds the
-- pointer + a content hash used to decide whether a cached PDF is still
-- valid for the PO's current data, so the PDF isn't re-rendered on every view.
--
-- Deliberately a separate table rather than columns on purchase_orders:
-- purchase_orders already has a BEFORE UPDATE trigger (trg_po_upd) that
-- bumps updated_at on any change to the row. Writing cache metadata back
-- onto purchase_orders would bump updated_at every time someone merely
-- *views* a PO whose cache was stale, polluting a timestamp that currently
-- means "the PO's business data last changed."
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor: every step is guarded so re-running this script is a no-op.

BEGIN;

CREATE TABLE IF NOT EXISTS public.purchase_order_pdfs (
  po_id UUID PRIMARY KEY REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID REFERENCES auth.users(id)
);

-- Read-only for clients: only the edge function (using the service_role key)
-- ever writes here. No INSERT/UPDATE/DELETE grant is given to `authenticated`,
-- so writes are denied by default regardless of RLS.
GRANT SELECT ON public.purchase_order_pdfs TO authenticated;
GRANT ALL ON public.purchase_order_pdfs TO service_role;
ALTER TABLE public.purchase_order_pdfs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "po_pdfs_select" ON public.purchase_order_pdfs;
CREATE POLICY "po_pdfs_select" ON public.purchase_order_pdfs FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.purchase_orders p
    WHERE p.id = po_id AND public.can_see_project(auth.uid(), p.project_id)
  )
);

-- ============ STORAGE BUCKETS ============
-- Both buckets are private. Nothing is granted to `anon`/`authenticated` on
-- storage.objects for them — all reads and writes are mediated by edge
-- functions using the service_role key, which bypasses storage RLS. Clients
-- never call supabase.storage directly for these buckets.

-- Generated PDFs, one object per PO (path: {po_id}.pdf), overwritten on
-- regeneration.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('purchase-order-pdfs', 'purchase-order-pdfs', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Static branding assets (e.g. the MKJ logo) embedded into generated PDFs.
-- Upload the logo here manually via the Storage tab, e.g. at
-- app-assets/logo/mkj-logo.jpg.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('app-assets', 'app-assets', false, 5242880, ARRAY['image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

COMMIT;
