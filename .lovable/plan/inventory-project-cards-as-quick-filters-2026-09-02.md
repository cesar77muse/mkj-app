# Inventory Project Cards as Quick Filters

## Goal
Change the project cards on the Inventory page from navigation links into quick filters. Tapping a card should narrow the inventory table below to that project. Provide a clear way to clear the filter and return to the full inventory list.

## Scope
Frontend only. The inventory data is already fetched in full and filtered client-side, so no backend or database changes are required.

## Changes

1. **State management**
   - Add `selectedProjectId: string | null` state to `src/routes/_authenticated/inventory.tsx`.

2. **Card interaction**
   - Replace the `Link` wrapper around each project card with a clickable `Card` (or button-style div) that sets `selectedProjectId`.
   - Apply visual active state when a card is selected (e.g., ring or border color change).

3. **Table filtering**
   - Filter the existing `filtered` rows further by `selectedProjectId` when one is active.
   - Keep the text search working together with the project filter.

4. **Clear filter**
   - Add a "Clear filter" / "Show all projects" chip or small button near the cards when `selectedProjectId` is set.
   - Clicking it resets `selectedProjectId` to `null` and restores the full inventory table.

## Affected file
- `src/routes/_authenticated/inventory.tsx`

## Not in scope
- No database migrations, new endpoints, or RLS changes.
- No changes to the project detail page.
