// Supabase Storage over the REST API with the service-role key — no new SDK
// dependency, works in both the Next.js server runtime and the worker. Adapted
// from worker/storage.ts and generalised to take a bucket + add the signed-URL
// primitives Firm Knowledge needs.
//
// The `firm-knowledge` bucket is PRIVATE: documents never get a public URL.
// Uploads go BROWSER → Storage directly via a short-lived signed upload URL
// (the Vercel function only brokers the URL, never streams bytes — respects the
// 4.5 MB function-body cap). The parse worker downloads with the service key.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. When unset (local dev without
// storage), every call returns null so callers degrade gracefully.

export const FIRM_KNOWLEDGE_BUCKET = "firm-knowledge";

export function isStorageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function env() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { base: url.replace(/\/$/, ""), key };
}

const bucketsEnsured = new Set<string>();

/** Create a bucket once per process if missing. Best-effort — a 400/409 "already
 *  exists" is success; any other failure is logged and the caller proceeds. */
export async function ensureBucket(bucket: string, isPublic: boolean): Promise<void> {
  if (bucketsEnsured.has(bucket)) return;
  const { base, key } = env();
  try {
    const res = await fetch(`${base}/storage/v1/bucket`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ id: bucket, name: bucket, public: isPublic }),
    });
    if (!res.ok && res.status !== 400 && res.status !== 409) {
      console.warn(`[storage] ensureBucket ${bucket} returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.warn(`[storage] ensureBucket ${bucket} failed:`, err);
  }
  bucketsEnsured.add(bucket);
}

export type SignedUpload = {
  /** Full URL the browser PUTs the file bytes to. Token is embedded; no auth header needed. */
  uploadUrl: string;
  /** The object path inside the bucket (what we persist as KnowledgeItem.storagePath). */
  path: string;
};

/**
 * Mint a short-lived signed upload URL for `<bucket>/<objectPath>`. The browser
 * then PUTs the file bytes straight to Storage — the bytes never pass through the
 * Vercel function. Returns null if storage isn't configured or the sign fails.
 */
export async function createSignedUploadUrl(
  bucket: string,
  objectPath: string,
): Promise<SignedUpload | null> {
  if (!isStorageConfigured()) return null;
  await ensureBucket(bucket, /* public */ false);
  const { base, key } = env();
  try {
    const res = await fetch(`${base}/storage/v1/object/upload/sign/${bucket}/${objectPath}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" },
    });
    if (!res.ok) {
      console.warn(`[storage] sign upload ${objectPath} failed ${res.status}: ${await res.text()}`);
      return null;
    }
    // Response: { url: "/object/upload/sign/<bucket>/<path>?token=..." }
    const data = (await res.json()) as { url?: string };
    if (!data.url) return null;
    return { uploadUrl: `${base}/storage/v1${data.url}`, path: objectPath };
  } catch (err) {
    console.warn(`[storage] sign upload ${objectPath} threw:`, err);
    return null;
  }
}

/**
 * Mint a short-lived signed DOWNLOAD URL for a private object (UI click-out to the
 * original file). Returns null if storage isn't configured or the sign fails.
 */
export async function createSignedDownloadUrl(
  bucket: string,
  objectPath: string,
  expiresInSeconds = 300,
): Promise<string | null> {
  if (!isStorageConfigured()) return null;
  const { base, key } = env();
  try {
    const res = await fetch(`${base}/storage/v1/object/sign/${bucket}/${objectPath}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    });
    if (!res.ok) {
      console.warn(`[storage] sign download ${objectPath} failed ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { signedURL?: string };
    if (!data.signedURL) return null;
    return `${base}/storage/v1${data.signedURL}`;
  } catch (err) {
    console.warn(`[storage] sign download ${objectPath} threw:`, err);
    return null;
  }
}

/**
 * Download an object's raw bytes with the service-role key (parse worker path).
 * Returns null if storage isn't configured or the object can't be read.
 */
export async function downloadBytes(bucket: string, objectPath: string): Promise<Buffer | null> {
  if (!isStorageConfigured()) return null;
  const { base, key } = env();
  try {
    const res = await fetch(`${base}/storage/v1/object/${bucket}/${objectPath}`, {
      headers: { Authorization: `Bearer ${key}`, apikey: key },
    });
    if (!res.ok) {
      console.warn(`[storage] download ${objectPath} failed ${res.status}`);
      return null;
    }
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.warn(`[storage] download ${objectPath} threw:`, err);
    return null;
  }
}

/** Delete an object (best-effort cleanup, e.g. an abandoned/rejected upload). */
export async function deleteObject(bucket: string, objectPath: string): Promise<void> {
  if (!isStorageConfigured()) return;
  const { base, key } = env();
  try {
    await fetch(`${base}/storage/v1/object/${bucket}/${objectPath}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}`, apikey: key },
    });
  } catch (err) {
    console.warn(`[storage] delete ${objectPath} threw:`, err);
  }
}
