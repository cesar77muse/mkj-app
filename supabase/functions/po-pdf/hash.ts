/** SHA-256 hex digest of the JSON-serialized value, used to detect whether a PO's PDF-relevant data has changed since it was last rendered. */
export async function computeContentHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
