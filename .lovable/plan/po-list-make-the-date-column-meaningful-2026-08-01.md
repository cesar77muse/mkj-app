# PO list: make the date column meaningful

## What's happening today

The "Delivery" column shows `purchase_orders.delivery_date`, which is the **expected** delivery date optionally typed in when the PO is created. Both existing POs (MKJ2403EX001, MKJ2403EX002) have it blank, so the column is empty. It is not connected to packing slips in any way — the receipt of slip 2403-PS-0001 on 2026-07-30 is recorded only on the packing slip record.

## Proposed change

Split the single ambiguous column into two clear ones on the Purchase Orders list:

- **Expected** — the existing `delivery_date` (shows "—" when not set).
- **Received** — the date of the most recent packing slip logged against that PO (shows "—" when nothing received yet).

The same two-value display is added to the PO detail page's Delivery card, so "Delivery date" there is labelled "Expected delivery" and a "Last received" line is added underneath.

No database changes: the received date is derived from existing packing slip rows.

## Technical notes

- `src/routes/_authenticated/purchase-orders.index.tsx`: extend the list query with a fetch of `packing_slips (po_id, received_date)` for the listed PO ids, reduce to max `received_date` per PO, and render the new column.
- `src/routes/_authenticated/purchase-orders.$id.tsx`: the `po-slips` query is already loaded; use its first row's `received_date` for the "Last received" line.
- Presentation only — no changes to receiving logic, status computation, or the PDF generator.
