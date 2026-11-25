// 同一正式號的一次提交：接送押金，以及套餐已確認時的火化（含明確產品），都在同一個專案。
// 編號沿用現有開單路徑配出的專案／單號，不改編號產生器。讀回不一致就標成未完成，不暗中改其他單。
import { invoiceLabel } from "@/lib/invoice-label";
import { suggestUrnPickup, type UrnPickup } from "@/lib/invoice-remark";
import { projectNoFromNotes } from "@/lib/order-label";
import { reviewRow, serviceToken, type IntakeAnswers, type IntakePayload } from "@/lib/order-intake";

export type PersistedService = {
  companyOrderId: string;
  linkedBookingId: string;
  invoiceNo: number;
  projectNo: string;
  caseNo: string | null;
  groupKey: string;
  type: "deposit" | "cremation";
  amount: number;
  paymentStatus: string;
  paymentIntent: string;
  creditApplied: boolean;
  /** logistics_orders.driver；備註裡的司機不算。 */
  driverField: string | null;
  /** company_orders.details.driver，必須與獨立欄一致。 */
  driverDetail: string | null;
  notes: string;
  draftNote: string;
  serviceDate: string | null;
  serviceTime: string | null;
  productSkus: string[];
  adoptedExisting: boolean;
  status: string;
};

export type ServiceDraft = {
  token: string;
  type: "deposit" | "cremation";
  projectNo: string | null;
  formalNo: number;
  amount: number;
  driver: string | null;
  notes: string;
  serviceDate: string | null;
  serviceTime: string | null;
  customer: { name: string; phone: string; email: string; petName: string; petType: string; breed: string; weightKg: number };
  address: string;
  packageVariantId: string | null;
  packageSku: string | null;
  productLines: { variantId: string; sku: string; quantity: number; amount: number }[];
  urn: { type: string; pickupDate: string } | null;
  urnPickup: UrnPickup | null;
  depositVariantId: string | null;
};

export type BundleIntent = {
  formalNo: number;
  bundleKey: string;
  existingProjectNo: string | null;
  adoptDeposit: boolean;
  adoptCremation: boolean;
  driver: string;
  weightPending: boolean;
  deposit: ServiceDraft;
  cremation: ServiceDraft | null;
  pendingFields: string[];
};

export type VerifyIssue = { code: string; detail: string };

export type VerifyResult = {
  ok: boolean;
  formalAligned: boolean;
  driverIndependent: boolean;
  issues: VerifyIssue[];
  actionable: string[];
};

export type BundleRunResult = {
  business: "blocked" | "incomplete" | "mismatch" | "verified";
  complete: boolean;
  elapsedMs: number;
  formalNo: number;
  projectNo: string | null;
  invoiceNo: number | null;
  services: PersistedService[];
  verify: VerifyResult | null;
  recoverable: boolean;
  error?: string;
  warnings: string[];
  tokens: string[];
};

export interface IntakeGateway {
  read(token: string): Promise<PersistedService | null>;
  readExisting(projectNo: string, type: "deposit" | "cremation"): Promise<PersistedService | null>;
  create(draft: ServiceDraft): Promise<{ ok: true; warning?: string } | { ok: false; error: string }>;
}

const MONEY = (n: number) => Math.round(n * 100) / 100;

export function buildBundleIntent(row: IntakePayload, answers: IntakeAnswers, drivers: string[]): { ok: true; intent: BundleIntent } | { ok: false; row: IntakePayload } {
  const reviewed = reviewRow(row, answers, drivers);
  if (!reviewed.submittable || reviewed.deposit.amount == null || !reviewed.deposit.variantId || !reviewed.pickup.driver || reviewed.pet.weightKg == null) {
    return { ok: false, row: reviewed };
  }
  const urnPickup = reviewed.package.confirmed ? resolveUrn(reviewed, answers) : null;
  if (reviewed.package.confirmed && !urnPickup) return { ok: false, row: reviewed };
  const customer = {
    name: reviewed.customer.name,
    phone: reviewed.customer.phone,
    email: reviewed.customer.email,
    petName: reviewed.pet.name,
    petType: reviewed.pet.type,
    breed: reviewed.pet.breed,
    weightKg: reviewed.pet.weightKg,
  };
  const depositAmount = reviewed.deposit.amount;
  const deposit: ServiceDraft = {
    token: serviceToken(reviewed.bundleKey, "deposit"),
    type: "deposit",
    projectNo: reviewed.existingProjectNo,
    formalNo: reviewed.formalNo,
    amount: depositAmount,
    driver: reviewed.pickup.driver,
    notes: reviewed.notesDeposit,
    serviceDate: reviewed.pickup.date,
    serviceTime: reviewed.pickup.time,
    customer,
    address: reviewed.pickup.address,
    packageVariantId: null,
    packageSku: null,
    productLines: [],
    urn: null,
    urnPickup: null,
    depositVariantId: reviewed.deposit.variantId,
  };
  let cremation: ServiceDraft | null = null;
  if (reviewed.package.confirmed && reviewed.package.variantId && reviewed.package.sku && reviewed.package.officialPrice != null && reviewed.cremation?.date && reviewed.cremation.time) {
    const lines = reviewed.products.map((p) => ({ variantId: p.variantId, sku: p.sku, quantity: p.qty, amount: p.officialPrice }));
    cremation = {
      token: serviceToken(reviewed.bundleKey, "cremation"),
      type: "cremation",
      projectNo: reviewed.existingProjectNo,
      formalNo: reviewed.formalNo,
      amount: MONEY(reviewed.package.officialPrice + lines.reduce((n, l) => n + l.amount * l.quantity, 0)),
      driver: null,
      notes: reviewed.notesCremation,
      serviceDate: reviewed.cremation.date,
      serviceTime: reviewed.cremation.time,
      customer,
      address: reviewed.pickup.address,
      packageVariantId: reviewed.package.variantId,
      packageSku: reviewed.package.sku,
      productLines: lines,
      urn: { type: reviewed.source.urn || "", pickupDate: reviewed.source.urnPickup || "" },
      urnPickup,
      depositVariantId: null,
    };
  }
  return {
    ok: true,
    intent: {
      formalNo: reviewed.formalNo,
      bundleKey: reviewed.bundleKey,
      existingProjectNo: reviewed.existingProjectNo,
      adoptDeposit: reviewed.mode === "reuse" && reviewed.hasExistingDeposit,
      adoptCremation: reviewed.mode === "reuse" && reviewed.hasExistingCremation,
      driver: reviewed.pickup.driver,
      weightPending: reviewed.pet.weightApproximate,
      deposit,
      cremation,
      pendingFields: reviewed.pendingFields,
    },
  };
}

function resolveUrn(row: IntakePayload, answers: IntakeAnswers): UrnPickup | null {
  if (answers.urnPickup === "today" || answers.urnPickup === "later" || answers.urnPickup === "na") return answers.urnPickup;
  return suggestUrnPickup(row.source.urnPickup, row.cremation?.date || "", row.source.urn);
}

function displayFrom(service: PersistedService): string | null {
  const text = `${service.draftNote}\n${service.notes}`;
  const match = text.match(/單據編號：\s*([^\s|｜\n]+)/);
  return match ? match[1] : null;
}

export function verifyPersisted(intent: BundleIntent, services: PersistedService[]): VerifyResult {
  const issues: VerifyIssue[] = [];
  const expected: ServiceDraft[] = intent.cremation ? [intent.deposit, intent.cremation] : [intent.deposit];
  if (services.length !== expected.length) issues.push({ code: "service_count", detail: `需要 ${expected.length} 項服務，讀回 ${services.length} 項。` });
  const projects = new Set(services.map((s) => s.projectNo).filter(Boolean));
  if (projects.size !== 1) issues.push({ code: "project_count", detail: `服務落在 ${projects.size} 個專案（${[...projects].join("、") || "沒有"}）。押金不可另開第二個專案。` });
  const projectNo = services[0]?.projectNo || "";
  const invoices = new Set(services.map((s) => s.invoiceNo));
  if (invoices.size !== 1) issues.push({ code: "invoice_count", detail: `讀回多於一個單號：${[...invoices].join("、")}。` });
  const invoiceNo = services[0]?.invoiceNo;
  for (const draft of expected) {
    const row = services.find((s) => s.type === draft.type);
    if (!row) {
      issues.push({ code: "missing_service", detail: `缺少${draft.type === "deposit" ? "接送押金" : "火化"}服務。` });
      continue;
    }
    if (row.companyOrderId === String(row.invoiceNo) || row.linkedBookingId === row.companyOrderId) {
      issues.push({ code: "id_kind_mismatch", detail: `${draft.type} 的公司單 id、發票號或預約 id 被混在一起。` });
    }
    if (!/^[0-9a-f-]{36}$/i.test(row.companyOrderId) || !/^[0-9a-f-]{36}$/i.test(row.linkedBookingId)) {
      issues.push({ code: "id_kind_mismatch", detail: `${draft.type} 的公司單 id 或預約 id 不是獨立識別碼。` });
    }
    if (MONEY(row.amount) !== MONEY(draft.amount)) issues.push({ code: "amount", detail: `${draft.type} 金額讀回 ${row.amount}，預期 ${draft.amount}。` });
    if (row.paymentStatus !== "pending" || row.paymentIntent !== "link") issues.push({ code: "payment", detail: `${draft.type} 付款狀態為 ${row.paymentStatus}／${row.paymentIntent}，只可維持待付款。` });
    if (row.creditApplied) issues.push({ code: "deposit_credited", detail: "未收款的押金被拿去抵扣。" });
    if (row.status === "cancelled" || row.status === "paid") issues.push({ code: "payment", detail: `${draft.type} 狀態為 ${row.status}。` });
    if ((row.serviceDate || "") !== (draft.serviceDate || "") || (row.serviceTime || "") !== (draft.serviceTime || "")) {
      issues.push({ code: "schedule", detail: `${draft.type} 日期時間讀回 ${row.serviceDate || "空白"} ${row.serviceTime || ""}，預期 ${draft.serviceDate || "空白"} ${draft.serviceTime || ""}。` });
    }
    if (row.projectNo !== projectNo || row.groupKey !== row.projectNo) issues.push({ code: "group_key", detail: `${draft.type} 的專案編號與群組路徑不一致。` });
    const noted = projectNoFromNotes(row.notes);
    if (noted === "—" || noted.toUpperCase() !== row.projectNo.toUpperCase()) issues.push({ code: "note_project", detail: `${draft.type} 備註內的專案編號讀回「${noted}」，與專案 ${row.projectNo} 不一致。` });
    const display = displayFrom(row);
    const expectedLabel = invoiceLabel(row.invoiceNo, row.type);
    if (!display) issues.push({ code: "display_label_missing", detail: `${draft.type} 讀回的單據沒有顯示編號。` });
    else if (display !== expectedLabel) issues.push({ code: "display_label", detail: `${draft.type} 顯示編號「${display}」與單號對應的「${expectedLabel}」不一致。` });
    if (draft.type === "cremation") {
      if ((row.caseNo || "").toUpperCase() !== row.projectNo.toUpperCase()) issues.push({ code: "case_no", detail: `火化 case_no「${row.caseNo || "空白"}」與專案 ${row.projectNo} 不一致。` });
      const got = [...row.productSkus].sort().join(",");
      const want = [draft.packageSku, ...draft.productLines.map((l) => l.sku)].filter(Boolean).sort().join(",");
      if (got !== want) issues.push({ code: "product_lines", detail: `火化項目讀回 ${got || "空白"}，預期 ${want}。` });
      if (intent.deposit.serviceDate && row.serviceDate === intent.deposit.serviceDate && draft.serviceDate !== intent.deposit.serviceDate) {
        issues.push({ code: "farewell_mixed", detail: "火化日期讀回成接送或告別日期。" });
      }
    }
    if (!row.adoptedExisting && row.notes !== draft.notes && !row.notes.includes(draft.notes)) {
      issues.push({ code: "notes", detail: `${draft.type} 備註與這一張單的來源不一致。` });
    }
  }
  const deposit = services.find((s) => s.type === "deposit");
  let driverIndependent = false;
  if (deposit) {
    const field = (deposit.driverField || "").trim();
    const detail = (deposit.driverDetail || "").trim();
    driverIndependent = field === intent.driver && detail === intent.driver;
    if (!field) issues.push({ code: "driver_not_independent", detail: "司機沒有寫在獨立司機欄。備註裡的司機不算已保存。" });
    else if (field !== intent.driver || detail !== intent.driver) issues.push({ code: "driver_mismatch", detail: `獨立司機欄讀回「${field || "空白"}」，預期「${intent.driver}」。` });
  }
  if (intent.weightPending && !services.some((s) => s.notes.includes("實際重量待核實"))) {
    issues.push({ code: "weight_pending_missing", detail: "大約重量沒有在讀回的備註標成待核實。" });
  }
  const formalAligned = invoiceNo === intent.formalNo && projectNo === String(intent.formalNo);
  if (!formalAligned) {
    issues.push({
      code: "formal_number_mismatch",
      detail: `來源正式號 ${intent.formalNo}。讀回顯示單號 ${invoiceNo ?? "空白"}、內部專案 ${projectNo || "空白"}、群組 /projects/group/${encodeURIComponent(projectNo || "")}。現有編號產生器沒有改成來源號；這次不會自動改號，也不會改其他舊單。`,
    });
  }
  const actionable = issues.map((issue) => `${issue.code}：${issue.detail}`);
  if (!formalAligned) actionable.push("請用現有「修改單號」核對這一張新單的顯示編號、內部專案、押金單號、火化 case_no、備註專案號及群組路徑是否全部等於來源正式號。未讀回一致前不能當作完成。");
  return { ok: issues.length === 0, formalAligned, driverIndependent, issues, actionable };
}

export async function runIntakeBundle(intent: BundleIntent, gateway: IntakeGateway, now = Date.now): Promise<BundleRunResult> {
  const started = now();
  const warnings: string[] = [];
  const drafts = intent.cremation ? [intent.deposit, intent.cremation] : [intent.deposit];
  let project = intent.existingProjectNo;
  const refs: { token: string; type: "deposit" | "cremation"; adopted: boolean }[] = [];
  for (const draft of drafts) {
    const adopt = draft.type === "deposit" ? intent.adoptDeposit : intent.adoptCremation;
    let existing = await gateway.read(draft.token);
    let adopted = false;
    if (!existing && adopt && project) {
      existing = await gateway.readExisting(project, draft.type);
      adopted = !!existing;
    }
    if (existing) {
      if (project && existing.projectNo !== project) {
        return finish(started, now, intent, [], null, "incomplete", true, "讀回的服務不在同一個專案，已停止，沒有再開新專案。", warnings, refs);
      }
      project = existing.projectNo;
      refs.push({ token: draft.token, type: draft.type, adopted });
      continue;
    }
    const created = await gateway.create({ ...draft, projectNo: project });
    if (!created.ok) {
      const readBack = await reread(gateway, refs, project);
      return finish(started, now, intent, readBack, null, "incomplete", true, created.error, warnings, refs);
    }
    if (created.warning) warnings.push(created.warning);
    const read = await gateway.read(draft.token);
    if (!read) return finish(started, now, intent, [], null, "incomplete", true, "服務可能已寫入，但讀回失敗。請只重試讀取，不要當失敗而再開一張。", warnings, refs);
    if (project && read.projectNo !== project) {
      return finish(started, now, intent, [read], null, "incomplete", true, `新服務落在專案 ${read.projectNo}，與已有專案 ${project} 不同。已停止，沒有把它當成完成。`, warnings, [...refs, { token: draft.token, type: draft.type, adopted: false }]);
    }
    project = read.projectNo;
    refs.push({ token: draft.token, type: draft.type, adopted: false });
  }
  const services = await reread(gateway, refs, project);
  if (services.length !== refs.length) {
    return finish(started, now, intent, services, null, "incomplete", true, "第二次讀回的服務數量與剛保存的不一致。", warnings, refs);
  }
  const verify = verifyPersisted(intent, services);
  return finish(started, now, intent, services, verify, verify.ok ? "verified" : "mismatch", !verify.ok, undefined, warnings, refs);
}

async function reread(gateway: IntakeGateway, refs: { token: string; type: "deposit" | "cremation"; adopted: boolean }[], project: string | null): Promise<PersistedService[]> {
  const out: PersistedService[] = [];
  for (const ref of refs) {
    const row = ref.adopted && project ? await gateway.readExisting(project, ref.type) : await gateway.read(ref.token);
    if (row) out.push({ ...row, adoptedExisting: ref.adopted });
  }
  return out;
}

function finish(
  started: number,
  now: () => number,
  intent: BundleIntent,
  services: PersistedService[],
  verify: VerifyResult | null,
  business: BundleRunResult["business"],
  recoverable: boolean,
  error: string | undefined,
  warnings: string[],
  refs: { token: string }[]
): BundleRunResult {
  return {
    business,
    complete: business === "verified",
    elapsedMs: Math.max(0, now() - started),
    formalNo: intent.formalNo,
    projectNo: services[0]?.projectNo || intent.existingProjectNo,
    invoiceNo: services[0]?.invoiceNo ?? null,
    services,
    verify,
    recoverable,
    error,
    warnings,
    tokens: refs.map((r) => r.token),
  };
}

export function createMemoryGateway(options?: {
  allocate?: () => { invoiceNo: number; projectNo: string };
  failTypes?: { type: "deposit" | "cremation"; times: number }[];
  driverOnlyInNotes?: boolean;
  ignorePassedProject?: boolean;
}): IntakeGateway & { creates: number; rows: PersistedService[] } {
  const rows: PersistedService[] = [];
  let creates = 0;
  let seq = 0;
  const failures = new Map((options?.failTypes || []).map((f) => [f.type, f.times]));
  const gateway: IntakeGateway & { creates: number; rows: PersistedService[] } = {
    rows,
    get creates() { return creates; },
    async read(token) {
      return rows.find((r) => r.companyOrderId.endsWith(token.slice(0, 8)) || (r.draftNote.includes(token) && false)) || rows.find((r) => (r as PersistedService & { token?: string }).token === token) || null;
    },
    async readExisting(projectNo, type) {
      return rows.find((r) => r.projectNo === projectNo && r.type === type) || null;
    },
    async create(draft) {
      const found = rows.find((r) => (r as PersistedService & { token?: string }).token === draft.token);
      if (found) return { ok: true };
      const left = failures.get(draft.type) || 0;
      if (left > 0) {
        failures.set(draft.type, left - 1);
        return { ok: false, error: `${draft.type} 寫入失敗（可再試，已成功的服務不會重開）。` };
      }
      creates += 1;
      seq += 1;
      const allocated = options?.allocate ? options.allocate() : { invoiceNo: 900 + seq, projectNo: String(900 + seq) };
      const projectNo = !draft.projectNo || options?.ignorePassedProject ? allocated.projectNo : draft.projectNo;
      const invoiceNo = draft.projectNo && !options?.ignorePassedProject ? rows.find((r) => r.projectNo === projectNo)?.invoiceNo || allocated.invoiceNo : allocated.invoiceNo;
      const note = [`專案編號：${projectNo}`, draft.notes, `單據編號：${invoiceLabel(invoiceNo, draft.type)}`].filter(Boolean).join(" | ");
      const driverField = draft.type === "deposit" && !options?.driverOnlyInNotes ? draft.driver : null;
      const row = {
        token: draft.token,
        companyOrderId: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
        linkedBookingId: `11111111-1111-4111-8111-${String(seq).padStart(12, "0")}`,
        invoiceNo,
        projectNo,
        caseNo: draft.type === "cremation" ? projectNo : null,
        groupKey: projectNo,
        type: draft.type,
        amount: draft.amount,
        paymentStatus: "pending",
        paymentIntent: "link",
        creditApplied: false,
        driverField,
        driverDetail: driverField,
        notes: note,
        draftNote: `單據編號：${invoiceLabel(invoiceNo, draft.type)}`,
        serviceDate: draft.serviceDate,
        serviceTime: draft.serviceTime,
        productSkus: draft.type === "cremation" ? [draft.packageSku, ...draft.productLines.map((l) => l.sku)].filter((s): s is string => !!s) : [],
        adoptedExisting: false,
        status: "draft",
      } as PersistedService & { token: string };
      rows.push(row);
      return { ok: true };
    },
  };
  gateway.read = async (token: string) => rows.find((r) => (r as PersistedService & { token?: string }).token === token) || null;
  return gateway;
}
