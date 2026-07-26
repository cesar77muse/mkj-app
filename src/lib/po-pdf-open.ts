import { supabase } from "@/integrations/supabase/client";
import type { POPdfData } from "@/lib/po-pdf";

export async function openPOPdfById(id: string, win?: Window | null) {
  const [{ data: po }, { data: items }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("*, projects:project_id(mkj_number, name), suppliers:supplier_id(name, address)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("purchase_order_items").select("*").eq("po_id", id).order("line_no"),
  ]);
  if (!po) {
    win?.close();
    throw new Error("Purchase order not found");
  }

  const data: POPdfData = {
    po_number: po.po_number,
    project_mkj: po.projects?.mkj_number ?? null,
    project_name: po.projects?.name ?? null,
    supplier_name: po.suppliers?.name ?? null,
    supplier_address: po.suppliers?.address ?? null,
    bill_to: po.bill_to,
    ship_to: po.ship_to,
    delivery_date: po.delivery_date,
    ship_via: po.ship_via,
    payment_terms: po.payment_terms,
    description: po.description,
    status: po.status,
    additional_freight: po.additional_freight,
    lines: (items ?? []).map((l) => ({
      line_no: l.line_no,
      budget_code: l.budget_code,
      description: l.description,
      qty: Number(l.qty),
      unit: l.unit,
      unit_cost: Number(l.unit_cost),
    })),
  };

  const { openPOPdf } = await import("@/lib/po-pdf");
  openPOPdf(data, win);
}
