// Renders a Shipping Ticket to PDF. Mirrors supabase/functions/po-pdf/
// exactly (see that function's comments for the full rationale) — same two
// modes, same cache-by-content-hash strategy, same signed-URL handoff, same
// shared _shared/pdf/ drawing primitives.
//
//   { ticket_id } — persisted ticket. Reads run through a caller-scoped
//                   Supabase client, so can_see_project RLS on
//                   shipping_tickets gates the whole request. Regenerates
//                   only when the content hash no longer matches.
//   { draft }     — an unsaved ticket from the "New Shipping Ticket" screen.
//                   Nothing persisted; rendered bytes returned directly.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { renderShippingTicketPdf, type ShippingTicketPdfData, type ShippingTicketPdfLineItem } from "./render.ts";
import { computeContentHash } from "./hash.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PDF_BUCKET = "shipping-ticket-pdfs";
const ASSETS_BUCKET = "app-assets";
const LOGO_PATH = "logo/mkj-logo.jpg";
const SIGNED_URL_TTL_SECONDS = 120;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York" });
}

function formatPrintedOn(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

async function loadLogoBytes(serviceClient: SupabaseClient): Promise<Uint8Array | null> {
  const { data, error } = await serviceClient.storage.from(ASSETS_BUCKET).download(LOGO_PATH);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

interface RawItem {
  description: string;
  qty_shipped: number;
  qty_backordered: number;
  products: { part_number: string } | null;
}

function toLineItems(items: RawItem[]): ShippingTicketPdfLineItem[] {
  return items.map((it) => ({
    partNumber: it.products?.part_number ?? null,
    description: it.description,
    qtyShipped: Number(it.qty_shipped),
    qtyBackordered: Number(it.qty_backordered),
  }));
}

// deno-lint-ignore no-explicit-any
function buildPdfData(t: any, items: RawItem[]): Omit<ShippingTicketPdfData, "logoBytes" | "printedOn"> {
  return {
    ticketNumber: t.ticket_number,
    dateCreated: formatDate(t.created_at),
    deliverToName: t.deliver_to_name,
    deliverToAddress: t.deliver_to_address,
    contactName: t.contact_name,
    contactPhone: t.contact_phone,
    jobNumber: `MKJ${t.project_number}EX`,
    shipBy: t.ship_by,
    contractNumber: t.projects?.contract_number ?? null,
    items: toLineItems(items),
  };
}

// deno-lint-ignore no-explicit-any
function hashableFields(t: any, items: RawItem[]) {
  return {
    ticket_number: t.ticket_number,
    project_number: t.project_number,
    created_at: t.created_at,
    deliver_to_name: t.deliver_to_name,
    deliver_to_address: t.deliver_to_address,
    contact_name: t.contact_name,
    contact_phone: t.contact_phone,
    ship_by: t.ship_by,
    // Contract number is read live from the project (not snapshotted), so it
    // must be in the hash: if it changes, the cached PDF should invalidate.
    contract_number: t.projects?.contract_number ?? null,
    items: items.map((it) => ({
      part_number: it.products?.part_number ?? null,
      description: it.description,
      qty_shipped: it.qty_shipped,
      qty_backordered: it.qty_backordered,
    })),
  };
}

interface DraftLine {
  part_number?: string | null;
  description: string;
  qty_shipped: number;
  qty_backordered: number;
}

interface DraftPayload {
  jobNumber?: string | null;
  contractNumber?: string | null;
  deliverToName?: string | null;
  deliverToAddress?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  shipBy?: string | null;
  items: DraftLine[];
}

function buildPdfDataFromDraft(draft: DraftPayload): Omit<ShippingTicketPdfData, "logoBytes" | "printedOn"> {
  return {
    ticketNumber: "DRAFT — not yet created",
    dateCreated: formatDate(new Date().toISOString()),
    deliverToName: draft.deliverToName ?? null,
    deliverToAddress: draft.deliverToAddress ?? null,
    contactName: draft.contactName ?? null,
    contactPhone: draft.contactPhone ?? null,
    jobNumber: draft.jobNumber ?? "",
    shipBy: draft.shipBy ?? null,
    contractNumber: draft.contractNumber ?? null,
    items: (draft.items ?? []).map((l) => ({
      partNumber: l.part_number ?? null,
      description: l.description,
      qtyShipped: Number(l.qty_shipped),
      qtyBackordered: Number(l.qty_backordered),
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));

    if (body?.draft) {
      const pdfData = buildPdfDataFromDraft(body.draft as DraftPayload);
      const logoBytes = await loadLogoBytes(serviceClient);
      const bytes = await renderShippingTicketPdf({
        ...pdfData,
        logoBytes,
        printedOn: formatPrintedOn(new Date()),
      });
      return new Response(bytes, { headers: { ...corsHeaders, "Content-Type": "application/pdf" } });
    }

    const ticketId = body?.ticket_id;
    if (typeof ticketId !== "string" || !UUID_RE.test(ticketId)) {
      return json({ error: "ticket_id is required" }, 400);
    }

    const { data: ticket, error: tErr } = await callerClient
      .from("shipping_tickets")
      .select("*, projects:project_id(contract_number)")
      .eq("id", ticketId)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!ticket) return json({ error: "Not found" }, 404); // RLS-filtered rows land here too — same response either way.

    const { data: items, error: itemsErr } = await callerClient
      .from("shipping_ticket_items")
      .select("description, qty_shipped, qty_backordered, products:product_id(part_number)")
      .eq("ticket_id", ticketId)
      .order("id");
    if (itemsErr) throw itemsErr;

    const contentHash = await computeContentHash(hashableFields(ticket, items ?? []));

    const { data: cached } = await callerClient
      .from("shipping_ticket_pdfs")
      .select("storage_path, content_hash")
      .eq("ticket_id", ticketId)
      .maybeSingle();

    const storagePath = cached?.storage_path ?? `${ticketId}.pdf`;

    if (!cached || cached.content_hash !== contentHash) {
      const pdfData = buildPdfData(ticket, items ?? []);
      const logoBytes = await loadLogoBytes(serviceClient);
      const bytes = await renderShippingTicketPdf({
        ...pdfData,
        logoBytes,
        printedOn: formatPrintedOn(new Date()),
      });

      const { error: uploadErr } = await serviceClient.storage
        .from(PDF_BUCKET)
        .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
      if (uploadErr) throw uploadErr;

      const {
        data: { user },
      } = await callerClient.auth.getUser();

      const { error: upsertErr } = await serviceClient.from("shipping_ticket_pdfs").upsert({
        ticket_id: ticketId,
        storage_path: storagePath,
        content_hash: contentHash,
        generated_at: new Date().toISOString(),
        generated_by: user?.id ?? null,
      });
      if (upsertErr) throw upsertErr;
    }

    const { data: signed, error: signErr } = await serviceClient.storage
      .from(PDF_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (signErr) throw signErr;

    return json({ url: signed.signedUrl }, 200);
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
