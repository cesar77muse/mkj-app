
## MVP Goal

Responsive web app (desktop + mobile) to replace the manual handling of **Purchase Orders**, **Packing Slips**, **Inventory**, and **Shipping Tickets** — organized **by project** (MKJ job number, e.g. `MKJ2403`) — with inter-project **inventory borrowing** and in-app **notifications**. Target: demoable MVP for the owner and managers.

## Projects Are the Backbone

Every operational document and inventory record is scoped to a **Project** (MKJ job).

- Project fields: MKJ number (e.g. `MKJ2403`), name/description, contract number, status (Active / On Hold / Closed), **project manager** (user), created date.
- All lists (POs, packing slips, tickets, inventory) filter by project via a top-level project picker.
- URLs are project-scoped: `/projects/:mkj/pos`, `/projects/:mkj/packing-slips`, `/projects/:mkj/inventory`, `/projects/:mkj/shipping-tickets`.
- A global "All Projects" view is available to Admin / Warehouse Manager only.

## Users & Roles

Roles live in a `user_roles` table + `has_role()` security-definer function.

| Role | POs / Packing Slips / Tickets | Inventory | Borrow requests | Users & Roles |
|---|---|---|---|---|
| **Admin** | Full | Full | Full | Full |
| **Warehouse Manager** | Full on all projects | Full on all projects | Approve/deny for any project | Denied |
| **Manager** | Full on projects they manage | Full on projects they manage | Request from other projects; approve requests targeting their projects | Denied |
| **Engineer** | **View only** | **View only** | Denied (view own project's requests only) | Denied |

Engineer is strictly read-only — no create/edit/receive/ship/adjust actions anywhere. UI hides write controls; server RLS enforces it.

Auth: email + password (Lovable Cloud). Admin-only screen to invite users, assign role, and (for Managers/Engineers) assign the projects they belong to.

## Core Modules

### 1. Projects
List / create / edit projects, assign manager, close/reopen. Every other module is entered through a project.

### 2. Products (catalog, global)
Part number (SKU), description, unit, reorder point. Shared across projects; on-hand quantities are tracked **per project** (not globally), which is what makes borrowing meaningful.

### 3. Inventory (per project)
- On-hand qty per (project, product) computed from an inventory ledger.
- Ledger entries reference the source document: packing slip in, shipping ticket out, manual adjustment, or **borrow transfer** between projects.
- Low-stock flag when qty ≤ reorder point.
- Manual adjustments allowed for Admin / Warehouse Manager / project's Manager (reason required).

### 4. Suppliers
Company, address, phone, contact, email (from PO "Contract Company" block).

### 5. Purchase Orders (per project)
Modeled after the Scan Source PO sample.
- **Header**: PO # (`MKJ2403EX-###`), project, date created, bill-to, ship-to, vendor, created by, assignee, status (Draft → Approved → Executed → Partially Received → Received → Closed), payment terms, ship via, delivery date, description, attachments, terms & conditions.
- **Line items**: #, budget code, description, qty, units, unit cost, amount. Grand total + additional freight.
- Actions: Save Draft · Approve · Executed · Print/PDF · Receive (opens packing slip).

### 6. Packing Slips (goods receipt, per project via parent PO)
Created against a PO when a shipment arrives.
- **Header**: slip # (auto), linked PO, vendor, received date, received by, carrier, vendor's slip # (free text), notes, attachment (scan).
- **Line items** (pre-filled from PO): part #, description, qty ordered, qty already received, **qty received now**, **qty backordered (auto)**, condition (OK / Damaged / Rejected).
- On save: increments project inventory per line and advances the PO status (Partially Received / Received). PO detail shows all slips + per-line receipt history and outstanding backorder qty.

### 7. Shipping Tickets (per project)
Modeled after the S04974 ship ticket sample.
- **Header**: ticket # (auto, `S#####`), date, deliver-to (address + on-site contact + phone), MKJ job number (= project), ship by (e.g. "Van"), contract #, project, purchase order # reference, status (Draft → Ready → Shipped → Delivered).
- **Line items**: part #, description, **shipped qty**, **backordered qty**.
- **Delivery block**: delivered by, received by (print name + signature on mobile), pass #, date. Printable view matching the paper form.
- On "Shipped": decrements project inventory; backorder qty recorded per line.

### 8. Inventory Borrowing (inter-project)
When Project A is short on a part and Project B has it on hand.

- **Request** (Manager of A or Warehouse Manager): pick source project, target project, product, qty, reason, needed-by date. Live on-hand qty of the source project is shown to prevent impossible requests.
- **Approval**: goes to the **source project's Manager** (and Warehouse Manager + Admin). They can **Approve**, **Deny**, or **Approve partial** (with a counter-qty and note).
- **Fulfillment**: on approval, an inventory ledger transfer is recorded — decrement source project, increment target project — linked to the borrow request. History visible on both projects.
- Statuses: Pending → Approved / Partially Approved / Denied → Fulfilled → (optional) Returned.
- Optional "return" flow: target project can log a return transfer back to source.
- Engineers see borrow activity for their project read-only; cannot request/approve.

### 9. Notifications (in-app)
A notifications table + bell icon in the header with unread badge and a `/notifications` page. Events that generate notifications:
- Borrow request received (→ source project Manager, Warehouse Manager, Admin)
- Borrow request approved / partially approved / denied (→ requester)
- Borrow transfer fulfilled (→ both project Managers)
- PO approved / marked executed (→ project Manager + assignee)
- Packing slip received with backorders (→ project Manager)
- Shipping ticket marked Shipped / Delivered (→ project Manager)
- Low-stock threshold crossed on a project (→ project Manager)

Each notification: type, title, body, link to the source record, read/unread, created_at, recipient_user_id. Generated by Postgres triggers on the underlying tables so notifications are consistent regardless of which UI path caused the change. (Email delivery is out of scope for MVP; in-app only.)

### 10. CSV/Excel Import
Admin / Warehouse Manager screens for:
- Products (part #, description, unit, reorder point)
- Suppliers
- Projects
- Starting inventory per project (project, part #, qty)

Client-side parse (SheetJS), preview + Zod validation, per-row error report, then bulk insert.

## Navigation

Responsive shell:
- **Top bar**: project switcher, notifications bell, user menu.
- **Sidebar** (within a project): Dashboard · Inventory · Purchase Orders · Packing Slips · Shipping Tickets · Borrow Requests.
- **Global sidebar** (Admin / Warehouse Manager): Projects · Products · Suppliers · Import · Users · All Notifications.

**Project Dashboard**: open POs, POs with outstanding backorders, packing slips this week, tickets ready to ship, low-stock items, pending borrow requests (incoming + outgoing), recent activity.

## Technical Details

- **Stack**: TanStack Start + Lovable Cloud (Supabase); `createServerFn` + `requireSupabaseAuth`; TanStack Query for reads.
- **Schema** (public tables, each with GRANTs + RLS):
  - `profiles`, `app_role` enum (`admin`, `warehouse_manager`, `manager`, `engineer`), `user_roles`, `has_role()`
  - `projects` (mkj_number unique), `project_managers` (project_id, user_id), `project_engineers` (project_id, user_id) for scoping visibility
  - `suppliers`, `products`
  - `purchase_orders`, `purchase_order_items` (both carry `project_id`)
  - `packing_slips`, `packing_slip_items`
  - `shipping_tickets`, `shipping_ticket_items`
  - `inventory_adjustments` (ledger; project_id, product_id, delta, source_type, source_id, reason, created_by)
  - `borrow_requests` (source_project_id, target_project_id, product_id, qty_requested, qty_approved, status, requested_by, decided_by, note, needed_by)
  - `notifications` (recipient_user_id, type, title, body, link, read_at)
- **RLS policy shape**:
  - Read: authenticated users can read documents & inventory for projects they can see (Admin / Warehouse Manager: all; Manager: projects they manage; Engineer: projects they're assigned to).
  - Write: Admin / Warehouse Manager anywhere; Manager only on projects they manage; Engineer no write policies at all.
  - `user_roles` writes: admin-only.
  - `borrow_requests`: insert by Manager (target-project side) + Warehouse Manager + Admin; update (approve/deny) restricted to source project's Manager + Warehouse Manager + Admin.
- **Views**:
  - `v_project_inventory` — on-hand per (project, product) from the ledger.
  - `v_po_backorders` — per PO line ordered vs. received.
- **Numbering**: Postgres sequences per document type, prefixed with the project's MKJ number where applicable.
- **Notifications**: `AFTER INSERT/UPDATE` triggers on POs, packing slips, shipping tickets, borrow requests, and ledger low-stock crossings insert rows into `notifications`.
- **Printable views**: `/pos/:id/print`, `/packing-slips/:id/print`, `/shipping-tickets/:id/print`.
- **Design**: shadcn/ui + Tailwind semantic tokens, clean business-app aesthetic.

## Out of Scope for MVP

Multi-warehouse locations within a project, barcode scanning, RMAs, cost/profit reporting, email/push notification delivery, vendor portals, QuickBooks / ShipStation integrations. Flagged as phase-2.

## Build Order

1. Lovable Cloud + auth; roles, `has_role()`, RLS scaffolding.
2. Projects + project-manager + project-engineer assignments; project switcher.
3. Products + Suppliers + CSV import.
4. Per-project inventory ledger + adjustments UI.
5. Purchase Orders (Draft → Executed) with print view.
6. Packing Slips (receive against PO, backorder tracking, inventory-in).
7. Shipping Tickets (create → shipped, inventory-out) with print view.
8. Inventory Borrowing (request → approve → transfer) between projects.
9. Notifications table + triggers + bell/inbox UI.
10. Project dashboard + polish.
