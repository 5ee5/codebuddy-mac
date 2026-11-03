import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Other hostnames allowed to open the dev server, such as this machine's LAN
  // address, from DEV_ORIGINS in .env.local (comma-separated). Dev only.
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [],
  cacheComponents: true,
  partialPrefetching: true,
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
