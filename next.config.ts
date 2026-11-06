import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: a second "player" on 127.0.0.1, and phones on the home Wi-Fi (192.168.x.x).
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*"],
};

export default nextConfig;
