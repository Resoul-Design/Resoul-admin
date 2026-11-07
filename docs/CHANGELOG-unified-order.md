# 統一「開新單」及公司單號（分支 unified-order）

## 上線次序
1. Supabase（diyxcx）SQL Editor 執行 `db/migration_20261108_company_invoice_no.sql`
   - 執行前確認第 7a 段「最後已用的公司單號」（預設 289，新單號由 290 開始）。
   - 執行後跑檔案最後三句檢查，全部應為 0。
2. 合併 `unified-order` 至 `main`（Vercel 自動部署）。
3. Shopify Order Printer 重新貼入 `resoul-landing/docs/order-printer-invoice.liquid`。
4. 營運手冊：把 OneDrive `營運手冊來源/待上線-開新單/` 的檔案覆蓋上一層，並重出 PDF。

## 改動
- 新增：`/new-order`（開新單）、`/new-order/[id]`（單詳情）、`lib/order-types.ts`（單類型設定）。
- 頁頂「＋ 開新單」為唯一開單入口；移除接送服務、火化預約、紀念品訂單頁的「＋ 新增訂單」
  （刪除 `_booking-order.tsx`、`_booking-order-actions.ts`、`orders/_new-order.tsx`、`createSouvenirDraftOrder`、`sendSouvenirDraftInvoice`、`lib/draft-names.ts`）。
- 資料庫：`company_invoices`（單號登記，同一專案共用）、`company_orders`（開單記錄，類型細節放 `details` jsonb）、
  `deposit_ledger`（接送訂金收取／抵扣／退款流水，`invoice_no` 必填）及 `deposit_balances` 視圖；
  `deposit_bookings`、`cremation_bookings`、`product_orders` 加 `invoice_no`，由觸發器按專案自動配號（網站預約毋須改動）。
- 列表、全後台搜尋、專案及客戶檔案、發票 PDF／Word、訂金抵扣：主顯示公司單號；Shopify 訂單號只作搜尋及「內部參考」。
- 管理員可在單詳情修正單號（`set_company_invoice_no`，同一專案所有記錄及流水一併更新，留審計記錄）。

## 單類型（`lib/order-types.ts`）
| key | 名稱 | 記錄 | Shopify |
|---|---|---|---|
| cremation | 善終／告別套餐 | cremation_bookings（admin:cremation） | 火化方案款式＋可選加購 |
| vet | 安樂在家 | cremation_bookings（admin:euthanasia） | 自訂項目：網站內容劃一收費＋附加費 |
| deposit | 預約接送訂金 | deposit_bookings（admin:deposit） | 「預約服務」產品款式 |
| product | 紀念品／加購 | company_orders | 紀念品款式（多件） |
| other | 其他／自訂 | company_orders | 自訂項目及金額 |
