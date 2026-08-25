import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  Clock3,
  FileDown,
  Package,
  Percent,
  RefreshCw,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { cmd } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Input, SearchField } from "@/components/ui/Field";
import { PageHeader, Panel } from "@/components/ui/Page";
import { useToasts } from "@/components/ui/Toast";
import { useSession } from "@/stores/session";
import { cn } from "@/utils/cn";

type Kind =
  | "sales"
  | "sales_product"
  | "top_sellers"
  | "least_sellers"
  | "sales_category"
  | "sales_employee"
  | "sales_payment"
  | "profit"
  | "inventory"
  | "low_stock"
  | "expiry"
  | "slow"
  | "valuation"
  | "purchases"
  | "expenses"
  | "suppliers"
  | "customers"
  | "cash";

type Card = {
  id: Kind;
  title: string;
  desc: string;
  group: string;
  icon: LucideIcon;
  perm?: string;
  usesPeriod: boolean;
};

type ReportView = {
  kind: string;
  title: string;
  subtitle: string;
  storeName: string;
  periodLabel: string;
  generatedAt: string;
  usesPeriod: boolean;
  columns: string[];
  rows: string[][];
  summary: { label: string; value: string }[];
  footnote: string;
};

const CARDS: Card[] = [
  { id: "sales", title: "المبيعات", desc: "فواتير الفترة مع الكاشير والعميل", group: "المبيعات", icon: ShoppingBag, usesPeriod: true },
  { id: "sales_product", title: "حسب المنتج", desc: "الكميات والإيراد والتكلفة لكل صنف", group: "المبيعات", icon: Package, usesPeriod: true },
  { id: "top_sellers", title: "الأكثر مبيعاً", desc: "أعلى الأصناف كميةً خلال الفترة — لتعرف ما يجب توفيره", group: "المبيعات", icon: TrendingUp, usesPeriod: true },
  { id: "least_sellers", title: "الأقل مبيعاً", desc: "الأضعف مبيعاً وما لم يُبع وما زال في المخزون", group: "المبيعات", icon: TrendingDown, usesPeriod: true },
  { id: "sales_category", title: "حسب التصنيف", desc: "تجميع المبيعات حسب فئة المنتج", group: "المبيعات", icon: BarChart3, usesPeriod: true },
  { id: "sales_employee", title: "حسب الموظف", desc: "إجمالي كل كاشير خلال الفترة", group: "المبيعات", icon: Users, usesPeriod: true },
  { id: "sales_payment", title: "حسب طريقة الدفع", desc: "كاش وبطاقة والتحويل", group: "المبيعات", icon: Banknote, usesPeriod: true },
  { id: "profit", title: "الربح والخسارة", desc: "إيراد وتكلفة الدفعة ومصروفات وصافٍ", group: "المالية", icon: Percent, perm: "profit.view", usesPeriod: true },
  { id: "expenses", title: "المصروفات", desc: "مصروفات الفترة حسب التصنيف", group: "المالية", icon: Wallet, usesPeriod: true },
  { id: "cash", title: "الصندوق والورديات", desc: "افتتاحي ومتوقع وفعلي وفرق الصندوق", group: "المالية", icon: Banknote, usesPeriod: true },
  { id: "inventory", title: "المخزون الحالي", desc: "الكميات حسب الموقع والدفعة", group: "المخزون", icon: Warehouse, usesPeriod: false },
  { id: "low_stock", title: "نواقص المخزون", desc: "أصناف وصلت لحد إعادة الطلب", group: "المخزون", icon: AlertTriangle, usesPeriod: false },
  { id: "expiry", title: "الصلاحية", desc: "منتهٍ وقارب على الانتهاء", group: "المخزون", icon: Clock3, usesPeriod: false },
  { id: "slow", title: "الراكد", desc: "بدون مبيعات خلال فترة الإعدادات", group: "المخزون", icon: Clock3, usesPeriod: false },
  { id: "valuation", title: "تقييم المخزون", desc: "القيمة بتكلفة الدفعة الفعلية", group: "المخزون", icon: Warehouse, usesPeriod: false },
  { id: "purchases", title: "المشتريات", desc: "فواتير الموردين والمدفوع والمتبقي", group: "المشتريات والعملاء", icon: Truck, usesPeriod: true },
  { id: "suppliers", title: "أرصدة الموردين", desc: "صافي حساب كل مورد", group: "المشتريات والعملاء", icon: Truck, usesPeriod: false },
  { id: "customers", title: "العملاء", desc: "مشتريات ومرتجعات ورصيد ونقاط", group: "المشتريات والعملاء", icon: Users, usesPeriod: true },
];

const KPI_TONES = [
  { icon: BarChart3, tone: "text-rose-700 bg-rose-50" },
  { icon: Wallet, tone: "text-emerald-700 bg-emerald-50" },
  { icon: Package, tone: "text-sky-700 bg-sky-50" },
  { icon: Percent, tone: "text-violet-700 bg-violet-50" },
  { icon: TrendingUp, tone: "text-amber-700 bg-amber-50" },
  { icon: Users, tone: "text-orange-700 bg-orange-50" },
] as const;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

function weekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 6 ? 0 : day + 1;
  d.setDate(d.getDate() - diff);
  return isoDate(d);
}

function kpiMeta(label: string, i: number) {
  if (/ربح|صاف/.test(label)) return { icon: TrendingUp, tone: "text-emerald-700 bg-emerald-50" };
  if (/تكلفة|مصروف|خسارة|ناقص|نقص/.test(label)) return { icon: TrendingDown, tone: "text-amber-700 bg-amber-50" };
  if (/إيراد|مبيعات|إجمالي|قيمة/.test(label)) return { icon: Wallet, tone: "text-rose-700 bg-rose-50" };
  if (/كمية|عدد|فواتير/.test(label)) return { icon: Package, tone: "text-sky-700 bg-sky-50" };
  return KPI_TONES[i % KPI_TONES.length];
}

function isMetricColumn(name: string) {
  return /إيراد|مبلغ|إجمالي|تكلفة|ربح|قيمة|كمية|عدد|رصيد|نقاط|مدفوع|متبقي|فرق/.test(name);
}

function isStatusColumn(name: string) {
  return name === "الحالة";
}

function statusCls(text: string) {
  if (/ملغ/.test(text)) return "bg-rose-50 text-rose-800 border-rose-100";
  if (/مرتجع/.test(text)) return "bg-amber-50 text-amber-800 border-amber-100";
  if (/مكتمل|مفتوح/.test(text)) return "bg-emerald-50 text-emerald-800 border-emerald-100";
  if (/منته/.test(text)) return "bg-rose-50 text-rose-800 border-rose-100";
  if (/قارب|منخفض|راكد/.test(text)) return "bg-amber-50 text-amber-800 border-amber-100";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function formatGenerated(iso: string) {
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso.replace("T", " ");
  return d.toLocaleString("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReportsPage() {
  const push = useToasts((s) => s.push);
  const can = useSession((s) => s.can);
  const [params] = useSearchParams();
  const [kind, setKind] = useState<Kind | null>(null);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDate(new Date()));
  const [report, setReport] = useState<ReportView | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [q, setQ] = useState("");

  const visible = CARDS.filter((c) => !c.perm || can(c.perm));
  const groups = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const c of visible) {
      const list = map.get(c.group) || [];
      list.push(c);
      map.set(c.group, list);
    }
    return [...map.entries()];
  }, [visible]);

  const current = CARDS.find((c) => c.id === kind) || null;
  const today = isoDate(new Date());
  const preset =
    from === today && to === today ? "today" : from === weekStart() && to === today ? "week" : from === monthStart() && to === today ? "month" : "custom";

  const filteredRows = useMemo(() => {
    if (!report) return [];
    const needle = q.trim();
    if (!needle) return report.rows;
    return report.rows.filter((row) => row.some((cell) => (cell || "").includes(needle)));
  }, [report, q]);

  async function load(nextKind: Kind, nextFrom = from, nextTo = to) {
    setBusy(true);
    try {
      const data = await cmd<ReportView>("run_report", { kind: nextKind, from: nextFrom, to: nextTo });
      setReport(data);
    } catch (e) {
      setReport(null);
      push("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const r = params.get("r") as Kind | null;
    if (r && CARDS.some((c) => c.id === r)) {
      setKind(r);
    }
  }, [params]);

  useEffect(() => {
    if (!kind) return;
    setQ("");
    void load(kind);
  }, [kind]);

  function open(id: Kind) {
    setReport(null);
    setKind(id);
  }

  function applyPreset(next: "today" | "week" | "month") {
    const nextTo = isoDate(new Date());
    const nextFrom = next === "today" ? nextTo : next === "week" ? weekStart() : monthStart();
    setFrom(nextFrom);
    setTo(nextTo);
    if (kind) void load(kind, nextFrom, nextTo);
  }

  async function exportPdf() {
    if (!kind || !current) return;
    setExporting(true);
    try {
      const fileName = `${current.title} ${from} ${to}.pdf`;
      const dest = await cmd<string | null>("pick_report_pdf_path", { fileName });
      if (!dest) return;
      await cmd<string>("export_report_pdf", { kind, from, to, dest });
      push("ok", "تم حفظ ملف PDF");
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  if (!kind || !current) {
    return (
      <div className="h-full bg-app overflow-auto">
        <div className="p-4 lg:p-5">
          <PageHeader
            title="التقارير"
            subtitle="كل تقرير منفصل. افتح التقرير ثم صدّره إلى PDF."
            icon={BarChart3}
            className="mb-4"
          />
          <div className="space-y-6">
            {groups.map(([group, cards]) => (
              <section key={group}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-8 px-3 rounded-full bg-white text-rose-800 border border-rose-100 shadow-sm text-xs font-bold">
                    {group}
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-l from-rose-200/70 via-slate-200 to-transparent" />
                </div>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {cards.map((c) => {
                    const Icon = c.icon;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => open(c.id)}
                        className="group text-right rounded-3xl bg-white border border-slate-100 shadow-sm p-4 hover:border-rose-200 hover:shadow-md transition min-h-[128px] flex flex-col"
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-rose-100 to-rose-200 text-rose-800 grid place-items-center border border-rose-100">
                            <Icon size={20} />
                          </div>
                          <ChevronLeft size={16} className="text-slate-300 group-hover:text-rose-500 mt-1" />
                        </div>
                        <div className="font-bold text-slate-800">{c.title}</div>
                        <div className="text-sm text-slate-500 mt-1.5 leading-5 flex-1">{c.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const Icon = current.icon;

  return (
    <div className="h-full bg-app overflow-auto">
      <div className="p-4 lg:p-5">
        <PageHeader
          title={current.title}
          subtitle={current.desc}
          icon={current.icon}
          className="mb-4"
          leading={
            <button
              type="button"
              onClick={() => {
                setKind(null);
                setReport(null);
                setQ("");
              }}
              className="h-11 w-11 shrink-0 rounded-xl bg-white border border-slate-200 text-slate-500 hover:border-rose-200 hover:text-rose-700 hover:bg-rose-50 grid place-items-center"
              aria-label="رجوع"
            >
              <ArrowRight size={16} />
            </button>
          }
          actions={
            <Button disabled={busy || exporting || !report} onClick={() => void exportPdf()}>
              <FileDown size={15} />
              {exporting ? "جاري التصدير…" : "تصدير PDF"}
            </Button>
          }
        />

        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-4 mb-4">
          <SearchField
            placeholder="ابحث داخل نتائج التقرير"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            wrapClassName="w-full min-w-0"
          />
          <div className="flex flex-wrap items-center gap-2 pt-3">
            {current.usesPeriod ? (
              <>
                {(
                  [
                    ["today", "اليوم"],
                    ["week", "الأسبوع"],
                    ["month", "الشهر"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => applyPreset(id)}
                    className={cn(
                      "h-7 px-3 rounded-full text-xs whitespace-nowrap border font-semibold",
                      preset === id
                        ? "bg-rose-700 text-white border-rose-700"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:border-rose-300",
                    )}
                  >
                    {label}
                  </button>
                ))}
                <div className="flex items-center gap-2 ms-auto">
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="h-9 w-auto rounded-xl bg-slate-50 border-slate-200 text-xs font-semibold"
                  />
                  <span className="text-xs text-slate-400">إلى</span>
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-9 w-auto rounded-xl bg-slate-50 border-slate-200 text-xs font-semibold"
                  />
                  <Button variant="secondary" disabled={busy} onClick={() => void load(kind)}>
                    <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
                    عرض
                  </Button>
                </div>
              </>
            ) : (
              <Button variant="secondary" disabled={busy} onClick={() => void load(kind)} className="ms-auto">
                <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
                تحديث
              </Button>
            )}
          </div>
        </div>

        {report?.summary?.length ? (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
            {report.summary.map((k, i) => {
              const meta = kpiMeta(k.label, i);
              const KpiIcon = meta.icon;
              const moneyLike = /إيراد|مبلغ|إجمالي|تكلفة|ربح|قيمة|صاف/.test(k.label);
              return (
                <div key={k.label} className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5 min-h-[110px]">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="text-sm text-slate-500">{k.label}</div>
                    <div className={`h-9 w-9 rounded-xl grid place-items-center ${meta.tone}`}>
                      <KpiIcon size={16} />
                    </div>
                  </div>
                  <div className={cn("text-lg font-bold leading-6", moneyLike ? "text-rose-700" : "text-slate-800")}>
                    {k.value}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {!report && busy ? (
          <Panel>
            <div className="py-16 px-6 text-center">
              <div className="h-12 w-12 mx-auto mb-3 rounded-2xl bg-rose-50 text-rose-700 grid place-items-center border border-rose-100">
                <RefreshCw size={22} className="animate-spin" />
              </div>
              <div className="font-bold text-sm text-slate-700">جاري تجهيز التقرير…</div>
              <p className="text-xs text-slate-400 mt-1">يتم جمع البيانات حسب الفترة المحددة.</p>
            </div>
          </Panel>
        ) : !report ? (
          <Panel>
            <div className="py-16 px-6 text-center">
              <div className="h-12 w-12 mx-auto mb-3 rounded-2xl bg-rose-50 text-rose-700 grid place-items-center border border-rose-100">
                <Icon size={22} />
              </div>
              <div className="font-bold text-sm text-slate-700">اضغط عرض لتحميل التقرير</div>
              <p className="text-xs text-slate-400 mt-1">{current.desc}</p>
            </div>
          </Panel>
        ) : filteredRows.length === 0 ? (
          <Panel>
            <div className="py-16 px-6 text-center">
              <div className="h-12 w-12 mx-auto mb-3 rounded-2xl bg-rose-50 text-rose-700 grid place-items-center border border-rose-100">
                <Icon size={22} />
              </div>
              <div className="font-bold text-sm text-slate-700">
                {q.trim() ? "لا توجد نتائج مطابقة" : "لا توجد بيانات لهذا التقرير"}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {q.trim() ? "جرّب كلمة بحث أخرى." : "غيّر الفترة أو أتمّ عمليات في نقطة البيع لتظهر هنا."}
              </p>
            </div>
          </Panel>
        ) : (
          <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-slate-800">{report.title || current.title}</div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                  {report.storeName}
                  {report.periodLabel ? ` · ${report.periodLabel}` : ""}
                  {report.generatedAt ? ` · ${formatGenerated(report.generatedAt)}` : ""}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {report.periodLabel ? (
                  <span className="h-7 px-2.5 rounded-full bg-white text-rose-800 border border-rose-100 text-xs font-bold inline-flex items-center gap-1">
                    <CalendarDays size={12} />
                    {report.periodLabel}
                  </span>
                ) : null}
                <span className="h-7 px-2.5 rounded-full bg-rose-50 border border-rose-100 text-xs font-bold text-rose-700">
                  {filteredRows.length}
                  {filteredRows.length !== report.rows.length ? ` من ${report.rows.length}` : ""} صف
                </span>
              </div>
            </div>

            <div className="overflow-auto p-3 bg-gradient-to-b from-slate-50/90 to-white">
              <table className="w-full text-sm min-w-[640px] border-separate border-spacing-y-2">
                <thead>
                  <tr>
                    {report.columns.map((c, j) => (
                      <th
                        key={c}
                        className={cn(
                          "px-4 pb-1 text-[11px] font-bold text-slate-400 whitespace-nowrap",
                          j === 0 ? "text-right" : isMetricColumn(c) ? "text-left" : "text-right",
                        )}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => (
                    <tr key={i} className="group">
                      {row.map((cell, j) => {
                        const col = report.columns[j] || "";
                        const first = j === 0;
                        const metric = isMetricColumn(col);
                        const status = isStatusColumn(col);
                        return (
                          <td
                            key={j}
                            className={cn(
                              "bg-white border-y border-slate-200 px-4 py-3 align-middle",
                              first ? "rounded-r-2xl border-r" : "",
                              j === row.length - 1 ? "rounded-l-2xl border-l" : "",
                              "group-hover:border-rose-200 group-hover:bg-rose-50/30",
                            )}
                          >
                            {first ? (
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-rose-100 to-rose-200 text-rose-800 grid place-items-center font-black shrink-0 border border-rose-100">
                                  {(cell || "•").slice(0, 1)}
                                </div>
                                <span className="font-bold text-slate-800 truncate">{cell || "—"}</span>
                              </div>
                            ) : status ? (
                              <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-bold", statusCls(cell))}>
                                {cell || "—"}
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  "block",
                                  metric ? "text-left font-black text-rose-700" : "text-slate-600 font-semibold",
                                )}
                                dir={metric ? "ltr" : undefined}
                              >
                                {cell || "—"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.footnote ? (
              <p className="text-[11px] text-slate-400 px-5 py-3 border-t border-slate-100">{report.footnote}</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
