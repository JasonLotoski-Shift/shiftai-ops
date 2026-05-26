import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Anchor file-tracing to this project; silences the multi-lockfile warning
  // caused by a stray package-lock.json in C:\Users\jason\.
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
