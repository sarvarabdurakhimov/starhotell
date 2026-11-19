import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.STANDALONE === "false" ? {} : { output: "standalone" }),
  outputFileTracingRoot: path.join(__dirname),
  // Django's API paths end in "/": Next must not redirect them before the /api proxy below
  skipTrailingSlashRedirect: true,
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
    return [
      // keep the trailing slash: Django cannot redirect a POST to the slashed URL
      { source: "/api/:path*/", destination: `${backendUrl}/api/:path*/` },
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
    ];
  },
};

export default nextConfig;
