import { supabase } from "@/integrations/supabase/client";

export type DraftPoLine = {
  line_no: number;
  budget_code?: string | null;
  description: string;
  qty: number;
  unit: string;
  unit_cost: number;
};

export type DraftPoPdfInput = {
  projectLine1?: string | null;
  projectLine2?: string | null;
  supplierName?: string | null;
  supplierAddress?: string | null;
  supplierPhone?: string | null;
  billTo?: string | null;
  shipTo?: string | null;
  deliveryDate?: string | null;
  shipVia?: string | null;
  paymentTerms?: string | null;
  description?: string | null;
  additionalFreight?: number;
  items: DraftPoLine[];
};

/** Opens the (cached or freshly generated) PDF for a saved PO in a new tab. */
export async function openPurchaseOrderPdf(poId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ url: string }>("po-pdf", {
    body: { po_id: poId },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("PDF service returned no URL");
  window.open(data.url, "_blank", "noopener,noreferrer");
}

function functionsUrl(name: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  return `${base}/functions/v1/${name}`;
}

function publishableKey(): string {
  return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
}

/**
 * Renders a PDF preview of an unsaved PO and opens it in a new tab. Nothing
 * is persisted — used by the "New Purchase Order" screen before a po_id
 * exists. Uses a direct fetch (rather than supabase.functions.invoke) so we
 * control the response as a Blob regardless of how the SDK would otherwise
 * branch on the application/pdf content type.
 */
export async function previewDraftPurchaseOrderPdf(draft: DraftPoPdfInput): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");

  const res = await fetch(functionsUrl("po-pdf"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: publishableKey(),
    },
    body: JSON.stringify({ draft }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `PDF preview failed (${res.status})`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
