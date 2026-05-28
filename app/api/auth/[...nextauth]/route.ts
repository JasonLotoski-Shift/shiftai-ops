// Auth.js v5 route handler — exposes /api/auth/* endpoints
// (signin / callback / csrf / session / signout).
//
// Wrapped with diagnostic logging while we hunt a prod AccessDenied
// that fires before our signIn callback runs. Strip the wrappers once
// the root cause is fixed.

import type { NextRequest } from "next/server";
import { handlers } from "@/auth";

export async function GET(request: NextRequest) {
  console.error("[route GET]", request.nextUrl.pathname + request.nextUrl.search);
  try {
    return await handlers.GET(request);
  } catch (err) {
    console.error("[route GET] EXCEPTION", err);
    throw err;
  }
}

export async function POST(request: NextRequest) {
  console.error("[route POST]", request.nextUrl.pathname + request.nextUrl.search);
  try {
    return await handlers.POST(request);
  } catch (err) {
    console.error("[route POST] EXCEPTION", err);
    throw err;
  }
}
