import { jsPDF } from "jspdf";

export type POPdfLine = {
  line_no: number;
  budget_code?: string | null;
  description: string;
  qty: number;
  unit: string;
  unit_cost: number;
};

export type POPdfData = {
  po_number: string;
  project_mkj?: string | null;
  project_name?: string | null;
  supplier_name?: string | null;
  supplier_address?: string | null;
  bill_to?: string | null;
  ship_to?: string | null;
  delivery_date?: string | null;
  ship_via?: string | null;
  payment_terms?: string | null;
  description?: string | null;
  status?: string | null;
  additional_freight?: number | null;
  lines: POPdfLine[];
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export function buildPOPdf(po: POPdfData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const M = 42;
  const W = doc.internal.pageSize.getWidth();
  let y = M;

  doc.setFont("helvetica", "bold").setFontSize(18);
  doc.text("MKJ COMMUNICATIONS", M, y);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text("Systems Integration", M, y + 13);

  doc.setFont("helvetica", "bold").setFontSize(15);
  doc.text("PURCHASE ORDER", W - M, y, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text(po.po_number, W - M, y + 15, { align: "right" });
  if (po.status) doc.text(`Status: ${po.status.replace(/_/g, " ")}`, W - M, y + 28, { align: "right" });

  y += 44;
  doc.setDrawColor(180).line(M, y, W - M, y);
  y += 18;

  doc.setFontSize(9).setFont("helvetica", "bold");
  doc.text("PROJECT", M, y);
  doc.text("SUPPLIER", W / 2, y);
  doc.setFont("helvetica", "normal");
  const projectText = [po.project_mkj, po.project_name].filter(Boolean).join(" — ") || "—";
  doc.text(doc.splitTextToSize(projectText, W / 2 - M - 12), M, y + 13);
  const supplierText = [po.supplier_name ?? "—", po.supplier_address ?? ""].filter(Boolean).join("\n");
  doc.text(doc.splitTextToSize(supplierText, W / 2 - M - 12), W / 2, y + 13);

  y += 62;
  doc.setFont("helvetica", "bold");
  doc.text("BILL TO", M, y);
  doc.text("SHIP TO", W / 2, y);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(po.bill_to || "—", W / 2 - M - 12), M, y + 13);
  doc.text(doc.splitTextToSize(po.ship_to || "—", W / 2 - M - 12), W / 2, y + 13);

  y += 66;
  doc.setFont("helvetica", "bold");
  doc.text("DELIVERY DATE", M, y);
  doc.text("SHIP VIA", M + 160, y);
  doc.text("PAYMENT TERMS", M + 320, y);
  doc.setFont("helvetica", "normal");
  doc.text(po.delivery_date || "—", M, y + 13);
  doc.text(po.ship_via || "—", M + 160, y + 13);
  doc.text(po.payment_terms || "—", M + 320, y + 13);
  y += 30;

  if (po.description) {
    doc.setFont("helvetica", "bold").text("NOTES", M, y);
    doc.setFont("helvetica", "normal");
    const notes = doc.splitTextToSize(po.description, W - 2 * M);
    doc.text(notes, M, y + 13);
    y += 13 + notes.length * 12 + 8;
  }

  // Table
  const cols = [
    { x: M, w: 22, label: "#", align: "left" as const },
    { x: M + 22, w: 80, label: "Budget code", align: "left" as const },
    { x: M + 102, w: 210, label: "Description", align: "left" as const },
    { x: M + 312, w: 46, label: "Qty", align: "right" as const },
    { x: M + 358, w: 40, label: "Unit", align: "left" as const },
    { x: M + 398, w: 62, label: "Unit cost", align: "right" as const },
    { x: M + 460, w: 68, label: "Amount", align: "right" as const },
  ];
  const cellX = (i: number) => (cols[i].align === "right" ? cols[i].x + cols[i].w - 4 : cols[i].x + 2);

  const header = () => {
    doc.setFillColor(238, 238, 238).rect(M, y, W - 2 * M, 20, "F");
    doc.setFont("helvetica", "bold").setFontSize(9);
    cols.forEach((c, i) => doc.text(c.label, cellX(i), y + 14, { align: c.align }));
    y += 20;
    doc.setFont("helvetica", "normal");
  };
  header();

  let subtotal = 0;
  for (const l of po.lines) {
    const amount = Number(l.qty) * Number(l.unit_cost);
    subtotal += amount;
    const desc = doc.splitTextToSize(l.description || "", cols[2].w - 6);
    const h = Math.max(18, desc.length * 11 + 7);
    if (y + h > doc.internal.pageSize.getHeight() - 70) {
      doc.addPage();
      y = M;
      header();
    }
    const values = [
      String(l.line_no),
      l.budget_code || "",
      "",
      String(Number(l.qty)),
      l.unit || "",
      money(Number(l.unit_cost)),
      money(amount),
    ];
    values.forEach((v, i) => {
      if (i === 2) return;
      doc.text(v, cellX(i), y + 12, { align: cols[i].align });
    });
    doc.text(desc, cellX(2), y + 12);
    doc.setDrawColor(225).line(M, y + h, W - M, y + h);
    y += h;
  }

  const freight = Number(po.additional_freight ?? 0);
  y += 12;
  const rightLabel = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(label, W - M - 120, y, { align: "right" });
    doc.text(value, W - M, y, { align: "right" });
    y += 15;
  };
  rightLabel("Subtotal", money(subtotal));
  if (freight) rightLabel("Additional freight", money(freight));
  rightLabel("Grand total", money(subtotal + freight), true);

  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120);
  doc.text(
    `Generated ${new Date().toLocaleString("en-US")} — MKJ Operations`,
    M,
    doc.internal.pageSize.getHeight() - 28,
  );

  return doc;
}

export function openPOPdf(po: POPdfData) {
  const doc = buildPOPdf(po);
  const url = doc.output("bloburl");
  window.open(url as unknown as string, "_blank");
}

export function poPdfDataUrl(po: POPdfData) {
  return buildPOPdf(po).output("datauristring");
}
