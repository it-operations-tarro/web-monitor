import type { NextConfig } from "next";

// Where the collector lives relative to the dashboard. In the single-container
// image both processes run in the same network namespace, so the collector is
// reachable on loopback. Overridable at BUILD time (rewrites are baked into the
// standalone output) for local dev where the collector may run elsewhere.
const COLLECTOR_ORIGIN = process.env.COLLECTOR_ORIGIN || "http://127.0.0.1:4448";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) for a lean Docker image.
  output: "standalone",
  allowedDevOrigins: ["messageboard-svr-dgt1-1.prod.letsdowonders.io"],

  // Single-origin proxy: the browser (and, after repacking, the extension) talk
  // only to the dashboard's port. Next forwards the collector's public paths to
  // the co-located collector on :4448. These are every externally-used route:
  //   /api/*      dashboard UI + extension config sync (/api/config)
  //   /logs       extension log ingestion (POST)
  //   /ping       extension heartbeat (POST)
  //   /updates/*  self-hosted extension .crx artifacts (GET)
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${COLLECTOR_ORIGIN}/api/:path*` },
      { source: "/logs", destination: `${COLLECTOR_ORIGIN}/logs` },
      { source: "/ping", destination: `${COLLECTOR_ORIGIN}/ping` },
      { source: "/updates/:path*", destination: `${COLLECTOR_ORIGIN}/updates/:path*` },
    ];
  },
};

export default nextConfig;
