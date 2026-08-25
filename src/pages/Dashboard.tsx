import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Bell,
  Clock3,
  CreditCard,
  FileText,
  Landmark,
  LayoutDashboard,
  Minus,
  Package,
  PauseCircle,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Truck,
  Undo2,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import { cmd, money, qty } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Page } from "@/components/ui/Page";
import { useToasts } from "@/components/ui/Toast";
import { settingFlag, usePrefs } from "@/stores/prefs";
import { useSession } from "@/stores/session";

type Dash = {
  salesToday: number;
  invoicesToday: number;
  profitToday: number;
  cashToday: number;
  cardToday: number;
  purchasesToday: number;
  expensesToday: number;
  salesYesterday: number;
  invoicesYesterday: number;
  expensesYesterday: number;
  returnsToday: number;
  returnsAmountToday: number;
  heldCount: number;
  customersCount: number;
  lowStock: number;
  expiring: number;
  expired: number;
  pendingTransfers: number;
  recentSales: { id: number; invoiceNumber: string; grandTotal: number; createdAt: string; userName?: string | null }[];
  topProducts: { name: string; quantity: number; total: number }[];
  lowStockItems: { name: string; quantity: number; minStock: number }[];
  expiringItems: { name: string; expirationDate: string; quantity: number }[];
};

const ROLE: Record<string, string> = {
  administrator: "مدير النظام",
  manager: "مدير",
  cashier: "كاشير",
  warehouse_clerk: "أمين مخزن",
};

export function Dashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [busy, setBusy] = useState(false);
  const push = useToasts((s) => s.push);
  const nav = useNavigate();
  const { shift, askOpenShift, can } = useSession();
  const store = usePrefs((p) => p.values["store.name"] || "نظام التجميل");
  const vals = usePrefs((p) => p.values);
  const showLow = settingFlag(vals, "alert.low_stock", true);
  const showExpiry = settingFlag(vals, "alert.expiry", true);
  const showBatch = settingFlag(vals, "alert.batch_expiry", true);

  async function load() {
    setBusy(true);
    try {
      setD(await cmd<Dash>("dashboard_summary"));
    } catch (e) {
      setD(null);
      if (shift) push("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [shift?.id]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "صباح الخير" : hour < 18 ? "مساء الخير" : "مساء الخير";
  const avgInvoice = d && d.invoicesToday ? Math.round(d.salesToday / d.invoicesToday) : 0;
  const netToday = d ? d.profitToday - d.expensesToday : 0;
  const alerts = d
    ? [
        showLow
          ? { label: "نواقص", value: d.lowStock, to: "/inventory", tone: d.lowStock ? "text-amber-800 bg-amber-50 border-amber-100" : "text-slate-600 bg-white border-slate-100", icon: Package }
          : null,
        showExpiry
          ? { label: "قارب على الانتهاء", value: d.expiring, to: "/inventory", tone: d.expiring ? "text-orange-800 bg-orange-50 border-orange-100" : "text-slate-600 bg-white border-slate-100", icon: Clock3 }
          : null,
        showBatch
          ? { label: "منتهي", value: d.expired, to: "/inventory", tone: d.expired ? "text-rose-800 bg-rose-50 border-rose-100" : "text-slate-600 bg-white border-slate-100", icon: AlertTriangle }
          : null,
        { label: "تحويلات معلّقة", value: d.pendingTransfers, to: "/inventory", tone: d.pendingTransfers ? "text-sky-800 bg-sky-50 border-sky-100" : "text-slate-600 bg-white border-slate-100", icon: Truck },
        { label: "فواتير معلّقة", value: d.heldCount, to: "/pos", tone: d.heldCount ? "text-violet-800 bg-violet-50 border-violet-100" : "text-slate-600 bg-white border-slate-100", icon: PauseCircle },
        { label: "مرتجعات اليوم", value: d.returnsToday, to: "/returns", tone: d.returnsToday ? "text-rose-800 bg-rose-50 border-rose-100" : "text-slate-600 bg-white border-slate-100", icon: Undo2 },
      ].filter((x): x is NonNullable<typeof x> => x !== null)
    : [];

  const shortcuts = [
    { to: "/pos", label: "نقطة البيع", hint: "F1", icon: ShoppingBag, show: can("sales.create") || !shift },
    { to: "/invoices", label: "الفواتير", hint: "", icon: FileText, show: can("sales.view") || !shift },
    { to: "/returns", label: "المرتجعات", hint: "F6", icon: Undo2, show: can("sales.return") || !shift },
    { to: "/products", label: "المنتجات", hint: "F3", icon: Package, show: can("products.view") || !shift },
    { to: "/inventory", label: "المخزون", hint: "F4", icon: Warehouse, show: can("stock.view") || !shift },
    { to: "/notifications", label: "التنبيهات", hint: "", icon: Bell, show: can("stock.view") || !shift },
    { to: "/purchases", label: "المشتريات", hint: "", icon: Truck, show: can("purchases.view") || !shift },
    { to: "/customers", label: "العملاء", hint: "", icon: Users, show: can("customers.manage") || !shift },
    { to: "/expenses", label: "المصروفات", hint: "F7", icon: Wallet, show: can("expenses.manage") || !shift },
    { to: "/cash", label: "الصندوق", hint: "", icon: Landmark, show: can("sales.view") || !shift },
    { to: "/reports", label: "التقارير", hint: "F12", icon: BarChart3, show: can("reports.view") || !shift },
    { to: "/shifts", label: "الورديات", hint: "", icon: Clock3, show: true },
  ].filter((s) => s.show);

  return (
    <Page
      title="الرئيسية"
      subtitle="ملخص اليوم، التنبيهات، والوصول السريع لكل أقسام المتجر."
      icon={LayoutDashboard}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => void load()}>
            <RefreshCw size={15} className={busy ? "animate-spin" : ""} /> تحديث
          </Button>
          <Button onClick={() => nav("/pos")}>
            <ShoppingBag size={15} /> فتح نقطة البيع
          </Button>
        </div>
      }
    >
      <section className="relative overflow-hidden rounded-2xl bg-rose-800 text-white border border-rose-800 p-5 mb-5">
        <div className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-gold-light text-xs font-bold tracking-wide">{greet}</div>
            <h2 className="text-xl font-bold mt-1">{store}</h2>
            <p className="text-sm text-rose-100 mt-1.5 leading-6">
              {shift ? (
                <>
                  الوردية مفتوحة باسم <strong className="text-white">{shift.userName}</strong>
                  {ROLE[shift.roleCode] ? ` · ${ROLE[shift.roleCode]}` : ""} · منذ {shiftSince(shift.openedAt)}
                </>
              ) : (
                "لا توجد وردية مفتوحة. افتح وردية لبدء البيع وعرض أرقام اليوم."
              )}
            </p>
          </div>
          {shift ? (
            <span className="h-8 px-3 rounded-full bg-white/15 text-gold-light text-xs font-bold inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> وردية نشطة
            </span>
          ) : (
            <Button className="bg-white text-rose-800 hover:bg-rose-50" onClick={askOpenShift}>
              فتح الوردية
            </Button>
          )}
        </div>
      </section>

      {!d ? (
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm py-16 text-center text-slate-400">
          {busy ? "جاري تحميل ملخص اليوم…" : "تعذر تحميل الملخص. تأكد من فتح وردية ثم اضغط تحديث."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
            <Kpi
              label="مبيعات اليوم"
              value={money(d.salesToday)}
              icon={ShoppingBag}
              tone="text-rose-700 bg-rose-50"
              delta={pctDelta(d.salesToday, d.salesYesterday)}
            />
            <Kpi
              label="عدد الفواتير"
              value={qty(d.invoicesToday)}
              hint={d.invoicesToday ? `متوسط الفاتورة ${money(avgInvoice)}` : "لا فواتير بعد"}
              icon={Sparkles}
              tone="text-amber-700 bg-amber-50"
              delta={pctDelta(d.invoicesToday, d.invoicesYesterday)}
            />
            <Kpi
              label="ربح تقديري"
              value={money(d.profitToday)}
              hint="بعد تكلفة البضاعة المباعة"
              icon={Banknote}
              tone="text-emerald-700 bg-emerald-50"
            />
            <Kpi
              label="صافي اليوم"
              value={money(netToday)}
              hint="الربح بعد خصم المصروفات"
              icon={Wallet}
              tone="text-slate-700 bg-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
            <MiniKpi label="نقدي" value={money(d.cashToday)} icon={Banknote} />
            <MiniKpi label="بطاقات" value={money(d.cardToday)} icon={CreditCard} />
            <MiniKpi label="مشتريات اليوم" value={money(d.purchasesToday)} icon={Truck} />
            <MiniKpi
              label="مصروفات اليوم"
              value={money(d.expensesToday)}
              icon={Wallet}
              delta={pctDelta(d.expensesToday, d.expensesYesterday)}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
            {alerts.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => nav(a.to)}
                  className={`rounded-2xl border p-3.5 text-right transition hover:shadow-sm ${a.tone}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-semibold">{a.label}</span>
                    <Icon size={15} />
                  </div>
                  <div className="text-lg font-bold">{qty(a.value)}</div>
                </button>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-5">
            <Card title="آخر المبيعات" action="كل الفواتير" onAction={() => nav("/invoices")}>
              {d.recentSales.length === 0 ? (
                <Empty text="لا توجد مبيعات بعد" />
              ) : (
                d.recentSales.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => nav("/invoices")}
                    className="w-full px-4 py-3 flex items-center gap-3 border-t border-slate-50 first:border-0 text-right hover:bg-rose-50/40"
                  >
                    <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-700 grid place-items-center shrink-0">
                      <ShoppingBag size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm text-slate-800">{s.invoiceNumber}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {s.userName || "—"} · {formatWhen(s.createdAt)}
                      </div>
                    </div>
                    <div className="font-bold text-sm text-rose-700 whitespace-nowrap">{money(s.grandTotal)}</div>
                  </button>
                ))
              )}
            </Card>

            <Card title="الأكثر مبيعاً اليوم" action="التقرير الكامل" onAction={() => nav("/reports?r=top_sellers")}>
              {d.topProducts.length === 0 ? (
                <Empty text="لا توجد أصناف مباعة اليوم" />
              ) : (
                d.topProducts.map((p, i) => (
                  <div key={p.name} className="px-4 py-3 flex items-center gap-3 border-t border-slate-50 first:border-0">
                    <div className="h-7 w-7 rounded-lg bg-slate-100 text-slate-600 grid place-items-center text-xs font-bold shrink-0">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-slate-800 truncate">{p.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{qty(p.quantity)} قطعة</div>
                    </div>
                    <div className="font-bold text-sm text-slate-700 whitespace-nowrap">{money(p.total)}</div>
                  </div>
                ))
              )}
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-5">
            <Card title="نواقص المخزون" action="المخزون" onAction={() => nav("/inventory")}>
              {d.lowStockItems.length === 0 ? (
                <Empty text="لا توجد نواقص حالياً" />
              ) : (
                d.lowStockItems.map((p) => (
                  <div key={p.name} className="px-4 py-3 flex items-center gap-3 border-t border-slate-50 first:border-0">
                    <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-700 grid place-items-center shrink-0">
                      <Package size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-slate-800 truncate">{p.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">الحد الأدنى {qty(p.minStock)}</div>
                    </div>
                    <span className="h-7 px-2.5 rounded-full bg-amber-50 text-amber-800 text-xs font-bold">
                      {qty(p.quantity)} متبقي
                    </span>
                  </div>
                ))
              )}
            </Card>

            <Card title="قرب انتهاء الصلاحية" action="المخزون" onAction={() => nav("/inventory")}>
              {d.expiringItems.length === 0 ? (
                <Empty text="لا توجد دفعات قاربت على الانتهاء" />
              ) : (
                d.expiringItems.map((p) => (
                  <div key={`${p.name}-${p.expirationDate}`} className="px-4 py-3 flex items-center gap-3 border-t border-slate-50 first:border-0">
                    <div className="h-9 w-9 rounded-xl bg-orange-50 text-orange-700 grid place-items-center shrink-0">
                      <Clock3 size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-slate-800 truncate">{p.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{qty(p.quantity)} قطعة</div>
                    </div>
                    <span className="h-7 px-2.5 rounded-full bg-orange-50 text-orange-800 text-xs font-bold whitespace-nowrap">
                      {formatDate(p.expirationDate)}
                    </span>
                  </div>
                ))
              )}
            </Card>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mb-5">
            <MiniKpi label="عملاء مسجّلون" value={qty(d.customersCount)} icon={Users} />
            <MiniKpi label="مبالغ المرتجعات اليوم" value={money(d.returnsAmountToday)} icon={Undo2} />
            <MiniKpi label="مقارنة بأمس" value={pctDelta(d.salesToday, d.salesYesterday).label} icon={d.salesToday >= d.salesYesterday ? ArrowUpRight : ArrowDownRight} />
          </div>
        </>
      )}

      <section className="rounded-3xl bg-white border border-slate-100 shadow-sm p-4">
        <div className="font-bold text-sm text-slate-800 mb-3">وصول سريع</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
          {shortcuts.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.to}
                type="button"
                onClick={() => nav(s.to)}
                className="rounded-2xl border border-slate-100 bg-slate-50/70 hover:bg-rose-50 hover:border-rose-200 p-3 text-center transition"
              >
                <div className="h-9 w-9 mx-auto mb-2 rounded-xl bg-white text-rose-700 grid place-items-center border border-slate-100">
                  <Icon size={16} />
                </div>
                <div className="text-xs font-bold text-slate-700">{s.label}</div>
                {s.hint ? <div className="text-[10px] text-slate-400 mt-0.5">{s.hint}</div> : null}
              </button>
            );
          })}
        </div>
      </section>
    </Page>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof ShoppingBag;
  tone: string;
  delta?: { label: string; up: boolean; flat: boolean };
}) {
  return (
    <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5 min-h-[118px]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-sm text-slate-500">{label}</div>
        <div className={`h-9 w-9 rounded-xl grid place-items-center ${tone}`}>
          <Icon size={16} />
        </div>
      </div>
      <div className="text-lg font-bold text-slate-800 leading-6">{value}</div>
      <div className="mt-1.5 flex items-center gap-2">
        {delta ? <DeltaBadge delta={delta} /> : null}
        {hint ? <div className="text-xs text-slate-400">{hint}</div> : null}
      </div>
    </div>
  );
}

function MiniKpi({
  label,
  value,
  icon: Icon,
  delta,
}: {
  label: string;
  value: string;
  icon: typeof ShoppingBag;
  delta?: { label: string; up: boolean; flat: boolean };
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm px-4 py-3.5 flex items-center gap-3">
      <div className="h-9 w-9 rounded-xl bg-slate-50 text-slate-600 grid place-items-center shrink-0">
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="font-bold text-slate-800 mt-0.5 truncate">{value}</div>
      </div>
      {delta ? <DeltaBadge delta={delta} /> : null}
    </div>
  );
}

function DeltaBadge({ delta }: { delta: { label: string; up: boolean; flat: boolean } }) {
  const Icon = delta.flat ? Minus : delta.up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`h-6 px-1.5 rounded-full text-[10px] font-bold inline-flex items-center gap-0.5 ${
        delta.flat ? "bg-slate-100 text-slate-500" : delta.up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
      }`}
    >
      <Icon size={11} /> {delta.label}
    </span>
  );
}

function Card({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h2 className="font-bold text-sm text-slate-800">{title}</h2>
        <button type="button" onClick={onAction} className="text-xs font-bold text-rose-700 hover:text-rose-800">
          {action}
        </button>
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-slate-400">{text}</div>;
}

function pctDelta(today: number, yesterday: number) {
  if (yesterday === 0 && today === 0) return { label: "مثل أمس", up: false, flat: true };
  if (yesterday === 0) return { label: "جديد", up: true, flat: false };
  const p = Math.round(((today - yesterday) / yesterday) * 100);
  if (p === 0) return { label: "مثل أمس", up: false, flat: true };
  return { label: `${p > 0 ? "+" : ""}${p}%`, up: p > 0, flat: false };
}

function formatWhen(iso: string) {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso.replace("T", " ");
  return d.toLocaleString("ar-EG", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
}

function formatDate(iso: string) {
  const [y, m, d] = (iso || "").split("-");
  if (!y || !m || !d) return iso || "—";
  return `${d}/${m}/${y}`;
}

function shiftSince(openedAt?: string) {
  if (!openedAt) return "—";
  const d = new Date(openedAt.includes("T") ? openedAt : openedAt.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return openedAt.replace("T", " ");
  const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (mins < 60) return `${mins} د`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} س و ${m} د` : `${h} س`;
}
