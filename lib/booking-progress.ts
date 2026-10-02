// 火化進度階段（已排期之後）：每階段記錄時間，並同步更新預約狀態
export type ProgressStage = "picked_up" | "cremating" | "ready" | "returned";

export const PROGRESS_STAGES: { key: ProgressStage; label: string; column: string; status: string }[] = [
  { key: "picked_up", label: "已接送", column: "picked_up_at", status: "pickup" },
  { key: "cremating", label: "火化中", column: "cremation_started_at", status: "cremating" },
  { key: "ready", label: "可取回", column: "ready_at", status: "ready" },
  { key: "returned", label: "已交還", column: "returned_at", status: "completed" },
];

export type ProgressData = {
  picked_up_at: string | null;
  cremation_started_at: string | null;
  ready_at: string | null;
  returned_at: string | null;
  returned_to: string | null;
};

export const PROGRESS_COLUMNS = "picked_up_at, cremation_started_at, ready_at, returned_at, returned_to";

// 骨灰可取回通知（WhatsApp 草稿，由同事檢查後自行傳送）
export function readyMessage(lang: "zh" | "en", owner: string, pet: string, staffName: string) {
  if (lang === "en") {
    const name = pet || "your companion";
    return `Hi ${owner || "there"}, this is ${staffName} from Resoul. ${name}'s ashes are ready, and you're welcome to come to Resoul to bring ${pet || "them"} home whenever you feel ready. Please reply with a day and time that suits you, and we'll have everything prepared. If there's anything you need, just let me know.`;
  }
  const who = /^[A-Za-z]/.test(staffName) ? ` ${staffName}` : staffName;
  const name = pet || "毛孩";
  return `${owner || ""}你好，我係 Resoul 嘅${who}。${name}嘅骨灰已經準備好，你準備好嘅時候，隨時可以嚟 Resoul 接${name}回家。請回覆方便嘅日子同時間，我哋會預先準備好。如有任何需要，隨時搵我。`;
}
