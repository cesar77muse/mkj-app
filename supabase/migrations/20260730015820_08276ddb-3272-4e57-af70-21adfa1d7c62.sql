UPDATE public.packing_slip_items i
SET product_id = p.id
FROM public.products p
WHERE i.product_id IS NULL
  AND (lower(p.part_number) = lower(trim(i.description)) OR lower(p.description) = lower(trim(i.description)));

INSERT INTO public.inventory_adjustments (project_id, product_id, delta, source_type, source_id, reason, created_by)
SELECT ps.project_id, i.product_id, i.qty_received, 'packing_slip', ps.id,
       'Received on slip ' || ps.slip_number, ps.received_by
FROM public.packing_slip_items i
JOIN public.packing_slips ps ON ps.id = i.slip_id
WHERE i.product_id IS NOT NULL
  AND i.qty_received > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory_adjustments a
    WHERE a.source_type = 'packing_slip' AND a.source_id = ps.id AND a.product_id = i.product_id
  );