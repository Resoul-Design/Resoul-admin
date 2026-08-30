import { NextResponse } from "next/server";
import crypto from "crypto";
import { buildAuthorizeUrl, shopDomain } from "@/lib/shopify";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!shopDomain() || !process.env.SHOPIFY_API_KEY) {
    return new NextResponse(
      "缺少 SHOPIFY_STORE_DOMAIN 或 SHOPIFY_API_KEY，請先在 .env.local 設定並重啟 dev server。",
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/shopify/callback`;
  const state = crypto.randomBytes(16).toString("hex");

  const res = NextResponse.redirect(buildAuthorizeUrl(redirectUri, state));
  res.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
