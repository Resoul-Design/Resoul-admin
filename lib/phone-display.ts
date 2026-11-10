// 顯示用電話：香港號碼去掉 +852／852 區號（只改顯示，資料不變）
export function displayPhone(phone: string | null | undefined): string {
  const s = String(phone || "").trim();
  if (!s) return "";
  const digits = s.replace(/[^\d]/g, "");
  if (/^852\d{8}$/.test(digits) && /^(\+?852|00852)/.test(s.replace(/[\s()-]/g, ""))) return digits.slice(3);
  return s;
}
