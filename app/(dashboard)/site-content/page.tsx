import { PageHeader, headerLinkClass } from "../_page-header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStaff, hasModule } from "@/lib/auth";
import { LANDING_URL } from "@/lib/company";
import { SITE_LABELS, type SiteKey } from "@/lib/site-content";
import { loadSiteContent, loadVersions, type LoadedSiteContent } from "@/lib/site-content-server";
import { VersionHistory, type VersionInfo } from "./_versions";
import {
  CremationPricesEditor,
  FaqEditor,
  GriefPricesEditor,
  KeepsakesEditor,
  NoticeEditor,
  ShopCategoriesEditor,
  VetPricesEditor,
} from "./_editors";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "prices", label: "收費" },
  { key: "keepsakes", label: "紀念精品" },
  { key: "shop", label: "商店分類" },
  { key: "faq", label: "常見問題" },
  { key: "notice", label: "頁頂公告" },
] as const;

const FAQ_PAGES = [
  { key: "cremation", label: "善終旅程" },
  { key: "euthanasia", label: "上門安樂死" },
  { key: "support", label: "情緒支援" },
] as const;

const tabClass = (active: boolean) =>
  "rounded-lg px-3 py-1.5 text-sm whitespace-nowrap " + (active ? "bg-[var(--gold)] text-white" : "border border-[var(--line)] bg-[var(--card)] hover:bg-[var(--cream)]");

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function SectionTitle({ siteKey, loaded, versions }: { siteKey: SiteKey; loaded: LoadedSiteContent; versions: Partial<Record<SiteKey, VersionInfo[]>> }) {
  const meta = SITE_LABELS[siteKey];
  const saved = loaded.saved[siteKey];
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-lg font-semibold">{meta.label}</h2>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--soft)]">
        <span>顯示於：{meta.pages}　·　{saved ? `最後儲存 ${fmt(saved.updated_at)}${saved.updated_by ? `（${saved.updated_by}）` : ""}` : "未曾修改（網站顯示原有內容）"}</span>
        <VersionHistory versions={versions[siteKey] || []} />
      </span>
    </div>
  );
}

export default async function SiteContentPage({ searchParams }: { searchParams: Promise<{ tab?: string; faq?: string }> }) {
  const staff = await getStaff();
  if (!staff || !hasModule(staff, ["site_content"])) notFound();
  const { tab: tabParam, faq: faqParam } = await searchParams;
  const tab = TABS.find((t) => t.key === tabParam)?.key || "prices";
  const faqPage = FAQ_PAGES.find((f) => f.key === faqParam)?.key || "cremation";
  const [loaded, versions] = await Promise.all([loadSiteContent(), loadVersions()]);
  // 儲存或還原後重新載入編輯器（以最後儲存時間作 key）
  const ver = (k: SiteKey) => loaded.saved[k]?.updated_at || "default";
  const { content } = loaded;

  return (
    <div>
      <PageHeader title="網站內容">
        <a href={LANDING_URL} target="_blank" rel="noopener noreferrer" className={headerLinkClass}>開啟網站 ↗</a>
      </PageHeader>

      {loaded.notReady && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          未啟用網站內容：請先於 Supabase（diyxcx）執行 <code>db/migration_site_content.sql</code>。未執行前，以下顯示網站現有內容，但未能儲存。
        </div>
      )}

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="網站內容分類">
        {TABS.map((t) => (
          <Link key={t.key} href={`/site-content?tab=${t.key}`} className={tabClass(t.key === tab)} aria-current={t.key === tab ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "prices" && (
        <div className="space-y-8">
          <section>
            <SectionTitle siteKey="prices.cremation" loaded={loaded} versions={versions} />
            <CremationPricesEditor key={ver("prices.cremation")} initial={content["prices.cremation"]} />
          </section>
          <section>
            <SectionTitle siteKey="prices.vet" loaded={loaded} versions={versions} />
            <VetPricesEditor key={ver("prices.vet")} initial={content["prices.vet"]} />
          </section>
          <section>
            <SectionTitle siteKey="prices.grief" loaded={loaded} versions={versions} />
            <GriefPricesEditor key={ver("prices.grief")} initial={content["prices.grief"]} />
          </section>
          <p className="text-xs leading-5 text-[var(--soft)]">
            回覆知識庫可用收費代號 {"{風之旅起價}"}、{"{火化收費表}"}、{"{獸醫收費表}"}、{"{情緒支援收費表}"} 等，插入回覆時會自動填入此頁的最新收費。
            接送訂金（HK$1,800）由 Shopify「預約接送訂金」產品設定，不在此頁修改。
          </p>
        </div>
      )}

      {tab === "keepsakes" && (
        <section>
          <SectionTitle siteKey="keepsakes" loaded={loaded} versions={versions} />
          <KeepsakesEditor key={ver("keepsakes")} initial={content.keepsakes} />
        </section>
      )}

      {tab === "shop" && (
        <section>
          <SectionTitle siteKey="shop.categories" loaded={loaded} versions={versions} />
          <ShopCategoriesEditor key={ver("shop.categories")} initial={content["shop.categories"]} landingUrl={LANDING_URL} />
        </section>
      )}

      {tab === "faq" && (
        <section>
          <div className="mb-4 flex flex-wrap gap-2">
            {FAQ_PAGES.map((f) => (
              <Link key={f.key} href={`/site-content?tab=faq&faq=${f.key}`} className={tabClass(f.key === faqPage)} aria-current={f.key === faqPage ? "page" : undefined}>
                {f.label}
              </Link>
            ))}
          </div>
          <SectionTitle siteKey={`faq.${faqPage}`} loaded={loaded} versions={versions} />
          <FaqEditor
            key={`${faqPage}:${ver(`faq.${faqPage}`)}`}
            siteKey={`faq.${faqPage}`}
            initial={content[`faq.${faqPage}`]}
            fixedGroups={faqPage === "support"}
            withIcons={faqPage === "support"}
          />
        </section>
      )}

      {tab === "notice" && (
        <section>
          <SectionTitle siteKey="notice" loaded={loaded} versions={versions} />
          <NoticeEditor key={ver("notice")} initial={content.notice} />
        </section>
      )}
    </div>
  );
}
