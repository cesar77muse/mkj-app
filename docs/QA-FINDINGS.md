# MKJ Ops — Defect register (pre-production review)

Severity: **S1** ships-blocking (data corruption / security), **S2** major
(workflow broken or missing), **S3** moderate, **S4** minor/polish.

Nothing here has been fixed. Each item names the exact file and line to change.

---

## S1 — Blocking

### F-01 Editing a packing slip double-counts inventory
`src/lib/receiving.ts:52-56`

`syncSlipInventory()` starts by deleting the slip's existing
`inventory_adjustments` rows, then re-inserts them. But
`inventory_adjustments` grants only `SELECT, INSERT` to `authenticated`
(migration `20260721233933:322`) and has **no DELETE policy**. The delete
therefore never removes anything — and its `error` is never checked, so it fails
silently. The subsequent insert succeeds.

Result: every save of the packing-slip edit dialog adds the received quantities
to on-hand **again**. Save three times and the ledger claims 3× the stock.

Reproduce: receive 10 of a part → on-hand 10 → open the slip, change nothing,
Save → on-hand 20.

### F-02 Borrow approval by a project manager half-commits
`src/routes/_authenticated/borrow-requests.tsx:184-197`

`decide()` updates `borrow_requests` first, then inserts two ledger rows — one
for the **source** project and one for the **target**. The `inv_insert` policy
requires `can_write_project` for each row's own `project_id`. A source-project
manager who does not also manage the target project fails the second row, so the
whole insert is rejected *after* the status update has already committed.

Result: the request shows `approved`, both sides get "approved" notifications,
and **no stock moves**. There is no transaction and no rollback.

Only admins and warehouse managers can complete a borrow today.

### F-03 "Mark shipped" is not idempotent
`src/routes/_authenticated/shipping-tickets.$id.tsx:35-53`

A plain insert of negative adjustments with no guard beyond the button's
visibility. A double-click, a retry after a slow network, or two users on the
same ticket deducts the quantity twice. The database already has an idempotent
equivalent — `ship_shipping_ticket_inventory()` — used by the edit dialog but
not by this button.

### F-04 Deleting a PO strands inventory and surfaces a raw DB error
`src/components/po-delete-button.tsx:36-39`

Deletes `purchase_order_items` then `purchase_orders` directly. Two problems:

1. `packing_slips.po_id` is `ON DELETE RESTRICT`, so any PO that has ever been
   received fails with a raw Postgres FK message shown in a toast.
2. When it does succeed, the packing-slip-derived `inventory_adjustments` rows
   survive with a dangling `source_id` — stock stays on the books for a PO that
   no longer exists.

Contrast `delete_shipping_ticket()`, which reverses inventory and re-checks the
role server-side. POs have no equivalent RPC.

### F-05 PO edit/delete rules are cosmetic
`src/components/po-edit-dialog.tsx:20`, `src/components/po-delete-button.tsx:15`

`canEditPO` / `canDeletePO` only decide whether to render a button. RLS
`po_write` is `FOR ALL USING (can_write_project(...))`, so **any project manager
can update or delete any PO on their project via the API**, including one in
`received` state. Same pattern for `packing-slip-edit-dialog.tsx:40`.

### F-06 Project and inventory visibility is wide open
migration `20260730231509`

```sql
CREATE POLICY inv_select   ON inventory_adjustments FOR SELECT USING (true);
CREATE POLICY projects_select ON projects           FOR SELECT USING (true);
```

Both replaced `can_see_project(...)`. Any authenticated account — including a
brand-new self-signup with **no role at all** — can list every project and every
inventory movement in the company. The Users page still tells admins that
"Admins & Warehouse Managers see every project."

Combined with open sign-up (`auth.tsx:101-119`, no domain restriction, no
invite), anyone who reaches the URL can read the whole project and stock ledger.

### F-07 Removing a project manager does not revoke their access
migration `20260730230303` (`sync_project_manager_assignment`)

Changing `projects.project_manager_id` inserts the new manager into
`project_managers` but never deletes the old one. `can_write_project` reads
`project_managers`, so a replaced manager keeps full write access to the
project's POs, slips and tickets indefinitely. There is no UI to clear the row
either (`pm_write` is admin-only and the Users page only exposes checkboxes for
users whose role is currently `manager`).

---

## S2 — Major

### F-08 Damaged and rejected goods still increase stock
`src/lib/receiving.ts:58-68`

`condition` is captured per line (`ok` / `damaged` / `rejected`) and stored, but
`syncSlipInventory` filters only on `qty_received > 0`. Rejected material is
added to on-hand exactly like good material.

### F-09 Shipped → Ready leaves inventory deducted
`src/components/shipping-ticket-edit-dialog.tsx:99-108`

The dialog reverses inventory when the status becomes `draft` and reconciles it
when it becomes `shipped`/`delivered`. Selecting **`ready`** on an already-shipped
ticket does neither: the ticket reads as not-yet-shipped while the stock stays
deducted.

### F-10 No stock check anywhere on the outbound path
`shipping-tickets.new.tsx:150-159`, `shipping-tickets.$id.tsx:35`

The new-ticket screen shows "short N" in red but never blocks; `Mark shipped`
never re-checks. On-hand goes negative with no warning and no approval step.
(The borrow flow *does* check — `borrow-requests.tsx:179-183` — so the behaviour
is inconsistent across the app.)

### F-11 `refreshPoStatus` can promote a draft PO to executed
`src/lib/receiving.ts:105-108`

When the last receipt is zeroed out, the fallback is
`po.pre_receipt_status ?? "executed"`. `pre_receipt_status` is null for any PO
whose first receipt predates the column, so a PO that was `draft` or `approved`
silently becomes `executed`.

### F-12 Borrow returns are unimplemented
`borrow_status.returned`, `ledger_source.borrow_return_out/in`

The enum values exist, the notification trigger has no branch for them, and no
screen offers a return. Borrowed stock permanently changes project ownership in
the ledger; the lending project has no way to get it back except a manual
counter-borrow.

### F-13 Proof of delivery is never captured
`shipping_tickets.received_by / delivered_by / signature_url / pass_number`

All four columns are unused by the entire application. The PDF prints blank
signature lines (`shipping-ticket-pdf/render.ts:40`) to be filled in by hand,
and `Mark delivered` (`shipping-tickets.$id.tsx:62-71`) writes only
`received_date`. There is no signature capture, no upload, and no record of who
received the goods — for a workflow whose entire purpose is replacing paper
delivery tickets.

### F-14 Freight and terms & conditions cannot be entered
`purchase_orders.additional_freight`, `terms_conditions`

Both are rendered on the PO PDF (`po-pdf/render.ts:139-147`) and
`additional_freight` is included in the detail-page total
(`purchase-orders.$id.tsx:69`), but neither the new-PO screen nor the edit
dialog exposes a field. Freight always prints `$0.00`.

Related: the totals on the new-PO and edit screens omit `additional_freight`
entirely, so a PO with freight shows a different total in the editor than on the
detail page and PDF.

### F-15 PO PDFs show blank Created-by and Assignee for most users
`supabase/functions/po-pdf/index.ts:264`

The function reads names from `profiles` through the **caller's** client.
Migration `20260801131217` narrowed `profiles` SELECT to "self or admin", so for
any non-admin the lookup returns nothing and both fields print empty. The
purpose-built `user_directory` table (readable by all authenticated users) is
what should be queried.

### F-16 No packing-slip delete, and no safe correction path
A slip recorded against the wrong PO or project cannot be removed by anyone.
The only correction route is the edit dialog, which corrupts inventory (F-01).

### F-17 PO status transitions are unguarded
`purchase-orders.$id.tsx:82-87`

A free `<Select>` allows any status to any status. Moving a `received` PO back to
`draft` leaves every packing slip and every inventory adjustment in place, and
the next slip save will recompute it back to `received` — but nothing warns the
user or reverses anything in between.

### F-18 Admin can lock everyone out of user management
`src/routes/_authenticated/users.tsx:78-90`

`setRoleMut` deletes **all** of a user's roles then inserts one. An admin can
apply this to their own account and demote themselves; if they are the only
admin, `/users` becomes permanently unreachable (`user_roles` writes are
admin-only, and the "first user becomes admin" trigger only fires when the table
is completely empty). There is no last-admin guard and no confirmation.

Secondary: the delete-then-insert is not atomic — a failure between the two
statements leaves the user with no role at all.

---

## S3 — Moderate

### F-19 Notification realtime subscription is dead
`src/components/app-shell.tsx:105`

```ts
filter: `user_id=eq.${userId}`
```
The column is `recipient_user_id`. The subscription matches nothing, so the
"live" badge only ever updates on the 30-second poll.

### F-20 Packing-slip numbering can collide under concurrency
`packing-slips.new.tsx:141-157`

`gen_ps_number()` is called, then the row is inserted in a separate round trip,
against a **global** `ps_seq` (POs and tickets were both migrated to atomic
per-project RPCs; slips were not). Two simultaneous receipts can race, and the
number is minted even if the insert then fails — burning sequence values.

### F-21 Product lookup interpolates user text into a PostgREST filter
`src/lib/receiving.ts:21`

```ts
.or(`part_number.ilike.${key},description.ilike.${key}`)
```
`key` is a free-typed PO line description. A comma, parenthesis, or dot changes
the parsed filter — producing wrong matches or a 400. It also creates catalog
products keyed on whole sentences when a PO line was typed free-hand, polluting
`products` with junk part numbers.

The edit dialog calls the same helper **without** `partNumber`
(`packing-slip-edit-dialog.tsx:66-69`), so create and edit can resolve the same
line to different products.

### F-22 Over-receipt is silently allowed
`packing-slips.new.tsx:290-313` shows an "over" hint but nothing prevents
receiving more than was ordered, and the PO still lands on `received`.

### F-23 Slip lines snapshot `qty_ordered` and never re-sync
If a PO line's quantity is edited after a partial receipt, the slip keeps the old
`qty_ordered`, so `slipStatusFor()` and the displayed backorder are both wrong.

### F-24 Detail pages show "Loading…" forever when a record is missing
`packing-slips.$id.tsx:27`, `shipping-tickets.$id.tsx:80`

`if (!slip.data) return <p>Loading…</p>` conflates *pending* with *not found /
no access*. A bad ID or an RLS-filtered row hangs on a loading message.
`projects.$mkj.tsx:37` throws `notFound()` from inside a query function, which
surfaces as an error boundary rather than the 404 component.

### F-25 Two sources of truth for project manager
`projects.project_manager_id` vs the `project_managers` table (see also F-07).
The Projects list and detail read the column; every permission check reads the
table. They can disagree.

### F-26 Orphan supplier rows from "Other…"
`purchase-orders.new.tsx:50-56` inserts the new supplier before calling
`create_purchase_order`. If PO creation then fails (validation, RLS, network),
the supplier remains, and retrying creates a duplicate.

### F-27 Approved-quantity is never bounded by the request
`borrow-requests.tsx:338-343` lets an approver enter more than `qty_requested`
(only on-hand is checked), and the row is then written as `approved` rather than
`partially_approved`.

### F-28 Multiple roles are silently dropped
`users.tsx:133` reads `rs[0]`. The schema permits several roles per user; if one
is ever created outside this screen, the UI shows and enforces only the first.

### F-29 Timezone handling is UTC, the business is America/New_York
- `dashboard.tsx:45` — the 7-day packing-slip window is sliced from a UTC ISO
  string.
- `packing-slips.new.tsx:46` and `shipping-tickets.new.tsx:46` default the date
  to `new Date().toISOString().slice(0,10)` — after 20:00 ET this defaults to
  **tomorrow**.
- `shipping-tickets.$id.tsx:64` stamps `received_date` the same way.

The PDF functions correctly use `America/New_York`, so printed and stored dates
can disagree by a day.

---

## S4 — Minor

- **F-30** No pagination anywhere: PO/slip/ticket lists cap at 200,
  notifications at 100, borrow history at 50 — silently truncated with no
  indication.
- **F-31** `inventory.tsx:44` selects the entire `inventory_adjustments` table
  (no limit) purely to compute a per-project "last updated" timestamp.
- **F-32** `purchase-orders.index.tsx:33-49` puts a 200-element `poIds` array in
  the query key, so the receipts query re-runs whenever list order shifts.
- **F-33** `notif_insert_self` lets any user insert arbitrary notifications for
  themselves — harmless today, but it means notification content is not
  trustworthy as an audit trail.
- **F-34** Products have no edit or delete; a typo in a part number is permanent
  and `part_number` is `UNIQUE`.
- **F-35** Projects have no delete in the UI (admin-only in RLS) and no archive
  action; `on_hold`/`closed` projects still appear in packing-slip pickers
  (`packing-slips.new.tsx:54` does not filter on status, unlike PO and ticket
  creation).
- **F-36** `EXECUTED_STATUSES` in `po-pdf/index.ts:33` still lists `closed`,
  removed from the enum in migration `20260801203231`.
- **F-37** Signed PDF URLs live 120 s; a user who leaves the tab open and reloads
  gets an opaque storage error rather than a re-signed URL.
- **F-38** `coming-soon.tsx` is unreferenced dead code.
- **F-39** No user invitation flow — every user must self-register, then wait for
  an admin to notice them on `/users` (which has a manual "Refresh" button).
- **F-40** `packing_slips.attachment_url` is unused: no way to attach the scanned
  vendor slip, in a workflow explicitly meant to replace paper.
