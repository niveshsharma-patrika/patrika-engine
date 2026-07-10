import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained production server for the Azure VM, run under PM2 as:
  //   node .next/standalone/server.js   (PORT + env from the process)
  output: "standalone",
  // Pin the trace root to THIS project so the standalone output stays flat at
  // .next/standalone/server.js. Without it, a sibling app on the box (there's a
  // patrika-content-insight next to it) makes Next pick a higher root and nest
  // the output under .next/standalone/<path>/server.js, which PM2 can't find.
  outputFileTracingRoot: import.meta.dirname,
  // Self-hosted: skip the built-in image optimizer (no Vercel optimizer, no
  // sharp dependency, no per-domain allowlist) — external photo CDNs load as-is.
  images: { unoptimized: true },
};

export default nextConfig;
