import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["react-leaflet", "@react-leaflet/core", "leaflet"],
};

export default nextConfig;
