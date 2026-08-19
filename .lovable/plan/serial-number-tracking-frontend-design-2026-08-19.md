# Serial Number Tracking — Frontend Design

Adds optional serial-number capture to receiving, and surfaces serials in Inventory and Shipping Tickets. Frontend only; the backend (columns, tables, RPCs, RLS) is being handled in a separate session — this plan defines the shapes the UI expects.

## How it works for users

1. A product is marked **Serialized** in the Products section (a checkbox). Only serialized parts prompt for serials.
2. When recording a packing slip, a serialized line expands into one input per received unit. Serials stay **optional** — a slip can be saved with some or all blank, with a soft amber "3 of 5 serials missing" hint, never a hard block.
3. Non-serialized parts (cable, bulk hardware) show no serial UI at all.
4. Inventory rows for serialized parts get a count badge and expand to list the serials on hand for that project.
5. On a shipping ticket, a serialized line lets the user pick specific serials from that project's on-hand stock, limited to the shipped quantity. Picked serials print on the ticket PDF.

## Screens and changes

### Products (`products.tsx`)
- "Serialized" checkbox in the create/edit product form.
- "Serialized" indicator (small badge) in the product table.

### New packing slip (`packing-slips.new.tsx`) and edit dialog (`packing-slip-edit-dialog.tsx`)
- New shared component `src/components/serial-number-inputs.tsx`:
  - Props: `qty`, `values: string[]`, `onChange`, `disabled`.
  - Renders a numbered grid of inputs (1..qty), auto-advances focus on Enter/Tab so a barcode scanner can run straight through.
  - Grows/shrinks when the received qty changes; typed values are preserved.
  - "Paste list" secondary action that splits a pasted block on newlines/commas into the boxes.
  - Inline duplicate detection within the line (highlight repeated values).
- Serialized lines get a chevron toggle that expands the serial grid under the row; a summary chip shows "4/5 serials".
- Non-serialized lines render unchanged.

### Packing slip detail (`packing-slips.$id.tsx`)
- Serialized rows expand to a read-only list of captured serials; blank slots shown as "— not recorded".

### Inventory (`inventory.tsx`)
- Rows for serialized parts get an expand chevron and a "N serials" badge.
- Expanded panel lists serials on hand with status (in stock / shipped-out is filtered out) and a small filter box for long lists.
- Existing search bar also matches serial numbers, expanding matching rows automatically.

### Shipping tickets (`shipping-tickets.new.tsx`, `shipping-ticket-edit-dialog.tsx`)
- Serialized lines show a "Select serials" control opening a picker listing available serials for that project/product with checkboxes and a filter box.
- Selection is capped at the line's shipped qty; a chip row shows the selected serials with quick removal.
- Validation is soft: warn on save when a serialized line has fewer serials selected than shipped qty, but allow saving.

### Shipping ticket detail + PDF (`shipping-tickets.$id.tsx`, `src/lib/shipping-ticket-pdf.ts`)
- Detail table shows serials under each line.
- Ticket PDF renders serials beneath the line description (edge-function render change coordinated with the backend session; the frontend just passes/reads the field).

## Technical notes

Expected data shapes the UI will read (backend session owns the actual schema):

```text
products.is_serialized: boolean
packing_slip_items -> serials: { id, serial: string }[]   (0..qty_received)
v_project_inventory serial list: { serial, product_id, project_id, status }
shipping_ticket_items -> serials: { id, serial }[]
```

- All serial UI is gated on `product.is_serialized`; if the flag is absent the UI behaves exactly as today, so this ships safely before the backend lands.
- Serial reads/writes go through the existing `supabase` client with the same React Query keys already in use (`ps-items`, `inventory`, `ticket-items`), so cache invalidation needs no new plumbing.
- Roles unchanged: warehouse manager/admin can enter and edit serials wherever they can already edit the parent record; engineers see read-only.
- New files: `src/components/serial-number-inputs.tsx`, `src/components/serial-picker-dialog.tsx`.
