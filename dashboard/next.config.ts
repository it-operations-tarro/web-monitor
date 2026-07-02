import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) for a lean Docker image.
  output: "standalone",
  allowedDevOrigins: ["messageboard-svr-dgt1-1.prod.letsdowonders.io"],
};

export default nextConfig;
