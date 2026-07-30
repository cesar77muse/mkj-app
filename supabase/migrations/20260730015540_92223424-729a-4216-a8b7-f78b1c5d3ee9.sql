ALTER TABLE public.packing_slips
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'received';

ALTER TABLE public.packing_slips
  DROP CONSTRAINT IF EXISTS packing_slips_status_check;

ALTER TABLE public.packing_slips
  ADD CONSTRAINT packing_slips_status_check
  CHECK (status IN ('received','partially_received'));

UPDATE public.packing_slips ps
SET status = CASE
  WHEN EXISTS (
    SELECT 1 FROM public.packing_slip_items i
    WHERE i.slip_id = ps.id AND i.qty_received < i.qty_ordered
  ) THEN 'partially_received'
  ELSE 'received'
END;