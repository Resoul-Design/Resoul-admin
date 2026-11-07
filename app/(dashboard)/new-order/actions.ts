"use server";

// 統一「開新單」：先寫 Supabase（公司單號、專案編號、付款參考），再按類型建立 Shopify 草稿訂單。
// Shopify 失敗時保留記錄（狀態「未同步 Shopify」），可在單詳情重試；以標籤 ro-xxxxxxxx 防止重試時重覆開單。
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getStaff, hasModule, type Staff } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopifyGraphQL } from "@/lib/shopify";
import { createDraftWithCustomer } from "@/lib/shopify-customer";
import { CREMATION_TYPES, DEPOSIT_TYPES } from "@/lib/catalog";
import { PLAN_CODES } from "@/lib/company";
import { findTimeSlot } from "@/lib/deposit-followup";
import { isProjectNo, projectNoFromNotes, canonicalProjectNo } from "@/lib/order-label";
import { phoneKey } from "@/lib/product-orders";
import { newCompanyProjectNo } from "@/lib/project-no";
import { loadSiteContent } from "@/lib/site-content-server";
import { ORDER_TYPE_MAP, RECEIVED_METHODS, type OrderType, type PaymentIntent } from "@/lib/order-types";

export type NewOrderLine = { variantId: string; quantity: number };
export type NewOrderInput = {
  clientToken: string;
  type: OrderType;
  customer: { name: string; phone: string; email?: string; referrerPhone?: string };
  projectNo?: string; // 沿用客人原有專案；留空＝新專案
  petName?: string;
  petType?: string;
  serviceDate?: string;
  serviceSlot?: string;
  address?: string;
  internalNote?: string;
  publicNote?: string;
  paymentIntent: PaymentIntent;
  receivedMethod?: string;
  variantId?: string; // 告別套餐、接送訂金
  lines?: NewOrderLine[]; // 紀念品；告別套餐的加購
  vetSurcharges?: number[]; // 安樂在家附加費（網站內容的序號）
  other?: { title: string; amount: number; description?: string };
};

export type CustomerMatch = {
  name: string;
  email: string;
  pets: string[];
  projects: { projectNo: string; invoiceNo: number | null; lastDate: string; labels: string[] }[];
};

type Line = { variantId?: string; title?: string; price?: number; quantity: number; label: string };
type DraftPlan = { lineItems: Record<string, unknown>[]; note: string; tags: string[]; attributes: { key: string; value: string }[]; email: string };

const DRAFT_CREATE = `mutation UnifiedDraftCreate($input: DraftOrderInput!) {
  draftOrderCreate(input: $input) { draftOrder { id name invoiceUrl } userErrors { field message } }
}`;
const DRAFT_COMPLETE = `mutation UnifiedDraftComplete($id: ID!) {
  draftOrderComplete(id: $id) { draftOrder { id order { id name } } userErrors { message } }
}`;
const DRAFT_BY_TAG = `query DraftByTag($q: String!) { draftOrders(first: 1, query: $q) { nodes { id name invoiceUrl status order { id } } } }`;
const VARIANTS = `query UnifiedVariants($ids: [ID!]!) {
  nodes(ids: $ids) { ... on ProductVariant { id title price product { title productType status } } }
}`;
type VariantNode = { id: string; title: string; price: string | null; product: { title: string; productType: string | null; status: string } } | null;

const t = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const hk = (n: number) => `HK$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const syncTag = (id: string) => `ro-${id.slice(0, 8)}`;
const makePaymentRef = () => `PAY-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
const variantLabel = (v: NonNullable<VariantNode>) => `${v.product.title}${v.title && v.title !== "Default Title" ? `（${v.title}）` : ""}`;

function revalidateAll() {
  for (const p of ["/new-order", "/deposits", "/bookings", "/vet-assessments", "/orders", "/projects", "/"]) revalidatePath(p);
}

async function loadVariants(ids: string[]) {
  const res = await shopifyGraphQL<{ nodes: VariantNode[] }>(VARIANTS, { ids });
  return new Map(res.nodes.filter((n): n is NonNullable<VariantNode> => !!n).map((n) => [n.id, n]));
}

// ---- 客人：以電話找回既有客人及專案 ----
export async function lookupCustomer(phone: string): Promise<CustomerMatch | null> {
  const staff = await getStaff();
  if (!staff) return null;
  const key = phoneKey(phone);
  if (!key) return null;
  const admin = createAdminClient();
  const [dep, crem, prod, co, logistics] = await Promise.all([
    admin.from("deposit_bookings").select("owner_name, contact, pet_name, project_no, invoice_no, created_at").ilike("contact", `%${key}%`).order("created_at", { ascending: false }).limit(20),
    admin.from("cremation_bookings").select("owner_name, contact, pet_name, case_no, notes, source, invoice_no, created_at").ilike("contact", `%${key}%`).order("created_at", { ascending: false }).limit(20),
    admin.from("product_orders").select("customer_name, email, project_no, invoice_no, shopify_created_at").eq("phone_key", key).order("shopify_created_at", { ascending: false }).limit(20),
    admin.from("company_orders").select("customer_name, email, pet_name, project_no, invoice_no, order_type, created_at").eq("phone_key", key).order("created_at", { ascending: false }).limit(20),
    admin.from("logistics_orders").select("owner_name, phone, pet_name, invoice_no, created_at").ilike("phone", `%${key}%`).order("created_at", { ascending: false }).limit(20),
  ]);
  const projects = new Map<string, { projectNo: string; invoiceNo: number | null; lastDate: string; labels: Set<string> }>();
  const add = (no: string | null | undefined, invoice: number | null | undefined, date: string | null | undefined, label: string) => {
    const projectNo = canonicalProjectNo(no);
    if (projectNo === "—") return;
    const cur = projects.get(projectNo) || { projectNo, invoiceNo: invoice ?? null, lastDate: "", labels: new Set<string>() };
    cur.labels.add(label);
    if (invoice && !cur.invoiceNo) cur.invoiceNo = invoice;
    if ((date || "") > cur.lastDate) cur.lastDate = (date || "").slice(0, 10);
    projects.set(projectNo, cur);
  };
  const names: string[] = [];
  const pets = new Set<string>();
  let email = "";
  for (const r of dep.data || []) {
    if (phoneKey(r.contact) !== key) continue;
    names.push(r.owner_name || "");
    if (r.pet_name) pets.add(r.pet_name);
    add(r.project_no, r.invoice_no, r.created_at, "接送");
  }
  for (const r of crem.data || []) {
    if (phoneKey(r.contact) !== key) continue;
    names.push(r.owner_name || "");
    if (r.pet_name) pets.add(r.pet_name);
    add(r.case_no || projectNoFromNotes(r.notes), r.invoice_no, r.created_at, String(r.source || "").includes("euthanasia") ? "安樂在家" : "火化");
  }
  for (const r of prod.data || []) {
    names.push(r.customer_name || "");
    email = email || r.email || "";
    add(r.project_no, r.invoice_no, r.shopify_created_at, "紀念品");
  }
  for (const r of co.data || []) {
    names.push(r.customer_name || "");
    email = email || r.email || "";
    if (r.pet_name) pets.add(r.pet_name);
    add(r.project_no, r.invoice_no, r.created_at, ORDER_TYPE_MAP[r.order_type as OrderType]?.label || "其他");
  }
  for (const r of logistics.data || []) {
    if (phoneKey(r.phone) !== key) continue;
    names.push(r.owner_name || "");
    if (r.pet_name) pets.add(r.pet_name);
    add(null, Number(r.invoice_no) || null, r.created_at, "客戶資料");
  }
  if (!projects.size && !names.some(Boolean)) return null;
  return {
    name: names.find(Boolean) || "",
    email,
    pets: [...pets].slice(0, 5),
    projects: [...projects.values()]
      .sort((a, b) => b.lastDate.localeCompare(a.lastDate))
      .slice(0, 6)
      .map((p) => ({ projectNo: p.projectNo, invoiceNo: p.invoiceNo, lastDate: p.lastDate, labels: [...p.labels] })),
  };
}

// ---- 開新單 ----
export async function createOrder(input: NewOrderInput): Promise<{ id?: string; error?: string; warning?: string }> {
  const staff = await getStaff();
  if (!staff) return { error: "登入狀態已失效，請重新登入。" };
  const def = ORDER_TYPE_MAP[input?.type];
  if (!def) return { error: "請選擇單類型。" };
  if (!hasModule(staff, [def.module])) return { error: `沒有「${def.label}」的開單權限。` };
  if (!/^[0-9a-f-]{36}$/i.test(input.clientToken || "")) return { error: "表格已過期，請重新整理頁面。" };

  const admin = createAdminClient();
  // 同一次提交只建立一張單（網絡重試或雙按時）
  const { data: existing } = await admin.from("company_orders").select("id").eq("client_token", input.clientToken).maybeSingle();
  if (existing) return { id: existing.id };

  // 共用欄位
  const name = t(input.customer?.name, 100);
  const phone = t(input.customer?.phone, 40);
  const email = t(input.customer?.email, 254);
  const referrerPhone = t(input.customer?.referrerPhone, 40);
  const petName = t(input.petName, 100);
  const petType = t(input.petType, 80);
  const serviceDate = t(input.serviceDate, 10);
  const slot = input.serviceSlot ? findTimeSlot(t(input.serviceSlot, 60))?.zh || "" : "";
  const address = t(input.address, 300);
  const internalNote = t(input.internalNote, 1000);
  const publicNote = t(input.publicNote, 500);
  const enteredProject = t(input.projectNo, 40).toUpperCase();
  const intent: PaymentIntent = input.paymentIntent === "received" ? "received" : "link";
  const method = t(input.receivedMethod, 40);
  if (!name) return { error: "請填寫客人姓名。" };
  if (!phoneKey(phone)) return { error: "請填寫有效電話（8 位香港電話或 +國家碼）。" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "電郵格式無效。" };
  if (referrerPhone && !phoneKey(referrerPhone)) return { error: "推薦人電話格式無效。" };
  if (enteredProject && !isProjectNo(enteredProject)) return { error: "專案編號只可包含文字、數字、空格、連字號或底線（2–40 個字元）。" };
  if (serviceDate && !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return { error: "日期格式無效。" };
  if (intent === "received" && !RECEIVED_METHODS.includes(method)) return { error: "請選擇收款方式。" };

  // 類型細節：金額一律由 Shopify 產品或網站內容計算，不信任瀏覽器提交的價錢
  const lines: Line[] = [];
  let planName: string | null = null;
  try {
    if (input.type === "cremation" || input.type === "deposit") {
      const ids = [input.variantId || "", ...(input.type === "cremation" ? (input.lines || []).map((l) => l.variantId) : [])];
      if (ids.some((id) => !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(id))) return { error: input.type === "deposit" ? "請選擇訂金產品。" : "請選擇套餐及寵物體重。" };
      const variants = await loadVariants(ids);
      const main = variants.get(ids[0]);
      const allowed = input.type === "deposit" ? DEPOSIT_TYPES : CREMATION_TYPES;
      if (!main || main.product.status !== "ACTIVE" || !allowed.includes((main.product.productType || "").trim())) return { error: "所選產品不可用，請重新選擇。" };
      lines.push({ variantId: main.id, price: Number(main.price || 0), quantity: 1, label: variantLabel(main) });
      planName = input.type === "cremation" ? Object.keys(PLAN_CODES).find((k) => main.product.title.includes(k)) || main.product.title : "預約接送訂金";
      for (const l of input.type === "cremation" ? input.lines || [] : []) {
        const v = variants.get(l.variantId);
        const qty = Number(l.quantity);
        if (!v || v.product.status !== "ACTIVE" || !Number.isInteger(qty) || qty < 1 || qty > 99) return { error: "加購商品資料無效，請重新選擇。" };
        if ([...CREMATION_TYPES, ...DEPOSIT_TYPES].includes((v.product.productType || "").trim())) return { error: "加購只可選紀念品。" };
        lines.push({ variantId: v.id, price: Number(v.price || 0), quantity: qty, label: variantLabel(v) });
      }
    } else if (input.type === "product") {
      const list = (input.lines || []).filter((l) => l && l.variantId);
      if (!list.length || list.length > 20) return { error: "請選擇 1 至 20 項商品。" };
      if (list.some((l) => !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(l.variantId) || !Number.isInteger(Number(l.quantity)) || l.quantity < 1 || l.quantity > 99)) return { error: "商品或數量資料無效，請重新選擇。" };
      const variants = await loadVariants([...new Set(list.map((l) => l.variantId))]);
      for (const l of list) {
        const v = variants.get(l.variantId);
        if (!v || v.product.status !== "ACTIVE" || [...CREMATION_TYPES, ...DEPOSIT_TYPES].includes((v.product.productType || "").trim())) return { error: "所選商品不可用，請重新選擇。" };
        lines.push({ variantId: v.id, price: Number(v.price || 0), quantity: Number(l.quantity), label: variantLabel(v) });
      }
    } else if (input.type === "vet") {
      const vet = (await loadSiteContent()).content["prices.vet"];
      lines.push({ title: "上門獸醫評估及安樂服務 At-home vet assessment", price: vet.base, quantity: 1, label: `上門獸醫評估（${hk(vet.base)}）` });
      for (const i of [...new Set(input.vetSurcharges || [])]) {
        const s = vet.surcharges[i];
        if (!s) return { error: "附加費資料無效，請重新選擇。" };
        lines.push({ title: `附加費：${s.zh}${s.en ? ` ${s.en}` : ""}`, price: s.price, quantity: 1, label: `附加費：${s.zh}（${hk(s.price)}）` });
      }
    } else {
      const title = t(input.other?.title, 120);
      const amount = Number(input.other?.amount);
      if (!title) return { error: "請填寫項目名稱。" };
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return { error: "請填寫正確金額。" };
      lines.push({ title, price: Math.round(amount * 100) / 100, quantity: 1, label: `${title}（${hk(amount)}）` });
    }
  } catch (e) {
    console.error("[new_order_lines]", e instanceof Error ? e.message : "unknown");
    return { error: "未能讀取 Shopify 產品或收費資料，請稍後再試。" };
  }
  const amount = lines.reduce((n, l) => n + (l.price || 0) * l.quantity, 0);

  // 新專案：專案編號＝單號（例如 290）；沿用舊專案則保留原編號
  const projectNo = enteredProject || (await newCompanyProjectNo(admin));
  if (!projectNo) return { error: "未能編配單號，請稍後再試。" };
  const paymentRef = makePaymentRef();
  const who = staff.name || staff.email;
  const otherDescription = t(input.other?.description, 500);

  // 1) 服務記錄（接送、火化、安樂在家）：與網站預約同一格式，進度及付款流程沿用現有列表
  let linkedTable: "deposit_bookings" | "cremation_bookings" | null = null;
  let linkedId: string | null = null;
  let invoiceNo: number | null = null;
  if (input.type === "deposit" || input.type === "cremation" || input.type === "vet") {
    linkedTable = input.type === "deposit" ? "deposit_bookings" : "cremation_bookings";
    const notes = [
      input.type === "vet" ? "獸醫評估" : "",
      `專案編號：${projectNo}`,
      `付款參考: ${paymentRef}`,
      input.type === "vet" ? "" : `產品: ${lines[0].label}`,
      input.type === "vet" && address ? `地點：${address}` : "",
      slot ? `希望時段: ${slot}` : "",
      lines.length > 1 ? `${input.type === "vet" ? "收費" : "加購"}: ${lines.slice(input.type === "vet" ? 0 : 1).map((l) => `${l.label}×${l.quantity}`).join("、")}` : "",
      referrerPhone ? `推薦人電話: ${referrerPhone}` : "",
      `後台開新單：${who}`,
      internalNote ? `備註: ${internalNote}` : "",
    ].filter(Boolean).join(" | ");
    const common = {
      owner_name: name, contact: phone, pet_name: petName || null, pet_type: petType || null, service_date: serviceDate || null,
      pickup_address: input.type === "vet" ? null : address || null, notes, status: "new",
      payment_ref: paymentRef, payment_status: "pending", payment_amount: amount, payment_currency: "HKD",
    };
    const row: Record<string, unknown> = input.type === "deposit"
      ? { ...common, project_no: projectNo, plan: planName, service_time: slot || null, source: "admin:deposit" }
      : { ...common, case_no: projectNo, plan: input.type === "vet" ? null : planName, service_time: null, source: input.type === "vet" ? "admin:euthanasia" : "admin:cremation" };
    let ins = await admin.from(linkedTable).insert(row).select("id, invoice_no").single();
    // 同一專案已有火化預約或獸醫評估（case_no 唯一）：專案編號只寫入備註
    if (ins.error && linkedTable === "cremation_bookings" && /duplicate|unique/i.test(ins.error.message)) {
      ins = await admin.from(linkedTable).insert({ ...row, case_no: null }).select("id, invoice_no").single();
    }
    if (ins.error || !ins.data) {
      console.error("[new_order_insert]", ins.error?.message);
      return { error: `未能建立記錄：${ins.error?.message || "未知錯誤"}` };
    }
    linkedId = ins.data.id;
    invoiceNo = ins.data.invoice_no;
  } else {
    const { data, error } = await admin.rpc("company_invoice_for_project", { p_project: projectNo });
    if (error) return { error: "未能取得公司單號，請確認已執行 db/migration_20261108_company_invoice_no.sql。" };
    invoiceNo = data as number;
  }
  if (!invoiceNo) return { error: "未能取得公司單號，請確認已執行 db/migration_20261108_company_invoice_no.sql。" };

  // 2) 開單記錄＋ Shopify 草稿內容（重試時用同一內容）
  const def2 = ORDER_TYPE_MAP[input.type];
  const booking = linkedTable !== null;
  const refAttrs = [{ key: "Project No", value: projectNo }, ...(booking ? [{ key: "payment_ref", value: paymentRef }] : [])];
  const plan: DraftPlan = {
    email,
    note: [publicNote, otherDescription && input.type === "other" ? otherDescription : "", petName ? `寵物：${petName}` : "", `單據編號：${invoiceNo}`].filter(Boolean).join("\n"),
    tags: [...def2.tags, projectNo, `Invoice ${invoiceNo}`],
    attributes: [
      { key: "Invoice No", value: String(invoiceNo) },
      { key: "Order Type", value: def2.label },
      ...refAttrs,
      { key: "Owner", value: name },
      { key: "Phone", value: phone },
      ...(petName ? [{ key: "Pet", value: petName }] : []),
      ...(referrerPhone ? [{ key: "referrer_phone", value: referrerPhone }] : []),
    ],
    lineItems: lines.map((l) =>
      l.variantId
        ? { variantId: l.variantId, quantity: l.quantity, customAttributes: refAttrs }
        : { title: l.title, quantity: l.quantity, originalUnitPriceWithCurrency: { amount: (l.price || 0).toFixed(2), currencyCode: "HKD" }, requiresShipping: false, taxable: false, customAttributes: refAttrs }
    ),
  };
  const { data: order, error: orderError } = await admin
    .from("company_orders")
    .insert({
      client_token: input.clientToken, invoice_no: invoiceNo, project_no: projectNo, order_type: input.type, status: "draft",
      customer_name: name, phone, phone_key: phoneKey(phone), email: email || null, pet_name: petName || null, referrer_phone: referrerPhone || null,
      amount, payment_intent: intent, payment_ref: paymentRef, linked_table: linkedTable, linked_id: linkedId, created_by: who,
      details: {
        lines: lines.map((l) => ({ label: l.label, quantity: l.quantity, price: l.price })),
        petType: petType || null, serviceDate: serviceDate || null, serviceSlot: slot || null, address: address || null,
        internalNote: internalNote || null, publicNote: publicNote || null, receivedMethod: intent === "received" ? method : null,
        other: input.type === "other" ? { title: lines[0].title, description: otherDescription || null } : null,
        vetSurcharges: input.type === "vet" ? input.vetSurcharges || [] : null,
        draft: plan,
      },
    })
    .select("id")
    .single();
  if (orderError || !order) {
    console.error("[new_order_record]", orderError?.message);
    if (/client_token/.test(orderError?.message || "")) {
      const { data: again } = await admin.from("company_orders").select("id").eq("client_token", input.clientToken).maybeSingle();
      if (again) return { id: again.id };
    }
    if (linkedTable && linkedId) await admin.from(linkedTable).delete().eq("id", linkedId);
    return { error: "未能建立開單記錄，請確認已執行 db/migration_20261108_company_invoice_no.sql。" };
  }

  await admin.from("logistics_orders").upsert({
    invoice_no: String(invoiceNo), owner_name: name, phone, pet_name: petName || null,
    plan: planName || def2.label, status: "新訂單", created_at: new Date().toISOString(),
  }, { onConflict: "invoice_no" });

  await logAudit("create_unified_order", "company_orders", order.id, `${def2.label}｜單號 ${invoiceNo}｜${projectNo}｜${hk(amount)}`);
  const sync = await syncToShopify(order.id, staff);
  revalidateAll();
  return { id: order.id, ...(sync.error ? { warning: sync.error } : {}) };
}

// ---- Shopify 同步（開單時及「重試同步」）----
async function syncToShopify(id: string, staff: Staff): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { data: o } = await admin.from("company_orders").select("*").eq("id", id).maybeSingle();
  if (!o) return { error: "找不到此單。" };
  if (o.status === "cancelled") return { error: "此單已取消。" };
  const plan = (o.details as { draft?: DraftPlan })?.draft;
  if (!plan) return { error: "此單缺少 Shopify 資料，請重新開單。" };
  const fail = async (message: string) => {
    await admin.from("company_orders").update({ sync_error: message, updated_at: new Date().toISOString() }).eq("id", id);
    return { error: message };
  };
  try {
    let draftId: string | null = o.shopify_draft_id;
    let invoiceUrl: string | null = o.shopify_invoice_url;
    let orderId: string | null = o.shopify_order_id;
    // 未有草稿紀錄：先按標籤找（上次可能已建立但未能寫回），找不到才建立
    if (!draftId) {
      const found = await shopifyGraphQL<{ draftOrders: { nodes: { id: string; invoiceUrl: string | null; order: { id: string } | null }[] } }>(DRAFT_BY_TAG, { q: `tag:${syncTag(id)}` });
      const hit = found.draftOrders.nodes[0];
      if (hit) {
        draftId = hit.id;
        invoiceUrl = hit.invoiceUrl;
        orderId = hit.order?.id || null;
      } else {
        const res = await createDraftWithCustomer<{ draftOrderCreate: { draftOrder: { id: string; name: string; invoiceUrl: string | null } | null; userErrors: { message: string }[] } }>(
          DRAFT_CREATE,
          {
            ...(plan.email ? { email: plan.email } : {}),
            note: plan.note,
            tags: [...plan.tags, syncTag(id)],
            customAttributes: plan.attributes,
            lineItems: plan.lineItems,
          },
          { name: o.customer_name, phone: o.phone, email: plan.email }
        );
        const payload = res.draftOrderCreate;
        if (payload.userErrors.length || !payload.draftOrder) return fail(payload.userErrors.map((e) => e.message).join("；") || "Shopify 沒有回傳草稿訂單。");
        draftId = payload.draftOrder.id;
        invoiceUrl = payload.draftOrder.invoiceUrl;
      }
      await admin.from("company_orders").update({ shopify_draft_id: draftId, shopify_invoice_url: invoiceUrl, shopify_order_id: orderId, status: orderId ? "paid" : "awaiting_payment", sync_error: null, updated_at: new Date().toISOString() }).eq("id", id);
      // 付款跟進沿用同一付款連結
      if (o.linked_table === "deposit_bookings" && o.linked_id) {
        await admin.from("deposit_bookings").update({ payment_link: invoiceUrl, payment_link_at: new Date().toISOString(), payment_draft_id: draftId }).eq("id", o.linked_id);
      } else if (o.linked_table === "cremation_bookings" && o.linked_id) {
        await admin.from("follow_up_marks").upsert({ entity: o.order_type === "vet" ? "vet" : "cremation", ref: o.linked_id, payment_link: invoiceUrl, payment_link_at: new Date().toISOString(), payment_draft_id: draftId }, { onConflict: "entity,ref" });
      }
    }

    // 已收款：Shopify 草稿直接完成為已付款訂單；服務記錄同時標記已付款（網站 webhook 之後會視為已處理）
    if (o.payment_intent === "received" && !orderId && draftId) {
      const res = await shopifyGraphQL<{ draftOrderComplete: { draftOrder: { order: { id: string; name: string } | null } | null; userErrors: { message: string }[] } }>(DRAFT_COMPLETE, { id: draftId });
      const payload = res.draftOrderComplete;
      if (payload.userErrors.length || !payload.draftOrder?.order) return fail(`Shopify 未能標記已付款：${payload.userErrors.map((e) => e.message).join("；") || "未知錯誤"}`);
      orderId = payload.draftOrder.order.id;
      await admin.from("company_orders").update({ shopify_order_id: orderId, status: "paid", sync_error: null, updated_at: new Date().toISOString() }).eq("id", id);
      if (o.linked_table && o.linked_id) {
        const method = (o.details as { receivedMethod?: string })?.receivedMethod || "其他";
        const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
        const { data: row } = await admin.from(o.linked_table).select("notes, payment_status").eq("id", o.linked_id).maybeSingle();
        if (row && row.payment_status !== "paid") {
          await admin.from(o.linked_table).update({
            payment_status: "paid", payment_amount: o.amount, payment_currency: "HKD", paid_at: new Date().toISOString(),
            shopify_order_id: orderId, shopify_order_name: payload.draftOrder.order.name,
            notes: `${row.notes || ""} | 開單時已收款 ${today}：${method} ${hk(Number(o.amount || 0))}（${staff.name || staff.email}）`.slice(0, 4000),
          }).eq("id", o.linked_id);
        }
      }
    }
    return {};
  } catch (e) {
    console.error("[new_order_sync]", e instanceof Error ? e.message : "unknown");
    return fail("連接 Shopify 失敗，記錄已保存，請稍後按「重試同步」。");
  }
}

export async function retrySync(id: string): Promise<{ error?: string }> {
  const staff = await getStaff();
  if (!staff) return { error: "登入狀態已失效，請重新登入。" };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "記錄無效。" };
  const { data: o } = await createAdminClient().from("company_orders").select("order_type").eq("id", id).maybeSingle();
  if (!o) return { error: "找不到此單。" };
  if (!hasModule(staff, [ORDER_TYPE_MAP[o.order_type as OrderType].module])) return { error: "沒有此功能的使用權限。" };
  const res = await syncToShopify(id, staff);
  await logAudit("retry_order_sync", "company_orders", id, res.error ? `失敗：${res.error}` : "成功");
  revalidateAll();
  return res;
}

// ---- 管理員人手修正單號（同一專案所有記錄一併更新，留審計記錄）----
export async function changeInvoiceNo(oldNo: number, newNoText: string, reason: string): Promise<{ error?: string }> {
  const staff = await getStaff();
  if (!staff || staff.role !== "admin") return { error: "只限管理員修改單號。" };
  const newNo = Number(String(newNoText).trim());
  if (!Number.isInteger(oldNo) || !Number.isInteger(newNo) || newNo < 1 || newNo > 99_999_999) return { error: "請輸入正整數單號。" };
  const note = t(reason, 300);
  if (!note) return { error: "請填寫修改原因。" };
  const { error } = await createAdminClient().rpc("set_company_invoice_no", { p_old: oldNo, p_new: newNo, p_note: `${note}（${staff.name || staff.email}）` });
  if (error) return { error: /already used|23505/.test(error.message) ? `單號 ${newNo} 已被使用。` : "未能修改單號。" };
  await logAudit("change_invoice_no", "company_invoices", String(newNo), `${oldNo} → ${newNo}｜${note}`);
  revalidateAll();
  return {};
}

