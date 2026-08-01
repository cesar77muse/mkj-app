// Bordered label/value grid, e.g.:
//   BILL TO:            ...          SHIP TO:            ...
//   STATUS:             Approved     EXECUTED:           Yes
// Rows can be a two-column pair or a single full-width label+paragraph
// (used for Description / Terms & Conditions).

import { CONTENT_WIDTH, FONT_SIZE_BODY, FONT_SIZE_LABEL, MARGIN } from "./layout.ts";
import { drawLine, drawText, ensureSpace, PdfCursor, wrapText } from "./cursor.ts";

export interface KeyValueField {
  label: string;
  value: string;
}

export type GridRow =
  | { type: "pair"; left: KeyValueField; right: KeyValueField }
  | { type: "full"; label: string; value: string };

const LABEL_WIDTH = 108;
const CELL_PADDING = 4;
const LINE_HEIGHT = FONT_SIZE_BODY + 2.5;

function fieldLines(cursor: PdfCursor, field: KeyValueField, valueWidth: number): string[] {
  return wrapText(cursor, field.value || "", valueWidth, FONT_SIZE_BODY);
}

export function drawKeyValueGrid(cursor: PdfCursor, rows: GridRow[]) {
  const rightX = MARGIN + CONTENT_WIDTH;
  const halfWidth = CONTENT_WIDTH / 2;

  for (const row of rows) {
    let lines: string[][];
    let rowHeight: number;

    if (row.type === "pair") {
      const leftValueWidth = halfWidth - LABEL_WIDTH - CELL_PADDING * 2;
      const rightValueWidth = halfWidth - LABEL_WIDTH - CELL_PADDING * 2;
      const leftLines = fieldLines(cursor, row.left, leftValueWidth);
      const rightLines = row.right.label ? fieldLines(cursor, row.right, rightValueWidth) : [];
      const maxLines = Math.max(leftLines.length, rightLines.length, 1);
      rowHeight = maxLines * LINE_HEIGHT + CELL_PADDING * 2;
      lines = [leftLines, rightLines];
    } else {
      const valueWidth = CONTENT_WIDTH - CELL_PADDING * 2;
      const valueLines = wrapText(cursor, row.value || "", valueWidth, FONT_SIZE_BODY);
      rowHeight = LINE_HEIGHT + valueLines.length * LINE_HEIGHT + CELL_PADDING * 2;
      lines = [valueLines];
    }

    ensureSpace(cursor, rowHeight);
    const rowTop = cursor.y;

    if (row.type === "pair") {
      const midX = MARGIN + halfWidth;
      drawText(cursor, row.left.label, MARGIN + CELL_PADDING, rowTop - CELL_PADDING - FONT_SIZE_LABEL, {
        size: FONT_SIZE_LABEL,
        bold: true,
      });
      lines[0].forEach((line, i) =>
        drawText(cursor, line, MARGIN + LABEL_WIDTH, rowTop - CELL_PADDING - FONT_SIZE_LABEL - i * LINE_HEIGHT, {
          size: FONT_SIZE_BODY,
        }),
      );
      if (row.right.label) {
        drawText(cursor, row.right.label, midX + CELL_PADDING, rowTop - CELL_PADDING - FONT_SIZE_LABEL, {
          size: FONT_SIZE_LABEL,
          bold: true,
        });
        lines[1].forEach((line, i) =>
          drawText(cursor, line, midX + LABEL_WIDTH, rowTop - CELL_PADDING - FONT_SIZE_LABEL - i * LINE_HEIGHT, {
            size: FONT_SIZE_BODY,
          }),
        );
      }
      drawLine(cursor, midX, rowTop, midX, rowTop - rowHeight, 0.5);
    } else {
      drawText(cursor, row.label, MARGIN + CELL_PADDING, rowTop - CELL_PADDING - FONT_SIZE_LABEL, {
        size: FONT_SIZE_LABEL,
        bold: true,
      });
      lines[0].forEach((line, i) =>
        drawText(
          cursor,
          line,
          MARGIN + CELL_PADDING,
          rowTop - CELL_PADDING - FONT_SIZE_LABEL - LINE_HEIGHT - i * LINE_HEIGHT,
          { size: FONT_SIZE_BODY },
        ),
      );
    }

    drawLine(cursor, MARGIN, rowTop, rightX, rowTop, 0.5);
    cursor.y = rowTop - rowHeight;
  }
  drawLine(cursor, MARGIN, cursor.y, rightX, cursor.y, 0.5);
  cursor.y -= 12;
}
