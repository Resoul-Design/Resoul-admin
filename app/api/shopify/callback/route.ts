import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeToken, verifyHmac } from "@/lib/shopify";
import { getStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function page(title: string, message: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:-apple-system,"Microsoft JhengHei",sans-serif;background:#f7f3ec;color:#3b2f27;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}.card{background:#fff;border:1px solid #e6dccb;border-radius:8px;padding:32px;max-width:640px;width:100%}h1{color:#9c7f52;font-size:20px;margin:0 0 16px}.muted{color:#6b5d4f;font-size:14px;line-height:1.7}.err{color:#dc2626}</style></head><body><div class="card"><h1 class="${status >= 400 ? "err" : ""}">${title}</h1><p class="muted">${message}</p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

export async function GET(request: Request) {
  const staff = await getStaff();
  if (!staff || staff.role !== "admin") return page("禁止存取", "僅限管理員使用。", 403);

  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const savedState = (await cookies()).get("shopify_oauth_state")?.value;
  if (!code || !state || state !== savedState) return page("授權失敗", "授權狀態無效或已逾時。", 400);
  if (!verifyHmac(params)) return page("授權失敗", "Shopify 簽章驗證失敗。", 401);

  try {
    const { access_token, scope } = await exchangeToken(code);
    const { error } = await createAdminClient().from("shopify_credentials").upsert({
      id: "primary",
      access_token,
      scopes: scope,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return page("Shopify 授權成功", "Access token 已安全儲存，頁面不會顯示憑證。可以關閉此頁。 ");
  } catch {
    return page("授權失敗", "請檢查伺服器設定及 shopify_credentials migration。", 500);
  }
}
