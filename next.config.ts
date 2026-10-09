import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Per-user, per-request app: no Cache Components mode (same call as beta).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
