-- ============================================================
-- MKJ OPS APP — DEMO DATA: SERIAL NUMBER TRACKING (add-on)
-- ============================================================
-- Companion to seed_demo_data.sql, run AFTER it and AFTER the two serial
-- migrations (…_serial_number_tracking and …_borrow_request_serials).
-- Same rules as the main seed: every row it creates is marked "(DEMO)" so
-- teardown_demo_data.sql removes it, and it only ever touches DEMO- rows
-- and the two demo projects.
--
-- WHY THIS EXISTS AS A SEPARATE FILE: the main seed's stock comes from
-- 'initial' opening-balance ledger rows, which have no packing slip behind
-- them — and serials only exist because a packing slip recorded them. So
-- flagging a part as serialized on its own would leave every screen empty
-- ("6 on hand, 0 serials", nothing to pick on a ticket). This script adds
-- the receipts that give the demo something real to show:
--
--   1. Flags six DEMO parts as serialized (the ones a warehouse would
--      actually track by unit) and every other DEMO part explicitly as
--      not serialized.
--   2. 2403 receives 3 managed switches and 4 TPM modules, with serials.
--   3. 2601 receives 2 server chassis, with serials.
--   4. A 2403 shipping ticket picks one switch serial (left 'ready', so
--      the unit is still in stock — it shows on the ticket and its PDF).
--   5. 2601 borrows one switch from 2403 naming its serial, so that unit
--      is listed under 2601 in Inventory while the borrow is outstanding.
--
-- Safe to run more than once: the product flags are plain idempotent
-- UPDATEs, and the receipts/ticket/borrow are guarded on their own
-- "(DEMO) Serialized …" descriptions, so a second run creates nothing.
-- ============================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1. WHICH DEMO PARTS ARE SERIALIZED
-- ---------------------------------------------------------------
-- Serialized: high-value or security-sensitive units that get tracked one
-- by one — switches, the server chassis, the RAID controller, the storage
-- drive, and the TPM. Everything else (cables, ties, brackets, terminal
-- blocks, licenses, SD cards, rack kits, cabinets, power supplies) is
-- consumable or bulk stock, counted by quantity only.
UPDATE public.products SET is_serialized = true
WHERE part_number IN ('DEMO-1001','DEMO-1006','DEMO-1015','DEMO-1016','DEMO-1017','DEMO-1018')
  AND is_serialized IS DISTINCT FROM true;

UPDATE public.products SET is_serialized = false
WHERE part_number LIKE 'DEMO-%'
  AND part_number NOT IN ('DEMO-1001','DEMO-1006','DEMO-1015','DEMO-1016','DEMO-1017','DEMO-1018')
  AND is_serialized IS DISTINCT FROM false;

-- ---------------------------------------------------------------
-- 2-5. RECEIPTS, TICKET AND BORROW THAT CARRY SERIALS
-- ---------------------------------------------------------------
DO $$
DECLARE
  proj_2403 UUID := 'c00fd282-f8b1-40e7-b8e3-87f4e9abed99';
  proj_2601 UUID := 'c86232b1-cbd1-490a-a3f5-1979094d19a3';
  justin    UUID := 'eb6a1aaf-fb0c-45f0-8c89-1d865f68f60c';  -- warehouse_manager
  lucia     UUID := '040db047-d97b-48da-9bc0-f8e8c1f35369';  -- warehouse_manager
  cesar     UUID := 'b3f95bdc-a959-4683-9546-86b5f59309a3';  -- manager, 2601
  sup1      UUID := md5('mkj-demo-supplier-1')::uuid;
  sup3      UUID := md5('mkj-demo-supplier-3')::uuid;
  p1        UUID := md5('mkj-demo-product-1')::uuid;   -- managed switch      (serialized)
  p15       UUID := md5('mkj-demo-product-15')::uuid;  -- server chassis      (serialized)
  p18       UUID := md5('mkj-demo-product-18')::uuid;  -- TPM 2.0 module      (serialized)
  bill      TEXT := 'MKJ Electric Corp., 3630 Review Ave, Long Island City, NY 11101';
  po        public.purchase_orders;
  slip      public.packing_slips;
  ticket    public.shipping_tickets;
  item      UUID;
  req       UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p1) THEN
    RAISE NOTICE 'Demo products not found — run seed_demo_data.sql first. Nothing seeded.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.purchase_orders WHERE description LIKE '(DEMO) Serialized%') THEN
    RAISE NOTICE 'Serial demo data already present. Nothing seeded.';
    RETURN;
  END IF;

  -- ===== 2403: switches + TPM modules received with serials (Justin) =====
  PERFORM set_config('request.jwt.claims', json_build_object('sub', justin, 'role', 'authenticated')::text, true);

  SELECT * INTO po FROM public.create_purchase_order(
    proj_2403, sup1, bill, bill, CURRENT_DATE - 12, 'Common Carrier', 'Net 30',
    '(DEMO) Serialized network hardware — switches and security modules', justin, 0, NULL, NULL);

  INSERT INTO public.purchase_order_items (po_id, line_no, description, qty, unit, unit_cost) VALUES
    (po.id, 1, '(DEMO) Managed industrial switch, 24-port GE SFP downlink / 4-port GE SFP uplink', 3, 'ea', 4180.00),
    (po.id, 2, '(DEMO) Trusted Platform Module, TPM 2.0',                                          4, 'ea',  212.50);

  UPDATE public.purchase_orders SET status = 'executed' WHERE id = po.id;

  SELECT * INTO slip FROM public.create_packing_slip(
    po.id, proj_2403, CURRENT_DATE - 4, '(DEMO) Common Carrier', 'DEMO-VEND-91055',
    '(DEMO) Serialized receipt — every unit checked in against its serial number.',
    'received');

  -- Switch line: 3 units, all three serials captured.
  INSERT INTO public.packing_slip_items (slip_id, po_item_id, product_id, description, qty_ordered, qty_received, condition)
  SELECT slip.id, poi.id, p1, poi.description, poi.qty, poi.qty, 'ok'
  FROM public.purchase_order_items poi WHERE poi.po_id = po.id AND poi.line_no = 1
  RETURNING id INTO item;

  INSERT INTO public.packing_slip_item_serials (slip_item_id, serial, created_by) VALUES
    (item, 'FDO26DM0A01', justin),
    (item, 'FDO26DM0A02', justin),
    (item, 'FDO26DM0A03', justin);

  -- TPM line: 4 units received, only 3 serials recorded — deliberately
  -- incomplete, so the demo shows the soft "3/4 serials" state the UI is
  -- built around. A missing serial never blocks a receipt.
  INSERT INTO public.packing_slip_items (slip_id, po_item_id, product_id, description, qty_ordered, qty_received, condition)
  SELECT slip.id, poi.id, p18, poi.description, poi.qty, poi.qty, 'ok'
  FROM public.purchase_order_items poi WHERE poi.po_id = po.id AND poi.line_no = 2
  RETURNING id INTO item;

  INSERT INTO public.packing_slip_item_serials (slip_item_id, serial, created_by) VALUES
    (item, 'TPM2-DM-004471', justin),
    (item, 'TPM2-DM-004472', justin),
    (item, 'TPM2-DM-004473', justin);

  PERFORM public.sync_packing_slip_inventory(slip.id);
  UPDATE public.purchase_orders SET status = 'received', pre_receipt_status = 'executed' WHERE id = po.id;

  -- ===== 2601: server chassis received with serials (Lucia) =====
  PERFORM set_config('request.jwt.claims', json_build_object('sub', lucia, 'role', 'authenticated')::text, true);

  SELECT * INTO po FROM public.create_purchase_order(
    proj_2601, sup3, bill, bill, CURRENT_DATE - 9, 'UPS Ground', 'Net 30',
    '(DEMO) Serialized rack server chassis for the equipment room', lucia, 0, NULL, NULL);

  INSERT INTO public.purchase_order_items (po_id, line_no, description, qty, unit, unit_cost) VALUES
    (po.id, 1, '(DEMO) Rackmount server chassis, rear I/O, 16-drive support', 2, 'ea', 6215.00);

  UPDATE public.purchase_orders SET status = 'executed' WHERE id = po.id;

  SELECT * INTO slip FROM public.create_packing_slip(
    po.id, proj_2601, CURRENT_DATE - 3, '(DEMO) UPS Ground', 'DEMO-VEND-77310',
    '(DEMO) Serialized receipt — chassis serials recorded at the dock.',
    'received');

  INSERT INTO public.packing_slip_items (slip_id, po_item_id, product_id, description, qty_ordered, qty_received, condition)
  SELECT slip.id, poi.id, p15, poi.description, poi.qty, poi.qty, 'ok'
  FROM public.purchase_order_items poi WHERE poi.po_id = po.id AND poi.line_no = 1
  RETURNING id INTO item;

  INSERT INTO public.packing_slip_item_serials (slip_item_id, serial, created_by) VALUES
    (item, 'SRV-DM-88Q1042', lucia),
    (item, 'SRV-DM-88Q1043', lucia);

  PERFORM public.sync_packing_slip_inventory(slip.id);
  UPDATE public.purchase_orders SET status = 'received', pre_receipt_status = 'executed' WHERE id = po.id;

  -- ===== 2403: shipping ticket carrying a picked serial (Justin) =====
  -- Left at 'ready' on purpose: the unit is still on hand, so it stays
  -- pickable in Inventory while also showing on the ticket and its PDF.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', justin, 'role', 'authenticated')::text, true);

  SELECT * INTO ticket FROM public.create_shipping_ticket(
    proj_2403, CURRENT_DATE + 2, '(DEMO) Job Site A', '(DEMO) 1200 Platform Level, Queens, NY',
    'Site Super Alvarez', '(555) 010-0142', 'Van');

  INSERT INTO public.shipping_ticket_items (ticket_id, product_id, description, qty_shipped, qty_backordered)
  VALUES (ticket.id, p1, '(DEMO) Managed industrial switch, 24-port GE SFP downlink / 4-port GE SFP uplink', 1, 0)
  RETURNING id INTO item;

  INSERT INTO public.shipping_ticket_item_serials (ticket_item_id, serial, created_by)
  VALUES (item, 'FDO26DM0A03', justin);

  -- ===== 2601 borrows a switch from 2403, by serial =====
  -- Requested by 2601's manager, approved by the lending side's warehouse
  -- manager — the same two-role path a real borrow takes.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', cesar, 'role', 'authenticated')::text, true);

  INSERT INTO public.borrow_requests
    (source_project_id, target_project_id, product_id, qty_requested, reason, needed_by, requested_by)
  VALUES
    (proj_2403, proj_2601, p1, 1,
     '(DEMO) Serialized switch needed for the 2601 control room cutover — unit tracked by serial.',
     CURRENT_DATE + 5, cesar)
  RETURNING id INTO req;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', justin, 'role', 'authenticated')::text, true);
  PERFORM public.decide_borrow_request(
    req, 'approved', 1,
    '(DEMO) Approved — sending unit FDO26DM0A02.',
    ARRAY['FDO26DM0A02']);

  RAISE NOTICE 'Serial demo data seeded.';
END $$;

COMMIT;

-- ============================================================
-- WHAT YOU SHOULD SEE AFTERWARDS
--   Products      DEMO-1001 / 1006 / 1015 / 1016 / 1017 / 1018 badged "Serialized".
--   Packing slips the 2403 serialized receipt shows 3/3 switch serials and
--                 3/4 TPM serials ("1 not recorded").
--   Inventory     2403 lists FDO26DM0A01 and FDO26DM0A03 for the switch;
--                 FDO26DM0A02 appears under 2601 (borrowed, not returned).
--   Ticket        the 2403 "ready" ticket lists FDO26DM0A03, and its PDF
--                 prints it under the line description.
--   Borrow        the request detail shows the serial that moved.
-- ============================================================
