
-- ============ FIX F-13: SHIPPING TICKET PROOF-OF-DELIVERY STORAGE ============
-- The "Mark delivered" dialog (frontend already built) uploads a photo/scan
-- of the signed ticket to a bucket named "shipping-ticket-proofs" before
-- writing delivered_by/received_by/pass_number/signature_url on the ticket
-- row. That bucket doesn't exist yet, so every delivery attempt fails at
-- the upload step. This creates it and its RLS, same shape as
-- packing-slip-attachments (F-40): path convention <ticket_id>/<filename>,
-- policies join back to shipping_tickets through that to reuse
-- can_write_project/can_see_project.
--
-- NOTE: on this project, INSERT INTO storage.buckets from the SQL Editor
-- has previously not taken effect even when the rest of the script
-- committed successfully (see purchase-order-pdfs / app-assets). If the
-- bucket doesn't show up after running this, create it manually via the
-- Storage tab: id "shipping-ticket-proofs", private, ~10MB limit,
-- application/pdf + image/jpeg + image/png.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('shipping-ticket-proofs', 'shipping-ticket-proofs', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS shipping_ticket_proofs_write ON storage.objects;
CREATE POLICY shipping_ticket_proofs_write ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'shipping-ticket-proofs'
  AND EXISTS (
    SELECT 1 FROM public.shipping_tickets t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND public.can_write_project(auth.uid(), t.project_id)
  )
);

DROP POLICY IF EXISTS shipping_ticket_proofs_replace ON storage.objects;
CREATE POLICY shipping_ticket_proofs_replace ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'shipping-ticket-proofs'
  AND EXISTS (
    SELECT 1 FROM public.shipping_tickets t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND public.can_write_project(auth.uid(), t.project_id)
  )
);

DROP POLICY IF EXISTS shipping_ticket_proofs_read ON storage.objects;
CREATE POLICY shipping_ticket_proofs_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'shipping-ticket-proofs'
  AND EXISTS (
    SELECT 1 FROM public.shipping_tickets t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND public.can_see_project(auth.uid(), t.project_id)
  )
);

COMMIT;
