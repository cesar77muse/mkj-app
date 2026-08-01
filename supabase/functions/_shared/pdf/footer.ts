// Applied once, after all page content is placed, since the total page
// count is only known at the end.

import { rgb } from "npm:pdf-lib@1.17.1";
import { FONT_SIZE_FOOTER, MARGIN, MUTED, PAGE_WIDTH } from "./layout.ts";
import { PdfCursor, sanitizeForPdf } from "./cursor.ts";

export function drawFooters(cursor: PdfCursor, printedOn: string) {
  const total = cursor.pages.length;
  cursor.pages.forEach((page, idx) => {
    const color = rgb(MUTED.r, MUTED.g, MUTED.b);
    page.drawText(sanitizeForPdf(`Page ${idx + 1} of ${total}`), {
      x: MARGIN,
      y: MARGIN - 14,
      size: FONT_SIZE_FOOTER,
      font: cursor.font,
      color,
    });
    const text = sanitizeForPdf(`Printed On: ${printedOn}`);
    const w = cursor.font.widthOfTextAtSize(text, FONT_SIZE_FOOTER);
    page.drawText(text, {
      x: PAGE_WIDTH - MARGIN - w,
      y: MARGIN - 14,
      size: FONT_SIZE_FOOTER,
      font: cursor.font,
      color,
    });
  });
}
