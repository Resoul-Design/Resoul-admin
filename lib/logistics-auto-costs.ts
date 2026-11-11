// 保存客戶資料時只保留本次提交的欄位。
// 不把紀念品加購、司機費或骨灰龕成本算完後塞進未改的欄位，也不重寫已隱藏的接送費。

export function logisticsSavePatch<T extends Record<string, unknown>>(submitted: T): T {
  const patch = { ...submitted };
  delete patch.pickup_fee;
  return patch;
}
