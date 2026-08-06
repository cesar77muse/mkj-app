# MKJ Ops — Live application test report

**Environment:** https://mkjapp.lovable.app (live Lovable deployment)
**Database:** Supabase project `beoggpwowmwzqmtuidvl`
**Reference:** `QA-TEST-PLAN.md` rev 2, `QA-FINDINGS.md`

| Round | Date | Account | Role |
|---|---|---|---|
| 1 | 2026-08-05 | `jbaidoo@mkjcomm.com` (Joseph Baidoo) | Engineer |
| 2 | 2026-08-05 | `jschneider@mkjcomm.com` (Justin Schneider) | Warehouse Manager |
| 3 | 2026-08-05 | `cesarhmcod@gmail.com` (Cesar Admin) | Admin |
| 4 | 2026-08-05 | `rghalsasi@mkjcomm.com` (Rucha Ghalsasi) | Manager — PM of 2403 only |

Findings are numbered **L-nn** to keep them distinct from the static register's F-nn.

---

## 1. Headline

**The business logic is in good shape.** Round 2 exercised the highest-risk cases in
the entire plan — packing-slip re-save, ship idempotency, negative-stock blocking,
delete cascades, and the PO status guard — and **every one passed**, most with
better error messages than the plan required. Notably **PS-05**, the single most
important test (the F-01 inventory double-count), passed three consecutive times
with the ledger holding at exactly one row.

**The problem is deployment, not code.** Four fixes that are complete and correct in
the repository have never reached the live environment: two migrations were skipped
mid-sequence, one edge function is running an older build, and one storage bucket
was never created. Earlier QA rounds verified the repository, so none of this was
visible.

Round 3 (Admin) confirmed the last-admin guard and the F-07 revocation trigger,
completed the outstanding F-07 stale-access audit, and proved L-04 conclusively. It
also surfaced L-10: extra project-manager assignments can no longer be removed from
the UI at all.

Round 4 (Manager) exercised the strictest permission fixture — a PM who manages one
project, cannot write the other, and is not warehouse. **All probes behaved
correctly.** It refined L-04 into something more precise, surfaced a hardening note
(L-11) about RLS-blocked writes returning success, and — with a fixture seeded by the
owner — closed **BR-02**, the F-02 half-commit case and the last S1-adjacent test
without live coverage.

**Every S1 finding from the original register is now verified fixed in production.**

**The permission model is the strongest part of this application.** Across four roles
and roughly 45 authorisation probes, every single one behaved exactly as designed —
no privilege escalation, no cross-project leakage, no UI-only gate the database failed
to back up.

| Severity | Count | IDs |
|---|---|---|
| **P1 — deployment drift** | 4 | L-01, L-02, L-03, L-08 |
| **P2 — functional defect** | 2 | L-04, L-10 |
| **P3 — permission / UX** | 3 | L-05, L-06, L-09 |
| Informational | 2 | L-07, L-11 |
| **Passed** | **77 checks** | §5 |

---

## 1.5 Owner remediation pass — 2026-08-06

Re-verified empirically against the live environment (direct REST/RPC calls with a
real session token — not source review, not the `list` endpoint for buckets, same
methodology this report itself used). Full detail in each item's own section below;
summary:

| ID | Status | Evidence |
|---|---|---|
| **L-01** | ❌ Still open | `GET v_project_last_updated` → `404 PGRST205`, view does not exist live |
| **L-02** | ❌ Still open | Direct `POST /notifications` with `recipient_user_id:<self>` → `201 Created`, forge still succeeds |
| **L-03** | ✅ Fixed, confirmed live | Decoded a real `po-pdf` signed-URL token: `exp - iat = 3600` |
| **L-04** | ✅ Fixed, confirmed live | Fix is `v_user_roles`, a new view mirroring the `v_project_directory`/F-15 pattern. Verified two ways after the owner published: (1) `GET v_user_roles` returns real rows directly against the live DB; (2) the live JS bundle's `assignee-select` and `project-manager-select` chunks were both re-fetched and confirmed to reference `v_user_roles`, replacing the old broken `user_roles` query. (Initial check caught this as "DB fixed, frontend not yet published" — owner published, re-checked, now fully confirmed.) |
| **L-08** | ✅ Fixed, confirmed live | Both buckets exist — proved via upload attempt (`415 invalid_mime_type` on a disallowed file), the same "upload is authoritative, `list` is not" method this report used, not a `404 NoSuchBucket` |
| **L-10** | ✅ Fixed, confirmed live | `project_managers` for 2403 now has exactly one row, matching `project_manager_id` (Rucha). Root cause note: the F-07 trigger only fires on an actual *change* to `project_manager_id` — since it was already correct, it never touched the stale rows; they required a direct one-off `DELETE`, which has been run. |

**Not yet attempted this pass** (still exactly as originally reported, no new code written): L-05, L-06, L-07, L-09, L-11.

**Outstanding actions before a clean re-run:**
1. Run migrations `20260801222200` (L-01) and `20260801222300` (L-02) — still not applied, despite other migrations from the same batch being live. These are the only two items left blocking a fully clean re-run.

---

## 2. P1 — Repository and live environment have diverged

The repo is **not** a reliable description of what is running. Each item below is
fixed in code and absent in production.

### L-01 — `v_project_last_updated` was never created; Inventory "Last updated" is permanently blank
*Migration `20260801222200` (F-31) not applied.*

> **Status (2026-08-06):** ❌ **Still open, re-verified** — `GET v_project_last_updated` still returns `404 PGRST205` live. Migration `20260801222200` needs to be run.

```
GET /rest/v1/v_project_last_updated
→ 404  "Could not find the table 'public.v_project_last_updated' in the schema cache"
```

`inventory.tsx` queries it for the per-project "Last updated" stamp. The query
throws, React Query swallows it, and the card falls back to `—`. Confirmed in the
UI: **both** project cards read `Last updated: —`, permanently, for every user. The
page degrades silently, which is why it went unnoticed.

### L-02 — Any user can still forge notifications addressed to themselves
*Migration `20260801222300` (F-33) not applied.*

> **Status (2026-08-06):** ❌ **Still open, re-verified** — repeated the exact same probe (direct `POST /notifications` with `recipient_user_id:<self>`), got `201 Created` again. Migration `20260801222300` needs to be run. (The probe row was marked read; it can't be deleted without direct DB access — no `DELETE` policy on `notifications`, same limitation noted elsewhere in this report for the `jbaidoo@` test rows.)

```
POST /rest/v1/notifications {recipient_user_id:<self>, type:"qa", title:"probe"}
→ 201 Created
```

`notif_insert_self` is still live. A user can fabricate convincing notifications
("PO approved", "Borrow approved") in their own inbox — exactly the audit-trust
problem F-33 described. Forging one for **another** user is correctly refused (403),
so the blast radius is self-only.

### L-03 — The deployed PDF functions predate the F-37 fix

Live signed URLs carry a **120-second** lifetime, not the 3600 the repo specifies:

```
token claims: iat 1785972171, exp 1785972291  →  120s
```

Leave a PO PDF tab open for two minutes, reload, and it breaks. **Fix:** redeploy
`po-pdf` and `shipping-ticket-pdf`.

> **Status (2026-08-06):** ✅ **Fixed, confirmed live** — generated a real signed URL for an actual PO (`MKJ2403EX001`), decoded its token: `exp - iat = 3600`. Both functions redeployed successfully.

### L-08 — The `packing-slip-attachments` bucket does not exist; F-40 is dead in production

The UI offers "Vendor slip scan (optional)" on the receive form and "Attach vendor
slip scan" on the slip detail page. Every upload will fail:

```
POST /storage/v1/object/packing-slip-attachments/<slip>/attachment.pdf
→ 400 {"statusCode":"404","error":"Bucket not found","code":"NoSuchBucket"}
```

Verified with a control, because Supabase's `list` endpoint is not a valid existence
test — it returns `200 []` for *any* bucket name, including
`definitely-not-a-real-bucket-xyz`. Upload is authoritative:

| Bucket | Upload result | Verdict |
|---|---|---|
| `app-assets` | `415 invalid_mime_type` | exists |
| `purchase-order-pdfs` | — (3 objects in use) | exists |
| `shipping-ticket-pdfs` | — (1 object in use) | exists |
| **`packing-slip-attachments`** | **`404 NoSuchBucket`** | **missing** |

The `attachment_url` column from the same migration (`20260801222400`) *is* present,
so the SQL ran — but its `INSERT INTO storage.buckets` did not take effect. This is
the exact failure mode already documented in migration `20260801211252`, which warns
that bucket inserts from the SQL Editor silently do nothing on this project and must
be created by hand in the Storage tab.

> **Status (2026-08-06):** ✅ **Fixed, confirmed live** — re-ran the same "upload is authoritative" test this finding used. `packing-slip-attachments` and `shipping-ticket-proofs` (the F-13 bucket, same failure mode, not yet live-tested when this report was written) both now return `415 invalid_mime_type` on a disallowed file type — proving both buckets exist with their intended MIME restrictions, not `404 NoSuchBucket`. Created by hand via the Storage tab, matching this section's own documented workaround.

### Scope note — this is not "everything after a cut-off"

`20260801222100` and `20260801222400` **are** live, while `222200` and `222300` are
not. Migrations were skipped *mid-sequence*. **Do not just run the two identified** —
reconcile the whole applied set against the repo.

---

## 3. P2 / P3 — Defects in the running application

### L-04 (P2) — Project Manager and Assignee show "Unassigned" for every non-admin

> **Status (2026-08-06):** ✅ **Fixed, confirmed live (DB + frontend both verified).** Root cause fixed by adding `v_user_roles`, a view mirroring the exact `v_project_directory`/F-15 pattern — it bypasses `user_roles`' self-scoped RLS via Postgres view-owner semantics, gated by `has_any_role` so it stays restricted to real app users. Verified two ways: (1) `GET v_user_roles` returns real rows directly against the live DB; (2) the published JS bundle's `assignee-select` and `project-manager-select` chunks were both fetched fresh from the live site and confirmed to reference `v_user_roles`, not the old `user_roles` query. Could not test end-to-end as a non-admin (no second account available), but both halves of the fix are independently confirmed live and the mechanism is the same one already proven for `v_project_directory` elsewhere in this app.

Not a blank field — the UI states a **wrong fact**.

| Screen | Shows | Truth |
|---|---|---|
| `/projects` card for 2403 | `PM: Unassigned` | PM is **Rucha Ghalsasi** |
| PO detail MKJ2403EX003 | `ASSIGNEE — Unassigned` | Assignee is **Lucia Salinas** |
| The PDF for that same PO | `ASSIGNEE: Lucia Salinas` ✓ | correct |

The app contradicts the document it generates for the same record.

**Root cause.** `useAssignableUsers()` and `useManagers()` resolve names in two
steps, and the first step reads a table non-admins cannot see:

```ts
// assignee-select.tsx:17
const { data: roleRows } = await supabase.from("user_roles").select("user_id");
const ids = [...new Set((roleRows ?? []).map(r => r.user_id))];
await supabase.from("user_directory").select("id, full_name").in("id", ids);
```

`user_roles` RLS is `user_id = auth.uid() OR is_admin(auth.uid())`. Measured live as
the Engineer: **`user_roles` returned 1 row**, **`user_directory` returned all 6**.
The lookup list is near-empty, `.find()` misses, `assigneeLabel(undefined)` renders
`"Unassigned"`.

Affects **every non-admin role** — engineer, manager and warehouse_manager alike.
The name is freely available in `user_directory`; the code never asks for it. Same
root cause as F-15, surfacing in a second place. Fix: drop the `user_roles`
pre-query, or use it only to *filter the picker*, never to *resolve a stored id*.

**Confirmed conclusively in round 3, refined in round 4.** The identical screens and
records across three roles:

| Screen | As Engineer | As Manager (Rucha) | As Admin |
|---|---|---|---|
| `/projects` 2403 (PM = Rucha) | `Unassigned` | **`Rucha Ghalsasi` ✓** | `Rucha Ghalsasi` ✓ |
| `/projects` 2601 (PM = Cesar H.) | *(not visible)* | *(not visible)* | `Cesar Hernandez` ✓ |
| PO MKJ2403EX003 (assignee = Lucia) | `Unassigned` | **`Unassigned`** | `Lucia Salinas` ✓ |

**The refinement matters.** A non-admin sees the correct name *only when the person
being displayed is themselves* — because `user_roles` returns exactly their own row,
so the lookup list contains only them. Rucha sees herself as PM of her own project
and everything looks fine; the same page shows `Unassigned` for a PO assigned to a
colleague. Measured live as the Manager: `user_roles` → **1 row**,
`user_directory` → **6 rows**.

This is why the bug is easy to miss in casual testing: the person most likely to
check a project's PM field is that project's PM, and they are the one user for whom
it renders correctly.

### L-10 (P2) — Extra project-manager assignments cannot be removed from the UI

> **Status (2026-08-06):** ✅ **Data fixed and confirmed live** — owner confirmed both extra rows were mistaken assignments (Cesar Hernandez should only manage 2601; Lucia Salinas is `warehouse_manager`, which already grants blanket access and needs no `project_managers` row at all). Removed via a direct one-off `DELETE` (the only remaining write path, since F-25 dropped all other direct-write access to this table). Re-verified live: `project_managers` for project 2403 now returns exactly **one** row, matching `project_manager_id` (Rucha). No UI/code change was made — this was purely a data fix, and the owner declined building an admin-only management control for now, since the write path that created this situation is already closed.
>
> **Root cause note confirmed:** the F-07 revocation trigger only fires on an actual *change* to `project_manager_id`. Since 2403's primary PM was already correct (Rucha), re-setting it to the same value was a no-op that never touched the stale rows — they were only removable via direct DB access, exactly as this finding originally concluded.

The Users page no longer renders assignment checkboxes for managers. It shows a
read-only list plus *"Set via each project's edit dialog — a project has one
manager."* But `project_managers` is a many-to-many table, and the live data has
**three** manager rows on project 2403:

| Project | Primary PM (`projects.project_manager_id`) | Rows in `project_managers` |
|---|---|---|
| 2403 | Rucha Ghalsasi | Rucha Ghalsasi, **Lucia Salinas**, **Cesar Hernandez** |
| 2601 | Cesar Hernandez | Cesar Hernandez |

Consequences:

1. **Cesar Hernandez (role `manager`) holds write access to 2403** — `can_write_project`
   reads `project_managers` — even though Rucha is 2403's manager. The Users page
   lists him as "2403, 2601", contradicting its own "a project has one manager" note.
   There is no UI control anywhere to remove that row.
2. **Lucia Salinas's row is completely invisible.** As a warehouse manager her
   assignment cell reads *"Admins & Warehouse Managers see every project."* Her
   `project_managers` row on 2403 is never displayed and cannot be managed. (It grants
   her nothing extra, since warehouse managers already have blanket access — but it is
   unaudited state.)
3. The project edit dialog only sets the single primary PM, so the F-07 trigger will
   only ever revoke *that* one. Extra rows are permanent without direct DB access.

Verified in the DOM: **zero checkboxes on the entire page**; only the Engineer row
has an assignment control.

This is the live residual of F-07/F-25 — the trigger correctly handles the primary
manager (proven in US-09/10 below), but nothing manages the extras. Whether these two
rows are stale leftovers or deliberate co-manager assignments is a call only you can
make; either way there is currently no way to change them from the application.

### L-05 (P3) — `/bulk-upload` is reachable by any signed-in user

Loads fully for an Engineer, and the page calls itself *"Admin-only tool."* The nav
entry is hidden (`adminOnly: true`) but the route has no `beforeLoad` guard, unlike
`/users`, which correctly redirects. Harmless today (the page has no backend calls
at all) but a real hole once import is wired up.

### L-06 (P3) — Engineers are offered actions they cannot complete

| Control | Result if used |
|---|---|
| **New PO** (`/purchase-orders`) | full form loads → *"Not permitted to create a purchase order for this project"* |
| **New Ticket** (`/shipping-tickets`) | → *"Not permitted to create a shipping ticket for this project"* |
| **Receive shipment** (PO detail) | → *"Not permitted to create a packing slip for this project"* |
| **Upload signed ticket** | stub — does nothing for anyone (F-13) |

Security is intact — all refused server-side with readable messages. This is a
usability defect: the user fills in an entire purchase order before being told they
were never allowed to. The app is **inconsistent** rather than uniformly wrong —
`/packing-slips` correctly hides its create button behind `canWrite`, and PO/ticket
Edit and Delete are correctly hidden. Only the create entry points were missed.

### L-09 (P3) — Document numbers are reused after deletion

After deleting slip `QA01-PS-0001`, the next slip created on that project was issued
**`QA01-PS-0001` again**. The per-project sequence is computed `MAX(...)+1` from
surviving rows, so deleting the newest record frees its number. The same pattern is
used for PO and ticket numbering.

These numbers appear on paperwork that leaves the building. Two different physical
documents carrying the same number is a records problem even though the database
stays internally consistent. Consider a monotonic sequence per project rather than
`MAX+1`.

### L-11 (informational, but worth a defensive pattern) — RLS-blocked writes return success

When RLS blocks an `UPDATE` or `DELETE`, PostgREST does **not** error — the `USING`
clause simply filters the rows out, so the statement legitimately affects zero rows
and returns **`200` / `204`**. Observed repeatedly:

| Attempt | Response | Actual effect |
|---|---|---|
| Manager updates `packing_slips.carrier` | `200` | none — carrier still `Fedex` |
| Manager updates `packing_slip_items.qty_received` | `200` | none |
| Engineer deletes own notifications | `204` | none |
| Warehouse deletes a project | `200` | none |

This bit me during round 4: I first recorded A-23 as a failure on the `200` alone,
and only caught it by reading the affected-row count and re-reading the value.

It matters because **this is the exact shape of the original F-01 bug** —
`syncSlipInventory` issued a `DELETE` that silently affected zero rows and never
checked. Any future client code that assumes "2xx means it happened" can reintroduce
the same class of defect. Two cheap mitigations:

- Use `.select()` on mutations and assert a non-empty result where the caller
  depends on the write having landed.
- Prefer the `SECURITY DEFINER` RPC pattern already used for the delete/sync paths,
  which raises explicit exceptions instead of silently no-op'ing.

No user-facing impact today — every affected path is also gated in the UI — so this
is a hardening note, not a defect.

### L-07 (informational) — Two features are visible but non-functional

- **Upload Signed Ticket** (F-13) — renders on delivered tickets; no storage, no
  status change. Also offered to Engineers, who should not have it. `closed` is in
  the frontend status list but was never added to the `ticket_status` enum, so it is
  unreachable.
- **Bulk Upload** — the page contains no Supabase calls whatsoever.

If the owner demo is near, consider hiding both rather than shipping dead buttons.

---

## 4. Environment limitation affecting UI-level testing

**Radix overlays do not open under this browser automation.** `Select`, `Popover`
and `Dialog` triggers did not respond to synthetic pointer events *or* keyboard
(`Enter` on a focused combobox left `aria-expanded="false"`, with no portal node
created). This is a limitation of the automation surface, **not an application
defect** — the same components work normally in a human browser session.

Consequence: flows gated behind a dropdown or modal could not be driven purely
through the UI. Where that blocked a test, I executed **the same code path the
component calls**, read directly from the component source, and have labelled it as
such below. Everything else — navigation, route guards, rendered values, button
visibility, page state — was verified in the real UI.

**PDF generation works fine here.** Contrary to the concern raised, I generated,
downloaded and decoded a PO PDF successfully in this browser (§5, F-15). No
PDF-related failures were observed.

---

## 5. What passed

### Round 2 — Warehouse Manager (43 checks total across both rounds)

**Inventory integrity — the highest-risk block in the plan**

| Test | Result |
|---|---|
| **PS-05** save slip 3× with no changes | **on-hand held at 6; ledger stayed at exactly 1 row** ✅ |
| PS-06 lower 6→4 / raise 4→10 | on-hand 4 then 10, via compensating rows ✅ |
| PS-08 condition `rejected` | on-hand → 0, quantity excluded ✅ |
| PS-09 condition `damaged` | on-hand → 0, quantity excluded ✅ |
| IN-08 ledger discipline | append-only throughout; original rows never mutated ✅ |
| ST-03 ship 6 | on-hand → 0 ✅ |
| **ST-04** ship again ×2 (double-click) | still 0, **one** `-6` ledger row ✅ |
| **ST-05** ship 10 with 6 on hand | **hard block**, nothing deducted: *"Only 6.00 on hand for QA-WIDGET-1. Cannot ship 10.00 more."* ✅ |
| ST-09 shipped → ready | stock returned; ledger `[-6, +6]` ✅ |

**Status machine**

| Test | Result |
|---|---|
| PO-12 `draft → received` / `→ partially_received` | rejected: *"This PO has no recorded receipts yet…"* ✅ |
| PO-13 `received → draft` **with** receipts | rejected: *"This PO has recorded receipts and must stay Partially Received or Received. To correct it, edit or delete the packing slip instead."* ✅ |
| PO-14 status consistent with receipts | 6/10 → `partially_received`, 10/10 → `received` ✅ |
| PS-07 / F-11 zero all receipts | reverted to the **stored** `pre_receipt_status` (`executed`), cleared to null — no blanket guess ✅ |
| Correction allowed once receipts are gone | ✅ |

**Deletes**

| Test | Result |
|---|---|
| PS-16 delete slip | slip + items removed, inventory reversed (6 → 0) ✅ |
| PS-16b PO status after delete | reverts correctly to `executed` when the button's full flow runs ✅ |
| PO-16/17/18 delete PO **with** a packing slip | no FK error; slip cascaded, inventory reversed (5 → 0), ledger `[+5, −5]` ✅ |
| ST-13 warehouse deletes `ready` ticket | allowed ✅ |
| ST-14 warehouse deletes `delivered` ticket | rejected ✅ |

**Permission boundary (F-05)**

| Test | Result |
|---|---|
| A-21 warehouse edits guarded field on `received` PO | rejected: *"Not permitted to edit this purchase order"* ✅ |
| A-22 warehouse edits **status only** on `received` PO | allowed — status stays open for receiving ✅ |
| PO-19 warehouse deletes `received` PO | rejected ✅ |
| Nav gating | Products/Suppliers shown; Users & Bulk Upload hidden ✅ |
| Both projects visible to warehouse | ✅ |
| F-14 | `create_purchase_order` accepted `_additional_freight` / `_terms_conditions` ✅ |

### Round 4 — Manager (PM of 2403 only)

The strictest permission fixture: writes 2403, cannot write 2601, is not warehouse.

| Test | Result |
|---|---|
| Nav | Dashboard…Borrow Requests only — no Products/Suppliers/Users/Bulk Upload ✅ |
| `projects` visible | 2403 only; `v_project_directory` returns both ✅ |
| Create borrow request targeting **2601** (can't write) | rejected by `br_insert` ✅ |
| Create borrow request targeting **2403** (can write) | allowed ✅ |
| **A-27** decide a request whose **source** they don't manage | rejected: *"Not permitted to decide this request"* ✅ |
| **A-20** delete a PO | rejected: *"Not permitted to delete this purchase order"* ✅ |
| **A-21** edit a PO guarded field | rejected: *"Not permitted to edit this purchase order"*; `ship_via` verified unchanged ✅ |
| **A-23** edit a packing slip | blocked — 0 rows affected, `carrier` verified unchanged ✅ (see L-11) |
| A-23b edit packing slip **items** | blocked — 0 rows affected ✅ |
| **A-28** delete a packing slip | rejected: *"Not permitted to delete this packing slip"* ✅ |
| Insert a ledger row for **2601** | rejected by `inv_insert` ✅ |
| Create a PO on **own** project | allowed ✅ |
| Create a shipping ticket on **own** project | allowed ✅ |
| Create a product | allowed — `products_write` is `can_write`, which includes managers ✅ correct per policy, though the nav hides the page |
| PO detail Edit/Delete buttons | correctly absent ✅ |

**BR-02 — the F-02 half-commit case — PASSED.** ✅

Fixture (seeded by the owner as Admin): pending request, **source 2403** (Rucha
manages), **target 2601** (she does not), 7 × `PIP-WVQJB501W`.

| Step | Result |
|---|---|
| BR-04 approve 10 when 7 was requested | rejected: *"Cannot approve 10 — only 7.00 was requested."* ✅ |
| Invalid status value (`fulfilled`) passed directly | rejected: *"Invalid decision status: fulfilled"* ✅ |
| State after both rejections | unchanged — 2403 still 15, 2601 still 0, still `pending` ✅ |
| **BR-02 approve 7** | **`204` — succeeded** ✅ |
| Request row | `status = fulfilled`, `qty_approved = 7`, `decided_by = Rucha`, `fulfilled_at` set ✅ |
| **On-hand 2403** | 15 → **8** (−7) ✅ |
| **On-hand 2601** | 0 → **7** (+7) ✅ |
| BR-07 replay the decision | rejected: *"This request has already been decided (fulfilled)."* ✅ |
| BR-17 return the stock as the **source** manager | rejected: *"Not permitted to return stock for this request"* — returns are target-side ✅ |
| UI | row reads `2403 → 2601 · 7 (approved 7) · Fulfilled`; history shows *"Borrowed out · PIP-WVQJB501W · 7 · Borrow to 2601"* ✅ |

**The decisive detail:** the ledger query run as Rucha returns **only the `borrow_out`
row on 2403** — she cannot even read the `borrow_in` row her own approval created on
2601, because `inv_select` scopes it away. Yet 2601's on-hand demonstrably moved to 7.
That is exactly what the `SECURITY DEFINER` RPC was introduced to achieve: the write
lands in a project the approver has no access to, atomically, in one transaction.

Under the original F-02 code this is the precise point where the second insert failed
after the status update had already committed. **F-02 is now closed in production.**

### Round 3 — Admin

**Role management (F-18)**

| Test | Result |
|---|---|
| **US-03** demote self while **sole admin** (→ manager, then → engineer) | **rejected both times**: *"Cannot remove admin from the last remaining admin"*; role intact ✅ |
| US-04 promote a second admin, then demote them | both allowed; admin count 1 → 2 → 1 ✅ |
| US-06 role change atomicity | no intermediate role-less state observed ✅ |
| US-07 single role per user | exactly one `user_roles` row after each change ✅ |
| Nav | Users & Roles + Bulk Upload now visible ✅ |

**Project manager revocation (F-07)**

| Test | Result |
|---|---|
| US-09 change 2403 PM Rucha → Justin | Rucha's `project_managers` row **removed**, Justin's added ✅ |
| US-10 change back Justin → Rucha | Justin's row removed, Rucha's restored ✅ |
| State restored afterwards | ✅ (pre-existing extra rows untouched — see L-10) |

**F-07 stale-access audit — the outstanding action item from the static review, now complete**

| Project | Primary PM | Extra `project_managers` rows |
|---|---|---|
| 2403 | Rucha Ghalsasi | **Lucia Salinas, Cesar Hernandez** ← needs your decision |
| 2601 | Cesar Hernandez | none ✅ |

**Cleanup**

Sandbox project QA01 deleted (cascading all 15 ledger rows), product `QA-WIDGET-1`
and supplier "QA Test Vendor" removed. Only 2403 and 2601 remain — original state.

### Round 1 — Engineer

| Area | Result |
|---|---|
| Sidebar hides Products, Suppliers, Users, Bulk Upload | ✅ |
| `/users` by URL → redirected to `/dashboard` | ✅ |
| `/projects/2601` (not assigned) → "Project not found." | ✅ |
| `projects` returns only 2403; `v_project_directory` returns both | ✅ F-06 exactly as accepted |
| `inventory_adjustments` — all 24 rows scoped to own project | ✅ |
| `profiles` / `user_roles` return 1 row each (self) | ✅ |
| `suppliers` limited to vendors on visible POs | ✅ |
| PO/ticket Edit and Delete hidden | ✅ |
| Writes refused: products, suppliers, POs, all 3 create RPCs, `set_user_role`, notification-for-others | ✅ 8/8 |
| **F-15** | rendered PDF contains `CREATED BY: Lucia Salinas` / `ASSIGNEE: Lucia Salinas` while `profiles` returns `[]` — the fix works exactly as designed ✅ |
| **F-14** | PDF `Additional Freight: $0.00` / `Grand Total: $2000.00`; detail page `$2000.00`; line math correct ✅ |
| **F-17** | status is a read-only display with *"Set automatically from packing slips…"* ✅ |
| **F-12** | `Returned` with `4 of 4 returned` / `1 of 1 returned`; ledger balances 5 in / 5 out ✅ |
| **F-06 follow-up** | borrow From/To populated across an invisible project ✅ |
| **F-29** | PDF footer `Printed On: 08/05/2026, 07:22 PM EDT` ✅ |
| All 9 remediation RPCs present | ✅ |

---

## 6. Test data — cleaned up in round 3

Everything created under the QA sandbox project **QA01** has been removed:

| Item | State |
|---|---|
| Supplier "QA Test Vendor" | ✅ deleted |
| PO `MKJQA01EX001` + items | ✅ deleted (via the cascade test) |
| Packing slips `QA01-PS-0001` (×2) | ✅ deleted |
| Shipping ticket `SQA01-001` + items | ✅ deleted |
| Project `QA01` | ✅ deleted as Admin — cascaded all 15 ledger rows |
| Product `QA-WIDGET-1` | ✅ deleted once the ledger FK cleared |
| 2 notifications on `jbaidoo@` (`probe`, `probe2`) | ⚠️ **likely remain** — `notifications` are self-scoped, so an admin cannot see or delete another user's rows. They were marked read. Removing them needs direct DB access. |

**Round 4 leftovers — need an Admin to remove** (a manager cannot delete either):

| Item | Project |
|---|---|
| PO **MKJ2403EX004** (description "QA manager PO", no line items) | 2403 |
| Shipping ticket **S2403-002** (deliver-to "QA mgr", no line items, status `ready`) | 2403 |

Both were created to prove a manager *can* create on their own project. Neither has
line items and neither touched inventory. Removed already by the manager: the test
borrow request (cancelled) and product `QA-MGR-PROBE` (deleted).

**Real stock moved by the BR-02 test:** 7 × `PIP-WVQJB501W` transferred 2403 → 2601
(2403: 15 → 8, 2601: 0 → 7). This is genuine, correct ledger data, not junk — but if
you want the pre-test balance back, have a **2601-side manager, a warehouse manager,
or an admin** return it from the borrow request (returns are target-side, so Rucha
cannot). That would also exercise BR-12/13 on a fresh record.

Projects remaining: **2601, 2403** — original state. No pre-existing record was
deleted, and role/PM changes made during testing were all restored.

> Side observation: `DELETE /projects?...` returned **200 with no error** while
> deleting nothing (RLS matched zero rows). The same silent-success pattern appeared
> on `notifications`. Not exploitable, but a caller cannot distinguish "deleted" from
> "not permitted".

---

## 7. Recommended order of work

1. **Audit which migrations are actually applied** (L-01, L-02) — two were skipped
   mid-sequence, so reconcile the whole set, don't just run those two.
2. **Create the `packing-slip-attachments` bucket by hand** in the Storage tab
   (L-08) — private, ~10 MB, pdf + image mime types.
3. **Redeploy both PDF edge functions** (L-03).
4. **Fix name resolution** (L-04) — one shared change to `useAssignableUsers()` and
   `useManagers()` clears it on all three screens.
5. **Decide on the two extra manager rows on 2403** (L-10) and add a UI path to
   manage them — today they can only be changed in the database.
6. Add the `/bulk-upload` route guard (L-05); gate the create buttons by role (L-06).
7. Consider monotonic document numbering (L-09).

---

## 8. Coverage and what remains

Rounds 1–2 covered the Engineer and Warehouse Manager surfaces, including every
inventory-integrity regression case in the plan. Still untested live:

Rounds 1–3 covered Engineer, Warehouse Manager and Admin, including every
inventory-integrity regression case and the full role-management surface. Remaining:

Rounds 1–4 covered all four roles. The permission matrix is now verified end to end
from every angle, and every inventory-integrity regression case has passed live.
Remaining:

Rounds 1–4 covered all four roles, every inventory-integrity regression case, the full
permission matrix, and BR-02. **Live functional coverage of the S1 set is complete.**
What remains is optional or blocked on environment:

| Needs | To test |
|---|---|
| **Two admin accounts, with your go-ahead** | **US-05** — concurrent double-demotion. Deliberately **not run**: two simultaneous demotions that both slipped past the guard would leave **zero** admins, and `user_roles` writes are admin-only with no in-app recovery — you'd need the Supabase dashboard. The guard uses `FOR UPDATE` and passed US-03, so I judged the downside disproportionate. Happy to run it on your say-so. |
| **Two manager accounts** | BR-06 (concurrent double-approval). Low value now that BR-07 proved the `status <> 'pending'` guard rejects a second decision. |
| **A 2601-side manager / warehouse / admin** | BR-12/13 returns on the new fulfilled request — would also restore the 7 units moved by BR-02 (see §6). |
| **Any role, human browser** | The UI flows blocked by the Radix limitation in §4 — creating a PO/slip/ticket through the actual forms, and the slip edit dialog end-to-end. **This is the one gap I'd still close before release**: those are the paths real users take daily, and they are the only significant surface I could not drive directly. A single manual pass by a person would cover it. |

**Suggested next:** stop testing and start fixing. The four P1 deployment items
(L-01, L-02, L-03, L-08) are the only things standing between this build and a
demo-ready state, and none of them require code changes — they are a migration
reconciliation, a bucket creation, and an edge-function redeploy.
