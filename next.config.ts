import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允許較大的檔案上載（專案文件）
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
};

export default nextConfig;
