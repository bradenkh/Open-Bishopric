import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["firebase-admin"],
  // Turbopack is the default in Next.js 16 — no webpack plugin needed.
  // Service worker is registered manually via public/sw.js
};

export default nextConfig;
