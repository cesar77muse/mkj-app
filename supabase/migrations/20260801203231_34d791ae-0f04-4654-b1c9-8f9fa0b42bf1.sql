ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS pre_receipt_status public.po_status;

ALTER TYPE public.po_status RENAME TO po_status_old;
CREATE TYPE public.po_status AS ENUM ('draft','approved','executed','partially_received','received');

ALTER TABLE public.purchase_orders ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.purchase_orders
  ALTER COLUMN status TYPE public.po_status USING status::text::public.po_status,
  ALTER COLUMN pre_receipt_status TYPE public.po_status USING pre_receipt_status::text::public.po_status;
ALTER TABLE public.purchase_orders ALTER COLUMN status SET DEFAULT 'draft'::public.po_status;

DROP TYPE public.po_status_old;