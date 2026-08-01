import { supabase } from "@/integrations/supabase/client";

export type DraftTicketLine = {
  part_number?: string | null;
  description: string;
  qty_shipped: number;
  qty_backordered: number;
};

export type DraftTicketPdfInput = {
  jobNumber?: string | null;
  contractNumber?: string | null;
  deliverToName?: string | null;
  deliverToAddress?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  shipBy?: string | null;
  items: DraftTicketLine[];
};

/**
 * Opens the (cached or freshly generated) PDF for a saved shipping ticket in
 * a new tab. See src/lib/po-pdf.ts's openPurchaseOrderPdf for why the tab is
 * opened blank synchronously before the await — same popup-blocker reasoning
 * applies here.
 */
export async function openShippingTicketPdf(ticketId: string): Promise<void> {
  const newTab = window.open("", "_blank");
  try {
    const { data, error } = await supabase.functions.invoke<{ url: string }>("shipping-ticket-pdf", {
      body: { ticket_id: ticketId },
    });
    if (error) throw error;
    if (!data?.url) throw new Error("PDF service returned no URL");
    if (newTab) {
      newTab.location.href = data.url;
    } else {
      window.open(data.url, "_blank");
    }
  } catch (err) {
    newTab?.close();
    throw err;
  }
}

function functionsUrl(name: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  return `${base}/functions/v1/${name}`;
}

function publishableKey(): string {
  return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
}

/**
 * Renders a PDF preview of an unsaved ticket and opens it in a new tab.
 * Nothing is persisted — used by the "New Shipping Ticket" screen before a
 * ticket_id exists. Direct fetch rather than supabase.functions.invoke so we
 * control the response as a Blob for the application/pdf content type.
 */
export async function previewDraftShippingTicketPdf(draft: DraftTicketPdfInput): Promise<void> {
  const newTab = window.open("", "_blank");
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("Not signed in");

    const res = await fetch(functionsUrl("shipping-ticket-pdf"), {
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
    if (newTab) {
      newTab.location.href = url;
    } else {
      window.open(url, "_blank");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    newTab?.close();
    throw err;
  }
}
