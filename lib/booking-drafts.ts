import { createAdminClient } from "@/lib/supabase/admin";
import { shopDomain, shopifyGraphQL } from "@/lib/shopify";

export type BookingDraft = { name: string; url: string };
type Booking = { id: string; payment_status?: string | null; shopify_order_id?: string | number | null };
type Draft = { id: string; name: string; status: string; order: { id: string } | null };

const QUERY = `query BookingDrafts($ids: [ID!]!) {
  nodes(ids: $ids) { ... on DraftOrder { id name status order { id } } }
}`;

// Read only: use the current payment draft, and verify that it has not become an order.
export async function loadBookingDrafts(bookings: Booking[]) {
  const drafts = new Map<string, BookingDraft>();
  const refs = bookings.filter((b) => !b.shopify_order_id && !["paid", "refunded"].includes(b.payment_status || "")).map((b) => b.id);
  if (!refs.length || !shopDomain()) return { drafts, unavailable: false };
  try {
    const admin = createAdminClient();
    for (let offset = 0; offset < refs.length; offset += 100) {
      const { data, error } = await admin.from("follow_up_marks")
        .select("ref, payment_draft_id").eq("entity", "cremation").in("ref", refs.slice(offset, offset + 100));
      if (error) throw new Error("Draft references unavailable");
      const marks = (data || []).filter((m) => /^gid:\/\/shopify\/DraftOrder\/\d+$/.test(m.payment_draft_id || ""));
      const ids = [...new Set(marks.map((m) => String(m.payment_draft_id)))];
      if (!ids.length) continue;
      const result = await shopifyGraphQL<{ nodes: (Draft | null)[] }>(QUERY, { ids });
      const active = new Map(result.nodes.filter((d): d is Draft => !!d?.name && ["OPEN", "INVOICE_SENT"].includes(d.status) && !d.order).map((d) => [d.id, d]));
      for (const mark of marks) {
        const draft = active.get(mark.payment_draft_id);
        if (draft) drafts.set(mark.ref, { name: draft.name, url: `https://${shopDomain()}/admin/draft_orders/${draft.id.split("/").pop()}` });
      }
    }
    return { drafts, unavailable: false };
  } catch {
    return { drafts, unavailable: true };
  }
}

