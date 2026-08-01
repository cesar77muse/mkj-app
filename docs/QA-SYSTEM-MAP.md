# MKJ Ops — System Map (pre-production QA baseline)

Derived by reading the full source tree and all 23 migrations as of `4ed4326`.
Nothing in this document has been changed in the app — it is a description of
what exists today, including the parts that are wrong.

---

## 1. Modules / pages

All application pages sit under the `_authenticated` layout route
(`src/routes/_authenticated/route.tsx`), which calls `supabase.auth.getUser()`
in `beforeLoad` and redirects to `/auth` when there is no user.

| Route | File | Purpose | Nav visibility |
|---|---|---|---|
| `/` | `routes/index.tsx` | Redirect only → `/dashboard` or `/auth` | — |
| `/auth` | `routes/auth.tsx` | Sign in + **open self-service sign-up** | — |
| `/dashboard` | `_authenticated/dashboard.tsx` | 5 stat cards + recent projects | all |
| `/projects` | `projects.index.tsx` | Project list, create dialog | all (create: warehouse/admin) |
| `/projects/$mkj` | `projects.$mkj.tsx` | Tabs: Overview / Inventory / POs / Tickets | all |
| `/purchase-orders` | `purchase-orders.index.tsx` | PO list, PDF, edit, delete | all |
| `/purchase-orders/new` | `purchase-orders.new.tsx` | PO creation + draft PDF preview | all (RLS-gated) |
| `/purchase-orders/$id` | `purchase-orders.$id.tsx` | PO detail, status select, receive | all |
| `/packing-slips` | `packing-slips.index.tsx` | Slip list | all (add: can_write) |
| `/packing-slips/new` | `packing-slips.new.tsx` | Goods receipt against a PO | all |
| `/packing-slips/$id` | `packing-slips.$id.tsx` | Slip detail + edit dialog | all |
| `/shipping-tickets` | `shipping-tickets.index.tsx` | Ticket list, PDF, edit, delete | all |
| `/shipping-tickets/new` | `shipping-tickets.new.tsx` | Ticket creation + draft PDF preview | all |
| `/shipping-tickets/$id` | `shipping-tickets.$id.tsx` | Ticket detail, Mark shipped / delivered | all |
| `/inventory` | `inventory.tsx` | Cross-project on-hand + borrow history | all |
| `/borrow-requests` | `borrow-requests.tsx` | Inter-project stock borrowing | all |
| `/products` | `products.tsx` | Part catalog | warehouse/admin only (nav) |
| `/suppliers` | `suppliers.tsx` | Vendor catalog | warehouse/admin only (nav) |
| `/users` | `users.tsx` | Roles + project assignments | admin only (nav + `beforeLoad`) |
| `/notifications` | `notifications.tsx` | Notification inbox | bell icon |

Edge functions: `po-pdf`, `shipping-ticket-pdf` (both `verify_jwt = true`).

---

## 2. Roles

`public.app_role` = `admin | warehouse_manager | manager | engineer`.
Roles live in `user_roles` (many-to-many by schema, single-role in practice —
the Users page reads `rs[0]`).

Server-side predicates (all `SECURITY DEFINER`):

| Function | True for |
|---|---|
| `is_admin(u)` | admin |
| `is_warehouse_or_admin(u)` | admin, warehouse_manager |
| `can_write(u)` | admin, warehouse_manager, manager |
| `manages_project(u,p)` | row in `project_managers` |
| `can_see_project(u,p)` | warehouse/admin **or** PM **or** engineer on that project |
| `can_write_project(u,p)` | warehouse/admin **or** PM on that project |

Client mirrors live in `src/lib/roles.ts` (`isAdmin`, `isWarehouseOrAdmin`,
`canWrite`, `highestRole`).

**First-ever signup is auto-promoted to admin** (`handle_new_user()` trigger).
Every later signup gets a profile and **no role**.

---

## 3. Permission matrix (as actually enforced by RLS)

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | self or admin | — | self, or admin | — |
| `user_directory` | **any authenticated** | trigger only | trigger only | — |
| `user_roles` | self or admin | admin | admin | admin |
| `projects` | **`USING (true)` — everyone** ⚠ | warehouse/admin | admin | admin |
| `project_managers` / `project_engineers` | self, admin, or project-visible | admin | admin | admin |
| `suppliers` | can_write, or tied to a visible PO | can_write | can_write | can_write |
| `products` | any authenticated | can_write | can_write | can_write |
| `purchase_orders` | can_see_project | can_write_project | can_write_project | **can_write_project** ⚠ |
| `purchase_order_items` | via parent PO | via parent PO | via parent PO | via parent PO |
| `packing_slips` | can_see_project | can_write_project | can_write_project | can_write_project |
| `packing_slip_items` | via parent slip | via parent slip | via parent slip | via parent slip |
| `shipping_tickets` | can_see_project | can_write_project | can_write_project | can_write_project |
| `shipping_ticket_items` | via parent ticket | via parent ticket | via parent ticket | via parent ticket |
| `inventory_adjustments` | **`USING (true)` — everyone** ⚠ | can_write_project | **no grant** ⚠ | **no grant** ⚠ |
| `borrow_requests` | can_see either project | can_write_project(target) | can_write_project(source), or own row | — |
| `notifications` | own | **own (self-insert allowed)** | own | — |
| `purchase_order_pdfs` / `shipping_ticket_pdfs` | via parent, read-only | service_role | service_role | service_role |
| storage `purchase-order-pdfs` / `shipping-ticket-pdfs` | via cache row + project | service_role | service_role | service_role |
| storage `app-assets` | any authenticated | can_write | can_write | warehouse/admin |

⚠ marks a deviation from the intended design (see the findings register).

### UI-only gates (not enforced server-side)

| Rule | Implemented in | Server enforcement |
|---|---|---|
| Edit PO: admin always; warehouse only while ≠ `received` | `po-edit-dialog.tsx:20` | **none** — RLS allows any project manager |
| Delete PO: same rule | `po-delete-button.tsx:15` | **none** — direct table DELETE |
| Edit packing slip: warehouse/admin | `packing-slip-edit-dialog.tsx:40` | **none** — RLS allows PMs |
| Edit/delete ticket: admin always; warehouse while ≠ `delivered` | `shipping-ticket-*.tsx` | **delete only** (`delete_shipping_ticket()` RPC re-checks) |
| Products/Suppliers pages hidden from managers | `app-shell.tsx:39` | none — `can_write` includes managers |

---

## 4. Entities and relationships

```
auth.users ─1:1─ profiles ─1:1─ user_directory
     │                └─trigger─ sync_user_directory()
     ├─1:N─ user_roles
     ├─N:M─ project_managers ──┐
     └─N:M─ project_engineers ─┤
                               ▼
projects (mkj_number UNIQUE, project_manager_id → profiles)
 ├─1:N─ purchase_orders (po_number UNIQUE, UNIQUE(project_id, po_sequence))
 │        ├─1:N─ purchase_order_items ──┐ (po_item_id)
 │        ├─1:1─ purchase_order_pdfs    │
 │        └─1:N─ packing_slips ◄────────┘  (ON DELETE RESTRICT)
 │                 └─1:N─ packing_slip_items ─→ products
 ├─1:N─ shipping_tickets (UNIQUE(project_id, ticket_sequence))
 │        ├─1:N─ shipping_ticket_items ─→ products
 │        └─1:1─ shipping_ticket_pdfs
 ├─1:N─ inventory_adjustments ─→ products      [append-only ledger]
 │        └─ view v_project_inventory = SUM(delta) GROUP BY project, product
 └─N:N─ borrow_requests (source_project_id ≠ target_project_id, → products)

suppliers ─1:N─ purchase_orders
notifications → auth.users (recipient_user_id)
```

Dual source of truth: a project's manager is stored **both** in
`projects.project_manager_id` **and** in `project_managers`. The
`trg_projects_sync_pm` trigger copies the former into the latter on insert/update
but **never removes** a superseded manager.

---

## 5. CRUD inventory (what the UI actually does)

| Entity | Create | Read | Update | Delete |
|---|---|---|---|---|
| Project | `projects.index` dialog | list + detail | `project-edit-dialog` | **none in UI** (admin-only in RLS) |
| Supplier | dialog | list | dialog | **none** |
| Product | dialog | list | **none** | **none** |
| Purchase order | `create_purchase_order()` RPC + item inserts | list/detail | `po-edit-dialog` (header + lines) | direct table DELETE ×2 |
| PO status | — | — | free-form `<Select>`, any→any | — |
| Packing slip | `gen_ps_number()` RPC then insert | list/detail | `packing-slip-edit-dialog` | **none** |
| Shipping ticket | `create_shipping_ticket()` RPC + item inserts | list/detail | `shipping-ticket-edit-dialog` | `delete_shipping_ticket()` RPC |
| Inventory adjustment | packing slip, ship, borrow | inventory pages | append-only | attempted by `syncSlipInventory` (**fails**) |
| Borrow request | dialog | list + detail dialog | approve / deny / cancel | **none** |
| User role | — (self-signup) | Users page | delete-all + insert-one | — |
| Project assignment | Users page checkboxes | Users page | — | Users page checkboxes |
| Notification | DB triggers | inbox | mark read | **none** |

---

## 6. Calculations

| # | Calculation | Where | Formula |
|---|---|---|---|
| C1 | PO line amount | new/edit/detail/PDF | `qty × unit_cost` |
| C2 | PO grand total (screen, detail) | `purchase-orders.$id.tsx:69` | `Σ(qty×unit_cost) + additional_freight` |
| C3 | PO grand total (new/edit screen) | `purchase-orders.new.tsx:43`, `po-edit-dialog.tsx:96` | `Σ(qty×unit_cost)` — **freight omitted** |
| C4 | PO grand total (PDF) | `po-pdf/render.ts:139` | `Σ(qty×unit_cost) + additionalFreight` |
| C5 | Remaining to receive | `packing-slips.new.tsx:103` | `max(0, po_qty − Σ prior qty_received)` |
| C6 | Backorder per slip line | `packing-slips.new.tsx:289` | `max(0, qty_ordered − (qty_already + qty_received))` |
| C7 | Slip status | `receiving.ts:76` | any line `qty_received < qty_ordered` → `partially_received` |
| C8 | PO received status | `receiving.ts:87` | no receipts → `pre_receipt_status ?? 'executed'`; any line short → `partially_received`; else `received` |
| C9 | On-hand | `v_project_inventory` | `SUM(delta)` per (project, product) |
| C10 | Low-stock flag | inventory pages | `on_hand ≤ reorder_point` |
| C11 | Ticket stock preview | `shipping-tickets.new.tsx:152` | `on_hand − qty_shipped` (display only, never blocks) |
| C12 | Ship deduction (button) | `shipping-tickets.$id.tsx:39` | insert `−qty_shipped` per line, **not idempotent** |
| C13 | Ship deduction (edit dialog) | `ship_shipping_ticket_inventory()` | reconcile ledger to `−Σ qty_shipped`, idempotent |
| C14 | Ship reversal | `reverse_shipping_ticket_inventory()` | insert `−SUM(delta)` per product, idempotent |
| C15 | Borrow transfer | `borrow-requests.tsx:190` | `−q` on source, `+q` on target |
| C16 | Dashboard 7-day window | `dashboard.tsx:45` | `now − 7×864e5`, **UTC-sliced** |

---

## 7. Document generation flows

Both PDF functions share `_shared/pdf/` primitives and follow the same shape.

**Saved document** (`{po_id}` / `{ticket_id}`):
1. Caller-scoped client reads the row → RLS decides access (404 on deny).
2. `computeContentHash(hashableFields(...))` (SHA-256 of a JSON projection).
3. Compare with `purchase_order_pdfs` / `shipping_ticket_pdfs` cache row.
4. On miss: render → `service_role` upload to the private bucket (`{id}.pdf`,
   upsert) → upsert cache row.
5. Return a **120-second signed URL**; client opens a pre-opened blank tab.

**Draft preview** (`{draft}`): renders from the posted payload, persists nothing,
returns `application/pdf` bytes; client converts to an object URL (revoked after
60 s).

Content differences worth knowing:
- PO PDF: logo, bill-to/ship-to, supplier block, created-by and assignee names,
  line table, `Additional Freight` + `Grand Total`, terms & conditions,
  2-group signature block, "executed" treatment for
  `executed|partially_received|received|closed`.
- Shipping ticket PDF: logo, deliver-to block, job/contract numbers, line table
  with shipped/backordered, and a **blank fill-in proof-of-delivery block** —
  nothing signed is ever read back into the database.
- Logo is loaded from the private `app-assets` bucket at `logo/mkj-logo.jpg`;
  if missing, `loadLogoBytes` silently returns `null` and the PDF renders
  without branding.

---

## 8. Statuses and workflow transitions

### Purchase order — `po_status`
`draft → approved → executed → partially_received → received`
(`closed` was dropped in migration `20260801203231`; `pre_receipt_status`
snapshots the pre-receipt value.)

- Manual: a free `<Select>` on the detail page permits **every** transition,
  including `received → draft`, with no side effects and no guard.
- Automatic: `refreshPoStatus()` after any packing-slip write.

### Packing slip — text column, CHECK (`received`, `partially_received`)
Set from quantities on create; freely overridable in the edit dialog.

### Shipping ticket — `ticket_status`
`draft → ready → shipped → delivered`

- `create_shipping_ticket()` always inserts `ready` — `draft` is only reachable
  by editing backwards.
- `Mark shipped` (draft/ready only) → inserts negative adjustments, sets `shipped`.
- `Mark delivered` (shipped only) → sets `delivered` + `received_date` (today).
- Edit dialog can set **any** of the four values; `draft` reverses inventory,
  `shipped`/`delivered` reconcile it, `ready` does **neither**.

### Borrow request — `borrow_status`
`pending → approved | partially_approved | denied | cancelled`, then
`→ fulfilled`; `returned` exists in the enum but **no return flow is implemented**.

In practice `approved`/`partially_approved` is written and then immediately
overwritten with `fulfilled` in the same mutation, so the intermediate state is
never durably visible.

### Project — `project_status`
`active | on_hold | closed`. No transition rules; closed/on-hold projects are
still selectable in some pickers and excluded in others (PO/ticket creation
filter on `active`, packing slips do not).
