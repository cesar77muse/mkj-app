// Minimal drawing cursor on top of pdf-lib: tracks the current page and
// vertical write position, and adds a new page automatically when content
// would run past the bottom margin. Document-specific renderers build on
// this instead of talking to pdf-lib directly.

import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";
import { BOTTOM_MARGIN, MARGIN, PAGE_HEIGHT, PAGE_WIDTH } from "./layout.ts";

export interface PdfCursor {
  doc: PDFDocument;
  pages: PDFPage[];
  page: PDFPage;
  y: number;
  font: PDFFont;
  fontBold: PDFFont;
  /** Called after a new page is added, e.g. to redraw a repeating table header. */
  onNewPage?: (cursor: PdfCursor) => void;
}

export async function createCursor(): Promise<PdfCursor> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const cursor: PdfCursor = { doc, pages: [], page: undefined as unknown as PDFPage, y: 0, font, fontBold };
  addPage(cursor);
  return cursor;
}

export function addPage(cursor: PdfCursor) {
  const page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  cursor.pages.push(page);
  cursor.page = page;
  cursor.y = PAGE_HEIGHT - MARGIN;
  cursor.onNewPage?.(cursor);
}

/** Starts a new page if `height` more points won't fit above the bottom margin. */
export function ensureSpace(cursor: PdfCursor, height: number) {
  if (cursor.y - height < BOTTOM_MARGIN) addPage(cursor);
}

// pdf-lib's standard fonts (Helvetica etc.) use WinAnsi encoding, which can't
// represent characters like the narrow no-break space (U+202F) that
// Intl.DateTimeFormat/toLocaleString insert before AM/PM in modern JS
// engines, or smart quotes/em dashes that show up in pasted free text.
// Normalize those to their closest WinAnsi-safe equivalent before they ever
// reach pdf-lib, rather than special-casing each source of the text.
const PDF_TEXT_REPLACEMENTS: [RegExp, string][] = [
  [/[‘’‚‛]/g, "'"],
  [/[“”„‟]/g, '"'],
  [/[–—]/g, "-"],
  [/…/g, "..."],
  [/[     ]/g, " "],
  [/•/g, "-"],
];

export function sanitizeForPdf(text: string): string {
  let out = text ?? "";
  for (const [pattern, replacement] of PDF_TEXT_REPLACEMENTS) out = out.replace(pattern, replacement);
  return out;
}

export function textWidth(cursor: PdfCursor, text: string, size: number, bold = false): number {
  return (bold ? cursor.fontBold : cursor.font).widthOfTextAtSize(sanitizeForPdf(text), size);
}

export function drawText(
  cursor: PdfCursor,
  text: string,
  x: number,
  y: number,
  opts: { size?: number; bold?: boolean; color?: { r: number; g: number; b: number } } = {},
) {
  const clean = sanitizeForPdf(text);
  if (!clean) return;
  cursor.page.drawText(clean, {
    x,
    y,
    size: opts.size ?? FONT_SIZE_DEFAULT,
    font: opts.bold ? cursor.fontBold : cursor.font,
    color: rgb(opts.color?.r ?? 0, opts.color?.g ?? 0, opts.color?.b ?? 0),
  });
}
const FONT_SIZE_DEFAULT = 9;

export function drawTextRightAligned(
  cursor: PdfCursor,
  text: string,
  rightX: number,
  y: number,
  opts: { size?: number; bold?: boolean; color?: { r: number; g: number; b: number } } = {},
) {
  const size = opts.size ?? FONT_SIZE_DEFAULT;
  const w = textWidth(cursor, text, size, opts.bold);
  drawText(cursor, text, rightX - w, y, opts);
}

export function drawLine(cursor: PdfCursor, x1: number, y1: number, x2: number, y2: number, thickness = 0.75) {
  cursor.page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: rgb(0, 0, 0) });
}

export function drawRect(
  cursor: PdfCursor,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: { borderWidth?: number } = {},
) {
  cursor.page.drawRectangle({
    x,
    y,
    width,
    height,
    borderWidth: opts.borderWidth ?? 0.75,
    borderColor: rgb(0, 0, 0),
  });
}

/** Greedy word-wrap to fit `maxWidth` points at the given font size. */
export function wrapText(cursor: PdfCursor, text: string, maxWidth: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  for (const rawLine of (text || "").split("\n")) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && textWidth(cursor, candidate, size, bold) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

export async function finish(cursor: PdfCursor): Promise<Uint8Array> {
  return await cursor.doc.save();
}
