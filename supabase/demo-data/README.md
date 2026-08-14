# Demo data for the MKJ walkthrough

Everything in this folder is **temporary, hand-run, and reversible** — it is
not a Lovable schema migration and nothing here runs automatically. It only
adds rows to the two real projects (2403, 2601); it never edits or deletes
anything real.

## What it creates

- 5 demo suppliers, 22 demo products (`DEMO-1001`…`DEMO-1022`), with an
  opening inventory balance in both projects (10–30 items, as requested).
- 6 purchase orders across both projects covering all 5 PO statuses (draft,
  approved, executed, partially received, received) — including one
  received line split into an "ok" and a "damaged" portion, to show that
  damaged goods don't count as usable stock.
- 2 packing slips (one full receipt, one partial/backordered).
- 5 shipping tickets covering draft, ready, and shipped — plus one left at
  "shipped" for you to finish to "delivered" manually (see below).
- 7 borrow requests between 2403 and 2601, one for each status: pending,
  denied, fulfilled, partially returned, returned, and two synthetic ones
  (approved, partially approved) — see the note in the SQL file on why
  those two can't be produced by a real approval and are clearly marked.

All of it is created by calling the app's own database functions
(`create_purchase_order`, `create_packing_slip`, `create_shipping_ticket`,
`sync_packing_slip_inventory`, `ship_shipping_ticket_inventory`,
`decide_borrow_request`, `return_borrowed_stock`), impersonating the real
warehouse managers/project managers pulled from your roles export — the
same functions the app's buttons call — so nothing bypasses the app's own
guardrails.

## How to run it

1. Open the Supabase SQL Editor (same place you run migrations).
2. Paste in **`seed_demo_data.sql`**, run once.
3. It's wrapped in one transaction — if anything fails, nothing is left
   half-applied.

## The one manual step (Storage can't be reached from SQL)

One shipping ticket — project 2403, "(DEMO) Job Site A", the Cat6A cable
line, currently at status **Shipped** — is left for you to mark
**Delivered** in the running app, using the placeholder proof image sent
alongside this file (`demo-shipping-ticket-proof.png`, also referenced from
the seed script's comments). This is the only way to get a real signed/
delivered example without touching a service-role key: the private
`shipping-ticket-proofs` bucket needs an actual uploaded file, which only
the browser upload flow can do.

Steps: open that ticket → **Mark Delivered** → fill in "Delivered by" /
"Received by" (anything, e.g. "Demo Walkthrough") → attach
`demo-shipping-ticket-proof.png` → save.

## Cleaning it up later

Run **`teardown_demo_data.sql`** the same way (paste into the SQL Editor,
run once). It deletes only rows matching the `(DEMO) ` / `DEMO-` markers
the seed script wrote, in the correct order, and includes a sanity-check
block at the bottom you can run afterward to confirm nothing was left
behind.

**After teardown**, two things the SQL script can't reach:
- The placeholder image you uploaded to the `shipping-ticket-proofs`
  bucket for the manual step above — delete
  `<ticket-id>/proof.<ext>` from that bucket in the Supabase Storage tab.
  Harmless if left behind (the bucket is private and nothing in the app
  links to it once the ticket row is gone), but easy to remove if you want
  it fully gone.
- Cached PDFs: `purchase_order_pdfs` / `shipping_ticket_pdfs` rows and
  their Storage objects are cascade-deleted automatically with the PO/
  ticket rows, so no action needed there.

## If you need to re-run the seed

The script isn't safe to run twice in a row (unlike your schema
migrations) — it would create duplicate demo POs/tickets. If a run fails
partway or you want to regenerate it, run `teardown_demo_data.sql` first,
then run `seed_demo_data.sql` again.
