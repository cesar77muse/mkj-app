import {
  createCursor,
  drawDocumentHeader,
  drawKeyValueGrid,
  drawTable,
  drawFooters,
  drawLine,
  drawText,
  ensureSpace,
  finish,
  MARGIN,
  CONTENT_WIDTH,
  type GridRow,
  type TableColumn,
  type PdfCursor,
} from "../_shared/pdf/index.ts";

export interface ShippingTicketPdfLineItem {
  partNumber: string | null;
  description: string;
  qtyShipped: number;
  qtyBackordered: number;
}

export interface ShippingTicketPdfData {
  ticketNumber: string;
  dateCreated: string;
  deliverToName: string | null;
  deliverToAddress: string | null;
  contactName: string | null;
  contactPhone: string | null;
  jobNumber: string;
  shipBy: string | null;
  contractNumber: string | null;
  items: ShippingTicketPdfLineItem[];
  printedOn: string;
  logoBytes?: Uint8Array | null;
}

/** Draws one "Label: ____________" line for the proof-of-delivery block; the line is left blank — filled in by hand on the printed/scanned copy. */
function drawFillLine(cursor: PdfCursor, label: string, x: number, y: number, lineWidth: number) {
  const labelSize = 8.5;
  drawText(cursor, label, x, y, { size: labelSize, bold: true });
  const labelWidth = 90;
  drawLine(cursor, x + labelWidth, y - 2, x + labelWidth + lineWidth, y - 2, 0.75);
}

export async function renderShippingTicketPdf(data: ShippingTicketPdfData): Promise<Uint8Array> {
  const cursor = await createCursor();

  const deliverToBlock = [
    data.deliverToName,
    data.deliverToAddress,
    data.contactName ? `Contact - ${data.contactName}` : null,
    data.contactPhone,
  ]
    .filter(Boolean)
    .join("\n");

  await drawDocumentHeader(cursor, {
    logoBytes: data.logoBytes,
    logoMime: "image/jpeg",
    title: "Ship Ticket",
    documentNumber: data.ticketNumber,
    metaLines: [],
  });

  const rows: GridRow[] = [
    { type: "pair", left: { label: "DATE:", value: data.dateCreated }, right: { label: "", value: "" } },
    { type: "full", label: "DELIVER TO:", value: deliverToBlock },
    {
      type: "pair",
      left: { label: "MKJ JOB NUMBER:", value: data.jobNumber },
      right: { label: "PROJECT:", value: data.jobNumber },
    },
    {
      type: "pair",
      left: { label: "SHIP BY:", value: data.shipBy ?? "" },
      right: { label: "CONTRACT NUMBER:", value: data.contractNumber ?? "" },
    },
  ];
  drawKeyValueGrid(cursor, rows);
  cursor.y -= 4;

  const columns: TableColumn[] = [
    { key: "partNumber", header: "Part number", width: 130 },
    { key: "description", header: "Description", width: 262 },
    { key: "qtyShipped", header: "Shipped", width: 70, align: "right" },
    { key: "qtyBackordered", header: "Backordered", width: 70, align: "right" },
  ];
  const tableRows = data.items.map((it) => ({
    partNumber: it.partNumber ?? "",
    description: it.description,
    qtyShipped: String(it.qtyShipped),
    qtyBackordered: String(it.qtyBackordered),
  }));
  drawTable(cursor, columns, tableRows);
  cursor.y -= 20;

  // Proof-of-delivery block: intentionally blank fill-in lines — these are
  // captured by hand on delivery, not through the app (see also the planned
  // future "attach signed/scanned ticket" feature).
  ensureSpace(cursor, 90);
  const halfWidth = CONTENT_WIDTH / 2;
  drawFillLine(cursor, "Delivered by:", MARGIN, cursor.y, halfWidth - 100);
  cursor.y -= 26;
  drawFillLine(cursor, "Received by:", MARGIN, cursor.y, halfWidth - 160);
  drawText(cursor, "Pass #", MARGIN + halfWidth - 60, cursor.y, { size: 8.5, bold: true });
  drawLine(cursor, MARGIN + halfWidth - 20, cursor.y - 2, MARGIN + CONTENT_WIDTH, cursor.y - 2, 0.75);
  cursor.y -= 26;
  drawFillLine(cursor, "Print name:", MARGIN, cursor.y, halfWidth - 100);
  cursor.y -= 26;
  drawFillLine(cursor, "Date:", MARGIN, cursor.y, halfWidth - 100);
  cursor.y -= 20;

  drawFooters(cursor, data.printedOn);

  return await finish(cursor);
}
