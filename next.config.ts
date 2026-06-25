import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained production server for the Azure VM, run under PM2 as:
  //   node .next/standalone/server.js   (PORT + env from the process)
  output: "standalone",
  // Self-hosted: skip the built-in image optimizer (no Vercel optimizer, no
  // sharp dependency, no per-domain allowlist) — external photo CDNs load as-is.
  images: { unoptimized: true },
};

export default nextConfig;
