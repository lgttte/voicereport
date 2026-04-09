import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sharp needs to be treated as external on serverless
  serverExternalPackages: ["sharp"],
  // Enable PWA headers for service worker scope
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Content-Type", value: "application/javascript" },
        ],
      },
    ];
  },
};

export default nextConfig;
