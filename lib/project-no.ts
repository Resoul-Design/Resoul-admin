import { randomBytes } from "node:crypto";

// RSL 專案編號：RSL-YYMMDD（香港日期）-8 位隨機碼，與網站預約相同格式
export function makeProjectNo(at: Date | string = new Date()) {
  const time = new Date(at).getTime();
  const hk = new Date((Number.isFinite(time) ? time : Date.now()) + 8 * 60 * 60 * 1000);
  const code = Array.from(randomBytes(5), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8).toUpperCase();
  return `RSL-${hk.toISOString().slice(2, 10).replace(/-/g, "")}-${code}`;
}
