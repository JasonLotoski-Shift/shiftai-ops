import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
