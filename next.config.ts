import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@wppconnect-team/wppconnect", "better-sqlite3"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
