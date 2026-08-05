
-- ============ FIX F-40: PACKING SLIP ATTACHMENTS ============
-- packing_slips.attachment_url existed but nothing in the app ever wrote
-- or read it -- no way to attach the scanned vendor slip, in a workflow
-- whose whole purpose is replacing paper. This adds a private storage
-- bucket and the RLS to let a project writer upload one, and any project
-- viewer read it.
--
-- Path convention: <slip_id>/<filename>, so storage.foldername(name)[1] is
-- the slip's id -- policies join back to packing_slips through that to
-- reuse can_write_project/can_see_project, same as every other
-- project-scoped permission check in this schema. attachment_url itself is
-- just a plain column write on packing_slips, already covered by the
-- existing ps_insert/ps_update policies (F-05) -- no table-level change
-- needed here, only the bucket + its storage.objects policies.
--
-- NOTE: on this project, INSERT INTO storage.buckets from the SQL Editor
-- has previously not taken effect even when the rest of the script
-- committed successfully (see purchase-order-pdfs / app-assets). If the
-- bucket doesn't show up after running this, create it manually via the
-- Storage tab: id "packing-slip-attachments", private, ~10MB limit,
-- application/pdf + image/jpeg + image/png.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('packing-slip-attachments', 'packing-slip-attachments', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS packing_slip_attachments_write ON storage.objects;
CREATE POLICY packing_slip_attachments_write ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'packing-slip-attachments'
  AND EXISTS (
    SELECT 1 FROM public.packing_slips ps
    WHERE ps.id::text = (storage.foldername(name))[1]
      AND public.can_write_project(auth.uid(), ps.project_id)
  )
);

DROP POLICY IF EXISTS packing_slip_attachments_replace ON storage.objects;
CREATE POLICY packing_slip_attachments_replace ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'packing-slip-attachments'
  AND EXISTS (
    SELECT 1 FROM public.packing_slips ps
    WHERE ps.id::text = (storage.foldername(name))[1]
      AND public.can_write_project(auth.uid(), ps.project_id)
  )
);

DROP POLICY IF EXISTS packing_slip_attachments_read ON storage.objects;
CREATE POLICY packing_slip_attachments_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'packing-slip-attachments'
  AND EXISTS (
    SELECT 1 FROM public.packing_slips ps
    WHERE ps.id::text = (storage.foldername(name))[1]
      AND public.can_see_project(auth.uid(), ps.project_id)
  )
);

COMMIT;
