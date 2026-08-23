import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Serve the transparent PNGs exactly as authored (no optimizer recompositing
  // onto a background, no stale optimized cache).
  images: { unoptimized: true },
};

export default nextConfig;
