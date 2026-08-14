-- ============================================================
-- MKJ OPS APP — DEMO DATA SEED (for the MKJ approval walkthrough)
-- ============================================================
-- This is NOT a schema migration. It only inserts rows, tied to the two
-- real projects (2403, 2601) that already exist. Nothing about any real
-- project, product, supplier, PO, slip, ticket, or borrow request is
-- touched, edited, or deleted by this script.
--
-- Every demo row is unmistakably marked so it can never be confused with
-- real data and so the paired teardown_demo_data.sql can find and remove
-- it precisely:
--   - products.part_number always starts with "DEMO-"
--   - products.description always starts with "(DEMO) "
--   - suppliers.name always starts with "(DEMO) "
--   - every purchase_orders.description starts with "(DEMO) "
--   - every packing_slips.notes starts with "(DEMO) "
--   - every shipping_tickets.deliver_to_name starts with "(DEMO) "
--   - every borrow_requests.reason starts with "(DEMO) "
--   - every hand-inserted inventory_adjustments.reason starts with "(DEMO) "
-- No real row in this app will ever match those patterns, so the teardown
-- script's WHERE clauses can't accidentally touch real data.
--
-- HOW THIS WORKS: rather than hand-writing raw INSERTs for POs, packing
-- slips, shipping tickets, and borrow decisions (which would risk silently
-- skipping the app's own guard triggers / stock checks / numbering logic),
-- this script calls the exact same SECURITY DEFINER functions the app
-- calls (create_purchase_order, create_packing_slip, create_shipping_ticket,
-- sync_packing_slip_inventory, ship_shipping_ticket_inventory,
-- decide_borrow_request, return_borrowed_stock), impersonating the right
-- real user for each step. Impersonation is done with
-- set_config('request.jwt.claims', ..., true) — a standard, transaction-
-- scoped (`true` = LOCAL) technique that only affects what auth.uid()
-- returns for the rest of THIS transaction. It does not create a session,
-- does not touch auth.users, and has no effect once this script finishes.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL Editor and run
-- it once, the same way you already apply migrations. It's wrapped in a
-- single transaction — if anything fails partway, nothing is committed.
--
-- WHAT THIS SCRIPT DELIBERATELY DOES NOT DO: it cannot upload real files
-- to Storage (no service-role key is used or needed anywhere here). One
-- shipping ticket (S....-xxx, "(DEMO) Job Site A" / Cat6A cable line) is
-- left at status 'shipped' on purpose — see README.md in this folder for
-- the 60-second manual step to mark it "Delivered" in the running app
-- using the placeholder proof image provided alongside this script, which
-- is the only way to get a real signed-ticket example without touching
-- Storage credentials.
--
-- Real users used (from the roles export you ran):
--   Justin Schneider   eb6a1aaf-fb0c-45f0-8c89-1d865f68f60c  warehouse_manager
--   Lucia Salinas      040db047-d97b-48da-9bc0-f8e8c1f35369  warehouse_manager
--   Cesar Hernandez    b3f95bdc-a959-4683-9546-86b5f59309a3  manager, 2601
--   Rucha Ghalsasi     7c91c2dc-cd4a-4850-90ad-46e2e052a1cb  manager, 2403
-- Projects:
--   2403  c00fd282-f8b1-40e7-b8e3-87f4e9abed99
--   2601  c86232b1-cbd1-490a-a3f5-1979094d19a3
--
-- Per your note that POs are a warehouse-manager action: Justin Schneider
-- creates/receives everything on 2403, Lucia Salinas on 2601. Borrow
-- requests are made/decided by each project's own manager, matching how a
-- real inter-project borrow would actually happen.
--
-- NOTE on borrow statuses: decide_borrow_request() auto-fulfills in the
-- same call whenever a request is approved (this app treats "approved" and
-- "stock transferred" as one atomic step) — so 'approved' and
-- 'partially_approved' are never a request's real resting status through
-- normal use; only pending / denied / fulfilled / partially_returned /
-- returned are. Per your instruction, two rows below (marked SYNTHETIC in
-- their decision_note) are hand-set directly to 'approved' and
-- 'partially_approved' purely for status-badge illustration — no inventory
-- is moved for those two, since no real action like that can occur.
--
-- Similarly, create_shipping_ticket() always creates a ticket as 'ready'
-- (there's no app path that leaves one at 'draft'), so the one 'draft'
-- ticket below is likewise hand-set afterward and marked SYNTHETIC.
-- ============================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1. SUPPLIERS (5, fixed deterministic ids so teardown needs no manifest)
-- ---------------------------------------------------------------
INSERT INTO public.suppliers (id, name, address, phone, contact_name, email) VALUES
  (md5('mkj-demo-supplier-1')::uuid, '(DEMO) Summit Electrical Supply',   '4100 Industrial Pkwy, Newark, NJ 07105',  '(973) 555-0142', 'Dana Ruiz',    'dana.ruiz@example-demo.com'),
  (md5('mkj-demo-supplier-2')::uuid, '(DEMO) Harbor Fiber & Cable Co.',   '221 Dockside Ave, Staten Island, NY 10301','(718) 555-0187', 'Mike Ferris',  'mike.ferris@example-demo.com'),
  (md5('mkj-demo-supplier-3')::uuid, '(DEMO) Northgate Rack Systems',    '77 Enclosure Way, Elizabeth, NJ 07201',   '(908) 555-0119', 'Priya Nair',   'priya.nair@example-demo.com'),
  (md5('mkj-demo-supplier-4')::uuid, '(DEMO) Meridian Controls Inc.',    '900 Panel Row, Long Island City, NY 11101','(718) 555-0163', 'Ben Ostrander','ben.ostrander@example-demo.com'),
  (md5('mkj-demo-supplier-5')::uuid, '(DEMO) Bluepeak Connectors LLC',   '15 Terminal Blvd, Hackensack, NJ 07601',  '(201) 555-0155', 'Amara Osei',   'amara.osei@example-demo.com')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- 2. PRODUCTS (22, fixed deterministic ids). Prices/quantities are pulled
--    from real 2403 paperwork (Rittal, Anixter, RS, Mercury, Fiber Optic
--    Warehouse POs) but jittered and reassigned to different, generic
--    descriptions so no real (part, price, qty) combination survives.
-- ---------------------------------------------------------------
INSERT INTO public.products (id, part_number, description, unit, reorder_point) VALUES
  (md5('mkj-demo-product-1')::uuid,  'DEMO-1001', '(DEMO) Managed industrial switch, 24-port GE SFP downlink / 4-port GE SFP uplink', 'ea',   2),
  (md5('mkj-demo-product-2')::uuid,  'DEMO-1002', '(DEMO) Rugged switch software license bundle, per device',                        'ea',   5),
  (md5('mkj-demo-product-3')::uuid,  'DEMO-1003', '(DEMO) 4GB industrial-grade SD memory card',                                       'ea',  10),
  (md5('mkj-demo-product-4')::uuid,  'DEMO-1004', '(DEMO) Low-voltage DC power supply module, 24-60V/10A',                            'ea',   5),
  (md5('mkj-demo-product-5')::uuid,  'DEMO-1005', '(DEMO) 23in NEBS rack-mount kit',                                                   'ea',   4),
  (md5('mkj-demo-product-6')::uuid,  'DEMO-1006', '(DEMO) 24-port copper PoE+ switch w/ 4x GE SFP uplink',                            'ea',   2),
  (md5('mkj-demo-product-7')::uuid,  'DEMO-1007', '(DEMO) High-capacity AC/DC power supply, 85-264VAC',                               'ea',   6),
  (md5('mkj-demo-product-8')::uuid,  'DEMO-1008', '(DEMO) 3-year device advantage license, per unit',                                 'ea',   8),
  (md5('mkj-demo-product-9')::uuid,  'DEMO-1009', '(DEMO) EMI-shielded equipment cabinet, 84x39x32in, right-hinge swing frame',       'ea',   1),
  (md5('mkj-demo-product-10')::uuid, 'DEMO-1010', '(DEMO) EMI-shielded equipment cabinet, 72x39x32in, right-hinge',                   'ea',   1),
  (md5('mkj-demo-product-11')::uuid, 'DEMO-1011', '(DEMO) EMI-shielded equipment cabinet, 72x39x32in, left-hinge',                    'ea',   1),
  (md5('mkj-demo-product-12')::uuid, 'DEMO-1012', '(DEMO) Two-position terminal block connector, feed-through, 8-24AWG',              'ea', 100),
  (md5('mkj-demo-product-13')::uuid, 'DEMO-1013', '(DEMO) Quick-mount end bracket, 55.6x9.5x32mm',                                    'ea', 100),
  (md5('mkj-demo-product-14')::uuid, 'DEMO-1014', '(DEMO) LC/UPC to LC/UPC single-mode fiber patch cable, 6ft',                       'ea',  20),
  (md5('mkj-demo-product-15')::uuid, 'DEMO-1015', '(DEMO) Rackmount server chassis, rear I/O, 16-drive support',                      'ea',   1),
  (md5('mkj-demo-product-16')::uuid, 'DEMO-1016', '(DEMO) 2TB SAS enterprise storage drive, 7200RPM',                                 'ea',   8),
  (md5('mkj-demo-product-17')::uuid, 'DEMO-1017', '(DEMO) RAID controller card, 16-drive support',                                    'ea',   2),
  (md5('mkj-demo-product-18')::uuid, 'DEMO-1018', '(DEMO) Trusted Platform Module, TPM 2.0',                                          'ea',   4),
  (md5('mkj-demo-product-19')::uuid, 'DEMO-1019', '(DEMO) Blu-ray/DVD-RW slim optical drive',                                         'ea',   3),
  (md5('mkj-demo-product-20')::uuid, 'DEMO-1020', '(DEMO) Cat6A shielded patch cable, 10ft, blue',                                    'ea',  40),
  (md5('mkj-demo-product-21')::uuid, 'DEMO-1021', '(DEMO) Cable management ring, wall-mount, 4in',                                    'ea',  25),
  (md5('mkj-demo-product-22')::uuid, 'DEMO-1022', '(DEMO) Heavy-duty cable tie, 24in, UV-rated (pack of 100)',                        'pack',15)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------
-- 3. OPENING INVENTORY BALANCE — one 'initial' ledger row per product per
--    project. This is what makes each project's Inventory tab show
--    22 items (within your 10-30 ask) right away.
-- ---------------------------------------------------------------
INSERT INTO public.inventory_adjustments (project_id, product_id, delta, source_type, reason, created_by)
SELECT v.project_id, p.product_id, v.qty, 'initial', '(DEMO) Opening balance, seeded for the MKJ walkthrough', v.actor
FROM (VALUES
  (md5('mkj-demo-product-1')::uuid,  3,   2),
  (md5('mkj-demo-product-2')::uuid,  10,  8),
  (md5('mkj-demo-product-3')::uuid,  10,  6),
  (md5('mkj-demo-product-4')::uuid,  6,   4),
  (md5('mkj-demo-product-5')::uuid,  12,  5),
  (md5('mkj-demo-product-6')::uuid,  3,   1),
  (md5('mkj-demo-product-7')::uuid,  6,   3),
  (md5('mkj-demo-product-8')::uuid,  5,   3),
  (md5('mkj-demo-product-9')::uuid,  1,   1),
  (md5('mkj-demo-product-10')::uuid, 1,   0),
  (md5('mkj-demo-product-11')::uuid, 0,   1),
  (md5('mkj-demo-product-12')::uuid, 400, 250),
  (md5('mkj-demo-product-13')::uuid, 400, 220),
  (md5('mkj-demo-product-14')::uuid, 60,  40),
  (md5('mkj-demo-product-15')::uuid, 1,   0),
  (md5('mkj-demo-product-16')::uuid, 16,  8),
  (md5('mkj-demo-product-17')::uuid, 3,   2),
  (md5('mkj-demo-product-18')::uuid, 8,   4),
  (md5('mkj-demo-product-19')::uuid, 5,   3),
  (md5('mkj-demo-product-20')::uuid, 120, 90),
  (md5('mkj-demo-product-21')::uuid, 60,  35),
  (md5('mkj-demo-product-22')::uuid, 40,  25)
) AS p(product_id, qty_2403, qty_2601)
CROSS JOIN LATERAL (VALUES
  ('c00fd282-f8b1-40e7-b8e3-87f4e9abed99'::uuid, p.qty_2403, 'eb6a1aaf-fb0c-45f0-8c89-1d865f68f60c'::uuid), -- 2403, Justin Schneider
  ('c86232b1-cbd1-490a-a3f5-1979094d19a3'::uuid, p.qty_2601, '040db047-d97b-48da-9bc0-f8e8c1f35369'::uuid)  -- 2601, Lucia Salinas
) AS v(project_id, qty, actor)
WHERE v.qty > 0;

-- ---------------------------------------------------------------
-- 4. PURCHASE ORDERS, PACKING SLIPS, SHIPPING TICKETS, BORROW REQUESTS
--    All actor-specific steps impersonate the real user via
--    set_config('request.jwt.claims', ..., true) immediately beforehand.
-- ---------------------------------------------------------------
DO $seed$
DECLARE
  proj_2403 CONSTANT UUID := 'c00fd282-f8b1-40e7-b8e3-87f4e9abed99';
  proj_2601 CONSTANT UUID := 'c86232b1-cbd1-490a-a3f5-1979094d19a3';

  justin CONSTANT UUID := 'eb6a1aaf-fb0c-45f0-8c89-1d865f68f60c'; -- warehouse_manager
  lucia  CONSTANT UUID := '040db047-d97b-48da-9bc0-f8e8c1f35369'; -- warehouse_manager
  cesarh CONSTANT UUID := 'b3f95bdc-a959-4683-9546-86b5f59309a3'; -- manager, 2601
  rucha  CONSTANT UUID := '7c91c2dc-cd4a-4850-90ad-46e2e052a1cb'; -- manager, 2403

  sup1 CONSTANT UUID := md5('mkj-demo-supplier-1')::uuid;
  sup2 CONSTANT UUID := md5('mkj-demo-supplier-2')::uuid;
  sup3 CONSTANT UUID := md5('mkj-demo-supplier-3')::uuid;
  sup4 CONSTANT UUID := md5('mkj-demo-supplier-4')::uuid;
  sup5 CONSTANT UUID := md5('mkj-demo-supplier-5')::uuid;

  p1  CONSTANT UUID := md5('mkj-demo-product-1')::uuid;
  p4  CONSTANT UUID := md5('mkj-demo-product-4')::uuid;
  p6  CONSTANT UUID := md5('mkj-demo-product-6')::uuid;
  p9  CONSTANT UUID := md5('mkj-demo-product-9')::uuid;
  p12 CONSTANT UUID := md5('mkj-demo-product-12')::uuid;
  p13 CONSTANT UUID := md5('mkj-demo-product-13')::uuid;
  p14 CONSTANT UUID := md5('mkj-demo-product-14')::uuid;
  p20 CONSTANT UUID := md5('mkj-demo-product-20')::uuid;
  p21 CONSTANT UUID := md5('mkj-demo-product-21')::uuid;

  bill CONSTANT TEXT := E'MKJ Communications\n850 3rd Ave., #407\nBrooklyn, NY 11232';

  po_draft_2403     public.purchase_orders;
  po_exec_2403      public.purchase_orders;
  po_recv_2403      public.purchase_orders;
  po_appr_2601      public.purchase_orders;
  po_partial_2601   public.purchase_orders;
  po_draft_2601     public.purchase_orders;

  slip_2403 public.packing_slips;
  slip_2601 public.packing_slips;

  t1 public.shipping_tickets;
  t2 public.shipping_tickets;
  t3 public.shipping_tickets;
  t4 public.shipping_tickets;
  t5 public.shipping_tickets;
BEGIN
  -- ===== PURCHASE ORDERS =====

  -- 2403 / draft — Justin Schneider (warehouse_manager)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', justin, 'role', 'authenticated')::text, true);
  SELECT * INTO po_draft_2403 FROM public.create_purchase_order(
    proj_2403, sup3, bill, bill, NULL, NULL, NULL,
    '(DEMO) Rack enclosures for equipment room build-out', justin, 0, NULL, NULL);
  INSERT INTO public.purchase_order_items (po_id, line_no, description, qty, unit, unit_cost) VALUES
    (po_draft_2403.id, 1, '(DEMO) EMI-shielded equipment cabinet, 84x39x32in, right-hinge swing frame', 1, 'ea', 21980.40),
    (po_draft_2403.id, 2, '(DEMO) EMI-shielded equipment cabinet, 72x39x32in, right-hinge',             1, 'ea', 13540.00);

  -- 2403 / executed — Justin Schneider
  PERFORM set_config('request.jwt.claims', json_build_object('sub', justin, 'role', 'authenticated')::text, true);
  SELECT * INTO po_exec_2403 FROM public.create_purchase_order(
    proj_2403, sup1, bill, bill, CURRENT_DATE + 21, 'UPS Ground', 'Net 30',
    '(DEMO) Network switching for phase 2 rollout', justin, 0, NULL, NULL);
  UPDATE public.purchase_orders SET status = 'executed' WHERE id = po_exec_2403.id;
  INSERT INTO public.purchase_order_items (po_id, line_no, description, qty, unit, unit_cost) VALUES
    (po_exec_2403.id, 1, '(DEMO) Managed industrial switch, 24-port GE SFP downlink / 4-port GE SFP uplink', 2, 'ea', 6802.10),
    (po_exec_2403.id, 2, '(DEMO) 24-port copper PoE+ switch w/ 4x GE SFP uplink',                            1, 'ea', 4180.90);

  -- 2403 / received (incl. a damaged-goods line) — Justin Schneider
  PERFORM set_config('request.jwt.claims', json_build_object('sub', justin, 'role', 'authenticated')::text, true);
  SELECT * INTO po_recv_2403 FROM public.create_purchase_order(
    proj_2403, sup2, bill, bill, CURRENT_DATE - 10, 'Common Carrier', 'Net 30',
    '(DEMO) Fiber and copper patch cable restock', justin, 0, NULL, NULL);
  INSERT INTO public.purchase_order_items (po_id, line_no, description, qty, unit, unit_cost) VALUES
    (po_recv_2403.id, 1, '(DEMO) LC/UPC to LC/UPC single-mode fiber patch cable, 6ft', 60, 'ea', 8.85),
    (po_recv_2403.id, 2, '(DEMO) Cat6A shielded patch cable, 10ft, blue',              50, 'ea', 7.95);

  SELECT * INTO slip_2403 FROM public.create_packing_slip(
    po_recv_2403.id, proj_2403, CURRENT_DATE - 3, '(DEMO) Common Carrier', 'DEMO-VEND-88213',
    '(DEMO) Full delivery, one line arrived with partial shipping damage — see condition on the Cat6A line.',
    'received');
  INSERT INTO public.packing_slip_items (slip_id, po_item_id, product_id, description, qty_ordered, qty_received, condition)
  SELECT slip_2403.id, poi.id, p14, poi.description, poi.qty, poi.qty, 'ok'
  FROM public.purchase_order_items poi WHERE poi.po_id = po_recv_2403.id AND poi.line_no = 1;
  -- Cat6A line: split across two slip lines so 40 count as usable stock and
  -- 10 (shipping damage) are recorded as received-but-not-stocked (F-08).
  -- The full ordered qty (50) lives on the 'ok' row only, and 0 on the
  -- 'damaged' row, so the two rows don't each display "50 ordered" (which
  -- would misleadingly read as 100 ordered at a glance).
  INSERT INTO public.packing_slip_items (slip_id, po_item_id, product_id, description, qty_ordered, qty_received, condition)
  SELECT slip_2403.id, poi.id, p20, poi.description, poi.qty, 40, 'ok'
  FROM public.purchase_order_items poi WHERE poi.po_id = po_recv_2403.id AND poi.line_no = 2;
  INSERT INTO public.packing_slip_items (slip_id, po_item_id, product_id, description, qty_ordered, qty_received, condition)
  SELECT slip_2403.id, poi.id, p20, poi.description, 0, 10, 'damaged'
  FROM public.purchase_order_items poi WHERE poi.po_id = po_recv_2403.id AND poi.line_no = 2;

  PERFORM public.sync_packing_slip_inventory(slip_2403.id);
  UPDATE public.purchase_orders SET status = 'received', pre_receipt_status = 'executed' WHERE id = po_recv_2403.id;

  -- 2601 / approved — Lucia Salinas
  PERFORM set_config('request.jwt.claims', json_build_object('sub', lucia, 'role', 'authenticated')::text, true);
  SELECT * INTO po_appr_2601 FROM public.create_purchase_order(
    proj_2601, sup4, bill, bill, CURRENT_DATE + 14, NULL, NULL,
    '(DEMO) Power supply modules for control panel retrofit', lucia, 0, NULL, NULL);
  UPDATE public.purchase_orders SET status = 'approved' WHERE id = po_appr_2601.id;
  INSERT INTO public.purchase_order_items (po_id, line_no, description, qty, unit, unit_cost) VALUES
    (po_appr_2601.id, 1, '(DEMO) Low-voltage DC power supply module, 24-60V/10A', 2, 'ea', 401.90),
    (po_appr_2601.id, 2, '(DEMO) High-capacity AC/DC power supply, 85-264VAC',    2, 'ea', 402.30);

  -- 2601 / partially_received — Lucia Salinas
  PERFORM set_config('request.jwt.claims', json_build_object('sub', lucia, 'role', 'authenticated')::text, true);
  SELECT * INTO po_partial_2601 FROM public.create_purchase_order(
    proj_2601, sup1, bill, bill, CURRENT_DATE - 5, 'UPS Ground', 'Net 30',
    '(DEMO) Terminal blocks and mounting hardware', lucia, 0, NULL, NULL);
  INSERT INTO public.purchase_order_items (po_id, line_no, description, qty, unit, unit_cost) VALUES
    (po_partial_2601.id, 1, '(DEMO) Two-position terminal block connector, feed-through, 8-24AWG', 200, 'ea', 3.05),
    (po_partial_2601.id, 2, '(DEMO) Quick-mount end bracket, 55.6x9.5x32mm',                       200, 'ea', 1.24);

  SELECT * INTO slip_2601 FROM public.create_packing_slip(
    po_partial_2601.id, proj_2601, CURRENT_DATE - 2, '(DEMO) UPS Ground', 'DEMO-VEND-40410',
    '(DEMO) Terminal blocks arrived complete; brackets short-shipped, remainder on backorder.',
    'partially_received');
  INSERT INTO public.packing_slip_items (slip_id, po_item_id, product_id, description, qty_ordered, qty_received, condition)
  SELECT slip_2601.id, poi.id, p12, poi.description, poi.qty, poi.qty, 'ok'
  FROM public.purchase_order_items poi WHERE poi.po_id = po_partial_2601.id AND poi.line_no = 1;
  INSERT INTO public.packing_slip_items (slip_id, po_item_id, product_id, description, qty_ordered, qty_received, condition)
  SELECT slip_2601.id, poi.id, p13, poi.description, poi.qty, 120, 'ok'
  FROM public.purchase_order_items poi WHERE poi.po_id = po_partial_2601.id AND poi.line_no = 2;

  PERFORM public.sync_packing_slip_inventory(slip_2601.id);
  UPDATE public.purchase_orders SET status = 'partially_received', pre_receipt_status = 'draft' WHERE id = po_partial_2601.id;

  -- 2601 / draft — Lucia Salinas
  PERFORM set_config('request.jwt.claims', json_build_object('sub', lucia, 'role', 'authenticated')::text, true);
  SELECT * INTO po_draft_2601 FROM public.create_purchase_order(
    proj_2601, sup5, bill, bill, NULL, NULL, NULL,
    '(DEMO) Cable management for equipment room', lucia, 0, NULL, NULL);
  INSERT INTO public.purchase_order_items (po_id, line_no, description, qty, unit, unit_cost) VALUES
    (po_draft_2601.id, 1, '(DEMO) Cable management ring, wall-mount, 4in', 100, 'ea', 1.10);

  -- ===== SHIPPING TICKETS =====

  -- 2403 / ready — Justin Schneider
  PERFORM set_config('request.jwt.claims', json_build_object('sub', justin, 'role', 'authenticated')::text, true);
  SELECT * INTO t1 FROM public.create_shipping_ticket(
    proj_2403, CURRENT_DATE + 1, '(DEMO) Job Site A', '(DEMO) 1200 Platform Level, Queens, NY',
    'Site Super Alvarez', '(555) 010-0142', 'Van');
  INSERT INTO public.shipping_ticket_items (ticket_id, product_id, description, qty_shipped, qty_backordered) VALUES
    (t1.id, p14, '(DEMO) LC/UPC to LC/UPC single-mode fiber patch cable, 6ft', 15, 0);

  -- 2403 / shipped -> will be completed to 'delivered' manually via the UI (see README)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', justin, 'role', 'authenticated')::text, true);
  SELECT * INTO t2 FROM public.create_shipping_ticket(
    proj_2403, CURRENT_DATE - 1, '(DEMO) Job Site A', '(DEMO) 1200 Platform Level, Queens, NY',
    'Site Super Alvarez', '(555) 010-0142', 'Van');
  INSERT INTO public.shipping_ticket_items (ticket_id, product_id, description, qty_shipped, qty_backordered) VALUES
    (t2.id, p20, '(DEMO) Cat6A shielded patch cable, 10ft, blue', 20, 0);
  PERFORM public.ship_shipping_ticket_inventory(t2.id);
  UPDATE public.shipping_tickets SET status = 'shipped' WHERE id = t2.id;

  -- 2403 / draft (SYNTHETIC — create_shipping_ticket always lands on 'ready';
  -- there is no app action that leaves a ticket at 'draft'. Set directly for
  -- status-badge illustration only.)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', justin, 'role', 'authenticated')::text, true);
  SELECT * INTO t3 FROM public.create_shipping_ticket(
    proj_2403, CURRENT_DATE + 3, '(DEMO) Job Site C (SYNTHETIC — draft)', '(DEMO) 500 Yard Rd, Bronx, NY',
    NULL, NULL, 'Van');
  INSERT INTO public.shipping_ticket_items (ticket_id, product_id, description, qty_shipped, qty_backordered) VALUES
    (t3.id, p9, '(DEMO) EMI-shielded equipment cabinet, 84x39x32in, right-hinge swing frame', 1, 0);
  UPDATE public.shipping_tickets SET status = 'draft' WHERE id = t3.id;

  -- 2601 / ready — Lucia Salinas
  PERFORM set_config('request.jwt.claims', json_build_object('sub', lucia, 'role', 'authenticated')::text, true);
  SELECT * INTO t4 FROM public.create_shipping_ticket(
    proj_2601, CURRENT_DATE + 2, '(DEMO) Job Site B', '(DEMO) 88 Harbor View, Brooklyn, NY',
    'Site Super Delgado', '(555) 010-0198', 'Van');
  INSERT INTO public.shipping_ticket_items (ticket_id, product_id, description, qty_shipped, qty_backordered) VALUES
    (t4.id, p12, '(DEMO) Two-position terminal block connector, feed-through, 8-24AWG', 50, 0);

  -- 2601 / shipped — Lucia Salinas
  PERFORM set_config('request.jwt.claims', json_build_object('sub', lucia, 'role', 'authenticated')::text, true);
  SELECT * INTO t5 FROM public.create_shipping_ticket(
    proj_2601, CURRENT_DATE - 2, '(DEMO) Job Site B', '(DEMO) 88 Harbor View, Brooklyn, NY',
    'Site Super Delgado', '(555) 010-0198', 'Van');
  INSERT INTO public.shipping_ticket_items (ticket_id, product_id, description, qty_shipped, qty_backordered) VALUES
    (t5.id, p21, '(DEMO) Cable management ring, wall-mount, 4in', 10, 0);
  PERFORM public.ship_shipping_ticket_inventory(t5.id);
  UPDATE public.shipping_tickets SET status = 'shipped' WHERE id = t5.id;

  -- ===== BORROW REQUESTS (7, one per status) =====

  -- pending: 2601 requests from 2403, un-decided
  PERFORM set_config('request.jwt.claims', json_build_object('sub', cesarh, 'role', 'authenticated')::text, true);
  INSERT INTO public.borrow_requests (id, source_project_id, target_project_id, product_id, qty_requested, reason, needed_by, requested_by)
  VALUES (md5('mkj-demo-borrow-1')::uuid, proj_2403, proj_2601, p1, 1, '(DEMO) Needed for a punch-list item at Job Site B', CURRENT_DATE + 5, cesarh);

  -- denied: 2403 requests from 2601, denied by 2601's manager
  PERFORM set_config('request.jwt.claims', json_build_object('sub', rucha, 'role', 'authenticated')::text, true);
  INSERT INTO public.borrow_requests (id, source_project_id, target_project_id, product_id, qty_requested, reason, needed_by, requested_by)
  VALUES (md5('mkj-demo-borrow-2')::uuid, proj_2601, proj_2403, p4, 2, '(DEMO) Short one power module for a panel swap', CURRENT_DATE + 3, rucha);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', cesarh, 'role', 'authenticated')::text, true);
  PERFORM public.decide_borrow_request(md5('mkj-demo-borrow-2')::uuid, 'denied', NULL, '(DEMO) Not enough spare on this project right now');

  -- fulfilled: 2601 requests from 2403, approved in full (auto-fulfills)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', cesarh, 'role', 'authenticated')::text, true);
  INSERT INTO public.borrow_requests (id, source_project_id, target_project_id, product_id, qty_requested, reason, needed_by, requested_by)
  VALUES (md5('mkj-demo-borrow-3')::uuid, proj_2403, proj_2601, p14, 10, '(DEMO) Extra patch cable run added to the punch list', CURRENT_DATE + 2, cesarh);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', rucha, 'role', 'authenticated')::text, true);
  PERFORM public.decide_borrow_request(md5('mkj-demo-borrow-3')::uuid, 'approved', 10, '(DEMO) Approved, plenty on hand');

  -- partially_returned: 2403 requests from 2601, partially approved+fulfilled, then part returned
  PERFORM set_config('request.jwt.claims', json_build_object('sub', rucha, 'role', 'authenticated')::text, true);
  INSERT INTO public.borrow_requests (id, source_project_id, target_project_id, product_id, qty_requested, reason, needed_by, requested_by)
  VALUES (md5('mkj-demo-borrow-4')::uuid, proj_2601, proj_2403, p12, 100, '(DEMO) Covering a terminal block shortage', CURRENT_DATE + 4, rucha);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', cesarh, 'role', 'authenticated')::text, true);
  PERFORM public.decide_borrow_request(md5('mkj-demo-borrow-4')::uuid, 'partially_approved', 60, '(DEMO) Can only spare 60 right now');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', rucha, 'role', 'authenticated')::text, true);
  PERFORM public.return_borrowed_stock(md5('mkj-demo-borrow-4')::uuid, 30, '(DEMO) Returning what was not needed after all');

  -- returned: 2601 requests from 2403, approved+fulfilled in full, then fully returned
  PERFORM set_config('request.jwt.claims', json_build_object('sub', cesarh, 'role', 'authenticated')::text, true);
  INSERT INTO public.borrow_requests (id, source_project_id, target_project_id, product_id, qty_requested, reason, needed_by, requested_by)
  VALUES (md5('mkj-demo-borrow-5')::uuid, proj_2403, proj_2601, p20, 40, '(DEMO) Short-term loan to finish a run before next delivery', CURRENT_DATE + 1, cesarh);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', rucha, 'role', 'authenticated')::text, true);
  PERFORM public.decide_borrow_request(md5('mkj-demo-borrow-5')::uuid, 'approved', 40, '(DEMO) Approved');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', cesarh, 'role', 'authenticated')::text, true);
  PERFORM public.return_borrowed_stock(md5('mkj-demo-borrow-5')::uuid, 40, '(DEMO) Our delivery came in, returning the full loan');

  -- approved (SYNTHETIC — see note above; no stock actually moves for this row)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', cesarh, 'role', 'authenticated')::text, true);
  INSERT INTO public.borrow_requests (id, source_project_id, target_project_id, product_id, qty_requested, qty_approved, status, reason, decision_note, needed_by, requested_by, decided_by, decided_at)
  VALUES (md5('mkj-demo-borrow-6')::uuid, proj_2601, proj_2403, p21, 20, 20, 'approved',
    '(DEMO) Needed a few cable rings ahead of inspection',
    '(DEMO SYNTHETIC — for status-badge illustration only. In real use this app moves straight to "fulfilled" the instant a request is approved, so this exact status is not something a real approval ever leaves behind.)',
    CURRENT_DATE + 6, rucha, cesarh, now());

  -- partially_approved (SYNTHETIC — see note above; no stock actually moves for this row)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', rucha, 'role', 'authenticated')::text, true);
  INSERT INTO public.borrow_requests (id, source_project_id, target_project_id, product_id, qty_requested, qty_approved, status, reason, decision_note, needed_by, requested_by, decided_by, decided_at)
  VALUES (md5('mkj-demo-borrow-7')::uuid, proj_2403, proj_2601, p6, 3, 1, 'partially_approved',
    '(DEMO) Requested 3 switches, only 1 was actually needed on site',
    '(DEMO SYNTHETIC — for status-badge illustration only. Same as above: a real partial approval auto-fulfills immediately, it does not rest here.)',
    CURRENT_DATE + 5, cesarh, rucha, now());

END;
$seed$;

COMMIT;

-- ============================================================
-- After this commits, see README.md in this folder for the one manual
-- step left: marking shipping ticket t2 (2403, "(DEMO) Job Site A", the
-- Cat6A line) as Delivered in the running app using the placeholder proof
-- image, to get one real 'delivered' example with an actual uploaded file.
-- ============================================================
