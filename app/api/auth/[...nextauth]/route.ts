// Auth.js v5 route handler — exposes /api/auth/* endpoints.
// Wrapped with diagnostic logging while we hunt a prod AccessDenied
// that fires before our signIn callback runs. Strip once root cause fixed.

import type { NextRequest } from "next/server";
import { handlers } from "@/auth";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  console.error("[route GET]", url.pathname + url.search);
  console.error("[route GET] cookies:", request.cookies.getAll().map((c) => c.name).join(",") || "(none)");
  console.error("[route GET] host:", request.headers.get("host"));
  console.error("[route GET] x-forwarded-host:", request.headers.get("x-forwarded-host"));
  console.error("[route GET] x-forwarded-proto:", request.headers.get("x-forwarded-proto"));
  try {
    return await handlers.GET(request);
  } catch (err) {
    console.error("[route GET] EXCEPTION", err);
    throw err;
  }
}

export async function POST(request: NextRequest) {
  const url = request.nextUrl;
  console.error("[route POST]", url.pathname + url.search);
  console.error("[route POST] cookies:", request.cookies.getAll().map((c) => c.name).join(",") || "(none)");
  console.error("[route POST] host:", request.headers.get("host"));
  console.error("[route POST] x-forwarded-host:", request.headers.get("x-forwarded-host"));
  try {
    return await handlers.POST(request);
  } catch (err) {
    console.error("[route POST] EXCEPTION", err);
    throw err;
  }
}
