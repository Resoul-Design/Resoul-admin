import Link from "next/link";
import type { MonthMetrics, Ratio } from "@/lib/metrics";

const card = "rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5";
const hkd = (n: number) => "HK$" + Math.round(n).toLocaleString("en-HK");
const pct = (r: Ratio) => (r.den ? Math.round((r.num / r.den) * 100) : null);

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${y} 年 ${Number(m)} 月`;
}

// 與上月比較：數字差、百分點差或金額差
function Delta({ now, prev, unit = "", money = false, lowerIsBetter = false }: { now: number | null; prev: number | null; unit?: string; money?: boolean; lowerIsBetter?: boolean }) {
  if (now === null || prev === null) return <span className="text-xs text-[var(--faint)]">上月無資料</span>;
  const diff = Math.round((now - prev) * 10) / 10;
  if (diff === 0) return <span className="text-xs text-[var(--soft)]">與上月相同</span>;
  const text = money ? hkd(Math.abs(diff)) : `${Math.abs(diff).toLocaleString("en-HK")}${unit}`;
  return (
    <span className={"text-xs " + (diff > 0 !== lowerIsBetter ? "text-green-700" : "text-red-700")}>
      {diff > 0 ? "↑" : "↓"} {text}（對比上月）
    </span>
  );
}

function RatioCard({ title, hint, now, prev }: { title: string; hint: string; now: Ratio; prev: Ratio }) {
  const p = pct(now);
  return (
    <div className={card}>
      <div className="text-sm text-[var(--soft)]">{title}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{p === null ? "—" : `${p}%`}</div>
      <div className="mt-0.5 text-xs text-[var(--soft)]">{now.den ? `${now.num} / ${now.den} 宗` : "本月未有個案"}</div>
      <div className="mt-1"><Delta now={p} prev={pct(prev)} unit=" 個百分點" /></div>
      <p className="mt-2 text-[11px] leading-5 text-[var(--faint)]">{hint}</p>
    </div>
  );
}

export function MetricsSection({ cur, prev, isLatest }: { cur: MonthMetrics; prev: MonthMetrics; isLatest: boolean }) {
  const prevMonth = prev.month;
  const nextMonth = (() => {
    const [y, m] = cur.month.split("-").map(Number);
    return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  })();
  const inquiryTotal = cur.inquiries.pickup + cur.inquiries.cremation + cur.inquiries.vet;
  const prevInquiryTotal = prev.inquiries.pickup + prev.inquiries.cremation + prev.inquiries.vet;
  const planMax = Math.max(1, ...cur.plans.map((p) => p.count));
  const navBtn = "rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-sm hover:bg-[var(--cream)]";

  return (
    <section className="mb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">營運指標 · {monthLabel(cur.month)}</h2>
        <div className="flex items-center gap-2">
          <Link href={`/reports?m=${prevMonth}`} className={navBtn}>← 上月</Link>
          {isLatest ? (
            <span className={navBtn + " cursor-not-allowed opacity-40"}>下月 →</span>
          ) : (
            <Link href={`/reports?m=${nextMonth}`} className={navBtn}>下月 →</Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={card}>
          <div className="text-sm text-[var(--soft)]">新查詢</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{inquiryTotal}</div>
          <div className="mt-0.5 text-xs text-[var(--soft)]">接送 {cur.inquiries.pickup} · 火化 {cur.inquiries.cremation} · 獸醫 {cur.inquiries.vet}</div>
          <div className="mt-1"><Delta now={inquiryTotal} prev={prevInquiryTotal} unit=" 宗" /></div>
          <p className="mt-2 text-[11px] leading-5 text-[var(--faint)]">本月新收到的預約（包括其後取消的）。</p>
        </div>
        <RatioCard title="訂金付款率" hint="本月落單的接送訂金中，已付款的比例（已取消不計）。" now={cur.depositPaid} prev={prev.depositPaid} />
        <RatioCard title="訂金轉火化率" hint="本月已付的接送訂金中，其後有火化預約的比例（以 RSL 專案編號或電話對應）。" now={cur.depositToCremation} prev={prev.depositToCremation} />
        <RatioCard title="紀念品加購率" hint="本月火化預約中，有購買紀念品的比例（以電話或 RSL 專案編號對應）。" now={cur.keepsakeAttach} prev={prev.keepsakeAttach} />

        <div className={card + " sm:col-span-2"}>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm text-[var(--soft)]">收入</div>
            <Delta now={cur.income.total} prev={prev.income.total} money />
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{hkd(cur.income.total)}</div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div><div className="text-xs text-[var(--soft)]">火化</div><div className="tabular-nums">{hkd(cur.income.cremation)}</div></div>
            <div><div className="text-xs text-[var(--soft)]">接送訂金</div><div className="tabular-nums">{hkd(cur.income.pickup)}</div></div>
            <div><div className="text-xs text-[var(--soft)]">紀念品</div><div className="tabular-nums">{hkd(cur.income.product)}</div></div>
          </div>
          <div className="mt-3 border-t border-[var(--line)] pt-2 text-sm">
            平均每宗火化收入：<span className="font-medium tabular-nums">{cur.avgCremation === null ? "—" : hkd(cur.avgCremation)}</span>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-[var(--faint)]">與「財務管理」相同計法：火化及接送按付款月份，紀念品按訂單月份；已取消或退款不計。</p>
        </div>

        <div className={card}>
          <div className="text-sm text-[var(--soft)]">方案分佈</div>
          <div className="mt-3 space-y-2">
            {cur.plans.map((p) => (
              <div key={p.plan} className="text-sm">
                <div className="flex justify-between"><span>{p.plan}</span><span className="tabular-nums">{p.count}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-[var(--head)]">
                  <div className="h-1.5 rounded-full bg-[var(--gold)]" style={{ width: `${(p.count / planMax) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-5 text-[var(--faint)]">本月新收到、未取消的火化預約。</p>
        </div>

        <div className={card}>
          <div className="text-sm text-[var(--soft)]">平均處理時間</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{cur.avgDaysToService === null ? "—" : `${cur.avgDaysToService.toFixed(1)} 日`}</div>
          <div className="mt-0.5 text-xs text-[var(--soft)]">{cur.avgDaysSample ? `根據 ${cur.avgDaysSample} 宗已完成個案` : "本月未有已完成個案"}</div>
          <div className="mt-1">
            <Delta
              now={cur.avgDaysToService === null ? null : Math.round(cur.avgDaysToService * 10) / 10}
              prev={prev.avgDaysToService === null ? null : Math.round(prev.avgDaysToService * 10) / 10}
              unit=" 日"
              lowerIsBetter
            />
          </div>
          <p className="mt-2 text-[11px] leading-5 text-[var(--faint)]">服務日在本月的已完成火化預約，由收到預約至服務日的平均日數。</p>
        </div>
      </div>
    </section>
  );
}
