import { supabase } from "@/integrations/supabase/client";

const BUCKET = "packing-slip-attachments";

/** Uploads a scanned vendor slip for a packing slip and records its path on the row. */
export async function uploadPackingSlipAttachment(slipId: string, file: File): Promise<void> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${slipId}/attachment.${ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (upErr) throw upErr;
  const { error: updErr } = await supabase.from("packing_slips").update({ attachment_url: path }).eq("id", slipId);
  if (updErr) throw updErr;
}

/** Signed URL (5 min) to view/download a packing slip's attachment. Private bucket, so this can't be a stored public link. */
export async function getPackingSlipAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}
