import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeToken, verifyHmac } from "@/lib/shopify";

export const runtime = "nodejs";

function page(title: string, bodyHtml: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      body{font-family:-apple-system,"Microsoft JhengHei",sans-serif;background:#f7f3ec;color:#3b2f27;
        display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
      .card{background:#fff;border:1px solid #e6dccb;border-radius:16px;padding:32px;max-width:640px;width:100%}
      h1{color:#9c7f52;font-size:20px;margin:0 0 16px}
      code{display:block;background:#f2ede3;border:1px solid #e6dccb;border-radius:8px;padding:12px;
        word-break:break-all;font-size:13px;margin:8px 0}
      .muted{color:#6b5d4f;font-size:14px;line-height:1.7}
      .warn{color:#b45309;font-size:13px;margin-top:12px}
      .err{color:#dc2626}
    </style></head><body><div class="card">${bodyHtml}</div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const code = sp.get("code");
  const state = sp.get("state");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("shopify_oauth_state")?.value;

  if (!code) {
    return page("授權失敗", `<h1 class="err">缺少授權碼</h1>
      <p class="muted">請重新由 <a href="/api/shopify/install">/api/shopify/install</a> 開始。</p>`, 400);
  }
  if (!state || state !== savedState) {
    return page("授權失敗", `<h1 class="err">state 不符</h1>
      <p class="muted">可能逾時或跨站請求。請重新由 <a href="/api/shopify/install">/api/shopify/install</a> 開始。</p>`, 400);
  }

  const hmacOk = verifyHmac(sp);

  try {
    const { access_token, scope } = await exchangeToken(code);
    return page(
      "授權成功",
      `<h1>✅ Shopify 授權成功</h1>
       <p class="muted">請將下面的 token 貼入 <b>resoul-admin/.env.local</b> 的
       <code style="display:inline;padding:2px 6px">SHOPIFY_ADMIN_API_TOKEN=</code>，然後重啟 dev server。</p>
       <code>${access_token}</code>
       <p class="muted">已授權範圍：${scope}</p>
       ${hmacOk ? "" : `<p class="warn">⚠ HMAC 未能驗證（本機一次性工具可忽略，但請確認來源為 Shopify）。</p>`}
       <p class="muted">完成後可關閉此頁。此 token 為離線權杖，不會過期；請妥善保存、切勿貼到對話或版本庫。</p>`
    );
  } catch (e) {
    return page("授權失敗", `<h1 class="err">換取 token 失敗</h1>
      <p class="muted">${String(e)}</p>`, 500);
  }
}
