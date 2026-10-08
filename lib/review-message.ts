// 邀請評價：候選記錄型別及 WhatsApp 訊息（頁面及瀏覽器共用，不可引用伺服器專用模組）
export type ReviewCandidate = {
  entity: "cremation" | "deposit";
  ref: string;
  owner: string;
  pet: string;
  phone: string;
  doneAt: string; // 服務完成日期（YYYY-MM-DD）
  lang: "zh" | "en";
};

// 邀請訊息（WhatsApp 草稿，由同事檢查後自行傳送）
export function reviewMessage(c: Pick<ReviewCandidate, "owner" | "pet" | "lang">, staffName: string, link: string) {
  if (c.lang === "en") {
    const pet = c.pet || "your companion";
    return `Hi ${c.owner || "there"}, this is ${staffName} from Resoul. Thank you for trusting us to walk the last part of the journey with ${pet}. If you feel comfortable, would you share your experience on Google? Your words may help other families facing a goodbye: ${link}\nWishing you and ${pet}'s memories warmth always.`;
  }
  const who = /^[A-Za-z]/.test(staffName) ? ` ${staffName}` : staffName;
  const pet = c.pet || "毛孩";
  return `${c.owner || ""}你好，我係 Resoul 嘅${who}。多謝你信任我哋，陪${pet}走最後一段路。如果你願意，可唔可以喺 Google 留低你嘅感受？你嘅分享可以幫助同樣面對離別嘅家庭：${link}\n願你同${pet}嘅回憶，一直溫暖你。`;
}
