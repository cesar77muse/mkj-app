// Renders a Purchase Order to PDF.
//
// Two modes, one request body:
//   { po_id }  — persisted PO. Reads run through a caller-scoped Supabase
//                client, so the existing `can_see_project` RLS policy on
//                purchase_orders is what decides whether this call is
//                allowed at all. If the cached PDF's content hash still
//                matches the PO's current data, no regeneration happens —
//                we just mint a fresh short-lived signed URL for the
//                existing storage object. Otherwise we re-render, overwrite
//                the stored object, and update the cache row (all via the
//                service_role client, since clients never write storage or
//                purchase_order_pdfs directly).
//   { draft }  — an unsaved PO from the "New Purchase Order" screen. Nothing
//                is persisted; the rendered bytes are returned directly.
//
// Shared drawing primitives live in supabase/functions/_shared/pdf/ so a
// future shipping-ticket-pdf function can reuse them.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { renderPurchaseOrderPdf, type PoPdfData, type PoPdfLineItem } from "./render.ts";
import { computeContentHash } from "./hash.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PDF_BUCKET = "purchase-order-pdfs";
const ASSETS_BUCKET = "app-assets";
const LOGO_PATH = "logo/mkj-logo.jpg";
const SIGNED_URL_TTL_SECONDS = 120;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXECUTED_STATUSES = new Set(["executed", "partially_received", "received", "closed"]);

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
  line_no: number;
  budget_code: string | null;
  description: string;
  qty: number;
  unit: string;
  unit_cost: number;
}

function toLineItems(items: RawItem[]): PoPdfLineItem[] {
  return items.map((it) => ({
    lineNo: it.line_no,
    budgetCode: it.budget_code,
    description: it.description,
    qty: Number(it.qty),
    unit: it.unit,
    unitCost: Number(it.unit_cost),
  }));
}

// deno-lint-ignore no-explicit-any
function buildPdfData(po: any, items: RawItem[], profilesById: Record<string, string>): Omit<PoPdfData, "logoBytes" | "printedOn"> {
  return {
    poNumber: po.po_number,
    status: po.status,
    executed: EXECUTED_STATUSES.has(po.status),
    projectLine1: `${po.projects?.mkj_number ?? po.project_number} — ${po.projects?.name ?? ""}`,
    projectLine2: po.projects?.description ?? null,
    dateCreated: formatDate(po.created_at),
    billTo: po.bill_to,
    shipTo: po.ship_to,
    supplierName: po.suppliers?.name ?? null,
    supplierAddress: po.suppliers?.address ?? null,
    supplierPhone: po.suppliers?.phone ?? null,
    createdByName: po.created_by ? profilesById[po.created_by] ?? null : null,
    assigneeName: po.assignee ? profilesById[po.assignee] ?? null : null,
    paymentTerms: po.payment_terms,
    shipVia: po.ship_via,
    deliveryDate: po.delivery_date,
    description: po.description,
    termsConditions: po.terms_conditions,
    additionalFreight: Number(po.additional_freight ?? 0),
    items: toLineItems(items),
  };
}

// deno-lint-ignore no-explicit-any
function hashableFields(po: any, items: RawItem[]) {
  return {
    po_number: po.po_number,
    status: po.status,
    project: { mkj_number: po.projects?.mkj_number, name: po.projects?.name, description: po.projects?.description },
    created_at: po.created_at,
    bill_to: po.bill_to,
    ship_to: po.ship_to,
    supplier: { name: po.suppliers?.name, address: po.suppliers?.address, phone: po.suppliers?.phone },
    created_by: po.created_by,
    assignee: po.assignee,
    payment_terms: po.payment_terms,
    ship_via: po.ship_via,
    delivery_date: po.delivery_date,
    description: po.description,
    terms_conditions: po.terms_conditions,
    additional_freight: po.additional_freight,
    items: items.map((it) => ({
      line_no: it.line_no,
      budget_code: it.budget_code,
      description: it.description,
      qty: it.qty,
      unit: it.unit,
      unit_cost: it.unit_cost,
    })),
  };
}

interface DraftLine {
  line_no: number;
  budget_code?: string | null;
  description: string;
  qty: number;
  unit: string;
  unit_cost: number;
}

interface DraftPayload {
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
  items: DraftLine[];
}

async function buildPdfDataFromDraft(
  draft: DraftPayload,
  callerClient: SupabaseClient,
): Promise<Omit<PoPdfData, "logoBytes" | "printedOn">> {
  const {
    data: { user },
  } = await callerClient.auth.getUser();

  let createdByName: string | null = null;
  if (user) {
    const { data: profile } = await callerClient.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    createdByName = profile?.full_name ?? null;
  }

  return {
    poNumber: "DRAFT — not yet created",
    status: "draft",
    executed: false,
    projectLine1: draft.projectLine1 ?? "",
    projectLine2: draft.projectLine2 ?? null,
    dateCreated: formatDate(new Date().toISOString()),
    billTo: draft.billTo ?? null,
    shipTo: draft.shipTo ?? null,
    supplierName: draft.supplierName ?? null,
    supplierAddress: draft.supplierAddress ?? null,
    supplierPhone: draft.supplierPhone ?? null,
    createdByName,
    assigneeName: null,
    paymentTerms: draft.paymentTerms ?? null,
    shipVia: draft.shipVia ?? null,
    deliveryDate: draft.deliveryDate ?? null,
    description: draft.description ?? null,
    termsConditions: null,
    additionalFreight: Number(draft.additionalFreight ?? 0),
    items: toLineItems(
      (draft.items ?? []).map((l) => ({
        line_no: l.line_no,
        budget_code: l.budget_code ?? null,
        description: l.description,
        qty: l.qty,
        unit: l.unit,
        unit_cost: l.unit_cost,
      })),
    ),
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
      const pdfData = await buildPdfDataFromDraft(body.draft as DraftPayload, callerClient);
      const logoBytes = await loadLogoBytes(serviceClient);
      const bytes = await renderPurchaseOrderPdf({
        ...pdfData,
        logoBytes,
        printedOn: formatPrintedOn(new Date()),
      });
      return new Response(bytes, { headers: { ...corsHeaders, "Content-Type": "application/pdf" } });
    }

    const poId = body?.po_id;
    if (typeof poId !== "string" || !UUID_RE.test(poId)) {
      return json({ error: "po_id is required" }, 400);
    }

    const { data: po, error: poErr } = await callerClient
      .from("purchase_orders")
      .select("*, projects:project_id(mkj_number, name, description), suppliers:supplier_id(name, address, phone)")
      .eq("id", poId)
      .maybeSingle();
    if (poErr) throw poErr;
    if (!po) return json({ error: "Not found" }, 404); // RLS-filtered rows land here too — same response either way.

    const { data: items, error: itemsErr } = await callerClient
      .from("purchase_order_items")
      .select("line_no, budget_code, description, qty, unit, unit_cost")
      .eq("po_id", poId)
      .order("line_no");
    if (itemsErr) throw itemsErr;

    const userIds = [po.created_by, po.assignee].filter((id): id is string => Boolean(id));
    let profilesById: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await callerClient.from("profiles").select("id, full_name").in("id", userIds);
      profilesById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name ?? ""]));
    }

    const contentHash = await computeContentHash(hashableFields(po, items ?? []));

    const { data: cached } = await callerClient
      .from("purchase_order_pdfs")
      .select("storage_path, content_hash")
      .eq("po_id", poId)
      .maybeSingle();

    const storagePath = cached?.storage_path ?? `${poId}.pdf`;

    if (!cached || cached.content_hash !== contentHash) {
      const pdfData = buildPdfData(po, items ?? [], profilesById);
      const logoBytes = await loadLogoBytes(serviceClient);
      const bytes = await renderPurchaseOrderPdf({
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

      const { error: upsertErr } = await serviceClient.from("purchase_order_pdfs").upsert({
        po_id: poId,
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
