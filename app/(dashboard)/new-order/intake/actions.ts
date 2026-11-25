"use server";

// 預檢結果經現有 createOrder 開單（登入、權限、Shopify 價錢、client_token 防重）。
// 不直接寫資料庫、不寄出付款連結、不派車、不改編號產生器。OPC 失敗不會重開服務。
import { revalidatePath } from "next/cache";
import { getStaff, hasModule } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { loadCatalog, type DraftCatalogProduct } from "@/lib/catalog";
import { DEPOSIT_AMOUNT } from "@/lib/deposit-amount";
import { EXCEL_DRIVERS } from "@/lib/driver-names";
import { driverOptions } from "@/lib/drivers";
import { planImport } from "@/lib/logistics-import";
import { hkTimestamp, prepareIntake, previewSource, type DepositQuote, type ExistingIdentity, type IntakeAnswers, type IntakePayload, type IntakePreview, type OfficialVariant, type SourceValues } from "@/lib/order-intake";
import { buildBundleIntent, runIntakeBundle, verifyPersisted, type BundleRunResult, type IntakeGateway, type PersistedService, type ServiceDraft } from "@/lib/order-bundle";
import { recordOpc, type OpcResult, type OpcSummary } from "@/lib/opc-log";
import { createAdminClient } from "@/lib/supabase/admin";
import { createOrder, type NewOrderInput } from "../actions";

export type IntakeActionResult = {
  message?: string;
  business: BundleRunResult | { business: "blocked"; complete: false; row: IntakePayload | null; elapsedMs: number };
  opc: OpcResult;
  elapsedMs: number;
  phasesMs: { createAndRead: number; opc: number };
};

function variantsOf(products: DraftCatalogProduct[], productType: OfficialVariant["productType"]): OfficialVariant[] {
  return products.flatMap((p) => p.variants.filter((v) => v.sku && v.price != null).map((v) => ({
    id: v.id, sku: v.sku || "", title: v.title, productTitle: p.title, productType, price: Number(v.price),
  }))).filter((v) => v.sku && Number.isFinite(v.price));
}

async function officialCatalog(): Promise<{ catalog: OfficialVariant[]; deposit: DepositQuote; error: string }> {
  const [cremation, deposit, souvenir] = await Promise.all([loadCatalog("cremation"), loadCatalog("deposit"), loadCatalog("souvenir")]);
  const catalog = [...variantsOf(cremation.products, "cremation"), ...variantsOf(deposit.products, "deposit"), ...variantsOf(souvenir.products, "product")];
  const depositVariant = catalog.find((v) => v.productType === "deposit" && v.sku.toUpperCase() === "RS-DEPOSIT") || catalog.find((v) => v.productType === "deposit");
  const envRaw = process.env.DEPOSIT_AMOUNT;
  const envAmount = envRaw && Number(envRaw) > 0 ? Number(envRaw) : null;
  const quote: DepositQuote = {
    catalog: depositVariant ? { amount: depositVariant.price, variantId: depositVariant.id, sku: depositVariant.sku } : null,
    envAmount,
    establishedDefault: !depositVariant && envAmount == null ? { amount: DEPOSIT_AMOUNT, source: "lib/deposit-amount.ts DEPOSIT_AMOUNT" } : null,
  };
  return { catalog, deposit: quote, error: [cremation.error, deposit.error, souvenir.error].filter(Boolean).join(" ") };
}

async function driverList(): Promise<{ drivers: string[]; live: boolean }> {
  try {
    return { drivers: await driverOptions(), live: true };
  } catch {
    return { drivers: [...EXCEL_DRIVERS], live: false };
  }
}

async function loadExisting(formalNos: number[]): Promise<{ rows: ExistingIdentity[]; checked: boolean }> {
  if (!formalNos.length) return { rows: [], checked: true };
  try {
    const admin = createAdminClient();
    const texts = formalNos.map(String);
    const [invoices, deposits, cremations, logistics] = await Promise.all([
      admin.from("company_invoices").select("invoice_no, project_no").or(`invoice_no.in.(${formalNos.join(",")}),project_no.in.(${texts.join(",")})`),
      admin.from("deposit_bookings").select("invoice_no, project_no, owner_name, contact, pet_name, status, service_date, service_time").or(`invoice_no.in.(${formalNos.join(",")}),project_no.in.(${texts.join(",")})`),
      admin.from("cremation_bookings").select("invoice_no, case_no, owner_name, contact, pet_name, status, service_date, service_time").or(`invoice_no.in.(${formalNos.join(",")}),case_no.in.(${texts.join(",")})`),
      admin.from("logistics_orders").select("invoice_no, owner_name, phone, pet_name, weight_kg, arrival_date, arrival_time").in("invoice_no", formalNos),
    ]);
    if (invoices.error || deposits.error || cremations.error || logistics.error) return { rows: [], checked: false };
    const byNo = new Map<number, ExistingIdentity>();
    const touch = (formal: number) => {
      const cur = byNo.get(formal) || { formalNo: formal, projectNo: String(formal), invoiceNo: formal, owner: "", pet: "", phone: "", weightKg: null, arrivalDate: null, arrivalTime: null, canceled: false, hasDeposit: false, hasCremation: false };
      byNo.set(formal, cur);
      return cur;
    };
    for (const row of invoices.data || []) {
      const formal = Number(row.invoice_no) || Number(row.project_no);
      if (!formalNos.includes(formal)) continue;
      const cur = touch(formal);
      if (row.project_no) cur.projectNo = String(row.project_no);
    }
    for (const row of deposits.data || []) {
      const formal = Number(row.invoice_no) || Number(row.project_no);
      if (!formalNos.includes(formal)) continue;
      const cur = touch(formal);
      cur.hasDeposit = true;
      cur.projectNo = String(row.project_no || cur.projectNo);
      cur.owner ||= String(row.owner_name || "");
      cur.pet ||= String(row.pet_name || "");
      cur.phone ||= String(row.contact || "");
      cur.arrivalDate ||= row.service_date ? String(row.service_date).slice(0, 10) : null;
      cur.arrivalTime ||= row.service_time ? String(row.service_time).slice(0, 5) : null;
      if (row.status === "cancelled") cur.canceled = true;
    }
    for (const row of cremations.data || []) {
      const formal = Number(row.invoice_no) || Number(row.case_no);
      if (!formalNos.includes(formal)) continue;
      const cur = touch(formal);
      cur.hasCremation = true;
      cur.projectNo = String(row.case_no || cur.projectNo);
      cur.owner ||= String(row.owner_name || "");
      cur.pet ||= String(row.pet_name || "");
      cur.phone ||= String(row.contact || "");
      if (row.status === "cancelled" && !cur.hasDeposit) cur.canceled = true;
    }
    for (const row of logistics.data || []) {
      const formal = Number(row.invoice_no);
      if (!formalNos.includes(formal)) continue;
      const cur = touch(formal);
      cur.owner ||= String(row.owner_name || "");
      cur.pet ||= String(row.pet_name || "");
      cur.phone ||= String(row.phone || "");
      if (row.weight_kg != null && cur.weightKg == null) cur.weightKg = Number(row.weight_kg);
      cur.arrivalDate ||= row.arrival_date ? String(row.arrival_date).slice(0, 10) : null;
      cur.arrivalTime ||= row.arrival_time ? String(row.arrival_time).slice(0, 5) : null;
    }
    for (const cur of byNo.values()) {
      if (cur.hasDeposit || cur.hasCremation) {
        const liveDeposit = (deposits.data || []).some((r) => (Number(r.invoice_no) || Number(r.project_no)) === cur.formalNo && r.status !== "cancelled");
        const liveCremation = (cremations.data || []).some((r) => (Number(r.invoice_no) || Number(r.case_no)) === cur.formalNo && r.status !== "cancelled");
        cur.canceled = !liveDeposit && !liveCremation;
      }
    }
    return { rows: [...byNo.values()], checked: true };
  } catch {
    return { rows: [], checked: false };
  }
}

function guard() {
  return getStaff().then((staff) => {
    if (!staff) return { error: "登入狀態已失效，請重新登入。" as const, staff: null };
    if (!hasModule(staff, ["deposits"]) || !hasModule(staff, ["bookings"])) return { error: "需要同時有接送服務及火化預約權限。" as const, staff: null };
    return { error: null, staff };
  });
}

export async function previewIntake(input: { logisticsCsv: string; memorialCsv?: string; fileName: string; location: string; fetchedAtHk: string }): Promise<{ error?: string; preview?: IntakePreview }> {
  const auth = await guard();
  if (auth.error) return { error: auth.error };
  const [{ catalog, deposit }, drivers, existing] = await Promise.all([
    officialCatalog(),
    driverList(),
    loadExisting(formalNosIn(input.logisticsCsv)),
  ]);
  const preview = prepareIntake({
    logisticsCsv: input.logisticsCsv,
    memorialCsv: input.memorialCsv,
    source: { fileName: input.fileName, location: input.location, fetchedAtHk: input.fetchedAtHk || hkTimestamp() },
    catalog,
    deposit,
    drivers: drivers.drivers,
    driversLive: drivers.live,
    existing: existing.rows,
    backendChecked: existing.checked,
  });
  return { preview };
}

function formalNosIn(csv: string): number[] {
  const planned = planImport(csv, { isAdmin: true });
  return [...new Set(planned.rows.map((r) => r.invoiceNo).filter((n) => n > 278))];
}

function toOrderInput(draft: ServiceDraft): NewOrderInput {
  return {
    clientToken: draft.token,
    type: draft.type,
    customer: { name: draft.customer.name, phone: draft.customer.phone, email: draft.customer.email },
    projectNo: draft.projectNo || undefined,
    petName: draft.customer.petName,
    petType: draft.customer.petType,
    petWeight: draft.customer.weightKg,
    petBreed: draft.customer.breed,
    serviceDate: draft.serviceDate || undefined,
    ceremonyTime: draft.type === "cremation" ? draft.serviceTime || undefined : undefined,
    serviceSlot: draft.type === "deposit" ? draft.serviceTime || undefined : undefined,
    address: draft.address,
    driver: draft.type === "deposit" ? draft.driver || undefined : undefined,
    internalNote: draft.notes,
    paymentIntent: "link",
    variantId: draft.type === "deposit" ? draft.depositVariantId || undefined : draft.packageVariantId || undefined,
    lines: draft.productLines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    urn: draft.type === "cremation" ? { type: draft.urn?.type, pickupDate: draft.urn?.pickupDate } : undefined,
    urnPickup: draft.urnPickup || undefined,
    test: false,
  };
}

function realGateway(): IntakeGateway {
  const read = async (token: string) => {
    try { return await readPersisted(token, null, null); } catch { return null; }
  };
  return {
    read,
    readExisting: async (projectNo, type) => {
      try { return await readPersisted(null, projectNo, type); } catch { return null; }
    },
    async create(draft) {
      try {
        const already = await readPersisted(draft.token, null, null);
        if (already) return { ok: true };
        const res = await createOrder(toOrderInput(draft));
        if (!res.id) return { ok: false, error: res.error || "未能建立服務。" };
        return { ok: true, warning: res.warning };
      } catch {
        return { ok: false, error: "開單時未能連接已授權的服務。已停止，沒有假設成功。" };
      }
    },
  };
}

async function readPersisted(token: string | null, projectNo: string | null, type: "deposit" | "cremation" | null): Promise<PersistedService | null> {
  const admin = createAdminClient();
  let query = admin.from("company_orders").select("id, client_token, invoice_no, project_no, order_type, amount, payment_intent, status, details, linked_id, linked_table").neq("status", "cancelled");
  if (token) query = query.eq("client_token", token);
  else if (projectNo && type) query = query.eq("project_no", projectNo).eq("order_type", type);
  else return null;
  const { data: order } = await query.order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!order?.linked_id || (order.linked_table !== "deposit_bookings" && order.linked_table !== "cremation_bookings")) return null;
  const bookingTable = order.linked_table;
  const [bookingRes, logisticsRes] = await Promise.all([
    admin.from(bookingTable).select("*").eq("id", order.linked_id).maybeSingle(),
    admin.from("logistics_orders").select("driver").eq("invoice_no", order.invoice_no).maybeSingle(),
  ]);
  const booking = bookingRes.data;
  if (!booking) return null;
  const details = (order.details || {}) as { driver?: string | null; planSku?: string | null; lines?: { sku?: string | null }[]; draft?: { note?: string | null } };
  const skus = [...new Set([details.planSku, ...(details.lines || []).map((l) => l.sku)].filter((s): s is string => !!s))];
  return {
    companyOrderId: String(order.id),
    linkedBookingId: String(order.linked_id),
    invoiceNo: Number(order.invoice_no),
    projectNo: String(order.project_no || ""),
    caseNo: bookingTable === "cremation_bookings" ? String(booking.case_no || "") : null,
    groupKey: String(order.project_no || ""),
    type: order.order_type === "cremation" ? "cremation" : "deposit",
    amount: Number(booking.payment_amount ?? order.amount ?? 0),
    paymentStatus: String(booking.payment_status || ""),
    paymentIntent: String(order.payment_intent || ""),
    creditApplied: Boolean(booking.credit_target || Number(booking.credit_amount) > 0 || Number(booking.deposit_credit) > 0),
    driverField: order.order_type === "deposit" ? (logisticsRes.data?.driver ? String(logisticsRes.data.driver) : null) : null,
    driverDetail: order.order_type === "deposit" ? (details.driver ? String(details.driver) : null) : null,
    notes: String(booking.notes || ""),
    draftNote: String(details.draft?.note || ""),
    serviceDate: booking.service_date ? String(booking.service_date).slice(0, 10) : null,
    serviceTime: booking.service_time ? String(booking.service_time).slice(0, 5) : null,
    productSkus: skus,
    adoptedExisting: !token,
    status: String(booking.status || order.status || ""),
  };
}

function summaryOf(formalNo: number, business: OpcSummary["business"], run: BundleRunResult | null, elapsedMs: number): OpcSummary {
  return {
    atHk: hkTimestamp(),
    formalNo,
    business,
    serviceCount: run?.services.length || 0,
    amounts: (run?.services || []).map((s) => ({ type: s.type, amount: s.amount })),
    payment: "pending",
    driverIndependent: !!run?.verify?.driverIndependent,
    formalAligned: !!run?.verify?.formalAligned,
    elapsedMs,
  };
}

async function withOpc(run: BundleRunResult): Promise<IntakeActionResult> {
  const opcStarted = Date.now();
  const opc = await recordOpc(summaryOf(run.formalNo, run.business === "verified" || run.business === "mismatch" || run.business === "incomplete" ? run.business : "blocked", run, run.elapsedMs), process.env);
  const opcMs = Date.now() - opcStarted;
  if (run.business === "verified" || run.business === "mismatch") {
    await logAudit("intake_order_verify", "company_orders", run.projectNo, `正式號 ${run.formalNo}｜${run.business}｜OPC ${opc.status}`);
    revalidatePath("/new-order");
  }
  return { business: run, opc, elapsedMs: run.elapsedMs + opcMs, phasesMs: { createAndRead: run.elapsedMs, opc: opcMs } };
}

export async function submitIntake(input: { values: SourceValues; answers: IntakeAnswers; acknowledgeAlignment: boolean }): Promise<IntakeActionResult> {
  const started = Date.now();
  const auth = await guard();
  if (auth.error) return blocked(input.values.formalNo, auth.error, started);
  if (!input.acknowledgeAlignment) return blocked(input.values.formalNo, "請先確認：編號若與來源正式號不一致，不會標成完成，也不會自動改號。", started);
  const built = await rebuild(input.values, input.answers || {});
  if (!built.ok) return { business: { business: "blocked", complete: false, row: built.row, elapsedMs: Date.now() - started }, opc: { status: "skipped", reason: "未滿足開單條件，沒有寫入 OPC 完成紀錄。" }, elapsedMs: Date.now() - started, phasesMs: { createAndRead: Date.now() - started, opc: 0 } };
  const run = await runIntakeBundle(built.intent, realGateway());
  return withOpc(run);
}

export async function retryIntakeLog(input: { values: SourceValues; answers: IntakeAnswers }): Promise<IntakeActionResult> {
  const started = Date.now();
  const auth = await guard();
  if (auth.error) return blocked(input.values.formalNo, auth.error, started);
  const built = await rebuild(input.values, input.answers || {});
  if (!built.ok) return { business: { business: "blocked", complete: false, row: built.row, elapsedMs: Date.now() - started }, opc: { status: "skipped", reason: "條件未齊，沒有重建服務。" }, elapsedMs: Date.now() - started, phasesMs: { createAndRead: 0, opc: 0 } };
  const gateway = realGateway();
  const drafts = built.intent.cremation ? [built.intent.deposit, built.intent.cremation] : [built.intent.deposit];
  const services: PersistedService[] = [];
  for (const draft of drafts) {
    const row = await gateway.read(draft.token);
    if (!row) {
      const run: BundleRunResult = { business: "incomplete", complete: false, elapsedMs: Date.now() - started, formalNo: built.intent.formalNo, projectNo: built.intent.existingProjectNo, invoiceNo: null, services, verify: null, recoverable: true, error: "讀不到已保存的服務。這次只重試紀錄，沒有建立新服務。", warnings: [], tokens: drafts.map((d) => d.token) };
      return { business: run, opc: { status: "skipped", reason: "服務讀回不齊，沒有把缺服務寫成完成。" }, elapsedMs: run.elapsedMs, phasesMs: { createAndRead: run.elapsedMs, opc: 0 } };
    }
    services.push(row);
  }
  const verify = verifyPersisted(built.intent, services);
  const run: BundleRunResult = {
    business: verify.ok ? "verified" : "mismatch",
    complete: verify.ok,
    elapsedMs: Date.now() - started,
    formalNo: built.intent.formalNo,
    projectNo: services[0]?.projectNo || null,
    invoiceNo: services[0]?.invoiceNo ?? null,
    services,
    verify,
    recoverable: !verify.ok,
    warnings: [],
    tokens: drafts.map((d) => d.token),
  };
  return withOpc(run);
}

async function rebuild(values: SourceValues, answers: IntakeAnswers) {
  const [{ catalog, deposit }, drivers, existing] = await Promise.all([
    officialCatalog(),
    driverList(),
    loadExisting([values.formalNo]),
  ]);
  const row = previewSource(values, { catalog, deposit, drivers: drivers.drivers, existing: existing.rows, backendChecked: existing.checked });
  const built = buildBundleIntent(row, answers, drivers.drivers);
  return built;
}

function blocked(_formalNo: number, error: string, started: number): IntakeActionResult {
  return { message: error, business: { business: "blocked", complete: false, row: null, elapsedMs: Date.now() - started }, opc: { status: "skipped", reason: error }, elapsedMs: Date.now() - started, phasesMs: { createAndRead: 0, opc: 0 } };
}
