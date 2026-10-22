import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Les documents Word générés côté serveur intègrent les logos lus dans public/brand/.
  outputFileTracingIncludes: {
    "/api/leaves/[id]/document": ["./public/brand/*.png"],
    "/api/missions/[id]/document": ["./public/brand/*.png"],
  },
};

export default nextConfig;
