import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Hold the client-side Router Cache for dynamic pages a few seconds so a quick
  // back/forward bounce between tabs reuses the last render instead of re-hitting
  // the DB on every click. Kept short (10s) on purpose: /financials and /pipeline
  // are shared firm-money screens, and your own edits already revalidate your
  // cache — so this window only ever affects ANOTHER partner who navigates away
  // and straight back inside 10s. The default is 0 (every nav refetches).
  experimental: {
    staleTimes: { dynamic: 10 },
  },
  // @react-pdf/renderer (invoice PDF render) ships native-ish deps + a wasm
  // layout engine; let Next require it at runtime instead of bundling it.
  serverExternalPackages: ["@react-pdf/renderer"],
  // Anchor file-tracing to this project; silences the multi-lockfile warning
  // caused by a stray package-lock.json in C:\Users\jason\.
  outputFileTracingRoot: path.resolve(__dirname),
  // skills/*.md are read at runtime by lib/ai.ts generate(). They aren't imported
  // as modules, so Next won't trace them into the serverless bundle on its own —
  // include them explicitly or the Anthropic calls 404 on Vercel.
  outputFileTracingIncludes: {
    "/**/*": ["./skills/**/*.md"],
  },
};

export default nextConfig;
