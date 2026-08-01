// Shared layout constants for generated business documents (PO, and later
// shipping tickets). Kept generic on purpose so document-specific renderers
// (e.g. supabase/functions/po-pdf) don't each invent their own page geometry.

export const PAGE_WIDTH = 612; // US Letter, points
export const PAGE_HEIGHT = 792;
export const MARGIN = 40;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export const FOOTER_HEIGHT = 24;
export const BOTTOM_MARGIN = MARGIN + FOOTER_HEIGHT;

export const FONT_SIZE_TITLE = 20;
export const FONT_SIZE_DOC_NUMBER = 14;
export const FONT_SIZE_META = 9;
export const FONT_SIZE_LABEL = 8.5;
export const FONT_SIZE_BODY = 8.5;
export const FONT_SIZE_FOOTER = 7.5;

export const MUTED = { r: 0.35, g: 0.35, b: 0.35 };
export const BLACK = { r: 0, g: 0, b: 0 };
