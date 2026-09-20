import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// 收緊 CSP：明確限制 connect/img/script/style 來源；只允許自身與 Supabase。
// 註：script-src 沿用 'unsafe-inline'（Next 需要），未用 nonce（需中介層逐請求生成，
// 風險較高，留待日後）。dev 額外允許 'unsafe-eval' 與 ws: 以免影響 HMR。
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'self'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://*.supabase.co https://cdn.shopify.com",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `connect-src 'self' https://*.supabase.co${isDev ? " ws:" : ""}`,
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  // 允許較大的檔案上載（專案文件）
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: csp },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    }];
  },
};

export default nextConfig;
