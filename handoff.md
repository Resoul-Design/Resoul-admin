# Resoul Admin Handoff

更新日期：2026-11-11（香港時間）

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
- PR #16 已合併；production commit：`7820e44ce56b0f6c83927f7b072f79812cdce68d`。
- Vercel production：`READY`，正式網址：[resoul-admin-five.vercel.app](https://resoul-admin-five.vercel.app)。

