import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CircleDot,
  Clock3,
  Receipt,
  ShoppingBag,
  Timer,
} from "lucide-react";
import { cmd, money, qty } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { SearchField } from "@/components/ui/Field";
import { Empty } from "@/components/ui/Empty";
import { useToasts } from "@/components/ui/Toast";
import { Page, Panel } from "@/components/ui/Page";
import { useSession } from "@/stores/session";
import { cn } from "@/utils/cn";

type ShiftRow = {
  id: number;
  userName: string;
  openedAt: string;
  closedAt?: string | null;
  openingCash: number;
  expectedCash: number;
  closingCashActual?: number | null;
  difference?: number | null;
  status: string;
  notes?: string | null;
  salesCount: number;
  salesTotal: number;
};

type StatusFilter = "all" | "open" | "closed";
type Period = "today" | "week" | "month" | "all";

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

function dateKey(iso: string) {
  return (iso || "").slice(0, 10);
}

function parseWhen(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatWhen(iso?: string | null) {
  const d = parseWhen(iso);
  if (!d) return iso ? iso.replace("T", " ") : "—";
  return d.toLocaleString("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClock(iso?: string | null) {
  const d = parseWhen(iso);
  if (!d) return "—";
  return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

function groupDateTitle(iso: string, today: string) {
  if (iso === today) return "اليوم";
  if (iso === daysAgoIso(1)) return "أمس";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
}

function durationLabel(openedAt: string, closedAt?: string | null) {
  const start = parseWhen(openedAt);
  if (!start) return "—";
  const end = parseWhen(closedAt) || new Date();
  const mins = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
  if (mins < 60) return `${mins} د`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} س و ${m} د` : `${h} س`;
}

function diffTone(n?: number | null) {
  if (n == null || n === 0) return "text-slate-600";
  return n > 0 ? "text-emerald-700" : "text-rose-700";
}

function diffText(n?: number | null) {
  if (n == null) return "—";
  if (n === 0) return money(0);
  return n > 0 ? `+${money(n)}` : money(n);
}

export function ShiftsPage() {
  const push = useToasts((s) => s.push);
  const askOpenShift = useSession((s) => s.askOpenShift);
  const current = useSession((s) => s.shift);
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [period, setPeriod] = useState<Period>("month");
  const [, setTick] = useState(0);

  useEffect(() => {
    cmd<ShiftRow[]>("list_shifts")
      .then(setRows)
      .catch((e) => push("err", (e as Error).message));
  }, [push, current?.id]);

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);

  const today = todayIso();
  const weekFrom = daysAgoIso(6);
  const monthPrefix = today.slice(0, 7);

  const filtered = useMemo(() => {
    const query = q.trim();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      const day = dateKey(r.openedAt);
      if (period === "today" && day !== today) return false;
      if (period === "week" && day < weekFrom) return false;
      if (period === "month" && !day.startsWith(monthPrefix)) return false;
      if (query) {
        const hay = `${r.userName} ${r.notes || ""}`;
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [rows, q, status, period, today, weekFrom, monthPrefix]);

  const grouped = useMemo(() => {
    const map = new Map<string, ShiftRow[]>();
    for (const r of filtered) {
      const key = dateKey(r.openedAt) || "—";
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const openRow = rows.find((r) => r.status === "open") || null;
  const openCount = rows.filter((r) => r.status === "open").length;
  const salesTotal = filtered.reduce((s, r) => s + r.salesTotal, 0);
  const invoicesTotal = filtered.reduce((s, r) => s + r.salesCount, 0);
  const closedDiff = filtered
    .filter((r) => r.status === "closed")
    .reduce((s, r) => s + (r.difference || 0), 0);

  const periods: { id: Period; label: string }[] = [
    { id: "today", label: "اليوم" },
    { id: "week", label: "آخر 7 أيام" },
    { id: "month", label: "هذا الشهر" },
    { id: "all", label: "الكل" },
  ];
  const statuses: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "كل الحالات" },
    { id: "open", label: "مفتوحة" },
    { id: "closed", label: "مغلقة" },
  ];

  const stats = [
    {
      label: "وردية مفتوحة",
      value: openCount ? "نشطة الآن" : "لا توجد",
      hint: openRow ? openRow.userName : "افتح وردية لبدء البيع",
      icon: CircleDot,
      tone: openCount ? "text-emerald-700 bg-emerald-50" : "text-slate-500 bg-slate-100",
    },
    {
      label: "عدد الورديات",
      value: qty(filtered.length),
      hint: `${qty(invoicesTotal)} فاتورة في المعروض`,
      icon: Timer,
      tone: "text-rose-700 bg-rose-50",
    },
    {
      label: "مبيعات الورديات",
      value: money(salesTotal),
      hint: "إجمالي الفواتير المكتملة",
      icon: ShoppingBag,
      tone: "text-amber-700 bg-amber-50",
    },
    {
      label: "فرق الصندوق",
      value: diffText(closedDiff),
      hint: "للورديات المغلقة المعروضة",
      icon: Banknote,
      tone:
        closedDiff === 0
          ? "text-slate-600 bg-slate-100"
          : closedDiff > 0
            ? "text-emerald-700 bg-emerald-50"
            : "text-rose-700 bg-rose-50",
    },
  ];

  return (
    <Page
      title="الورديات"
      subtitle="سجل فتح وإغلاق الصندوق والعهدة والمبيعات"
      icon={Clock3}
      actions={
        current ? null : (
          <Button onClick={askOpenShift}>فتح وردية</Button>
        )
      }
    >
      {openRow ? (
        <section className="relative overflow-hidden rounded-3xl bg-rose-800 text-white border border-rose-800 p-5 mb-4">
          <div className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute -right-6 -bottom-10 h-28 w-28 rounded-full bg-white/5" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-12 w-12 rounded-2xl bg-white/15 text-white grid place-items-center font-black text-lg shrink-0 border border-white/10">
                {(openRow.userName || "•").slice(0, 1)}
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-rose-100/80">الوردية الحالية</div>
                <div className="text-lg font-black mt-0.5 truncate">{openRow.userName}</div>
                <div className="text-sm text-rose-100/90 mt-1">
                  منذ {durationLabel(openRow.openedAt)} · فُتحت {formatWhen(openRow.openedAt)}
                </div>
              </div>
            </div>
            <span className="h-8 px-3 rounded-full bg-white/15 text-emerald-200 text-xs font-bold inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
              مفتوحة
            </span>
          </div>
          <div className="relative mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
            <BannerStat label="افتتاحي" value={money(openRow.openingCash)} />
            <BannerStat label="متوقع" value={money(openRow.expectedCash)} />
            <BannerStat label="المبيعات" value={money(openRow.salesTotal)} />
            <BannerStat label="الفواتير" value={qty(openRow.salesCount)} />
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-rose-200 bg-rose-50/40 px-5 py-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-bold text-slate-800">لا توجد وردية مفتوحة</div>
            <p className="text-sm text-slate-500 mt-0.5">افتح وردية من الشريط العلوي أو من الزر هنا لبدء البيع.</p>
          </div>
          <Button onClick={askOpenShift}>فتح وردية</Button>
        </section>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
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
              <div className="text-[11px] text-slate-400 mt-1">{s.hint}</div>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-4 mb-4">
        <SearchField
          placeholder="ابحث باسم الموظف أو الملاحظة"
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
          {statuses.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setStatus(p.id)}
              className={`h-7 px-3 rounded-full text-xs whitespace-nowrap border ${
                status === p.id ? "bg-rose-700 text-white border-rose-700" : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Panel>
          <Empty
            title={rows.length === 0 ? "لا توجد ورديات بعد" : "لا توجد نتائج مطابقة"}
            action={rows.length === 0 && !current ? "فتح وردية" : undefined}
            onAction={rows.length === 0 && !current ? askOpenShift : undefined}
          />
        </Panel>
      ) : (
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
            <div>
              <div className="font-bold text-slate-800">سجل الورديات</div>
              <div className="text-[11px] text-slate-400 mt-0.5">كل وردية في بطاقة مع حركة الصندوق</div>
            </div>
            <div className="h-7 px-2.5 rounded-full bg-rose-50 border border-rose-100 text-xs font-bold text-rose-700">
              {qty(filtered.length)} وردية
            </div>
          </div>
          <div className="p-4 bg-gradient-to-b from-slate-50/90 to-white space-y-6">
            {grouped.map(([date, list]) => (
              <section key={date}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-8 px-3 rounded-full bg-white text-rose-800 border border-rose-100 shadow-sm text-xs font-bold">
                    {groupDateTitle(date, today)}
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-l from-rose-200/70 via-slate-200 to-transparent" />
                  <div className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                    {qty(list.length)} · {money(list.reduce((s, r) => s + r.salesTotal, 0))}
                  </div>
                </div>
                <div className="space-y-2.5">
                  {list.map((r) => (
                    <ShiftCard key={r.id} row={r} live={r.status === "open"} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}

function BannerStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 border border-white/10 px-3 py-2.5">
      <div className="text-[11px] text-rose-100/80">{label}</div>
      <div className="font-black mt-0.5">{value}</div>
    </div>
  );
}

function ShiftCard({ row, live }: { row: ShiftRow; live: boolean }) {
  return (
    <article
      className={cn(
        "rounded-2xl bg-white border shadow-sm px-4 py-3.5 transition hover:shadow-md",
        live ? "border-emerald-200 ring-1 ring-emerald-100" : "border-slate-200 hover:border-rose-200",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "h-12 w-12 rounded-2xl grid place-items-center font-black shrink-0 border",
            live
              ? "bg-emerald-50 text-emerald-800 border-emerald-100"
              : "bg-gradient-to-br from-rose-100 to-rose-200 text-rose-800 border-rose-100",
          )}
        >
          {(row.userName || "•").slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold text-slate-800 truncate">{row.userName}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {formatClock(row.openedAt)}
                {row.closedAt ? ` → ${formatClock(row.closedAt)}` : " → الآن"}
                {" · "}
                {durationLabel(row.openedAt, row.closedAt)}
              </div>
            </div>
            <div className="text-left shrink-0">
              <div className="text-base font-black text-rose-700 whitespace-nowrap">{money(row.salesTotal)}</div>
              <div className="text-[11px] text-slate-400 mt-0.5 inline-flex items-center gap-1">
                <Receipt size={11} />
                {qty(row.salesCount)} فاتورة
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
        <CashCell label="افتتاحي" value={money(row.openingCash)} />
        <CashCell label="متوقع" value={money(row.expectedCash)} />
        <CashCell
          label="فعلي"
          value={row.closingCashActual == null ? "—" : money(row.closingCashActual)}
        />
        <CashCell
          label="الفرق"
          value={diffText(row.difference)}
          className={diffTone(row.difference)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold",
            live
              ? "bg-emerald-50 text-emerald-800 border-emerald-100"
              : "bg-slate-50 text-slate-600 border-slate-200",
          )}
        >
          {live ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> : null}
          {live ? "مفتوحة" : "مغلقة"}
        </span>
        {row.notes ? (
          <span className="text-xs text-slate-500 truncate max-w-full">{row.notes}</span>
        ) : null}
      </div>
    </article>
  );
}

function CashCell({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-2 min-w-0">
      <div className="text-[10px] font-semibold text-slate-400">{label}</div>
      <div className={cn("text-xs font-black mt-0.5 truncate text-slate-800", className)}>{value}</div>
    </div>
  );
}
