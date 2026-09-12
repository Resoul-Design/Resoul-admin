# Resoul 後台管理系統（resoul-admin）

Resoul 內部使用的後台，集中管理訂單、出貨倉存、預約火化、留言板/文章與員工排更。
**內部專用、需登入、不對外公開。**

## 技術選型
- **Next.js（App Router）+ TypeScript** — 前端 + 後端 API（Server Actions / Route Handlers）
- **Supabase** — Postgres + Auth（員工登入）+ RLS（角色權限）；與消費者站共用同一專案
- **Shopify Admin API** — 訂單、庫存、出貨、文章（需自建 Shopify custom app）
- **Vercel** — 部署（獨立網址，如 `admin.resoul…`）
- UI：Tailwind CSS

## 資料來源（不重複造資料）
| 模組 | 來源 | 說明 |
|---|---|---|
| 客戶訂單 | Shopify Admin API | 讀訂單、付款/履行狀態、篩選 |
| 倉存 · 出貨記錄 | Shopify Admin API | 庫存量、履行（fulfillment）狀態；額外備註存 Supabase |
| 預約火化記錄 | Supabase `cremation_bookings` | 由 Google Sheet 搬入；狀態流程管理 |
| 留言板記錄 | Supabase `posts` | 審核台：held→visible/hidden、危機留言優先 |
| 文章記錄 | Shopify Blog（Admin API） | 文章清單/狀態，連去 Shopify 編輯 |
| 員工上班安排（P2） | Supabase `shifts` | 班表日曆 |

## 目錄結構（規劃）
```
resoul-admin/
  db/schema.sql              # 資料庫（已建）
  app/
    layout.tsx  globals.css
    login/page.tsx           # 員工登入（Supabase Auth）
    (dashboard)/
      layout.tsx             # 側邊欄 + 權限守衛
      page.tsx               # 總覽（今日預約、待審留言、新訂單）
      bookings/page.tsx      # 預約火化記錄
      orders/page.tsx        # 客戶訂單
      inventory/page.tsx     # 倉存 · 出貨
      board/page.tsx         # 留言板審核
      articles/page.tsx      # 文章記錄
      staff/page.tsx         # 員工 + 排更（P2）
  lib/
    supabase/server.ts       # server client（service role / RLS）
    supabase/client.ts       # browser client
    shopify.ts               # Shopify Admin API 封裝
    auth.ts                  # 員工/角色守衛
  middleware.ts              # 未登入 → /login
```

## 環境變數（.env.local，勿入版本庫）
```
NEXT_PUBLIC_SUPABASE_URL=            # 與消費者站相同
NEXT_PUBLIC_SUPABASE_ANON_KEY=       # publishable key
SUPABASE_SERVICE_ROLE_KEY=           # 僅伺服器端使用（審核/管理）
SHOPIFY_STORE_DOMAIN=                # xxx.myshopify.com
SHOPIFY_ADMIN_API_TOKEN=             # Shopify custom app Admin token（read_orders, read_products, write_products, read_content…）
SHOPIFY_API_SECRET=                  # 用於驗證 Shopify webhook HMAC
SHOPIFY_WEBHOOK_SECRET=              # 可選；留空時使用 SHOPIFY_API_SECRET
```

## 建置階段
- **MVP（本次）**：預約火化記錄、客戶訂單 + 出貨倉存、留言板 + 文章管理、登入/權限、總覽
- **Phase 2**：員工上班安排、佣金/夥伴（同行計劃）對賬、報表匯出

## 你需要準備（讓後台可實際運行）
1. **Supabase service_role key**：Supabase → Project Settings → API →「service_role」（機密，只放伺服器 env）
2. **Shopify Admin custom app**：Shopify Admin → Settings → Apps → Develop apps → 建 app →
   授予 `read_orders`、`read_products`、`write_products`、`read_inventory`、`read_content` → 取得 Admin API access token
3. 執行 `db/schema.sql`（Supabase SQL Editor）
4. （選）由 Google Sheet 匯出現有預約 → 匯入 `cremation_bookings`

## 付款狀態 webhook

1. 先在 Supabase SQL Editor 執行 `db/migration_payment_tracking.sql`，為 `cremation_bookings` 加入 `payment_ref`、`payment_status`、付款金額及訂單欄位。
2. 在 Shopify Admin 建立 webhook：
   - Topic：`orders/paid`
   - URL：`https://你的後台網域/api/webhooks/shopify/orders-paid`
   - Format：JSON
3. 在 Vercel 後台設定 `SHOPIFY_API_SECRET`（或 `SHOPIFY_WEBHOOK_SECRET`）與 `SUPABASE_SERVICE_ROLE_KEY`。
4. 消費者站付款問卷會把同一個 `payment_ref` 寫入 Supabase 及付款訂單 attributes；webhook 收到付款成功後會把對應預約更新為 `payment_status='paid'`。
