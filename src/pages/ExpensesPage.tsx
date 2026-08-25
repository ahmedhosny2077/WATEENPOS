import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banknote, CalendarDays, CreditCard, Receipt, TrendingDown, Wallet } from "lucide-react";
import { cmd, money, qty } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { SearchField } from "@/components/ui/Field";
import { Empty } from "@/components/ui/Empty";
import { useToasts } from "@/components/ui/Toast";
import { Page, Panel } from "@/components/ui/Page";

type Exp = {
  id: number;
  categoryId?: number;
  category: string;
  amount: number;
  expenseDate: string;
  description?: string | null;
  paymentMethod?: string | null;
};
type Named = { id: number; name: string };
type Period = "today" | "week" | "month" | "all";

const CAT_TONE: Record<string, string> = {
  إيجار: "bg-slate-100 text-slate-700 border-slate-200",
  كهرباء: "bg-amber-50 text-amber-800 border-amber-200",
  رواتب: "bg-rose-50 text-rose-800 border-rose-200",
  مواصلات: "bg-sky-50 text-sky-800 border-sky-200",
  صيانة: "bg-orange-50 text-orange-800 border-orange-200",
  تغليف: "bg-violet-50 text-violet-800 border-violet-200",
  تسويق: "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200",
  متنوعة: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgoIso(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(iso: string) {
  const [y, m, d] = (iso || "").split("-");
  if (!y || !m || !d) return iso || "—";
  return `${d}/${m}/${y}`;
}

function catTone(name: string) {
  return CAT_TONE[name] || "bg-slate-50 text-slate-600 border-slate-200";
}

function payTone(name?: string | null) {
  if (name?.includes("بطاقة")) return "bg-sky-50 text-sky-700 border-sky-100";
  if (name?.includes("تحويل")) return "bg-violet-50 text-violet-700 border-violet-100";
  return "bg-emerald-50 text-emerald-700 border-emerald-100";
}

function groupDateTitle(iso: string, today: string) {
  if (iso === today) return "اليوم";
  if (iso === daysAgoIso(1)) return "أمس";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return formatDate(iso);
  return d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
}

function LedgerDivider() {
  return (
    <div className="flex items-center gap-3 py-2 px-1" aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-l from-rose-200 via-slate-200 to-transparent" />
      <span className="h-2 w-2 rotate-45 rounded-[2px] bg-rose-400 shadow-[0_0_0_3px_rgba(251,113,133,0.18)]" />
      <span className="h-px flex-1 bg-gradient-to-r from-rose-200 via-slate-200 to-transparent" />
    </div>
  );
}

export function ExpensesPage() {
  const nav = useNavigate();
  const push = useToasts((s) => s.push);
  const [rows, setRows] = useState<Exp[]>([]);
  const [cats, setCats] = useState<Named[]>([]);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>("month");

  async function load() {
    try {
      setRows(await cmd<Exp[]>("list_expenses"));
    } catch (e) {
      push("err", (e as Error).message);
    }
  }

  useEffect(() => {
    load();
    cmd<Named[]>("list_expense_categories").then(setCats).catch(() => {});
  }, []);

  const today = todayIso();
  const weekFrom = daysAgoIso(6);
  const monthPrefix = today.slice(0, 7);

  const filtered = useMemo(() => {
    const query = q.trim();
    return rows.filter((r) => {
      if (catFilter != null && r.categoryId != null && r.categoryId !== catFilter) return false;
      if (catFilter != null && r.categoryId == null) {
        const match = cats.find((c) => c.id === catFilter);
        if (match && r.category !== match.name) return false;
      }
      if (period === "today" && r.expenseDate !== today) return false;
      if (period === "week" && r.expenseDate < weekFrom) return false;
      if (period === "month" && !r.expenseDate.startsWith(monthPrefix)) return false;
      if (query) {
        const hay = `${r.category} ${r.description || ""} ${r.paymentMethod || ""}`.includes(query);
        if (!hay) return false;
      }
      return true;
    });
  }, [rows, q, catFilter, period, cats, today, weekFrom, monthPrefix]);

  const todayTotal = rows.filter((r) => r.expenseDate === today).reduce((s, r) => s + r.amount, 0);
  const monthTotal = rows.filter((r) => r.expenseDate.startsWith(monthPrefix)).reduce((s, r) => s + r.amount, 0);
  const shownTotal = filtered.reduce((s, r) => s + r.amount, 0);

  const byCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) map.set(r.category, (map.get(r.category) || 0) + r.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const grouped = useMemo(() => {
    const map = new Map<string, Exp[]>();
    for (const r of filtered) {
      const list = map.get(r.expenseDate) || [];
      list.push(r);
      map.set(r.expenseDate, list);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const periods: { id: Period; label: string }[] = [
    { id: "today", label: "اليوم" },
    { id: "week", label: "آخر 7 أيام" },
    { id: "month", label: "هذا الشهر" },
    { id: "all", label: "الكل" },
  ];

  const stats = [
    { label: "مصروفات اليوم", value: money(todayTotal), icon: CalendarDays, tone: "text-rose-700 bg-rose-50" },
    { label: "مصروفات الشهر", value: money(monthTotal), icon: TrendingDown, tone: "text-orange-700 bg-orange-50" },
    { label: "المعروض الآن", value: money(shownTotal), icon: Wallet, tone: "text-slate-700 bg-slate-100" },
    { label: "عدد القيود", value: qty(filtered.length), icon: Receipt, tone: "text-emerald-700 bg-emerald-50" },
  ];

  return (
    <Page
      title="المصروفات"
      subtitle="تسجيل ومتابعة مصروفات المتجر اليومية"
      icon={Wallet}
      actions={<Button onClick={() => nav("/expenses/new")}>تسجيل مصروف</Button>}
    >
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5 min-h-[110px]">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="text-sm text-slate-500">{s.label}</div>
                <div className={`h-9 w-9 rounded-xl grid place-items-center ${s.tone}`}>
                  <Icon size={16} />
                </div>
              </div>
              <div className="text-lg font-bold text-slate-800 leading-6">{s.value}</div>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-4 mb-4">
        <SearchField
          placeholder="ابحث بالوصف أو التصنيف"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex gap-2 overflow-x-auto pt-3">
          {periods.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`h-7 px-3 rounded-full text-xs whitespace-nowrap border ${
                period === p.id ? "bg-rose-700 text-white border-rose-700" : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pt-2">
          <button
            type="button"
            onClick={() => setCatFilter(null)}
            className={`h-7 px-3 rounded-full text-xs whitespace-nowrap border ${
              catFilter === null ? "bg-rose-700 text-white border-rose-700" : "bg-slate-50 text-slate-600 border-slate-200"
            }`}
          >
            كل التصنيفات
          </button>
          {cats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCatFilter(c.id)}
              className={`h-7 px-3 rounded-full text-xs whitespace-nowrap border ${
                catFilter === c.id ? "bg-rose-700 text-white border-rose-700" : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Panel>
          <Empty title={rows.length === 0 ? "لا توجد مصروفات بعد" : "لا توجد نتائج مطابقة"} action="تسجيل مصروف" onAction={() => nav("/expenses/new")} />
        </Panel>
      ) : (
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80">
            <div className="font-bold text-slate-800">سجل المصروفات</div>
            <div className="flex flex-wrap gap-2">
              {byCat.slice(0, 4).map(([name, total]) => (
                <span
                  key={name}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${catTone(name)}`}
                >
                  {name}
                  <span className="opacity-70">{money(total)}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="p-4 bg-gradient-to-b from-slate-50/90 to-white space-y-6">
            {grouped.map(([date, items]) => {
              const dayTotal = items.reduce((s, r) => s + r.amount, 0);
              return (
                <section key={date}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-8 px-3 rounded-full bg-white text-rose-800 border border-rose-100 shadow-sm text-xs font-bold inline-flex items-center gap-1.5">
                      <CalendarDays size={13} />
                      {groupDateTitle(date, today)}
                    </div>
                    <div className="h-px flex-1 bg-gradient-to-l from-rose-200/70 via-slate-200 to-transparent" />
                    <div className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                      {qty(items.length)} · {money(dayTotal)}
                    </div>
                  </div>
                  <div>
                    {items.map((r, i) => (
                      <div key={r.id}>
                        {i > 0 ? <LedgerDivider /> : null}
                        <article className="rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-3.5 hover:border-rose-200 hover:shadow-md transition">
                          <div className="flex items-start gap-3">
                            <div
                              className={`h-12 w-12 rounded-2xl grid place-items-center font-black shrink-0 border ${catTone(r.category)}`}
                            >
                              {(r.category || "م").slice(0, 1)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-800">{r.category}</div>
                                  <div className="text-sm text-slate-500 mt-0.5 leading-6">
                                    {r.description?.trim() || <span className="text-slate-400">بدون وصف</span>}
                                  </div>
                                </div>
                                <div className="text-left shrink-0">
                                  <div className="text-base font-black text-rose-700 whitespace-nowrap tabular-nums">
                                    {money(r.amount)}
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                  <CalendarDays size={12} className="text-slate-400" />
                                  <span dir="ltr">{formatDate(r.expenseDate)}</span>
                                </span>
                                {r.paymentMethod ? (
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${payTone(
                                      r.paymentMethod,
                                    )}`}
                                  >
                                    {r.paymentMethod.includes("بطاقة") ? (
                                      <CreditCard size={12} />
                                    ) : (
                                      <Banknote size={12} />
                                    )}
                                    {r.paymentMethod}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </article>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="px-5 py-3.5 border-t border-slate-100 bg-rose-50/50 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-600">إجمالي المعروض</div>
            <div className="text-base font-black text-rose-700 tabular-nums">{money(shownTotal)}</div>
          </div>
        </div>
      )}
    </Page>
  );
}
