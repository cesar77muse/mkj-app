# Track "Entered in Procore" on Purchase Orders

## What gets added

A single checkbox on each purchase order: **Entered in Procore**. Unchecked by default when a PO is created; the warehouse manager ticks it once the PO has been entered in Procore.

Only Admins and Warehouse Managers can tick or untick it. Everyone else sees it as a read-only indicator.

## Visual cue for missed entries

A PO whose status is **Executed**, **Partially Received**, or **Received** but that is still not marked as entered in Procore is flagged as needing attention:

- **PO list** — an amber "Not in Procore" pill in a new Procore column, so the row stands out at a glance. Rows that are entered show a plain check; POs still in Draft/Approved show a neutral dash-style state with no warning.
- **PO detail page** — an amber banner under the header: "This PO is executed but has not been entered in Procore yet", with the checkbox right there to fix it.
- **Dashboard** — a card counting POs that are executed-or-later and not yet entered in Procore, linking to the PO list.

The checkbox stays toggleable in both directions (in case it is ticked by mistake), and it never blocks any existing action — it is tracking only, not a gate.

## Technical notes

- Migration: add `entered_in_procore boolean not null default false` to `public.purchase_orders`. No new grants needed (table already granted); the existing update policy plus the PO edit guard governs who can write.
  - Because writes go through the existing update policy, the toggle is additionally restricted client-side to Admin / Warehouse Manager via the existing `isWarehouseOrAdmin` helper in `src/lib/roles.ts`. If the existing `enforce_po_edit_guard` trigger blocks updates on received POs for warehouse managers, the toggle will follow the same rule and only Admins can change it at that point.
- `src/components/po-procore-checkbox.tsx` (new): small shared component — reads/writes `entered_in_procore`, optimistic toggle via `useMutation`, invalidates `["pos"]`, `["po", id]`, and the dashboard counts. Also exports a `needsProcoreEntry(status, entered)` helper.
- `src/routes/_authenticated/purchase-orders.index.tsx`: add `entered_in_procore` to the select, add a "Procore" column rendering the checkbox/pill.
- `src/routes/_authenticated/purchase-orders.$id.tsx`: add the banner and the checkbox to the Delivery/summary area of the detail page.
- `src/routes/_authenticated/dashboard.tsx`: add a count query (`status in (executed, partially_received, received) and entered_in_procore = false`) rendered as an additional stat card.
- PDF generation, receiving logic, and status transitions are untouched.
