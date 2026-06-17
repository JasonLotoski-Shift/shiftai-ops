// Supabase Storage uploads for the worker — over the REST API with the service-role
// key, so no new SDK dependency and the worker stays plain Node. Big blobs (the
// prototype HTML + round screenshots) live here; only their public URLs go in Postgres.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional PROTOTYPE_STORAGE_BUCKET
// (default "prototypes"). When the env is unset (e.g. local dev-run) uploads are
// skipped and callers store null URLs — persistence must never block the build loop.
import fs from "node:fs";

const BUCKET = process.env.PROTOTYPE_STORAGE_BUCKET || "prototypes";

export function isStorageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function env() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { base: url.replace(/\/$/, ""), key };
}

let bucketEnsured = false;

// Create the bucket (public) once per process if it doesn't exist. Best-effort:
// a 400/409 "already exists" is success; any other failure is logged and uploads
// are attempted anyway (the bucket may exist but listing be denied).
async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  const { base, key } = env();
  try {
    const res = await fetch(`${base}/storage/v1/bucket`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
    });
    if (!res.ok && res.status !== 400 && res.status !== 409) {
      console.warn(`[storage] ensureBucket ${BUCKET} returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.warn(`[storage] ensureBucket ${BUCKET} failed:`, err);
  }
  bucketEnsured = true;
}

function publicUrl(objectPath: string): string {
  const { base } = env();
  return `${base}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

/**
 * Upload raw bytes to `<bucket>/<objectPath>` and return the public URL, or null
 * if storage isn't configured or the upload fails. Never throws — the build loop
 * must survive a storage hiccup.
 */
export async function uploadBytes(
  objectPath: string,
  bytes: Buffer | Uint8Array,
  contentType: string,
): Promise<string | null> {
  if (!isStorageConfigured()) return null;
  await ensureBucket();
  const { base, key } = env();
  try {
    const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${objectPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "content-type": contentType,
        "x-upsert": "true", // idempotent: re-running a round overwrites cleanly
      },
      body: bytes as unknown as BodyInit,
    });
    if (!res.ok) {
      console.warn(`[storage] upload ${objectPath} failed ${res.status}: ${await res.text()}`);
      return null;
    }
    return publicUrl(objectPath);
  } catch (err) {
    console.warn(`[storage] upload ${objectPath} threw:`, err);
    return null;
  }
}

/** Upload a file from disk (reads it, infers nothing — pass the contentType). */
export async function uploadFileAt(
  objectPath: string,
  filePath: string,
  contentType: string,
): Promise<string | null> {
  if (!isStorageConfigured()) return null;
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(filePath);
  } catch (err) {
    console.warn(`[storage] could not read ${filePath}:`, err);
    return null;
  }
  return uploadBytes(objectPath, bytes, contentType);
}
