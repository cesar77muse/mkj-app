-- ============================================================
-- MKJ OPS APP — POST-MVP RESET TO CLEAN SLATE
-- ============================================================
-- Run once, after the MVP walkthrough, before real data goes in.
--
-- This goes further than the old supabase/demo-data/ teardown did (that
-- one only removed '(DEMO) ' / 'DEMO-' marked rows and left the real
-- projects and catalog alone; the whole folder was deleted along with the
-- MVP data). This wipes ALL operational data — demo and real alike —
-- every project, and every user account except the admin.
--
-- KEPT, deliberately:
--   * auth user cesarhmcod@gmail.com (Cesar Admin) + its profile/admin role
--   * storage object app-assets/logo/mkj-logo.jpg — the letterhead the
--     po-pdf / shipping-ticket-pdf edge functions and the web build read
--   * all schema: tables, RPCs, triggers, RLS policies, buckets
--
-- Document numbering (po_sequence / ps_sequence / ticket_sequence) is
-- computed per project as MAX+1, so it restarts on its own once the rows
-- are gone. The legacy global sequences are reset at the bottom anyway.
--
-- Deletion order follows the FK graph: RESTRICT parents (products,
-- projects, purchase_orders) come after everything pointing at them, and
-- auth.users comes last because purchase_orders.created_by,
-- packing_slips.received_by, inventory_adjustments.created_by et al. are
-- NO ACTION and would block the delete.
-- ============================================================

BEGIN;

-- ---- 1. Inventory ledger (RESTRICT -> products) --------------------
DELETE FROM public.inventory_adjustments;

-- ---- 2. Notifications ---------------------------------------------
DELETE FROM public.notifications;

-- ---- 3. Borrow requests (RESTRICT -> products, projects) ----------
--        borrow_request_serials cascades.
DELETE FROM public.borrow_requests;

-- ---- 4. Packing slips (RESTRICT -> purchase_orders, projects) -----
--        packing_slip_items -> packing_slip_item_serials cascade.
DELETE FROM public.packing_slips;

-- ---- 5. Shipping tickets (RESTRICT -> projects) -------------------
--        shipping_ticket_items -> _serials, and _pdfs, cascade.
DELETE FROM public.shipping_tickets;

-- ---- 6. Purchase orders (RESTRICT -> projects) --------------------
--        purchase_order_items and purchase_order_pdfs cascade.
DELETE FROM public.purchase_orders;

-- ---- 7. Catalog ---------------------------------------------------
DELETE FROM public.products;
DELETE FROM public.suppliers;

-- ---- 8. Project assignments, then projects ------------------------
--        Both assignment tables cascade from projects; explicit for clarity.
DELETE FROM public.project_engineers;
DELETE FROM public.project_managers;
DELETE FROM public.projects;

-- ---- 9. Storage is NOT handled here -------------------------------
--        storage.protect_delete() rejects any direct DELETE on
--        storage.objects ("Use the Storage API instead") to avoid
--        orphaning the underlying S3 blobs, so the files must be
--        removed through the API — see reset_storage.sh next to this
--        file. Nothing is left reachable from the app either way: the
--        purchase_order_pdfs / shipping_ticket_pdfs cache rows went
--        with their parents in steps 5-6, and the storage RLS policies
--        grant reads only when a matching cache row exists.

-- ---- 10. Users, except the admin ----------------------------------
--         Cascades profiles, user_roles, user_directory, and any
--         remaining project_managers/project_engineers/notifications
--         rows, plus auth.identities / sessions / one_time_tokens.
DELETE FROM auth.users
WHERE email IS DISTINCT FROM 'cesarhmcod@gmail.com';

-- ---- 11. Reset the legacy global sequences ------------------------
--         Unused by the current per-project RPCs; reset so a fallback
--         path can't emit numbers that look like MVP leftovers.
ALTER SEQUENCE public.po_seq RESTART WITH 1;
ALTER SEQUENCE public.ps_seq RESTART WITH 1;
ALTER SEQUENCE public.ticket_seq RESTART WITH 4975;

COMMIT;

-- ============================================================
-- Verification — every count must be 0 except: auth.users = 1,
-- profiles = 1, user_roles = 1 (the admin), and storage.objects = 1
-- (app-assets/logo/mkj-logo.jpg).
-- ============================================================
