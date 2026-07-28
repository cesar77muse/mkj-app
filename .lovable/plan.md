## Goal

Add a visible entry point for creating packing slips, and upgrade the receive form so it starts from a project, lets you search that project's POs, and shows an ordered-vs-received comparison table with a read-only backorder column.

## 1. "Receive Shipment" button on the Packing Slips list

`packing-slips.index.tsx` currently has a header with no actions. Add a primary button in `PageHeader actions` linking to `/packing-slips/new`. Show it only for users who can write (same role check used elsewhere — admin / warehouse manager / manager), so engineers keep read-only access. Also update the empty-state cell to include the same call to action.

## 2. Project-first flow on the form

`packing-slips.new.tsx` today jumps straight to a flat "Choose PO" dropdown of every open PO. Restructure the top of the form into two steps:

- **Project selector** — dropdown of projects the user can see (`MKJ number — name`). Pre-selected if arriving with an existing `?po=` link.
- **PO search** — a searchable combobox (shadcn `Command` inside `Popover`) listing only POs for the chosen project with status approved / executed / partially_received. Typing filters by PO number, supplier, and description. Disabled until a project is chosen; changing the project clears the PO and lines.

The existing `?po=` search param keeps working: it resolves the PO, back-fills its project, and loads the lines immediately.

## 3. Ordered vs received comparison table

Once a PO is picked, load its line items plus the sum of previously received quantities per line (this query already exists in the form). Render one row per line with:

| Column | Behavior |
|---|---|
| Part # / Description | read-only |
| Ordered | read-only |
| Previously received | read-only, cumulative across earlier slips |
| Receiving now | editable number input, defaults to remaining |
| Total received | computed = previously + now |
| Backordered | **non-editable**, computed = max(0, ordered − total received); shows an amber "Backordered" pill when > 0, otherwise a dash |
| Condition | OK / Damaged / Rejected select |

Above the table, a small summary strip: lines fully received, lines with backorder, total units receiving. Under the table, a status line stating whether this receipt will mark the PO **Received** or **Partially Received** — matching the logic that already runs on save.

Guardrails: negative entries clamp to 0; receiving more than remaining is allowed (over-shipment happens) but the row is flagged and backorder stays 0.

## 4. Unchanged behavior

Saving still generates the slip number, writes `packing_slips` + `packing_slip_items`, posts inventory adjustments, and rolls the PO status forward. No schema changes, no backend work — this is frontend only.

## Technical notes

- Files touched: `src/routes/_authenticated/packing-slips.index.tsx`, `src/routes/_authenticated/packing-slips.new.tsx`; possibly a small extracted `packing-slip-lines` component to keep the route file readable.
- PO search uses existing shadcn `command` / `popover` primitives — no new dependencies.
- Queries stay in TanStack Query, keyed by project id and PO id.
