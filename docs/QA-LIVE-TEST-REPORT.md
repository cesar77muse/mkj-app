# MKJ Ops — Live application test report

**Environment:** https://mkjapp.lovable.app · **Database:** Supabase `beoggpwowmwzqmtuidvl`
**Companions:** `QA-TEST-PLAN.md` rev 2 · `QA-FINDINGS.md`
**Last updated:** 2026-08-06

| Round | Date | Account | Role |
|---|---|---|---|
| 1 | 2026-08-05 | `jbaidoo@mkjcomm.com` (Joseph Baidoo) | Engineer |
| 2 | 2026-08-05 | `jschneider@mkjcomm.com` (Justin Schneider) | Warehouse Manager |
| 3 | 2026-08-05 | `cesarhmcod@gmail.com` (Cesar Admin) | Admin |
| 4 | 2026-08-05 | `rghalsasi@mkjcomm.com` (Rucha Ghalsasi) | Manager — PM of 2403 only |
| — | 2026-08-06 | owner remediation pass + re-verification | mixed |

Live findings are numbered **L-nn**, distinct from the static register's **F-nn**.

---

## 1. Where things stand

**77 automated checks passed across four roles.** Every S1 finding from the original
register is verified fixed in production. The permission model came through roughly
45 authorisation probes without a single incorrect result — no privilege escalation,
no cross-project leakage, no UI-only gate the database failed to back up.

Of 11 live findings, **6 are closed** and the remaining 5 are P3/informational — no
P1 or P2 item is open. The theme worth remembering: **7 of the 11 were deployment
drift or data state, not application code.** The code was largely right; what was
running didn't match it.

### Status at a glance

| ID | Severity | Finding | Status |
|---|---|---|---|
| **L-01** | P1 | `v_project_last_updated` missing → Inventory "Last updated" blank | ✅ Fixed, confirmed live |
| **L-02** | P1 | Users can forge notifications to themselves | ✅ Fixed, confirmed live |
| **L-03** | P1 | PDF signed-URL TTL stuck at 120s | ✅ Fixed, confirmed live |
| **L-04** | P2 | PM/Assignee show "Unassigned" for non-admins | ✅ Fixed, confirmed live |
| **L-08** | P1 | `packing-slip-attachments` bucket missing | ✅ Fixed, confirmed live |
| **L-10** | P2 | Extra project-manager rows unmanageable | ✅ Data fixed, confirmed live |
| **L-05** | P3 | `/bulk-upload` reachable by any signed-in user | 🔴 Open |
| **L-06** | P3 | Engineers offered actions they cannot complete | 🔴 Open |
| **L-09** | P3 | Document numbers reused after deletion | 🔴 Open |
| **L-07** | info | Two features visible but non-functional | 🔴 Open (by design, for now) |
| **L-11** | info | RLS-blocked writes return success | 🔴 Open (hardening note) |

> **L-01 / L-02 closed 2026-08-06.** Both migrations have now been applied and both
> were re-verified live: `v_project_last_updated` returns real rows, and the Inventory
> cards render `Last updated: 8/5/2026, 8:03:56 PM` instead of `—`; a direct
> `POST /notifications` for the caller's own id now returns **`403` RLS** instead of
> `201`. **Every P1 and P2 finding in this report is closed.**

---

## 2. ✅ Human verification checklist

Everything below needs a **person driving a real browser**. Two reasons: automation
in this environment could not open Radix dropdowns or modals (§6), and some checks
need a second account or a human eye on a printed document.

**Legend** — 🔴 must pass before the owner demo · 🟡 should pass · ⚪ nice to have

### 2.1 Confirm the last two fixes — ✅ done 2026-08-06

| | ID | Check | Result |
|---|---|---|---|
| ✅ | **H-01** | Inventory project cards show a real "Last updated" time | Both cards read `8/5/2026, 8:03:56 PM` — no longer `—` |
| ✅ | **H-02** | A user cannot forge a notification to themselves | Direct `POST /notifications` → **`403` RLS** (was `201`) |

Verified by automated probe plus the rendered Inventory page. Nothing further needed.

### 2.2 Core forms — end to end through the real UI 🔴

These are the paths your staff use daily, and the ones automation could not drive.
For each: complete the form, save, then **re-open the record and confirm it saved**.

| | ID | Flow | Watch for |
|---|---|---|---|
| ⬜ | **H-03** | **Create a PO** — pick project + supplier from the dropdowns, add 2–3 line items, set freight, **Preview PDF**, then Create | Grand total on screen = total on the PDF, freight included |
| ⬜ | **H-04** | **Create a PO with supplier "Other…"** and a new vendor name | Vendor created once; no duplicate if you retry |
| ⬜ | **H-05** | **Receive a shipment** — project → search the PO → enter quantities → attach a scan → Record | Slip number issued; attachment opens afterwards; inventory increases |
| ⬜ | **H-06** | **Edit that packing slip, change nothing, Save. Note on-hand before and after.** | **On-hand must be identical.** This is the F-01 double-count guard — the single most important manual check |
| ⬜ | **H-07** | Edit the slip again, lower a quantity, Save | On-hand drops to match; it does not add |
| ⬜ | **H-08** | Mark a line **Damaged** or **Rejected**, Save | That quantity is **excluded** from on-hand |
| ⬜ | **H-09** | **Create a shipping ticket**, pick products, Mark shipped | On-hand decreases exactly once |
| ⬜ | **H-10** | Try to ship **more than on hand** | Blocked with a clear message; nothing deducted |
| ⬜ | **H-11** | On a shipped ticket, use the edit dialog to set status back to **Ready** | Stock returns to inventory |
| ⬜ | **H-12** | **Delete a packing slip** | Inventory reverses; the PO's status recalculates |
| ⬜ | **H-13** | **Delete a PO that has receipts** | Confirmation names the slips + inventory reversal; everything unwinds |

### 2.3 Borrowing 🟡

| | ID | Flow | Watch for |
|---|---|---|---|
| ⬜ | **H-14** | Create a borrow request via the dialog | Lending project's manager is notified |
| ⬜ | **H-15** | **Approve a partial quantity** (e.g. 3 of 5) | Status reads *Partially approved*; only 3 move |
| ⬜ | **H-16** | **Return borrowed stock** — full and partial | `X of Y returned` tracks correctly; both projects' on-hand match |

### 2.4 Cross-role checks — need a second account 🔴

L-04 was fixed but could only be verified as Admin. **This is the highest-value item
in the list** — it is the one fix with no end-to-end confirmation.

| | ID | Check | Pass looks like |
|---|---|---|---|
| ⬜ | **H-17** | Sign in as a **non-admin** (engineer or manager). Open **Projects**. | PM names render — **not** "Unassigned" |
| ⬜ | **H-18** | Same account → open a PO **assigned to someone else** | Assignee's real name shows, not "Unassigned" |
| ⬜ | **H-19** | Trigger a borrow request affecting your account, and watch the bell | Badge increments **without** refreshing the page |

> Why H-17/H-18 matter: a non-admin previously saw the correct name *only when it was
> their own*. So a PM checking their own project saw nothing wrong. Test with a record
> belonging to **someone else**.

### 2.5 Documents — print and eyeball 🟡

| | ID | Check | Watch for |
|---|---|---|---|
| ⬜ | **H-20** | Open a PO PDF, **print it on paper** | Logo present; nothing clipped at the margins |
| ⬜ | **H-21** | PO with **40+ line items** | Page breaks clean; headers/footers on every page |
| ⬜ | **H-22** | Long addresses, long descriptions, unusual part numbers | No overflow or overlap |
| ⬜ | **H-23** | Shipping ticket PDF | Proof-of-delivery block is usable as a hand-signed form |
| ⬜ | **H-24** | Leave a PDF tab open ~10 min, reload | Still loads (TTL is now 1 hour) |

### 2.6 Everyday robustness ⚪

| | ID | Check | Watch for |
|---|---|---|---|
| ⬜ | **H-25** | Use the app on a **phone** | Tables scroll; the menu works |
| ⬜ | **H-26** | Double-click every Save / Create / Mark-shipped button | Exactly one record; no doubled inventory |
| ⬜ | **H-27** | Browser Back after saving, then re-submit | No duplicate record |
| ⬜ | **H-28** | Turn Wi-Fi off mid-save | A real error message — never a false "saved" |
| ⬜ | **H-29** | Check dates entered after ~8pm | Date saved is **today**, not tomorrow |

---

## 3. Open findings

### L-05 (P3) — `/bulk-upload` is reachable by any signed-in user

Loads fully for an Engineer, and the page calls itself *"Admin-only tool."* The nav
hides it (`adminOnly: true`) but the route has no `beforeLoad` guard, unlike `/users`
which correctly redirects. Harmless today — the page makes no backend calls — but it
becomes a real hole the moment import is wired up.

**Fix:** copy the `beforeLoad` admin check from `/users`.

### L-06 (P3) — Engineers are offered actions they cannot complete

| Control | Result when used |
|---|---|
| **New PO** | full form loads → *"Not permitted to create a purchase order for this project"* |
| **New Ticket** | → *"Not permitted to create a shipping ticket for this project"* |
| **Receive shipment** | → *"Not permitted to create a packing slip for this project"* |

Security is intact — all refused server-side with readable messages. It is a
usability defect: the user fills in an entire purchase order before being told they
were never allowed to. The app is **inconsistent** rather than uniformly wrong —
`/packing-slips` correctly hides its create button behind `canWrite`, and PO/ticket
Edit and Delete are correctly hidden. Only the create entry points were missed.

### L-09 (P3) — Document numbers are reused after deletion

After deleting slip `QA01-PS-0001`, the next slip created on that project was issued
**`QA01-PS-0001` again**. Per-project sequences are computed `MAX(...)+1` from
surviving rows, so deleting the newest record frees its number. Same pattern for PO
and ticket numbering.

These numbers go out on paperwork. Two different physical documents carrying the same
number is a records problem even though the database stays internally consistent.

### L-07 (info) — Two features are visible but non-functional

- **Upload Signed Ticket** (F-13) — renders on delivered tickets; no storage write, no
  status change. Also offered to Engineers, who should not have it. `closed` appears
  in the frontend status list but was never added to the `ticket_status` enum, so it
  is unreachable. *(The bucket now exists — see L-08 — so the storage half is ready.)*
- **Bulk Upload** — the page contains no Supabase calls at all.

### L-11 (info) — RLS-blocked writes return success

When RLS blocks an `UPDATE`/`DELETE`, PostgREST does not error — the `USING` clause
filters the rows out, so the statement affects zero rows and returns **`200`/`204`**.

| Attempt | Response | Actual effect |
|---|---|---|
| Manager updates `packing_slips.carrier` | `200` | none — carrier unchanged |
| Manager updates `packing_slip_items.qty_received` | `200` | none |
| Engineer deletes own notifications | `204` | none |
| Warehouse deletes a project | `200` | none |

This caught me out during round 4 — I first recorded a failure on the `200` alone,
and only spotted it by checking the affected-row count.

It matters because **this is the exact shape of the original F-01 bug**:
`syncSlipInventory` issued a `DELETE` that silently affected zero rows and never
checked. No user-facing impact today, but it is a live footgun for future code.

---

## 4. Closed findings — with evidence

### L-01 — `v_project_last_updated` missing ✅
Migration `20260801222200` (F-31). Inventory's per-project "Last updated" query threw,
React Query swallowed it, and every card fell back to `—` for every user — silent
degradation, which is why it went unnoticed for so long.
**Fixed:** migration applied; the view returns rows and the cards render
`Last updated: 8/5/2026, 8:03:56 PM`.

### L-02 — Notification forgery ✅
Migration `20260801222300` (F-33). `POST /notifications` with
`recipient_user_id:<self>` returned `201`. Forging for *another* user was already
correctly refused, so blast radius was self-only — but fabricated "PO approved"
messages undermine notifications as an audit signal.
**Fixed:** `notif_insert_self` dropped; the same probe now returns **`403`**
*"new row violates row-level security policy for table notifications"*.

### L-03 — PDF signed-URL TTL ✅
Decoded a real `po-pdf` token for `MKJ2403EX001`: `exp - iat = 3600`. Both functions
redeployed.

### L-08 — Storage buckets ✅
Re-ran the "upload is authoritative" test. `packing-slip-attachments` **and**
`shipping-ticket-proofs` (the F-13 bucket) both return `415 invalid_mime_type` on a
disallowed file — proving they exist with intended MIME restrictions, rather than
`404 NoSuchBucket`. Created by hand via the Storage tab.

> Method note worth keeping: Supabase's `list` endpoint returns `200 []` for *any*
> bucket name, including one that does not exist. Only an upload attempt is
> authoritative.

### L-04 — PM/Assignee "Unassigned" for non-admins ✅

The bug, across three roles on identical records:

| Screen | Engineer | Manager (Rucha) | Admin |
|---|---|---|---|
| `/projects` 2403 (PM = Rucha) | `Unassigned` | **`Rucha Ghalsasi` ✓** | `Rucha Ghalsasi` ✓ |
| PO MKJ2403EX003 (assignee = Lucia) | `Unassigned` | **`Unassigned`** | `Lucia Salinas` ✓ |

**Root cause:** `useAssignableUsers()` / `useManagers()` resolved names via a
`user_roles` pre-query, and `user_roles` RLS is `user_id = auth.uid() OR is_admin(...)`.
Measured live as Manager: `user_roles` → **1 row**, `user_directory` → **6 rows**. So a
non-admin saw the correct name *only when the person was themselves* — which is
exactly why it survived casual testing.

**Fix:** new `v_user_roles` view mirroring the proven `v_project_directory`/F-15
pattern, gated by `has_any_role`. Verified two ways: the view returns rows against the
live DB, and the published JS bundle's `assignee-select` / `project-manager-select`
chunks were re-fetched and confirmed to reference `v_user_roles`.
**End-to-end confirmation as a non-admin is still outstanding — H-17/H-18.**

### L-10 — Extra project-manager rows ✅ (data fix)
Project 2403 had three `project_managers` rows (Rucha + Lucia Salinas + Cesar
Hernandez) while the Users page shows a read-only list and states *"a project has one
manager."* Owner confirmed both extras were mistaken; removed by direct `DELETE`.
Re-verified: 2403 now has exactly one row, matching `project_manager_id`.

Root-cause note: the F-07 trigger only fires on an actual *change* to
`project_manager_id`, so pre-existing extras were never touched. The owner declined
building an admin management control for now, since the write path that created the
situation is already closed.

---

## 5. Suggestions and improvements

Beyond the open defects — themes worth acting on, roughly by value.

### 5.1 Close the gap between the repo and what's running 🔴

**The single most valuable change.** Seven of eleven live findings were drift, not
code: two migrations skipped mid-sequence, one stale function build, one missing
bucket. Four QA rounds against the repository found none of them, because the
repository was correct.

Concretely:
- Keep a **migration ledger** — one table row per applied migration filename, written
  as part of each script. Then "what's applied?" is a query, not an archaeology
  exercise. The skipped ones (`222200`, `222300`) sat *between* two that were applied,
  so "everything after X" reasoning would have missed them.
- Add a **schema smoke test** — a tiny admin-only page or script that asserts each
  expected view, RPC and bucket exists and reports a red/green list. Most of §2.1
  becomes a page refresh.
- Remember the **three-step deploy**: git push, run SQL, publish. All three, every time.

### 5.2 Stop swallowing query failures 🔴

L-01 was invisible for days because a failing query degraded to `—` instead of
surfacing an error. A dead view, a renamed column or a revoked grant currently look
identical to "no data yet."

Surface query errors as a toast or an inline "couldn't load" state. Distinguishing
*empty* from *broken* would have turned L-01 from a silent defect into an obvious one.

### 5.3 Make writes assert their effect 🟡

Directly from L-11. Two cheap patterns:
- Use `.select()` on mutations and assert a non-empty result wherever the caller
  depends on the write landing.
- Prefer the `SECURITY DEFINER` RPC pattern already used for the delete/sync paths —
  it raises explicit exceptions instead of silently no-op'ing.

This is the pattern that produced F-01, the worst bug in the project. Worth making
structurally impossible rather than fixing case by case.

### 5.4 Gate what you show, not just what you allow 🟡

L-05 and L-06 are the same root idea: the server is right and the UI is optimistic.
Hide create buttons behind the same predicate the server enforces (`/packing-slips`
already does), and give every admin-only route a `beforeLoad` guard. Users should
never discover a permission boundary by filling in a form.

### 5.5 Decide the fate of the two half-built features 🟡

**Upload Signed Ticket** and **Bulk Upload** both render as working controls and do
nothing. Before the owner demo, either finish them or hide them — a button that
silently does nothing costs more trust than a missing feature.

Upload Signed Ticket is now the closer of the two: the bucket exists, so what remains
is the `closed` enum value, the upload write, and the status transition.

### 5.6 Make document numbers monotonic 🟡

L-09. Numbers on paper should never be reused. A dedicated per-project sequence (or a
`deleted_at` soft delete that keeps rows reserved) removes the risk entirely.

### 5.7 Give admins a supported way to correct inventory ⚪

The ledger is append-only with no UI for corrections. The `manual_adjustment` source
type exists in the enum but nothing writes it. Every correction so far has meant
editing or deleting a source document — or direct DB access, as with L-10.

A small admin-only "adjust stock" form writing `manual_adjustment` with a mandatory
reason would give a supported path and a better audit trail than silent DB edits.

### 5.8 Keep a permanent set of QA fixtures ⚪

This round needed four separate logins arranged ad hoc, and BR-02 needed a fixture
only another role could seed. A standing set — one account per role plus a scratch
project — makes a full regression pass something you can run in an afternoon.

Consider also a dedicated staging project. Several tests here (negative stock,
delete cascades, demoting the last admin) are ones you would not want to run against
real data.

### 5.9 Add a "delete" path for test data ⚪

`notifications` has no `DELETE` grant, so QA probe rows can be marked read but never
removed without direct DB access. A small admin cleanup affordance — or simply
accepting DB-level cleanup as the documented route — avoids accumulating noise.

---

## 6. Environment limitation — why §2 exists

**Radix overlays did not open under this browser automation.** `Select`, `Popover` and
`Dialog` triggers ignored synthetic pointer events *and* keyboard (`Enter` on a focused
combobox left `aria-expanded="false"`, no portal node created). This is a limitation of
the automation surface, **not an application defect** — the same components work
normally for a human.

Where that blocked a test, I executed **the same code path the component calls**, read
from the component source, and labelled it as such. Everything else — navigation,
route guards, rendered values, button visibility, page state — was verified in the
real UI.

**PDF generation worked fine here.** A PO PDF was generated, downloaded and decoded
successfully; no PDF-related failures were observed.

---

## 7. What passed — 77 automated checks

### Inventory integrity — the highest-risk block

| Test | Result |
|---|---|
| **PS-05** save a slip 3× with no changes | on-hand held at 6; ledger stayed at **exactly 1 row** ✅ |
| PS-06 lower 6→4 / raise 4→10 | on-hand 4 then 10, via compensating rows ✅ |
| PS-08 / PS-09 `rejected` / `damaged` | quantity excluded from on-hand ✅ |
| IN-08 ledger discipline | append-only throughout; originals never mutated ✅ |
| ST-03 / **ST-04** ship, then ship twice more | on-hand → 0 and stays; **one** `-6` row ✅ |
| **ST-05** ship 10 with 6 on hand | hard block: *"Only 6.00 on hand for QA-WIDGET-1. Cannot ship 10.00 more."* ✅ |
| ST-09 shipped → ready | stock returned; ledger `[-6, +6]` ✅ |

### Status machine

| Test | Result |
|---|---|
| PO-12 `draft → received` | rejected: *"This PO has no recorded receipts yet…"* ✅ |
| PO-13 `received → draft` with receipts | rejected: *"…must stay Partially Received or Received. To correct it, edit or delete the packing slip instead."* ✅ |
| PO-14 | 6/10 → `partially_received`, 10/10 → `received` ✅ |
| PS-07 / F-11 zero all receipts | reverted to the **stored** `pre_receipt_status`, not a guess ✅ |

### Deletes

| Test | Result |
|---|---|
| PS-16 delete slip | items removed, inventory reversed, PO status recalculated ✅ |
| PO-16/17/18 delete PO **with** a slip | no FK error; slip cascaded, inventory reversed, ledger `[+5, −5]` ✅ |
| ST-13 / ST-14 | warehouse may delete `ready`, refused on `delivered` ✅ |

### BR-02 — the F-02 half-commit case ✅

Approved by Rucha, who manages source 2403 but **cannot write target 2601**:

| | Before | After |
|---|---|---|
| 2403 on-hand | 15 | **8** (−7) |
| 2601 on-hand | 0 | **7** (+7) |
| Request | pending | `fulfilled`, qty_approved 7 |

**The decisive detail:** the ledger query as Rucha returns only the `borrow_out` row on
2403 — she cannot even read the `borrow_in` row her own approval created on 2601 — yet
2601's on-hand moved. Exactly what the `SECURITY DEFINER` RPC was for. Guards held too:
approving 10 of 7 → *"Cannot approve 10 — only 7.00 was requested."*; replay →
*"This request has already been decided (fulfilled)."*; returning as the source-side
manager → refused (returns are target-side).

### Permission matrix — ~45 probes, zero incorrect results

| Role | Verified |
|---|---|
| **Engineer** | nav gating; `/users` redirects; invisible project → "not found"; ledger scoped to own project; `profiles`/`user_roles` self-only; 8/8 writes refused |
| **Warehouse** | edit guarded fields on a `received` PO rejected; **status-only** update allowed; delete of `received` PO rejected |
| **Manager** | cannot delete/edit POs, cannot touch packing slips, cannot decide a request whose source they don't manage, cannot write a ledger row into another project — but **can** create POs/tickets on their own project |
| **Admin** | **last-admin guard held**: *"Cannot remove admin from the last remaining admin"*; promote/demote with 2 admins works; exactly one role row per user; F-07 revocation correct in both directions |

### Other confirmations

F-15 (PDF shows `CREATED BY` / `ASSIGNEE` for non-admins) · F-14 (freight and totals
agree across screen, editor and PDF) · F-17 (status is read-only with an explanation)
· F-12 (borrow returns with partial tracking; ledger balances) · F-29 (`Printed On:
08/05/2026, 07:22 PM EDT`) · all 9 remediation RPCs present.

---

## 8. Test data

Sandbox project **QA01** and everything under it (PO, 2 slips, ticket, product,
supplier, 15 ledger rows) was created and fully removed in round 3. Projects remaining:
**2601, 2403** — original state.

**Still present:**

| Item | Note |
|---|---|
| PO **MKJ2403EX004**, ticket **S2403-002** | Empty QA records on 2403; neither touched inventory. Need an admin to delete. |
| 7 × `PIP-WVQJB501W` moved 2403 → 2601 | Real, correct ledger data from BR-02. To restore the original balance, a **2601-side manager / warehouse / admin** can return it — which also exercises H-16. |
| QA notification rows (`probe`, `qa_final`) | On `jbaidoo@` and one other account. Marked read; `notifications` has no `DELETE` grant, so removal needs direct DB access. |

No pre-existing record was deleted. All role and project-manager changes made during
testing were restored.

---

## 9. Recommended order

1. ~~Confirm H-01 and H-02~~ — ✅ done 2026-08-06; all P1/P2 items now closed.
2. **Run §2.4 (H-17/H-18)** — the only fix with no end-to-end verification.
3. **Work §2.2** — the daily-use forms, especially **H-06**.
4. Fix L-05 and L-06 — both small, both pure UI gating.
5. Decide on L-07's two half-built features before the demo.
6. Then §5.1 and §5.2, which are what stop this class of problem recurring.
