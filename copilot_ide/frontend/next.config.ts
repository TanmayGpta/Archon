import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  allowedDevOrigins: [
    "localhost",
    "localhost:3000",
    "127.0.0.1",
    "127.0.0.1:3000",
    "172.20.168.185",
    "172.20.168.185:3000",
  ],
  async redirects() {
    return [
      {
        source: "/",
        destination: "/agai",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    const defaultBackend =
      process.env.NODE_ENV === "development"
        ? "http://127.0.0.1:8100"
        : "https://archon-agai-backend.wittymeadow-d0c20aa4.eastasia.azurecontainerapps.io";
    const backend =
      process.env.AGAI_BACKEND_URL ||
      process.env.BACKEND_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_AGAI_API_URL ||
      defaultBackend;
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
      {
        source: "/health",
        destination: `${backend}/health`,
      },
    ];
  },
};

export default nextConfig;
