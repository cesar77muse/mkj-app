#!/usr/bin/env bash
# ============================================================
# MKJ OPS APP — STORAGE CLEANUP (companion to reset_to_clean_slate.sql)
# ============================================================
# Empties the four data buckets and leaves app-assets alone, so the
# mkj-logo.jpg that the po-pdf / shipping-ticket-pdf edge functions draw
# on their letterhead survives.
#
# This exists as a separate script because Postgres refuses the job:
# storage.protect_delete() rejects any direct DELETE on storage.objects
# ("Use the Storage API instead") specifically so the S3 blobs behind the
# rows don't get orphaned. So the deletes have to go through the API.
#
# Usage — the key is read from the environment, never passed as an
# argument (arguments leak into shell history and `ps`):
#
#   export SUPABASE_SERVICE_ROLE_KEY='...'   # Dashboard > Settings > API
#   ./supabase/maintenance/reset_storage.sh
#
# Unset the variable afterwards. The service role key bypasses RLS
# entirely — never commit it or put it in .env files that ship to Vercel.
# ============================================================

set -euo pipefail

SUPABASE_URL="${SUPABASE_URL:-https://ujajblobqudgmdcterwe.supabase.co}"
KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [[ -z "$KEY" ]]; then
  echo "error: SUPABASE_SERVICE_ROLE_KEY is not set." >&2
  echo "  export SUPABASE_SERVICE_ROLE_KEY='...'   # Dashboard > Settings > API" >&2
  exit 1
fi
command -v jq >/dev/null || { echo "error: jq is required (brew install jq)." >&2; exit 1; }

# app-assets is deliberately absent from this list.
BUCKETS=(
  purchase-order-pdfs
  shipping-ticket-pdfs
  shipping-ticket-proofs
  packing-slip-attachments
)

# Lists object paths under $2 in bucket $1. Entries with a null id are
# folders, not objects — shipping-ticket-proofs stores its files one level
# down as "<ticket-id>/proof.<ext>" — so recurse into those.
list_paths() {
  local bucket="$1" prefix="$2" name id
  local body
  body=$(jq -nc --arg p "$prefix" '{prefix:$p, limit:1000, offset:0}')

  while IFS=$'\t' read -r name id; do
    [[ -z "$name" ]] && continue
    if [[ "$id" == "null" ]]; then
      list_paths "$bucket" "${prefix:+$prefix/}$name"
    else
      printf '%s\n' "${prefix:+$prefix/}$name"
    fi
  done < <(
    curl -sS -X POST "$SUPABASE_URL/storage/v1/object/list/$bucket" \
      -H "Authorization: Bearer $KEY" \
      -H "Content-Type: application/json" \
      -d "$body" \
    | jq -r '.[]? | [.name, (.id | tostring)] | @tsv' 2>/dev/null \
      || true
  )
}

total=0
for bucket in "${BUCKETS[@]}"; do
  # Not `mapfile` — macOS still ships bash 3.2, which doesn't have it.
  paths=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && paths+=("$line")
  done < <(list_paths "$bucket" "")

  if [[ ${#paths[@]} -eq 0 ]]; then
    echo "$bucket: already empty"
    continue
  fi

  payload=$(printf '%s\n' "${paths[@]}" | jq -R . | jq -sc '{prefixes: .}')
  curl -sS -X DELETE "$SUPABASE_URL/storage/v1/object/$bucket" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d "$payload" >/dev/null

  echo "$bucket: deleted ${#paths[@]}"
  total=$(( total + ${#paths[@]} ))
done

echo "---"
echo "deleted $total object(s); app-assets left untouched"
