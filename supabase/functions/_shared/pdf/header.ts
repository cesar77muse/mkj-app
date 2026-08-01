// Document header: optional logo top-left, document title + number and a
// few right-aligned meta lines (e.g. project) top-right, then a rule.

import { CONTENT_WIDTH, FONT_SIZE_DOC_NUMBER, FONT_SIZE_META, FONT_SIZE_TITLE, MARGIN } from "./layout.ts";
import { drawLine, drawText, drawTextRightAligned, ensureSpace, PdfCursor } from "./cursor.ts";

export interface DocumentHeaderOptions {
  logoBytes?: Uint8Array | null;
  logoMime?: "image/jpeg" | "image/png";
  title: string; // e.g. "Purchase Order"
  documentNumber: string; // e.g. "MKJ2403EX255"
  metaLines?: string[]; // e.g. ["Project: EX-24030 — 37 Elevators Forte", "Various Stations"]
}

export async function drawDocumentHeader(cursor: PdfCursor, opts: DocumentHeaderOptions) {
  ensureSpace(cursor, 90);
  const rightX = MARGIN + CONTENT_WIDTH;
  const topY = cursor.y;
  let logoBottom = topY;

  if (opts.logoBytes) {
    try {
      const image =
        opts.logoMime === "image/png"
          ? await cursor.doc.embedPng(opts.logoBytes)
          : await cursor.doc.embedJpg(opts.logoBytes);
      const maxW = 130;
      const maxH = 48;
      const scale = Math.min(maxW / image.width, maxH / image.height, 1);
      const w = image.width * scale;
      const h = image.height * scale;
      cursor.page.drawImage(image, { x: MARGIN, y: topY - h, width: w, height: h });
      logoBottom = topY - h;
    } catch {
      // Malformed/unreadable logo asset: fall through and render the header without it.
    }
  }

  let y = topY - 4;
  drawTextRightAligned(cursor, opts.title, rightX, y - FONT_SIZE_TITLE, { size: FONT_SIZE_TITLE, bold: true });
  y -= FONT_SIZE_TITLE + 6;
  drawTextRightAligned(cursor, opts.documentNumber, rightX, y - FONT_SIZE_DOC_NUMBER, {
    size: FONT_SIZE_DOC_NUMBER,
    bold: true,
  });
  y -= FONT_SIZE_DOC_NUMBER + 8;

  for (const line of opts.metaLines ?? []) {
    drawTextRightAligned(cursor, line, rightX, y - FONT_SIZE_META, { size: FONT_SIZE_META });
    y -= FONT_SIZE_META + 4;
  }

  cursor.y = Math.min(logoBottom, y) - 10;
  drawLine(cursor, MARGIN, cursor.y, rightX, cursor.y, 1.25);
  cursor.y -= 14;
}
