// 服務後邀請評價：服務完成（骨灰已交還或接送已完成）3 日後，提示同事邀請客人在 Google 留下評價。
// 已邀請或已略過的記錄存於 review_invites；同一電話只邀請一次。
import { createAdminClient } from "@/lib/supabase/admin";
import { phoneKey } from "@/lib/product-orders";
import type { ReviewCandidate } from "@/lib/review-message";

export type { ReviewCandidate };


const DAY = 24 * 60 * 60 * 1000;
const WAIT_DAYS = 3; // 服務完成後等候日數
const WINDOW_DAYS = 90; // 只列出最近 90 日內完成的服務

export async function loadReviewCandidates(can: { cremation: boolean; deposit: boolean }): Promise<{ items: ReviewCandidate[]; ready: boolean }> {
  const admin = createAdminClient();
  const invited = await admin.from("review_invites").select("entity, ref, phone_key");
  if (invited.error) return { items: [], ready: false };
  const doneRefs = new Set((invited.data || []).map((r: { entity: string; ref: string }) => `${r.entity}:${r.ref}`));
  const doneKeys = new Set((invited.data || []).map((r: { phone_key: string | null }) => r.phone_key).filter(Boolean));

  const now = Date.now();
  const latest = new Date(now - WAIT_DAYS * DAY);
  const earliest = new Date(now - WINDOW_DAYS * DAY);
  const ymd = (d: Date) => new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const english = (notes?: string | null, source?: string | null) => /Project no\./i.test(notes || "") || /-en$/.test(source || "");

  const [crem, dep] = await Promise.all([
    can.cremation
      ? admin
          .from("cremation_bookings")
          .select("id, owner_name, contact, pet_name, returned_at, source, notes")
          .eq("is_test", false)
          .not("returned_at", "is", null)
          .gte("returned_at", earliest.toISOString())
          .lte("returned_at", latest.toISOString())
          .limit(200)
      : null,
    can.deposit
      ? admin
          .from("deposit_bookings")
          .select("id, owner_name, contact, pet_name, service_date, notes, source")
          .eq("is_test", false)
          .eq("status", "completed")
          .gte("service_date", ymd(earliest))
          .lte("service_date", ymd(latest))
          .limit(200)
      : null,
  ]);

  const items: ReviewCandidate[] = [];
  const seen = new Set<string>();
  const push = (c: ReviewCandidate) => {
    const key = phoneKey(c.phone) || c.owner;
    if (doneRefs.has(`${c.entity}:${c.ref}`) || doneKeys.has(phoneKey(c.phone)) || seen.has(key)) return;
    seen.add(key);
    items.push(c);
  };
  type Row = { id: string; owner_name: string | null; contact: string | null; pet_name: string | null; notes: string | null; source: string | null };
  for (const r of (crem?.data || []) as (Row & { returned_at: string })[]) {
    if ((r.source || "").includes("euthanasia")) continue;
    push({ entity: "cremation", ref: r.id, owner: r.owner_name || "", pet: r.pet_name || "", phone: r.contact || "", doneAt: ymd(new Date(r.returned_at)), lang: english(r.notes, r.source) ? "en" : "zh" });
  }
  for (const r of (dep?.data || []) as (Row & { service_date: string })[]) {
    push({ entity: "deposit", ref: r.id, owner: r.owner_name || "", pet: r.pet_name || "", phone: r.contact || "", doneAt: r.service_date, lang: english(r.notes, r.source) ? "en" : "zh" });
  }
  return { items: items.sort((a, b) => a.doneAt.localeCompare(b.doneAt)), ready: true };
}
