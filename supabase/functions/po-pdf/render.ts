import {
  createCursor,
  drawDocumentHeader,
  drawKeyValueGrid,
  drawTable,
  drawSignatureBlock,
  drawFooters,
  drawLine,
  drawText,
  drawTextRightAligned,
  ensureSpace,
  finish,
  MARGIN,
  CONTENT_WIDTH,
  type GridRow,
  type TableColumn,
} from "../_shared/pdf/index.ts";

export interface PoPdfLineItem {
  lineNo: number;
  budgetCode: string | null;
  description: string;
  qty: number;
  unit: string;
  unitCost: number;
}

export interface PoPdfData {
  poNumber: string;
  status: string;
  executed: boolean;
  projectLine1: string;
  projectLine2?: string | null;
  dateCreated: string;
  billTo: string | null;
  shipTo: string | null;
  supplierName: string | null;
  supplierAddress: string | null;
  supplierPhone: string | null;
  createdByName: string | null;
  assigneeName: string | null;
  paymentTerms: string | null;
  shipVia: string | null;
  deliveryDate: string | null;
  description: string | null;
  termsConditions: string | null;
  additionalFreight: number;
  items: PoPdfLineItem[];
  printedOn: string;
  logoBytes?: Uint8Array | null;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export async function renderPurchaseOrderPdf(data: PoPdfData): Promise<Uint8Array> {
  const cursor = await createCursor();

  await drawDocumentHeader(cursor, {
    logoBytes: data.logoBytes,
    logoMime: "image/jpeg",
    title: "Purchase Order",
    documentNumber: data.poNumber,
    metaLines: [data.projectLine1, ...(data.projectLine2 ? [data.projectLine2] : [])],
  });

  const supplierBlock = [
    data.supplierName,
    data.supplierAddress,
    data.supplierPhone ? `Phone: ${data.supplierPhone}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const headerRows: GridRow[] = [
    { type: "pair", left: { label: "DATE CREATED:", value: data.dateCreated }, right: { label: "", value: "" } },
    {
      type: "pair",
      left: { label: "BILL TO:", value: data.billTo ?? "" },
      right: { label: "SHIP TO:", value: data.shipTo ?? "" },
    },
    {
      type: "pair",
      left: { label: "CONTRACT COMPANY:", value: supplierBlock },
      right: { label: "CREATED BY:", value: data.createdByName ?? "" },
    },
    {
      type: "pair",
      left: { label: "STATUS:", value: statusLabel(data.status) },
      right: { label: "EXECUTED:", value: data.executed ? "Yes" : "No" },
    },
    {
      type: "pair",
      left: { label: "PAYMENT TERMS:", value: data.paymentTerms ?? "" },
      right: { label: "ASSIGNEE:", value: data.assigneeName ?? "" },
    },
    {
      type: "pair",
      left: { label: "SHIP VIA:", value: data.shipVia ?? "" },
      right: { label: "DELIVERY DATE:", value: data.deliveryDate ?? "" },
    },
  ];
  drawKeyValueGrid(cursor, headerRows);

  if (data.description) {
    drawKeyValueGrid(cursor, [{ type: "full", label: "DESCRIPTION:", value: data.description }]);
  }
  if (data.termsConditions) {
    drawKeyValueGrid(cursor, [{ type: "full", label: "TERMS & CONDITIONS:", value: data.termsConditions }]);
  }

  cursor.y -= 4;

  const columns: TableColumn[] = [
    { key: "no", header: "#", width: 22 },
    { key: "budgetCode", header: "Budget Code", width: 90 },
    { key: "description", header: "Description", width: 216 },
    { key: "qty", header: "Qty", width: 40, align: "right" },
    { key: "unit", header: "Units", width: 34 },
    { key: "unitCost", header: "Unit Cost", width: 60, align: "right" },
    { key: "amount", header: "Amount", width: 70, align: "right" },
  ];
  const tableRows = data.items.map((it) => ({
    no: String(it.lineNo),
    budgetCode: it.budgetCode ?? "",
    description: it.description,
    qty: String(it.qty),
    unit: it.unit,
    unitCost: money(it.unitCost),
    amount: money(it.qty * it.unitCost),
  }));
  drawTable(cursor, columns, tableRows);

  const grandTotal = data.items.reduce((s, it) => s + it.qty * it.unitCost, 0) + (data.additionalFreight || 0);
  ensureSpace(cursor, 24);
  const totalsTop = cursor.y;
  drawLine(cursor, MARGIN, totalsTop, MARGIN + CONTENT_WIDTH, totalsTop, 0.5);
  drawText(cursor, `Additional Freight: ${money(data.additionalFreight || 0)}`, MARGIN + 4, totalsTop - 14, {
    size: 9,
    bold: true,
  });
  drawTextRightAligned(cursor, `Grand Total: ${money(grandTotal)}`, MARGIN + CONTENT_WIDTH - 4, totalsTop - 14, {
    size: 9,
    bold: true,
  });
  cursor.y = totalsTop - 24;

  drawSignatureBlock(cursor, 2);

  drawFooters(cursor, data.printedOn);

  return await finish(cursor);
}
