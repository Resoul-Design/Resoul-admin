# Resoul Admin Handoff

更新日期：2026-11-13（香港時間）

## 已完成

- 「客戶資料」同時讀取 `logistics_orders`、`company_orders`、`deposit_bookings`、`cremation_bookings` 及 `product_orders`。
- 相同發票編號會合併，系統發票（包括 311）可補入客戶資料列表。
- 發票詳情頁會查詢所有訂單來源，並以可取得的資料補齊欄位。
- 「服務工作台」每個服務獨立列顯示。
- 服務類型連到相應服務頁；「查看發票資料」仍連到發票詳情頁。
- 完整編輯表單已加入主人、電話、電郵、寵物、到達時間、套餐、司機、接送資料、發票金額、訂金、結餘、套餐價格、成本、佣金、紀念品及利潤等欄位。
- 保存操作會更新 `logistics_orders`，並保留電話、電郵及日期格式驗證與基本 audit 記錄。

## GitHub／Vercel

- GitHub repository：`Resoul-Design/Resoul-admin`
- 最新修正提交：`05357930c561aeb7dbe095ba4364d33144e61e3d`
- PR #9：合併物流及系統發票來源。
- PR #10：服務類型連結（首次部署因錯誤的文字 `\n` 而失敗）。
- PR #11：完整編輯欄位。
- PR #12：修正服務頁建置語法。
- PR #12 的 preview deployment 已為 `READY`。
- 最新 production deployment 最後檢查時仍為 `BUILDING`，不可視作已正式完成，需再次確認為 `READY`。

## 尚未完成／必須驗證

1. 確認最新 production deployment 轉為 `READY`，並開啟正式網址驗證。
2. 在線上詳情頁實測完整編輯流程：修改、保存、重新載入，確認所有欄位正確寫回 `logistics_orders`。
3. 完成重複客戶提示：相同電話、電郵或客戶資料需即時提示。
4. 完成逐欄修改記錄：顯示修改前、修改後、修改人及修改時間；目前只有基本 audit 記錄。
5. Excel 目前仍為手動 CSV 上傳；Excel 更新後自動同步尚未實作。

## 工作流程要求

- 修改完成後先執行完整 `npm run build`，不可只跑 TypeScript 檢查。
- 檢查 Git diff，確認沒有字面 `\n`、錯誤路徑或未提交檔案。
- 通過本機 production build 後，直接推送 GitHub 並部署 Vercel。
- 必須等待 Vercel 狀態為 `READY`，並實際打開相關頁面驗證後，才可向使用者回報「完成」。

## 2026-11-11 自動成本及正式部署

- 紀念品加購金額按同發票的產品／紀念品訂單自動加總。
- 司機／GoGoVan 費用按司機歷史物流記錄自動帶入。
- 骨灰龕成本按骨灰龕資料的歷史物流成本自動帶入，寫入 `urn_cost`；紀念品成本保留在 `memorial_cost`。
- `pickup_fee`（接送費）已從共用編輯畫面隱藏，司機成本不再以接送費作後備值。
- 儲存動作同時相容新版資料物件及傳統 `FormData` 入口。
- PR #16 已合併；其後 main 已包含自動成本修正及部署手冊更新。
- 目前 production commit：`f22de62ebeb5d173a4b9dfe8b1d8d2fdd7739000`。
- Vercel production：`READY`，正式網址：[resoul-admin-five.vercel.app](https://resoul-admin-five.vercel.app)。
- 以 `155b0d2` 為基礎的另一個預覽 PR #17 因 main 已有相同檔案的後續修改而產生 merge conflict，已關閉；預覽 build 本身為 READY，未影響 production。



## 2026-11-11 部署錯誤記錄

- 預覽分支 feature/logistics-auto-costs-from-155 首次 build：TypeScript 報錯，actions.ts 的 delete rest.urn_cost 不符合推斷型別；已改用篩選物件欄位方式移除。
- 第二次 preview build：TypeScript 報錯，fullRow[k] 對固定欄位物件以字串索引；已將 fullRow 明確標註為 typeof row。
- 預覽 build 修正後已為 READY。
- PR #17 合併時 GitHub 回報 merge conflict，原因是 main 已包含同一批物流檔案的後續提交；PR 已關閉，沒有強行覆蓋 main。
- handoff 更新後的 production deployment dpl_GoUDwYVfR1rWK7azSaCnCGVEKz2i 已為 READY，正式網址仍為 resoul-admin-five.vercel.app。

## 2026-11-13 自動成本統一（與 PR #15 合併，commit 3911ef0）

- 另一工作階段（Claude Code，jovial worktree）同時做了客戶資料自動成本；本次在 main（b7fe0a6）之上合併，沒有覆蓋上列提交。
- 計算來源統一放在 `lib/logistics-auto-costs.ts`，顯示（客戶資料「費用與付款」唯讀欄）與保存（`logistics/actions.ts`）用同一套：
  - 紀念品加購＝已保存的紀念品產品行總額（不計淡黃色建議行及 Shopify 已刪除的行）；沒有產品行時用未取消的紀念品訂單／開單記錄，再後備已存值。
  - 司機／GoGoVan 費用＝司機標準收費：`lib/drivers.ts` `driverFees()` 取試算表匯入記錄（source=basic_info_logistic）每位司機最常見金額（Ricky 320、豪仔 / Ho Jai 300、V's Dad 350、Yeah O2 400、Tony／Gary／Louis 300、Joe／JH／Vivian／Jason 0、O2 Team 400）；沒有對照才用最近一筆同司機記錄。
  - 骨灰龕成本＝`lib/urn-costs.ts` 對照 Drive「Resoul Memorial Product Pricing for Admin（2026-11-10）」numeric_cost（例如 URN02SP 35、URN04L 50、URN08 200）；By Package／No Urn／Pending 等非產品代碼才用最近一筆同骨灰龕記錄。
- 保存規則（保護舊資料）：自動值只在資料庫原本未有數值，或今次保存改了司機／骨灰龕時寫入；不會覆蓋舊單已存的紀念品加購、司機費、骨灰龕成本。
- 欄位：接送費（pickup_fee）、紀念品加購、骨灰龕成本、司機／GoGoVan 費用在表格隱藏（資料保留），改為唯讀計算欄；毛利扣除骨灰龕成本及司機費，沒有司機費時為 0（不再以接送費作後備）。
- 司機名稱：`lib/driver-names.ts`（瀏覽器可用）合併同一人寫法：豪仔、Ho Jai → 豪仔 / Ho Jai；V's dad、Vivian's dad → V's Dad；YEAH O2 → Yeah O2。只合併顯示，資料原文不變。
- `db/migration_20261111_urn_cost.sql`（新增 urn_cost 欄）仍待用戶於 Supabase 執行；未執行時其他欄照常保存並提示。
- 營運手冊（網頁、Word、PDF、public/manual）已同步，最後更新 2026-11-13。

## 2026-11-13 訂金單時間選擇器、套餐代碼對齊、半山貓醫院轉介

- 接送服務列表「操作 → 編輯資料」：原本的「預約時段」四段選單改為「接送時間」時、分選擇（`app/(dashboard)/deposits/_edit.tsx`，用 `_pickers.tsx` TimePicker，與開單及客戶資料一致）。舊單已存的時段文字（例如「上午（08:00–12:00）」）保留不改，除非同事重新選擇；網站預約表格仍為四段時段，沒有改動。
- 轉介對照表（`lib/logistics-calc.ts` REFERRAL_PARTNERS）加入「半山貓醫院」：套餐價 × 10%，應付。比例按 #233 已存記錄（套餐價 4,800、轉介費 480）。
- #339、#334 已存套餐代碼對齊 Shopify 草稿 SKU（用戶 2026-11-13 確認）：`db/fix_20261113_package_codes.sql`（339 SJ1 → SJ30；334 BJ1 → BJ0，只在仍為舊值時更新），待用戶於 Supabase 執行。只改後台已存代碼，沒有改 Shopify 草稿。
- 營運手冊（網頁、Word、PDF、public/manual）已同步。

## 2026-11-13 開單表格調整（寵物資料、骨灰龕、發票備註）

- 開新單（接送訂金、善終／告別套餐）：性別、年齡改為非必填（`new-order/actions.ts` 及 `_form.tsx`）；寵物資料備註只列有填的項目。寵物種類由「更多選項」移回基本資料（寵物姓名之後）。
- 骨灰龕類別選單不再提供「套餐包括（By Package）」（`lib/order-types.ts` URN_BASIC_OPTIONS `legacy: true`）；舊單已存 By Package 仍可辨認及顯示。
- 骨灰龕取回日期可選「待定」（`_pickers.tsx` DateOrPending，值為「待定」；開新單及客戶資料 `urn_pickup_status` 共用）；舊資料的其他文字保留為文字欄。
- 發票備註按骨灰龕取回日期自動建議（`lib/invoice-remark.ts` suggestUrnPickup）：取回日期＝火化日期 → 今日取回；其他日期或待定 → 另日取回；骨灰龕「不需要」→ 不適用；同事可再更改。另日取回並有日期時，備註寫出日期（Urn to be picked up on 20 Nov 2026.）。
- **注意（2026-11-13 約 15:00 起）**：唯讀檢查發現 Supabase 業務資料表（deposit_bookings、cremation_bookings、product_orders、memorial_product_lines、logistics_orders、company_orders）筆數為 0，staff（4）及 audit_log（634，最後一筆 2026-11-12 01:48 UTC）仍在；後台當時沒有請求。原因未明，已請用戶在 Supabase 查 Postgres 記錄及備份；此期間未有任何資料庫寫入。價目設定及資料核對頁暫停（草稿在 scratchpad，未 commit）。
