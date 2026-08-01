// Bordered table with a repeating header row. If a row would overflow the
// bottom margin, a new page is started and the header is redrawn.

import { MARGIN } from "./layout.ts";
import { drawLine, drawRect, drawText, ensureSpace, PdfCursor, wrapText } from "./cursor.ts";

export interface TableColumn {
  key: string;
  header: string;
  width: number; // points
  align?: "left" | "right";
}

const CELL_PADDING = 4;
const HEADER_HEIGHT = 18;

export function drawTable(
  cursor: PdfCursor,
  columns: TableColumn[],
  rows: Record<string, string>[],
  opts: { headerSize?: number; bodySize?: number } = {},
) {
  const headerSize = opts.headerSize ?? 8;
  const bodySize = opts.bodySize ?? 8.5;
  const tableWidth = columns.reduce((s, c) => s + c.width, 0);
  const lineHeight = bodySize + 3;

  function drawHeaderRow() {
    ensureSpace(cursor, HEADER_HEIGHT);
    const rowTop = cursor.y;
    drawRect(cursor, MARGIN, rowTop - HEADER_HEIGHT, tableWidth, HEADER_HEIGHT);
    let x = MARGIN;
    for (const col of columns) {
      if (x > MARGIN) drawLine(cursor, x, rowTop, x, rowTop - HEADER_HEIGHT, 0.5);
      drawText(cursor, col.header, x + CELL_PADDING, rowTop - HEADER_HEIGHT + 6, { size: headerSize, bold: true });
      x += col.width;
    }
    cursor.y = rowTop - HEADER_HEIGHT;
  }

  drawHeaderRow();
  cursor.onNewPage = drawHeaderRow;

  for (const row of rows) {
    const wrapped: Record<string, string[]> = {};
    let maxLines = 1;
    for (const col of columns) {
      const w = wrapText(cursor, row[col.key] ?? "", col.width - CELL_PADDING * 2, bodySize);
      wrapped[col.key] = w;
      maxLines = Math.max(maxLines, w.length);
    }
    const rowHeight = maxLines * lineHeight + CELL_PADDING * 2;

    ensureSpace(cursor, rowHeight);
    const rowTop = cursor.y;
    drawRect(cursor, MARGIN, rowTop - rowHeight, tableWidth, rowHeight);

    let x = MARGIN;
    for (const col of columns) {
      if (x > MARGIN) drawLine(cursor, x, rowTop, x, rowTop - rowHeight, 0.5);
      const lines = wrapped[col.key];
      lines.forEach((line, i) => {
        const lineWidth = (cursor.font).widthOfTextAtSize(line, bodySize);
        const textX = col.align === "right" ? x + col.width - CELL_PADDING - lineWidth : x + CELL_PADDING;
        drawText(cursor, line, textX, rowTop - CELL_PADDING - bodySize - i * lineHeight, { size: bodySize });
      });
      x += col.width;
    }
    cursor.y = rowTop - rowHeight;
  }

  cursor.onNewPage = undefined;
}
