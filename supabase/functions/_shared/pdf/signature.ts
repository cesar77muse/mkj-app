import { CONTENT_WIDTH, MARGIN } from "./layout.ts";
import { drawLine, drawText, ensureSpace, PdfCursor } from "./cursor.ts";

/** Draws `groups` side-by-side SIGNATURE / DATE line pairs. */
export function drawSignatureBlock(cursor: PdfCursor, groups: number) {
  ensureSpace(cursor, 55);
  cursor.y -= 25;
  const lineY = cursor.y;
  const groupWidth = CONTENT_WIDTH / groups;

  for (let i = 0; i < groups; i++) {
    const gx = MARGIN + i * groupWidth + (i > 0 ? 20 : 0);
    const groupUsableWidth = groupWidth - (i > 0 ? 20 : 0) - 10;
    const sigLineEnd = gx + groupUsableWidth * 0.55;
    const dateLineStart = sigLineEnd + 15;
    const dateLineEnd = gx + groupUsableWidth;

    drawLine(cursor, gx, lineY, sigLineEnd, lineY);
    drawLine(cursor, dateLineStart, lineY, dateLineEnd, lineY);
    drawText(cursor, "SIGNATURE", gx, lineY - 11, { size: 7.5, bold: true });
    drawText(cursor, "DATE", dateLineStart, lineY - 11, { size: 7.5, bold: true });
  }

  cursor.y = lineY - 24;
}
