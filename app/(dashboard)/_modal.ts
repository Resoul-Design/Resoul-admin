import type { MouseEvent } from "react";

// 彈出視窗：只有真正按在灰色背景上才關閉。
// 背景層可捲動時，捲動軸亦屬於背景層；按捲動軸的位置在 clientWidth／clientHeight 之外，不應關閉視窗。
export function isBackdropPress(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  if (e.target !== el) return false;
  const rect = el.getBoundingClientRect();
  return e.clientX - rect.left < el.clientWidth && e.clientY - rect.top < el.clientHeight;
}
