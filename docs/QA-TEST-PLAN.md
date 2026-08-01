# MKJ Ops — QA test plan

Scope: full pre-production pass over purchase orders, packing slips, inventory,
shipping tickets, borrowing, roles, and PDF generation.
Companion documents: `QA-SYSTEM-MAP.md` (what exists), `QA-FINDINGS.md` (what is
already known to be broken — F-nn references below point there).

---

## 1. Test environment

Do **not** run this plan against the production Supabase project. The suite
deliberately creates negative stock, double-saves receipts, and demotes admins.

Required setup:
1. A separate Supabase project with all 23 migrations applied in filename order.
2. Buckets created **manually** via the Storage tab — `purchase-order-pdfs`,
   `shipping-ticket-pdfs`, `app-assets` (SQL-editor bucket inserts have not taken
   effect on this project; see the note in migration `20260801211252`).
3. `app-assets/logo/mkj-logo.jpg` uploaded, plus one run with it **absent** to
   confirm PDFs still render.
4. Both edge functions deployed with `verify_jwt = true`.
5. Browser with popup blocking **on** (both PDF paths depend on the
   pre-opened-tab trick) and a second run with it off.

### Role fixtures

| Fixture | Setup | Notes |
|---|---|---|
| `admin@` | first account created — auto-admin | |
| `wh@` | role `warehouse_manager` | no project assignments needed |
| `pm-a@` | role `manager`, PM of project **A** only | |
| `pm-b@` | role `manager`, PM of project **B** only | needed for borrow tests |
| `eng-a@` | role `engineer`, assigned to project **A** | |
| `none@` | signed up, **no role assigned** | critical for F-06 |

### Data fixtures

- Projects **A** (`9001`, active), **B** (`9002`, active), **C** (`9003`, closed).
- Suppliers: one full record, one name-only.
- Products: `P-100` (reorder point 5), `P-200` (reorder point 0), plus one with
  a comma and a dot in the part number, e.g. `P,300.X` — for F-21.
- One PO per status value on project A.

---

## 2. Suite 1 — Authentication and access control

| ID | Test | Expected | Risk |
|---|---|---|---|
| A-01 | First-ever signup | Becomes admin; `user_roles` has exactly one row | |
| A-02 | Second signup | Profile created, **no** role; app still loads | |
| A-03 | Sign in with wrong password | Toast shows the error, no navigation | |
| A-04 | Visit `/dashboard` signed out | Redirects to `/auth` | |
| A-05 | Visit `/users` as non-admin | Redirects to `/dashboard` | |
| A-06 | **`none@` opens `/projects`** | *Should* see nothing; **currently sees every project** | **F-06** |
| A-07 | **`none@` opens `/inventory`** | *Should* see nothing; **currently sees all stock** | **F-06** |
| A-08 | `eng-a@` opens project B detail | Project B data must not be readable | F-06 |
| A-09 | Sign out, then Back button | No cached data; redirected to `/auth` | |
| A-10 | Expired/refreshed token during a save | Save either succeeds after refresh or fails cleanly | |
| A-11 | Open sign-up from a non-company email | Product decision required — currently unrestricted | F-06 |

### Suite 1b — Server-side permission probes (API, not UI)

Run these with `curl`/Postman using each fixture's JWT. The UI hides these
actions; the point is to prove the database also refuses.

| ID | Test | Expected | Risk |
|---|---|---|---|
| A-20 | `pm-a@` DELETEs a `received` PO on project A | Rejected | **F-05** |
| A-21 | `pm-a@` UPDATEs a `received` PO's line items | Rejected | **F-05** |
| A-22 | `pm-a@` UPDATEs a packing slip on project A | Rejected (UI restricts to warehouse/admin) | **F-05** |
| A-23 | `pm-a@` inserts a product / supplier | Decide intended rule; `can_write` currently allows it while the nav hides it | F-05 |
| A-24 | Replaced PM (`pm-a@` removed as A's manager) writes a PO on A | Rejected | **F-07** |
| A-25 | `none@` selects from `inventory_adjustments` | Rejected | **F-06** |
| A-26 | Any user inserts a notification for another user | Rejected | F-33 |
| A-27 | Any user inserts a notification for **themselves** | Currently allowed — confirm acceptable | F-33 |

---

## 3. Suite 2 — Purchase orders

| ID | Test | Expected | Risk |
|---|---|---|---|
| PO-01 | Create PO on project A | Number `MKJ9001EX001`; sequence continues per project | |
| PO-02 | Create a second PO on B | `MKJ9002EX001` — sequences are independent | |
| PO-03 | Two users create a PO on A simultaneously | Distinct sequences, no unique-violation error | |
| PO-04 | Create with supplier "Other…" then force a failure (revoke write mid-flow) | No orphan supplier row left behind | **F-26** |
| PO-05 | Create with 0 line items | Defined behaviour (currently allowed) | |
| PO-06 | Line qty `0`, negative, `1e9`, non-numeric | Input clamps to ≥0 integers; totals stay finite | |
| PO-07 | Unit cost `0.005`, `-5`, `999999999.99` | `NUMERIC(12,2)` overflow surfaces a readable message, not a raw DB error | |
| PO-08 | Grand total on new-PO screen vs detail vs PDF | All three agree | **F-14** |
| PO-09 | Set `additional_freight` | **No UI exists** — total and PDF always show `$0.00` freight | **F-14** |
| PO-10 | Edit PO: change lines, remove a line, add a line | Line numbers renumber contiguously; totals recalc | |
| PO-11 | Edit PO, remove a line that a packing slip references | `packing_slip_items.po_item_id` FK — must not silently break receipt history | |
| PO-12 | Edit fails halfway (network drop after header update) | No partial write, or a clear message that a retry is safe | |
| PO-13 | Status `draft → received` directly | Should be blocked or warned | **F-17** |
| PO-14 | Status `received → draft` after receipts exist | Should be blocked or reverse receipts | **F-17** |
| PO-15 | Delete a PO with packing slips (admin) | Friendly message, not a raw FK error; inventory must not be stranded | **F-04** |
| PO-16 | Delete a PO with no slips | Items and PO removed; PDF cache row cascades | |
| PO-17 | `wh@` sees delete on a `received` PO | Hidden in UI **and** refused by the API | **F-05** |
| PO-18 | List with >200 POs | Pagination or an explicit "showing 200 of N" | F-30 |

---

## 4. Suite 3 — Packing slips / receiving

This is the highest-risk area. **PS-05 is the single most important test in the
plan.**

| ID | Test | Expected | Risk |
|---|---|---|---|
| PS-01 | Receive full quantity | Slip `received`; PO `received`; on-hand += qty | |
| PS-02 | Receive partial | Slip + PO `partially_received`; backorder shown | |
| PS-03 | Second slip completing the balance | PO flips to `received`; "prev. received" prefilled correctly | |
| PS-04 | Receive **more** than ordered | Currently allowed and PO reads `received` — confirm intended | **F-22** |
| PS-05 | **Open a saved slip, Save with no changes** | On-hand must be **unchanged** | **F-01 — currently doubles** |
| PS-06 | Edit a slip, lower a quantity | Ledger nets to the new quantity, not the sum | **F-01** |
| PS-07 | Edit a slip, zero every line | PO reverts to its pre-receipt status, not `executed` | **F-11** |
| PS-08 | Receive a line marked `rejected` | Rejected material must not enter on-hand | **F-08** |
| PS-09 | Receive a line marked `damaged` | Defined rule required (segregate vs. count) | **F-08** |
| PS-10 | Receive a PO line with no `product_id` | Product resolved/created once; no duplicate catalog entries | F-21 |
| PS-11 | Receive a line whose description contains `,` `.` `(` | No 400; no unintended product match | **F-21** |
| PS-12 | Create slip, then edit it, on the same line | Create and edit resolve to the **same** product | **F-21** |
| PS-13 | Two users receive against the same PO simultaneously | Distinct slip numbers, no unique violation | **F-20** |
| PS-14 | Slip insert succeeds but item insert fails | No orphan slip header left behind | |
| PS-15 | Change a PO line qty after a partial receipt, reopen the slip | Displayed ordered/backorder reflect reality | **F-23** |
| PS-16 | Manually override slip status against its quantities | Should be prevented or warned | F-23 |
| PS-17 | Delete a slip recorded against the wrong PO | **No delete exists** | **F-16** |
| PS-18 | Attach the scanned vendor slip | **No upload exists** (`attachment_url` unused) | **F-40** |
| PS-19 | Receive against a project with status `closed` | Should be blocked (picker does not filter by status) | F-35 |
| PS-20 | Received date at 21:00 ET | Defaults to **today** in ET, not tomorrow | **F-29** |

---

## 5. Suite 4 — Shipping tickets

| ID | Test | Expected | Risk |
|---|---|---|---|
| ST-01 | Create a ticket | Number `S9001-001`; status `ready` | |
| ST-02 | Two simultaneous creations on one project | Distinct sequences | |
| ST-03 | Mark shipped | On-hand -= qty_shipped exactly once | |
| ST-04 | **Double-click Mark shipped** | Deducted **once** | **F-03** |
| ST-05 | Ship more than on-hand | Blocked, or an explicit override with a warning | **F-10** |
| ST-06 | Edit dialog: shipped → `draft` | Inventory fully returned | |
| ST-07 | Edit dialog: shipped → **`ready`** | Inventory returned (currently it is **not**) | **F-09** |
| ST-08 | Edit dialog: change qty on an already-shipped ticket | Ledger reconciles to the new quantity | |
| ST-09 | Edit dialog: remove a line from a shipped ticket | That product's deduction is reversed | |
| ST-10 | Ready → shipped → delivered via buttons | Status and `received_date` correct in ET | F-29 |
| ST-11 | Mark delivered | Who received it, signature, pass number recorded | **F-13** |
| ST-12 | Delete a shipped ticket (`wh@`) | Inventory returned, items and ticket removed | |
| ST-13 | Delete a **delivered** ticket as `wh@` | Refused by the RPC, not just hidden | |
| ST-14 | Delete a delivered ticket as `admin@` | Allowed; inventory returned | |
| ST-15 | Line with no product selected | Excluded from inventory but still printed — confirm intended | |
| ST-16 | Backordered quantity only (`qty_shipped` 0) | No inventory movement; line still on the PDF | |

---

## 6. Suite 5 — Inventory ledger

| ID | Test | Expected | Risk |
|---|---|---|---|
| IN-01 | On-hand = Σ deltas | Cross-check `v_project_inventory` against a manual sum after each of PS/ST/borrow | |
| IN-02 | Low-stock badge at exactly the reorder point | `on_hand ≤ reorder_point` → "Low" | |
| IN-03 | Negative on-hand | Should be unreachable | **F-10** |
| IN-04 | Full lifecycle reconciliation: receive 100 → ship 30 → borrow out 20 → delete the ticket | Ends at 90 on the source project | F-01/03/04 |
| IN-05 | Inventory search by project, part #, description | Client-side filter matches all four fields | |
| IN-06 | "Last updated" per project card | Correct timestamp; query does not pull the whole table | F-31 |
| IN-07 | Ledger rows after a PO delete | No adjustments left pointing at a deleted PO | **F-04** |

---

## 7. Suite 6 — Borrow requests

| ID | Test | Expected | Risk |
|---|---|---|---|
| BR-01 | `pm-b@` requests stock from project A | Request created; A's manager + oversight notified | |
| BR-02 | **`pm-a@` (source manager, not target manager) approves** | Transfer completes | **F-02 — currently half-commits** |
| BR-03 | `admin@` approves the same request | Both ledger rows written; status `fulfilled` | |
| BR-04 | Approve more than on-hand | Blocked with the "only N on hand" message | |
| BR-05 | Approve more than requested | Should be blocked | **F-27** |
| BR-06 | Partial approval | Recorded as `partially_approved`, quantity respected | F-27 |
| BR-07 | Status after approval | `approved` is immediately overwritten by `fulfilled` — confirm the audit trail is acceptable | F-02 |
| BR-08 | Deny | No inventory movement; requester notified | |
| BR-09 | Requester cancels a pending request | Status `cancelled`; lending side notified | |
| BR-10 | Cancel an already-approved request | Should be refused | |
| BR-11 | Two managers approve simultaneously | Only one transfer occurs | **F-02** |
| BR-12 | Source = target | Rejected (CHECK constraint + client guard) | |
| BR-13 | **Return borrowed stock** | **No flow exists** | **F-12** |
| BR-14 | Engineer opens the page | No "New Request" button; API also refuses | |
| BR-15 | Deep link `?request=<id>` from a notification | Opens the detail dialog and marks the notification read | |

---

## 8. Suite 7 — PDF generation

| ID | Test | Expected | Risk |
|---|---|---|---|
| PDF-01 | View a saved PO PDF | Opens in a new tab within the 120 s signed window | |
| PDF-02 | View twice without editing | Second call serves the cache (no re-render) | |
| PDF-03 | Edit the PO, view again | Hash changes; PDF reflects the edit | |
| PDF-04 | Change the project's name only | PO PDF re-renders (project fields are hashed) | |
| PDF-05 | **View as `pm-a@` / `eng-a@`** | Created-by and Assignee names present | **F-15 — currently blank** |
| PDF-06 | View a PO on a project you cannot see | 404, and no information leaked | |
| PDF-07 | Draft preview from the new-PO screen | Renders, persists nothing, marked "DRAFT" | |
| PDF-08 | Draft preview with popups blocked | Graceful failure, no dangling blank tab | |
| PDF-09 | Logo missing from `app-assets` | PDF still renders, unbranded | |
| PDF-10 | 60+ line items | Pagination, headers, and footers correct on every page | |
| PDF-11 | Long multi-line bill-to / ship-to / description | No overflow past the margins | |
| PDF-12 | Unicode and long part numbers | No missing glyphs or overlap | |
| PDF-13 | Totals: PDF vs detail page vs editor | Identical | **F-14** |
| PDF-14 | Ticket PDF: contract number changed on the project | Cache invalidates | |
| PDF-15 | Ticket PDF proof-of-delivery block | Confirm hand-signed-only is acceptable for go-live | **F-13** |
| PDF-16 | Reload the tab after 120 s | Understandable error or automatic re-sign | F-37 |
| PDF-17 | Concurrent views of the same stale PO | Both succeed; no upload conflict | |

---

## 9. Suite 8 — Users, roles, notifications

| ID | Test | Expected | Risk |
|---|---|---|---|
| US-01 | Assign each role in turn | Nav, buttons, and API access all change accordingly | |
| US-02 | Assign projects to a manager / engineer | Checkbox state persists; access follows | |
| US-03 | **Admin demotes themselves (only admin)** | Blocked with a last-admin guard | **F-18** |
| US-04 | Role change fails between delete and insert | User is not left role-less | F-18 |
| US-05 | Rename a user | `profiles` and `user_directory` both update | |
| US-06 | Change a project's manager | Old manager loses write access | **F-07** |
| US-07 | New signup appears on `/users` | Appears after Refresh; consider an invite flow | F-39 |
| US-08 | Borrow request notification arrives | Badge increments **without** a manual refresh | **F-19** |
| US-09 | Mark all as read | Badge clears; count is per-recipient | |
| US-10 | Notification deep links | Every `link` value routes correctly | |
| US-11 | 100+ notifications | Oldest are silently dropped from the list | F-30 |

---

## 10. Suite 9 — Cross-cutting

| ID | Test | Expected |
|---|---|---|
| X-01 | Every list/detail page at 375 px width | Tables scroll; the sidebar sheet works |
| X-02 | Every destructive action | Confirmation dialog; disabled state during the request |
| X-03 | Every mutation with the network offline | Toast with a real message; no silent success |
| X-04 | Every "not found" ID in a URL | Real empty state, never a permanent "Loading…" (**F-24**) |
| X-05 | Browser Back after each create flow | No duplicate submission |
| X-06 | Double-click every submit button | Exactly one record created |
| X-07 | Keyboard-only navigation of each dialog | Focus trapped and returned |
| X-08 | Console during a full happy-path run | No errors, no failed requests |
| X-09 | All dates displayed anywhere | America/New_York, consistent format (**F-29**) |
| X-10 | Currency formatting | Two decimals everywhere, no floating-point drift |

---

## 11. Suggested execution order

1. **Suite 1 + 1b** — access control gates everything else, and F-06 may change
   the fixture set.
2. **Suite 3 (PS-05, PS-06, PS-08)** and **Suite 4 (ST-04, ST-07)** — the
   inventory-corrupting defects. Run these before anyone loads real data.
3. **Suite 6 (BR-02)** — borrow approval is unusable for managers today.
4. Suites 2, 5, 7, 8.
5. Suite 9 as a final regression sweep.

## 12. Exit criteria for production

- Every **S1** finding fixed and covered by a test in this plan.
- F-08, F-09, F-10, F-13, F-14, F-18 fixed or explicitly accepted in writing by
  the business owner.
- IN-04 (full lifecycle reconciliation) passes three consecutive times on a
  freshly seeded database.
- A documented backup/restore path for the Supabase project, since the ledger is
  append-only and there is no way to undo a corrupted inventory history from
  inside the app.
