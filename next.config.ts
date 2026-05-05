import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "media.api-sports.io" },
      { protocol: "https", hostname: "logos-world.net" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
    ],
  },
};

export default config;
