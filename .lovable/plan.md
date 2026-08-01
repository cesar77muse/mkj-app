# Shipping Tickets: split date into Delivery date and Created date

## What changes

In the Shipping Tickets list, replace the single "Date" column with two columns:

- **Delivery date** — the ship date entered on the ticket form.
- **Created date** — the timestamp recorded when the ticket was saved.

Sorting stays newest delivery date first, matching current behavior.

## Technical details

- File: `src/routes/_authenticated/shipping-tickets.index.tsx`
- Add `created_at` to the existing select (already present on the `shipping_tickets` table, auto-set on insert — no database change needed).
- Table header: `Ticket # | Project | Deliver to | Delivery date | Created date | Status | actions` (colSpan on the empty state goes from 6 to 7).
- Render `ship_date` in the delivery column and `created_at` formatted as a short date in the created column.

No backend, schema, or form changes.
