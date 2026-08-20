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
  /** Serial numbers picked for this line. Empty/absent for non-serialized parts. */
  serials?: string[] | null;
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
  deliveredBy?: string | null;
  receivedBy?: string | null;
  passNumber?: string | null;
  receivedDate?: string | null;
}

/**
 * Draws one "Label: ____________" line for the proof-of-delivery block. If a
 * captured value is given, it's printed where the line would be (the ticket
 * went through the app's "Mark delivered" flow, which requires a photo/scan
 * of the physically-signed copy — captured separately as an attachment, not
 * embedded here). Otherwise the line stays blank, same as before, for
 * tickets delivered before this capture existed.
 */
function drawFillLine(cursor: PdfCursor, label: string, value: string | null | undefined, x: number, y: number, lineWidth: number) {
  const labelSize = 8.5;
  drawText(cursor, label, x, y, { size: labelSize, bold: true });
  const labelWidth = 90;
  if (value) {
    drawText(cursor, value, x + labelWidth, y, { size: labelSize });
  } else {
    drawLine(cursor, x + labelWidth, y - 2, x + labelWidth + lineWidth, y - 2, 0.75);
  }
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
  // Serials ride along under the description rather than in a column of
  // their own: a line can carry a dozen of them, and drawTable already
  // wraps on "\n" and grows the row to fit.
  const tableRows = data.items.map((it) => ({
    partNumber: it.partNumber ?? "",
    description: (it.serials ?? []).length > 0
      ? `${it.description}\nS/N: ${(it.serials ?? []).join(", ")}`
      : it.description,
    qtyShipped: String(it.qtyShipped),
    qtyBackordered: String(it.qtyBackordered),
  }));
  drawTable(cursor, columns, tableRows);
  cursor.y -= 20;

  // Proof-of-delivery block: prints captured values once "Mark delivered"
  // has recorded them, otherwise falls back to blank fill-in lines exactly
  // as before (for tickets delivered before this capture existed).
  ensureSpace(cursor, 90);
  const halfWidth = CONTENT_WIDTH / 2;
  drawFillLine(cursor, "Delivered by:", data.deliveredBy, MARGIN, cursor.y, halfWidth - 100);
  cursor.y -= 26;
  drawFillLine(cursor, "Received by:", data.receivedBy, MARGIN, cursor.y, halfWidth - 160);
  drawText(cursor, "Pass #", MARGIN + halfWidth - 60, cursor.y, { size: 8.5, bold: true });
  if (data.passNumber) {
    drawText(cursor, data.passNumber, MARGIN + halfWidth - 20, cursor.y, { size: 8.5 });
  } else {
    drawLine(cursor, MARGIN + halfWidth - 20, cursor.y - 2, MARGIN + CONTENT_WIDTH, cursor.y - 2, 0.75);
  }
  cursor.y -= 26;
  drawFillLine(cursor, "Print name:", data.receivedBy, MARGIN, cursor.y, halfWidth - 100);
  cursor.y -= 26;
  drawFillLine(cursor, "Date:", data.receivedDate, MARGIN, cursor.y, halfWidth - 100);
  cursor.y -= 20;

  drawFooters(cursor, data.printedOn);

  return await finish(cursor);
}
