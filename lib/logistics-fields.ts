// 客戶資料（Basic Info Logistic Excel 欄位）：單號詳細頁的編輯表格及保存驗證共用。
// 欄位與 db/migration_logistics_sync.sql 的 logistics_orders 一致。
export type LogisticsFieldType = "text" | "date" | "number" | "url" | "textarea";
// hidden：不在表格顯示（資料保留，匯出及 CSV 匯入照舊）。發票金額、待付餘額、推薦費、最終利潤改由「費用與付款」的自動計算顯示
export type LogisticsField = { key: string; label: string; type: LogisticsFieldType; adminOnly?: boolean; hidden?: boolean };

const f = (key: string, label: string, type: LogisticsFieldType = "text", adminOnly = false): LogisticsField => ({ key, label, type, adminOnly });

export const LOGISTICS_GROUPS: { title: string; fields: LogisticsField[] }[] = [
  { title: "主人及狀態、寵物", fields: [f("row_status", "訂單狀態"), f("owner_name", "主人姓名"), f("phone", "聯絡電話"), { ...f("email", "電郵"), hidden: true }, f("drive_folder_url", "雲端資料夾", "url"), f("pet_name", "寵物名稱"), f("animal", "動物類型"), f("breed", "品種"), f("weight_kg", "重量（公斤）", "number")] },
  { title: "接送安排", fields: [f("arrival_date", "到達日期", "date"), f("arrival_time", "到達時間"), f("pickup_type", "接送方式"), f("pickup_from", "接送地點"), f("driver", "司機"), { ...f("pickup_surcharge", "接送附加費", "number"), hidden: true }, f("driver_fee_settled_at", "司機費用結算日", "date")] },
  { title: "火化與儀式", fields: [f("package_name", "套餐"), f("package_code", "套餐代碼"), f("date_code", "日期代碼"), f("ceremony_or_order_date", "火化／訂單日期", "date"), f("ceremony_time", "火化時間"), { ...f("shower_date", "告別日期", "date"), hidden: true }] },
  { title: "骨灰龕", fields: [f("urn", "骨灰龕"), f("urn_supplier", "骨灰龕供應商"), f("urn_pickup_status", "骨灰龕取回日期"), f("customer_order_date", "客人下單日期", "date"), f("memorial_remarks", "備註", "textarea"), { ...f("product_pickup_or_delivery_on", "取貨／送貨日期", "date"), hidden: true }, f("urn_storage_expires_on", "骨灰龕存放到期日", "date")] },
  { title: "紀念品", fields: [f("memorial_supplier", "供應商"), f("delivered_to_supplier_on", "交供應商日期", "date"), f("supplier_returned_on", "供應商交回日期", "date"), { ...f("endup_profit", "最終利潤", "number", true), hidden: true }] },
  { title: "費用與付款", fields: [{ ...f("invoice_amount", "發票金額", "number"), hidden: true }, { ...f("deposit_received", "已收訂金", "number"), hidden: true }, f("other_surcharge", "其他附加費", "number"), f("package_price", "套餐價格", "number"), { ...f("memorial_addon_price", "紀念品加購", "number"), hidden: true }, f("back_to_nature_price", "回歸自然費", "number"), f("urn_storage_rental_price", "骨灰龕存放費", "number"), { ...f("pickup_fee", "接送費", "number"), hidden: true }, { ...f("urn_cost", "骨灰龕成本", "number"), hidden: true }, { ...f("driver_or_gogovan_cost", "司機／GoGoVan 費用", "number"), hidden: true }, f("discount_code", "優惠碼"), { ...f("discount_price", "折扣金額", "number"), hidden: true }, f("referral", "推薦來源"), { ...f("referral_fee", "推薦費", "number"), hidden: true }, { ...f("balance_settled", "待付餘額", "number"), hidden: true }, f("memorial_cost", "紀念品成本（不含骨灰龕）", "number"), f("delivery_cost_to_customer", "客戶送貨費", "number"), f("commission", "佣金", "number"), f("other_cost", "其他費用", "number"), f("other_cost_note", "其他費用說明")] },
];

export const LOGISTICS_FIELDS: LogisticsField[] = LOGISTICS_GROUPS.flatMap((g) => g.fields);

// 舊欄名（CSV 匯入仍接受）
// Excel「Customers Record & Logistic → Basic Info Logistic」英文欄名（CSV 匯入用）；第一欄沒有欄名的是訂單狀態
export const EXCEL_FIELD_LABELS: Record<string, string> = {
  "Pet Name": "pet_name", "Animal": "animal", "Breed": "breed", "Weight (kg)": "weight_kg", "Owner Name": "owner_name", "Email": "email",
  "Google drive folder link": "drive_folder_url", "Phone No.": "phone", "Arrival Date": "arrival_date", "Arrival Time": "arrival_time",
  "Pickup": "pickup_type", "Pickup From": "pickup_from", "Driver": "driver", "Pick up fee": "pickup_fee", "Driver fee settlement date": "driver_fee_settled_at",
  "Package": "package_name", "Package Code": "package_code", "Date Code": "date_code", "Ceremony Date/ Order date": "ceremony_or_order_date",
  "Ceremony Time": "ceremony_time", "Shower Date": "shower_date", "Invoice Amount": "invoice_amount", "Deposit Received (standard $1800)": "deposit_received",
  "Other surcharge (pick up/ urn upgrade/ time ext)": "other_surcharge", "Package Price": "package_price", "Memorial Product/ Add-on Price": "memorial_addon_price",
  "Back to nature price (standard $500)": "back_to_nature_price", "Urn Storage Rental Price": "urn_storage_rental_price",
  "Urn Storage Rental Period Expiration Date": "urn_storage_expires_on", "Discount Code": "discount_code", "Discount Price": "discount_price",
  "Referral": "referral", "Referral Fee": "referral_fee", "Balance Settled": "balance_settled", "Urn": "urn", "URN Pick Up date": "urn_pickup_status",
  "Customer Order Date": "customer_order_date", "Remarks": "memorial_remarks", "Memorial Product Supplier": "memorial_supplier",
  "Delivery Date To Supplier": "delivered_to_supplier_on", "Supplier send Back Date": "supplier_returned_on", "Product Pick Up/ Delivery Date": "product_pickup_or_delivery_on",
  "Memorial Product Cost": "memorial_cost", "Delivery Cost to Customer": "delivery_cost_to_customer", "Driver/ gogo van pick up cost": "driver_or_gogovan_cost",
  "Comission": "commission", "Endup Balance/ Profit": "endup_profit",
};

export const LEGACY_FIELD_LABELS: Record<string, string> = {
  "紀念品成本": "memorial_cost",
  "骨灰盅安排": "urn", "骨灰龕安排": "urn", "骨灰盅取回狀態": "urn_pickup_status", "骨灰龕取回狀態": "urn_pickup_status",
  "紀念品備註": "memorial_remarks", "紀念品供應商": "memorial_supplier", "紀念品取貨／送貨日期": "product_pickup_or_delivery_on",
};
