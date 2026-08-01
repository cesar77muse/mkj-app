# Purchase Order status lifecycle cleanup

## Status meanings (final)

- **Draft** — PO is being written. Default on creation. Manual.
- **Approved** — stakeholders agreed with the PO content and it was sent to the supplier. Manual only.
- **Executed** — the PO was paid by the finance team. Manual only.
- **Partially Received** — packing slips logged, some ordered quantity still outstanding. Automatic.
- **Received** — all ordered quantity covered by packing slips. Automatic. Final state.

Nothing in the app will ever set Approved or Executed automatically.

## Changes

### 1. Remove the `closed` status
`closed` is unreachable in the UI but still exists in the database. Remove it so Received / Partially Received are the only end states.

### 2. Receiving guard
A packing slip can only be recorded against a PO that is **Executed**, **Partially Received**, or **Received**. Draft and Approved POs simply don't appear in the PO picker on the new-packing-slip form — no explanatory note. Receiving never changes a PO to Approved or Executed — it only sets Partially Received or Received.

### 3. Revert to pre-receipt status when receipts are removed
Store the PO's status from just before its first packing slip. When the last packing slip on a PO is deleted (or all received quantities are edited down to zero), the PO returns to that stored status (e.g. back to Executed) instead of staying stuck on Received.

Deleting a packing slip currently does not recompute the PO status at all — it will now do so, the same way editing a slip already does.

## Technical notes

- Migration: drop `closed` from the `po_status` enum (rebuild the enum type, no rows currently use it — verified), and add a nullable `pre_receipt_status po_status` column to `purchase_orders`.
- `src/lib/receiving.ts` — `refreshPoStatus()` becomes the single source of truth: recompute received vs ordered across all slips; if no receipts remain, restore `pre_receipt_status` (fallback `executed`) and clear it; on the first receipt, save the current status into `pre_receipt_status` before overwriting.
- `src/routes/_authenticated/packing-slips.new.tsx` — call `refreshPoStatus()` instead of writing the PO status inline; filter the PO list to `executed`, `partially_received`, `received`.
- Packing slip delete path — call `refreshPoStatus()` after deletion.
- `src/components/po-status-badge.tsx` — no visual changes; `PO_STATUS_OPTIONS` already omits `closed`.
- Edit/delete permission rules (warehouse manager blocked once `received`, admin always allowed) stay unchanged.
