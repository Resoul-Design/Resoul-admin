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
import { appendNote } from "@/lib/payment-check";
import { invoiceLabel } from "@/lib/invoice-label";
import { depositCreditValue } from "@/lib/deposit-amount";
import { newCompanyProjectNo } from "@/lib/project-no";
import { loadSiteContent } from "@/lib/site-content-server";
import { ORDER_TYPE_MAP, RECEIVED_METHODS, type OrderType, type PaymentIntent } from "@/lib/order-types";
import { applyFix } from "@/lib/reconcile-fix";
import { loadInvoiceProductLines } from "@/lib/memorial-lines";

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
  lines?: NewOrderLine[]; // 紀念品；告別套餐及安樂在家的加購
  depositCreditId?: string; // 扣除同一專案已付的接送訂金（deposit_bookings.id）
  vetSurcharges?: number[]; // 安樂在家附加費（網站內容的序號）
  other?: { title: string; amount: number; description?: string };
};

export type CustomerMatch = {
  name: string;
  email: string;
  pets: string[];
  projects: { projectNo: string; invoiceNo: number | null; lastDate: string; labels: string[]; deposits: DepositCredit[] }[];
};

// 同一專案可扣除的接送訂金（已付款、未用、未取消）
export type DepositCredit = { id: string; invoiceNo: number | null; amount: number; paidAt: string; isTest: boolean };

type Line = { variantId?: string; title?: string; price?: number; quantity: number; label: string };
type DraftPlan = {
  lineItems: Record<string, unknown>[]; note: string; tags: string[]; attributes: { key: string; value: string }[]; email: string;
  appliedDiscount?: { title: string; description: string; value: number; valueType: "FIXED_AMOUNT" };
};

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
    admin.from("deposit_bookings").select("id, owner_name, contact, pet_name, project_no, invoice_no, created_at, payment_status, payment_amount, paid_at, credit_target, status, is_test").ilike("contact", `%${key}%`).order("created_at", { ascending: false }).limit(20),
    admin.from("cremation_bookings").select("owner_name, contact, pet_name, case_no, notes, source, invoice_no, created_at").ilike("contact", `%${key}%`).order("created_at", { ascending: false }).limit(20),
    admin.from("product_orders").select("customer_name, email, project_no, invoice_no, shopify_created_at").eq("phone_key", key).order("shopify_created_at", { ascending: false }).limit(20),
    admin.from("company_orders").select("customer_name, email, pet_name, project_no, invoice_no, order_type, created_at").eq("phone_key", key).order("created_at", { ascending: false }).limit(20),
    admin.from("logistics_orders").select("owner_name, phone, email, pet_name, invoice_no, created_at").ilike("phone", `%${key}%`).order("created_at", { ascending: false }).limit(20),
  ]);
  const projects = new Map<string, { projectNo: string; invoiceNo: number | null; lastDate: string; labels: Set<string>; deposits: DepositCredit[] }>();
  const add = (no: string | null | undefined, invoice: number | null | undefined, date: string | null | undefined, label: string) => {
    const projectNo = canonicalProjectNo(no);
    if (projectNo === "—") return;
    const cur = projects.get(projectNo) || { projectNo, invoiceNo: invoice ?? null, lastDate: "", labels: new Set<string>(), deposits: [] };
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
    const no = canonicalProjectNo(r.project_no);
    if (no !== "—" && r.payment_status === "paid" && !r.credit_target && r.status !== "cancelled") {
      projects.get(no)?.deposits.push({ id: r.id, invoiceNo: r.invoice_no ?? null, amount: depositCreditValue(r.payment_amount), paidAt: String(r.paid_at || r.created_at || "").slice(0, 10), isTest: !!r.is_test });
    }
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
    email = email || r.email || "";
    if (r.pet_name) pets.add(r.pet_name);
    add(null, Number(r.invoice_no) || null, r.created_at, "客戶資料");
  }
  if (!projects.size && !names.some(Boolean)) return null;
  return {
    name: names.find(Boolean) || "",
    email,
    pets: [...pets].slice(0, 5),
    projects: [...projects.values()]
      // 按單號由新到舊；未有單號的舊專案排最後
      .sort((a, b) => (b.invoiceNo ?? -1) - (a.invoiceNo ?? -1) || b.lastDate.localeCompare(a.lastDate))
      .slice(0, 10)
      .map((p) => ({ projectNo: p.projectNo, invoiceNo: p.invoiceNo, lastDate: p.lastDate, labels: [...p.labels], deposits: p.deposits })),
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
      // 加購紀念品（與告別套餐相同規則）
      const extra = (input.lines || []).filter((l) => l && l.variantId);
      if (extra.length > 20) return { error: "加購最多 20 項。" };
      if (extra.some((l) => !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(l.variantId) || !Number.isInteger(Number(l.quantity)) || l.quantity < 1 || l.quantity > 99)) return { error: "加購商品資料無效，請重新選擇。" };
      if (extra.length) {
        const variants = await loadVariants([...new Set(extra.map((l) => l.variantId))]);
        for (const l of extra) {
          const v = variants.get(l.variantId);
          if (!v || v.product.status !== "ACTIVE" || [...CREMATION_TYPES, ...DEPOSIT_TYPES].includes((v.product.productType || "").trim())) return { error: "加購只可選紀念品。" };
          lines.push({ variantId: v.id, price: Number(v.price || 0), quantity: Number(l.quantity), label: variantLabel(v) });
        }
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

  // 扣除接送訂金：只限同一專案、已付款、未用、未取消
  let credit: { id: string; amount: number; invoiceNo: number | null; notes: string | null } | null = null;
  const creditId = t(input.depositCreditId, 40);
  if (creditId) {
    if (input.type === "deposit") return { error: "接送訂金單不能再扣除訂金。" };
    if (!/^[0-9a-f-]{36}$/i.test(creditId)) return { error: "接送訂金資料無效。" };
    if (!enteredProject) return { error: "只可扣除同一專案的接送訂金，請先選擇客人原有專案。" };
    const { data: dep } = await admin.from("deposit_bookings").select("id, project_no, payment_status, payment_amount, credit_target, status, invoice_no, notes").eq("id", creditId).maybeSingle();
    if (!dep || dep.payment_status !== "paid" || dep.status === "cancelled") return { error: "此接送訂金未付款或已取消，不能扣除。" };
    if (String(dep.project_no || "").toUpperCase() !== projectNo.toUpperCase()) return { error: `只可扣除同一專案（${projectNo}）的接送訂金。` };
    if (dep.credit_target) return { error: "此接送訂金已用於另一張單。" };
    const value = Math.min(depositCreditValue(dep.payment_amount), amount);
    if (value > 0) credit = { id: dep.id, amount: value, invoiceNo: dep.invoice_no ?? null, notes: dep.notes };
  }
  const creditText = credit ? `接送訂金${credit.invoiceNo ? `（單號 ${credit.invoiceNo}）` : ""} ${hk(credit.amount)}（${projectNo}）` : "";
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
      credit ? `💰 接送訂金抵扣：${creditText}` : "",
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
  const basePlan: DraftPlan = {
    email,
    note: [publicNote, otherDescription && input.type === "other" ? otherDescription : "", petName ? `寵物：${petName}` : "", `單據編號：${invoiceLabel(invoiceNo, input.type)}`].filter(Boolean).join("\n"),
    // 標籤只放類型；舊專案（RSL- 或自訂編號）另加專案編號。單號不加標籤（已在自訂欄位 Invoice No 及備註）
    tags: [...def2.tags, ...(projectNo !== String(invoiceNo) ? [projectNo] : [])],
    attributes: [
      { key: "Invoice No", value: invoiceLabel(invoiceNo, input.type) },
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
  // 扣訂金：Shopify 草稿加「接送訂金抵扣」折扣，並在備註、自訂欄位及標籤留下記錄（與列表的訂金抵扣相同格式）
  const plan: DraftPlan = credit
    ? {
        ...basePlan,
        note: [basePlan.note, `💰 接送訂金抵扣：${creditText}`].join("\n"),
        attributes: [...basePlan.attributes, { key: "Deposit credit", value: creditText }],
        tags: [...basePlan.tags, "Deposit Credit"],
        appliedDiscount: { title: "接送訂金抵扣", description: creditText.slice(0, 255), value: credit.amount, valueType: "FIXED_AMOUNT" },
      }
    : basePlan;
  const details = {
    lines: lines.map((l) => ({ label: l.label, quantity: l.quantity, price: l.price })),
    petType: petType || null, serviceDate: serviceDate || null, serviceSlot: slot || null, address: address || null,
    internalNote: internalNote || null, publicNote: publicNote || null, receivedMethod: intent === "received" ? method : null,
    other: input.type === "other" ? { title: lines[0].title, description: otherDescription || null } : null,
    vetSurcharges: input.type === "vet" ? input.vetSurcharges || [] : null,
    depositCredit: credit ? { depositId: credit.id, amount: credit.amount, invoiceNo: credit.invoiceNo } : null,
    draft: plan,
  };
  const { data: order, error: orderError } = await admin
    .from("company_orders")
    .insert({
      client_token: input.clientToken, invoice_no: invoiceNo, project_no: projectNo, order_type: input.type, status: "draft",
      customer_name: name, phone, phone_key: phoneKey(phone), email: email || null, pet_name: petName || null, referrer_phone: referrerPhone || null,
      amount, payment_intent: intent, payment_ref: paymentRef, linked_table: linkedTable, linked_id: linkedId, created_by: who,
      details,
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

  const { error: logisticsError } = await admin.from("logistics_orders").upsert({
    invoice_no: invoiceNo, source: "admin", owner_name: name, phone, email: email || null, pet_name: petName || null, animal: petType || null,
    package_name: planName || def2.label, arrival_date: serviceDate || null, arrival_time: slot || null, pickup_from: address || null, invoice_amount: amount,
  }, { onConflict: "invoice_no", ignoreDuplicates: true });
  if (logisticsError) console.error("[new_order_logistics]", logisticsError.message);

  // 扣訂金：先標記訂金已使用（同時兩張單只有一張成功），失敗則照常開單但不扣
  let creditWarning = "";
  if (credit) {
    const target = linkedTable === "cremation_bookings" && linkedId ? `cremation:${linkedId}` : `company:${order.id}`;
    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const { data: claimed } = await admin
      .from("deposit_bookings")
      .update({ credit_target: target, credit_amount: credit.amount, credit_applied_at: new Date().toISOString(), notes: appendNote(credit.notes, `💰 接送訂金抵扣 ${today}：${hk(credit.amount)} 用於${def2.label}（單號 ${invoiceNo}）`) })
      .eq("id", credit.id).is("credit_target", null).select("id");
    if (claimed?.length) {
      if (linkedTable === "cremation_bookings" && linkedId) await admin.from("cremation_bookings").update({ deposit_credit: credit.amount, deposit_credit_ref: credit.id }).eq("id", linkedId);
      await logAudit("apply_deposit_credit", "deposit_bookings", credit.id, `開新單｜${def2.label}｜單號 ${invoiceNo}｜抵扣 ${hk(credit.amount)}`);
    } else {
      await admin.from("company_orders").update({ details: { ...details, depositCredit: null, draft: basePlan } }).eq("id", order.id);
      if (linkedTable && linkedId) {
        const { data: row } = await admin.from(linkedTable).select("notes").eq("id", linkedId).maybeSingle();
        await admin.from(linkedTable).update({ notes: String(row?.notes || "").replace(` | 💰 接送訂金抵扣：${creditText}`, "") }).eq("id", linkedId);
      }
      creditWarning = "此接送訂金剛被另一張單使用，此單未有扣除訂金。";
    }
  }

  await logAudit("create_unified_order", "company_orders", order.id, `${def2.label}｜單號 ${invoiceNo}｜${projectNo}｜${hk(amount)}`);
  const sync = await syncToShopify(order.id, staff);
  revalidateAll();
  const warning = [creditWarning, sync.error || ""].filter(Boolean).join(" ");
  return { id: order.id, ...(warning ? { warning } : {}) };
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
            ...(plan.appliedDiscount ? { appliedDiscount: plan.appliedDiscount } : {}),
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
            notes: `${row.notes || ""} | 開單時已收款 ${today}：${method} ${hk(Number(o.amount || 0) - Number((o.details as { depositCredit?: { amount?: number } | null })?.depositCredit?.amount || 0))}（${staff.name || staff.email}）`.slice(0, 4000),
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

// ---- 開單後加產品：把紀念品表格的新項目同步到 Shopify ----
// 未付款：加入同一單號現有的付款連結草稿（保留原有項目及訂金折扣）。
// 已付款或未有付款連結：Shopify 不能直接加項目，用同一單號另開付款連結。
// 每行帶 _resoul_line 欄位：重試時不會重覆加入；失敗保留「同步失敗」可重試。
const LINE_KEY = "_resoul_line";
const DRAFT_FOR_ADD = `query DraftForAdd($id: ID!) { draftOrder(id: $id) { id name status invoiceUrl order { id } appliedDiscount { title description value valueType }
  lineItems(first: 100) { nodes { title quantity custom requiresShipping taxable variant { id } originalUnitPriceWithCurrency { amount currencyCode } priceOverride { amount currencyCode } appliedDiscount { title description value valueType } customAttributes { key value } } } } }`;
const DRAFT_ADD = `mutation DraftAddLines($id: ID!, $input: DraftOrderInput!) { draftOrderUpdate(id: $id, input: $input) { draftOrder { id name invoiceUrl } userErrors { field message } } }`;
type DraftDiscount = { title: string | null; description: string | null; value: number; valueType: string } | null;
type DraftForAdd = {
  id: string; name: string; status: string; invoiceUrl: string | null; order: { id: string } | null; appliedDiscount: DraftDiscount;
  lineItems: { nodes: { title: string; quantity: number; custom: boolean; requiresShipping: boolean; taxable: boolean; variant: { id: string } | null; originalUnitPriceWithCurrency: { amount: string; currencyCode: string } | null; priceOverride: { amount: string; currencyCode: string } | null; appliedDiscount: DraftDiscount; customAttributes: { key: string; value: string | null }[] }[] };
};
type SyncLine = { id: string; product_name: string; variant_title: string | null; variant_id: string | null; quantity: number; unit_price: number | null };
export type ProductSyncResult = { error?: string; done?: string; shopifyRef?: string; invoiceUrl?: string };

const moneyInput = (n: number) => ({ amount: n.toFixed(2), currencyCode: "HKD" });
const discountInput = (d: DraftDiscount) => (d ? { title: d.title, description: d.description, value: d.value, valueType: d.valueType } : null);

// 表格一行 → Shopify 草稿項目。揀選的產品改了價錢時用 priceOverride；自訂項目用自訂價錢。
async function linesToDraftItems(lines: SyncLine[], extraAttrs: { key: string; value: string }[]) {
  const ids = [...new Set(lines.map((l) => l.variant_id).filter(Boolean) as string[])];
  const variants = ids.length ? await loadVariants(ids) : new Map<string, NonNullable<VariantNode>>();
  return lines.map((l) => {
    const customAttributes = [...extraAttrs, { key: LINE_KEY, value: l.id }];
    const price = Number(l.unit_price || 0);
    const v = l.variant_id ? variants.get(l.variant_id) : null;
    if (v && v.product.status === "ACTIVE") {
      return { variantId: v.id, quantity: l.quantity, customAttributes, ...(Math.abs(Number(v.price || 0) - price) > 0.005 ? { priceOverride: moneyInput(price) } : {}) };
    }
    const title = l.variant_title ? `${l.product_name}（${l.variant_title}）` : l.product_name;
    return { title, quantity: l.quantity, originalUnitPriceWithCurrency: moneyInput(price), requiresShipping: false, taxable: false, customAttributes };
  });
}

// 把草稿現有項目還原為輸入格式（draftOrderUpdate 的 lineItems 會整批取代）
function existingDraftItems(d: DraftForAdd) {
  return d.lineItems.nodes.map((n) => {
    const customAttributes = n.customAttributes.map((a) => ({ key: a.key, value: a.value || "" }));
    const discount = n.appliedDiscount ? { appliedDiscount: discountInput(n.appliedDiscount) } : {};
    if (n.variant && !n.custom) return { variantId: n.variant.id, quantity: n.quantity, customAttributes, ...discount, ...(n.priceOverride ? { priceOverride: n.priceOverride } : {}) };
    return { title: n.title, quantity: n.quantity, originalUnitPriceWithCurrency: n.originalUnitPriceWithCurrency, requiresShipping: n.requiresShipping, taxable: n.taxable, customAttributes, ...discount };
  });
}

export async function syncInvoiceProducts(invoiceNo: number): Promise<ProductSyncResult> {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["inventory", "orders", "bookings", "vet_assessments", "deposits"])) return { error: "沒有權限。" };
  if (!Number.isInteger(invoiceNo) || invoiceNo < 1) return { error: "單號無效。" };
  const admin = createAdminClient();
  const who = staff.name || staff.email;
  const rv = () => { for (const p of [`/logistics/${invoiceNo}`, "/logistics", "/services", "/orders", "/bookings", "/vet-assessments", "/new-order"]) revalidatePath(p); };

  if ((await loadInvoiceProductLines(invoiceNo)).cancelled) return { error: "此單已取消，不能再同步新產品到 Shopify。" };

  // 取走待同步的行（同一時間只有一個同步；卡住超過 3 分鐘的可重試）
  const stale = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const claim = await admin.from("memorial_product_lines")
    .update({ sync_status: "syncing", sync_error: null, updated_at: new Date().toISOString() })
    .eq("invoice_no", invoiceNo)
    .or(`sync_status.in.(pending,failed),and(sync_status.eq.syncing,updated_at.lt."${stale}")`)
    .select("id, product_name, variant_title, variant_id, quantity, unit_price");
  if (claim.error) return { error: "未啟用紀念品產品表格：請先於 Supabase 執行 db/migration_20261109_memorial_lines_cancel.sql。" };
  let lines = (claim.data || []).map((l) => ({ ...l, quantity: Number(l.quantity), unit_price: l.unit_price == null ? null : Number(l.unit_price) })) as SyncLine[];
  if (!lines.length) return { error: "沒有待同步的項目（可能已有同事正在同步）。" };

  const failAll = async (message: string, ids = lines.map((l) => l.id)): Promise<ProductSyncResult> => {
    await admin.from("memorial_product_lines").update({ sync_status: "failed", sync_error: message.slice(0, 500), updated_at: new Date().toISOString() }).in("id", ids);
    await logAudit("sync_product_lines", "memorial_product_lines", String(invoiceNo), `單號 ${invoiceNo}｜失敗：${message}`);
    rv();
    return { error: `${message}（未有寫入 Shopify 的項目已標記「同步失敗」，可再按同步重試。）` };
  };
  const markSynced = async (ids: string[], d: { name: string; id: string; invoiceUrl: string | null }, companyId: string | null) => {
    await admin.from("memorial_product_lines").update({ sync_status: "synced", sync_error: null, shopify_ref: d.name, shopify_draft_id: d.id, invoice_url: d.invoiceUrl, target_company_id: companyId, synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in("id", ids);
  };
  const bad = lines.filter((l) => !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 999 || l.unit_price == null || !l.product_name);
  if (bad.length) return failAll("有項目欠缺單價或數量不是整數，請修改後再同步。");

  try {
    const [companyRes, cremationRes] = await Promise.all([
      admin.from("company_orders").select("*").eq("invoice_no", invoiceNo).neq("status", "cancelled").order("created_at", { ascending: false }),
      admin.from("cremation_bookings").select("id, status, payment_status, source").eq("invoice_no", invoiceNo),
    ]);
    const companies = companyRes.data || [];

    // 上次開附加單時 Shopify 失敗：先重試同一張，不會重覆開單
    for (const c of companies.filter((x) => x.status === "draft" && !x.shopify_draft_id && (x.details as { addonLineIds?: string[] } | null)?.addonLineIds?.length)) {
      const res = await syncToShopify(c.id, staff);
      if (res.error) return failAll(`Shopify 未能建立附加付款連結：${res.error}`);
      const { data: fresh } = await admin.from("company_orders").select("shopify_draft_id, shopify_invoice_url, status").eq("id", c.id).maybeSingle();
      const addonIds = ((c.details as { addonLineIds?: string[] }).addonLineIds || []);
      const d = await shopifyGraphQL<{ draftOrder: DraftForAdd | null }>(DRAFT_FOR_ADD, { id: fresh?.shopify_draft_id });
      await markSynced(addonIds, { name: d.draftOrder?.name || "", id: String(fresh?.shopify_draft_id || ""), invoiceUrl: fresh?.shopify_invoice_url || null }, c.id);
      c.shopify_draft_id = fresh?.shopify_draft_id; c.status = fresh?.status; c.shopify_invoice_url = fresh?.shopify_invoice_url;
      lines = lines.filter((l) => !addonIds.includes(l.id));
    }
    if (!lines.length) {
      rv();
      return { done: "已重試成功，新項目已建立 Shopify 付款連結。" };
    }

    // 找仍未付款的付款連結草稿（接送訂金除外）
    const candidates: { draftId: string; companyId: string | null; table?: "cremation_bookings"; bookingId?: string }[] = [];
    for (const c of companies) if (c.order_type !== "deposit" && c.status === "awaiting_payment" && c.shopify_draft_id && !c.shopify_order_id) candidates.push({ draftId: c.shopify_draft_id, companyId: c.id, ...(c.linked_table === "cremation_bookings" ? { table: "cremation_bookings" as const, bookingId: c.linked_id } : {}) });
    const unpaid = (cremationRes.data || []).filter((b) => b.status !== "cancelled" && b.payment_status !== "paid" && b.payment_status !== "refunded");
    if (unpaid.length) {
      const { data: marks } = await admin.from("follow_up_marks").select("ref, payment_draft_id").in("entity", ["cremation", "vet"]).in("ref", unpaid.map((b) => b.id)).not("payment_draft_id", "is", null);
      for (const m of marks || []) if (!candidates.some((x) => x.draftId === m.payment_draft_id)) candidates.push({ draftId: String(m.payment_draft_id), companyId: null, table: "cremation_bookings", bookingId: String(m.ref) });
    }
    for (const cand of candidates) {
      const cur = await shopifyGraphQL<{ draftOrder: DraftForAdd | null }>(DRAFT_FOR_ADD, { id: cand.draftId });
      const d = cur.draftOrder;
      if (!d || d.order || d.status === "COMPLETED") continue;
      const present = new Set(d.lineItems.nodes.flatMap((n) => n.customAttributes.filter((a) => a.key === LINE_KEY).map((a) => String(a.value))));
      const toAdd = lines.filter((l) => !present.has(l.id));
      if (toAdd.length) {
        const added = await linesToDraftItems(toAdd, []);
        const res = await shopifyGraphQL<{ draftOrderUpdate: { draftOrder: { id: string; name: string; invoiceUrl: string | null } | null; userErrors: { message: string }[] } }>(DRAFT_ADD, {
          id: d.id,
          input: { lineItems: [...existingDraftItems(d), ...added], ...(d.appliedDiscount ? { appliedDiscount: discountInput(d.appliedDiscount) } : {}) },
        });
        if (res.draftOrderUpdate.userErrors.length || !res.draftOrderUpdate.draftOrder) return failAll(`Shopify 未能加入項目：${res.draftOrderUpdate.userErrors.map((e) => e.message).join("；") || "未知錯誤"}`);
      }
      await markSynced(lines.map((l) => l.id), { name: d.name, id: d.id, invoiceUrl: d.invoiceUrl }, cand.companyId);
      // 後台項目及金額跟隨 Shopify
      await applyFix({ kind: "refresh-lines", id: cand.bookingId || cand.companyId || "", ...(cand.table && cand.bookingId ? { table: cand.table } : {}), ...(cand.companyId ? { companyId: cand.companyId } : {}), draftId: d.id }, who, logAudit);
      await logAudit("sync_product_lines", "memorial_product_lines", String(invoiceNo), `單號 ${invoiceNo}｜加入 Shopify ${d.name}｜${lines.map((l) => `${l.product_name}×${l.quantity}`).join("、")}`);
      rv();
      return { done: `已加入現有付款連結 ${d.name}，客人用同一條連結付款。`, shopifyRef: d.name, invoiceUrl: d.invoiceUrl || undefined };
    }

    // 沒有可加入的付款連結（已付款或未開付款連結）：同一單號另開付款連結
    const info = await invoiceCustomer(invoiceNo);
    if (!info.name || !phoneKey(info.phone)) return failAll("此單未有客人姓名或有效電話，未能開付款連結。請先在客戶資料補上。");
    // 單號對應的專案編號（舊 Excel 單號未有記錄時補上，令付款後仍歸入同一單號）
    const { data: inv } = await admin.from("company_invoices").select("project_no").eq("invoice_no", invoiceNo).maybeSingle();
    let projectNo = inv?.project_no as string | null | undefined;
    if (!projectNo) {
      projectNo = info.projectNo || String(invoiceNo);
      const write = inv ? await admin.from("company_invoices").update({ project_no: projectNo }).eq("invoice_no", invoiceNo) : await admin.from("company_invoices").insert({ invoice_no: invoiceNo, project_no: projectNo, manual: true, note: "紀念品加購：舊單號補記錄" });
      if (write.error) return failAll(`未能記錄單號 ${invoiceNo}：${write.error.message}`);
    }
    const def = ORDER_TYPE_MAP.product;
    const paymentRef = makePaymentRef();
    const refAttrs = [{ key: "Project No", value: projectNo }];
    const items = await linesToDraftItems(lines, refAttrs);
    const summary = lines.map((l) => ({ label: l.variant_title ? `${l.product_name}（${l.variant_title}）` : l.product_name, quantity: l.quantity, price: Number(l.unit_price || 0) }));
    const amount = summary.reduce((n, l) => n + l.price * l.quantity, 0);
    const plan: DraftPlan = {
      email: info.email,
      note: [info.pet ? `寵物：${info.pet}` : "", `單據編號：${invoiceLabel(invoiceNo, "product")}`, "開單後加購"].filter(Boolean).join("\n"),
      tags: [...def.tags, ...(projectNo !== String(invoiceNo) ? [projectNo] : [])],
      attributes: [{ key: "Invoice No", value: invoiceLabel(invoiceNo, "product") }, { key: "Order Type", value: def.label }, ...refAttrs, { key: "Owner", value: info.name }, { key: "Phone", value: info.phone }, ...(info.pet ? [{ key: "Pet", value: info.pet }] : [])],
      lineItems: items,
    };
    const { data: order, error: orderError } = await admin.from("company_orders").insert({
      client_token: randomUUID(), invoice_no: invoiceNo, project_no: projectNo, order_type: "product", status: "draft",
      customer_name: info.name, phone: info.phone, phone_key: phoneKey(info.phone), email: info.email || null, pet_name: info.pet || null,
      amount, payment_intent: "link", payment_ref: paymentRef, created_by: who,
      details: { lines: summary, addon: true, addonLineIds: lines.map((l) => l.id), draft: plan },
    }).select("id").single();
    if (orderError || !order) return failAll(`未能建立附加單記錄：${orderError?.message || "未知錯誤"}`);
    await admin.from("memorial_product_lines").update({ target_company_id: order.id }).in("id", lines.map((l) => l.id));
    const created = await syncToShopify(order.id, staff);
    if (created.error) return failAll(`Shopify 未能建立付款連結：${created.error}`);
    const { data: fresh } = await admin.from("company_orders").select("shopify_draft_id, shopify_invoice_url").eq("id", order.id).maybeSingle();
    const d = await shopifyGraphQL<{ draftOrder: DraftForAdd | null }>(DRAFT_FOR_ADD, { id: fresh?.shopify_draft_id });
    const name = d.draftOrder?.name || "";
    await markSynced(lines.map((l) => l.id), { name, id: String(fresh?.shopify_draft_id || ""), invoiceUrl: fresh?.shopify_invoice_url || null }, order.id);
    await logAudit("sync_product_lines", "memorial_product_lines", String(invoiceNo), `單號 ${invoiceNo}｜另開付款連結 ${name}｜${hk(amount)}`);
    rv();
    return { done: `此單已付款或未有付款連結，已用同一單號另開付款連結 ${name}（${hk(amount)}），客人只付新增項目。`, shopifyRef: name, invoiceUrl: fresh?.shopify_invoice_url || undefined };
  } catch (e) {
    console.error("[sync_product_lines]", e instanceof Error ? e.message : "unknown");
    return failAll("未能連接 Shopify，請稍後再試。");
  }
}

// 單號的客人資料（新單優先，舊 Excel 單號讀客戶資料）
async function invoiceCustomer(invoiceNo: number): Promise<{ name: string; phone: string; email: string; pet: string; projectNo: string }> {
  const admin = createAdminClient();
  const [company, deposit, cremation, product, logistics] = await Promise.all([
    admin.from("company_orders").select("customer_name, phone, email, pet_name, project_no").eq("invoice_no", invoiceNo).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("deposit_bookings").select("owner_name, contact, pet_name, project_no").eq("invoice_no", invoiceNo).limit(1).maybeSingle(),
    admin.from("cremation_bookings").select("owner_name, contact, pet_name, case_no").eq("invoice_no", invoiceNo).limit(1).maybeSingle(),
    admin.from("product_orders").select("customer_name, phone, email, project_no").eq("invoice_no", invoiceNo).limit(1).maybeSingle(),
    admin.from("logistics_orders").select("owner_name, phone, email, pet_name").eq("invoice_no", invoiceNo).maybeSingle(),
  ]);
  const first = (...v: (string | null | undefined)[]) => v.map((x) => String(x || "").trim()).find(Boolean) || "";
  return {
    name: first(company.data?.customer_name, cremation.data?.owner_name, deposit.data?.owner_name, product.data?.customer_name, logistics.data?.owner_name),
    phone: first(company.data?.phone, cremation.data?.contact, deposit.data?.contact, product.data?.phone, logistics.data?.phone),
    email: first(company.data?.email, product.data?.email, logistics.data?.email),
    pet: first(company.data?.pet_name, cremation.data?.pet_name, deposit.data?.pet_name, logistics.data?.pet_name),
    projectNo: first(company.data?.project_no, cremation.data?.case_no, deposit.data?.project_no, product.data?.project_no),
  };
}
