// 到達／火化時間：新輸入用 HH:MM。舊的上午／下午等時段只保留原文，不改成某個鐘點。
import { findTimeSlot } from "./deposit-followup";

export function isExactTime(value: unknown): boolean {
  return /^\d{2}:\d{2}$/.test(String(value ?? "").trim());
}

export function preserveServiceTime(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (isExactTime(raw)) return raw;
  const slot = findTimeSlot(raw) || findTimeSlot(raw.replace(/-/g, "–"));
  return slot ? slot.zh : raw;
}
