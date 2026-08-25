import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Ban,
  Banknote,
  CalendarDays,
  Landmark,
  Receipt,
  ShoppingBag,
  Undo2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cmd, money, qty } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Field, Input, SearchField, Textarea } from "@/components/ui/Field";
import { Empty } from "@/components/ui/Empty";
import { Modal } from "@/components/ui/Modal";
import { useToasts } from "@/components/ui/Toast";
import { Page, Panel } from "@/components/ui/Page";
import { useSession } from "@/stores/session";

type CashMove = {
  id: number;
  sessionId: number;
  sessionUser: string;
  sessionStatus: string;
  occurredAt: string;
  moveType: string;
  amount: number;
  reason?: string | null;
  invoiceNumber?: string | null;
  returnNumber?: string | null;
  userName?: string | null;
};

type CashOpen = {
  id: number;
  userName: string;
  openedAt: string;
  openingCash: number;
  expectedCash: number;
  salesIn: number;
  refunds: number;
  expenses: number;
  cashIn: number;
  cashOut: number;
  voids: number;
};

type CashDrawer = {
  open: CashOpen | null;
  movements: CashMove[];
};

type Period = "shift" | "today" | "week" | "month" | "all";
type TypeFilter = "all" | "sale_cash" | "refund" | "expense" | "cash_in" | "cash_out" | "opening";

const TYPE_META: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  opening: { label: "رصيد افتتاحي", icon: Banknote, tone: "bg-slate-100 text-slate-700 border-slate-200" },
  sale_cash: { label: "بيع نقدي", icon: ShoppingBag, tone: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  cash_in: { label: "توريد للصندوق", icon: ArrowDownToLine, tone: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  refund: { label: "مرتجع نقدي", icon: Undo2, tone: "bg-orange-50 text-orange-800 border-orange-200" },
  expense: { label: "مصروف", icon: Wallet, tone: "bg-rose-50 text-rose-800 border-rose-200" },
  cash_out: { label: "سحب من الصندوق", icon: ArrowUpFromLine, tone: "bg-rose-50 text-rose-800 border-rose-200" },
  void_reversal: { label: "إلغاء فاتورة", icon: Ban, tone: "bg-slate-100 text-slate-700 border-slate-200" },
};

const QUICK = [50, 100, 200, 500, 1000];
const IN_REASONS = ["عهدة", "فكة", "تسوية", "أخرى"];
const OUT_REASONS = ["إيداع بنك", "عهدة", "تسوية", "أخرى"];

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

function typeMeta(code: string) {
  return TYPE_META[code] || { label: "حركة نقدية", icon: Landmark, tone: "bg-slate-50 text-slate-600 border-slate-200" };
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

function signedMoney(n: number) {
  if (n > 0) return `+${money(n)}`;
  return money(n);
}

export function CashPage() {
  const nav = useNavigate();
  const push = useToasts((s) => s.push);
  const shift = useSession((s) => s.shift);
  const askOpenShift = useSession((s) => s.askOpenShift);
  const [data, setData] = useState<CashDrawer | null>(null);
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>(shift ? "shift" : "today");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [moveOpen, setMoveOpen] = useState<"in" | "out" | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setData(await cmd<CashDrawer>("list_cash_drawer"));
    } catch (e) {
      push("err", (e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, [shift?.id]);

  const today = todayIso();
  const weekFrom = daysAgoIso(6);
  const monthPrefix = today.slice(0, 7);
  const open = data?.open || null;
  const rows = data?.movements || [];

  const filtered = useMemo(() => {
    const query = q.trim();
    return rows.filter((r) => {
      if (period === "shift") {
        if (!open || r.sessionId !== open.id) return false;
      } else {
        const day = dateKey(r.occurredAt);
        if (period === "today" && day !== today) return false;
        if (period === "week" && day < weekFrom) return false;
        if (period === "month" && !day.startsWith(monthPrefix)) return false;
      }
      if (typeFilter !== "all" && r.moveType !== typeFilter) return false;
      if (query) {
        const meta = typeMeta(r.moveType);
        const hay = `${meta.label} ${r.reason || ""} ${r.invoiceNumber || ""} ${r.returnNumber || ""} ${r.sessionUser} ${r.userName || ""}`;
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [rows, q, period, typeFilter, open, today, weekFrom, monthPrefix]);

  const grouped = useMemo(() => {
    const map = new Map<string, CashMove[]>();
    for (const r of filtered) {
      const key = dateKey(r.occurredAt) || "—";
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const shownIn = filtered.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const shownOut = filtered.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);
  const outflowAbs = Math.abs((open?.refunds || 0) + (open?.expenses || 0) + (open?.cashOut || 0) + (open?.voids || 0));

  const stats = [
    {
      label: "افتتاحي الوردية",
      value: money(open?.openingCash || 0),
      icon: Banknote,
      tone: "text-slate-700 bg-slate-100",
    },
    {
      label: "مبيعات نقدية",
      value: money(open?.salesIn || 0),
      icon: ShoppingBag,
      tone: "text-emerald-700 bg-emerald-50",
    },
    {
      label: "خارج من الصندوق",
      value: money(outflowAbs),
      icon: ArrowUpFromLine,
      tone: "text-rose-700 bg-rose-50",
    },
    {
      label: "توريدات يدوية",
      value: money(open?.cashIn || 0),
      icon: ArrowDownToLine,
      tone: "text-amber-700 bg-amber-50",
    },
  ];

  const periods: { id: Period; label: string }[] = [
    { id: "shift", label: "الوردية الحالية" },
    { id: "today", label: "اليوم" },
    { id: "week", label: "آخر 7 أيام" },
    { id: "month", label: "هذا الشهر" },
    { id: "all", label: "الكل" },
  ];
  const types: { id: TypeFilter; label: string }[] = [
    { id: "all", label: "كل الحركات" },
    { id: "sale_cash", label: "مبيعات" },
    { id: "refund", label: "مرتجعات" },
    { id: "expense", label: "مصروفات" },
    { id: "cash_in", label: "توريدات" },
    { id: "cash_out", label: "سحوبات" },
    { id: "opening", label: "افتتاحي" },
  ];

  const piastres = Math.round(Number((amount || "0").replace(",", ".")) * 100);
  const amountOk = Number.isFinite(piastres) && piastres > 0;
  const reasonChips = moveOpen === "out" ? OUT_REASONS : IN_REASONS;

  function openMove(kind: "in" | "out") {
    if (!shift) {
      askOpenShift();
      return;
    }
    setMoveOpen(kind);
    setAmount("");
    setReason("");
  }

  async function saveMove() {
    if (!amountOk) {
      push("err", "أدخل مبلغاً صالحاً.");
      return;
    }
    if (!reason.trim()) {
      push("err", "أدخل سبب الحركة.");
      return;
    }
    setSaving(true);
    try {
      await cmd("cash_move", { amount: piastres, reason: reason.trim(), isIn: moveOpen === "in" });
      setMoveOpen(null);
      push("ok", moveOpen === "in" ? "تم توريد المبلغ إلى الصندوق." : "تم السحب من الصندوق.");
      await load();
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page
      title="الصندوق"
      subtitle="رصيد الدرج الحالي وكل حركة نقدية دخلت أو خرجت أثناء الوردية"
      icon={Landmark}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => openMove("out")} disabled={!shift}>
            <ArrowUpFromLine size={15} /> سحب
          </Button>
          <Button onClick={() => openMove("in")} disabled={!shift}>
            <ArrowDownToLine size={15} /> توريد
          </Button>
        </div>
      }
    >
      <section className="relative overflow-hidden rounded-2xl bg-rose-800 text-white border border-rose-800 p-5 mb-5">
        <div className="pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-gold-light text-xs font-bold tracking-wide">الرصيد المتوقع في الصندوق</div>
            <div className="text-3xl font-black mt-1.5 tabular-nums">{money(open?.expectedCash || 0)}</div>
            <p className="text-sm text-rose-100 mt-2 leading-6">
              {open ? (
                <>
                  وردية <strong className="text-white">{open.userName}</strong> · افتتاحي {money(open.openingCash)}
                </>
              ) : (
                "لا توجد وردية مفتوحة. افتح وردية لبدء الصندوق وعرض الرصيد الحي."
              )}
            </p>
          </div>
          {open ? (
            <span className="h-8 px-3 rounded-full bg-white/15 text-gold-light text-xs font-bold inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> صندوق نشط
            </span>
          ) : (
            <Button className="bg-white text-rose-800 hover:bg-rose-50" onClick={askOpenShift}>
              فتح الوردية
            </Button>
          )}
        </div>
      </section>

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
        <SearchField placeholder="ابحث بالسبب أو رقم الفاتورة أو نوع الحركة" value={q} onChange={(e) => setQ(e.target.value)} />
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
          {types.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTypeFilter(t.id)}
              className={`h-7 px-3 rounded-full text-xs whitespace-nowrap border ${
                typeFilter === t.id ? "bg-rose-700 text-white border-rose-700" : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Panel>
          <Empty
            title={rows.length === 0 ? "لا توجد حركات في الصندوق بعد" : "لا توجد نتائج مطابقة"}
            action={!open ? "فتح الوردية" : undefined}
            onAction={!open ? askOpenShift : undefined}
          />
        </Panel>
      ) : (
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80">
            <div className="font-bold text-slate-800">سجل الصندوق</div>
            <div className="text-[11px] font-semibold text-slate-500">
              {qty(filtered.length)} حركة · داخل {money(shownIn)} · خارج {money(Math.abs(shownOut))}
            </div>
          </div>
          <div className="p-4 bg-gradient-to-b from-slate-50/90 to-white space-y-6">
            {grouped.map(([date, items]) => {
              const dayNet = items.reduce((s, r) => s + r.amount, 0);
              return (
                <section key={date}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-8 px-3 rounded-full bg-white text-rose-800 border border-rose-100 shadow-sm text-xs font-bold inline-flex items-center gap-1.5">
                      <CalendarDays size={13} />
                      {groupDateTitle(date, today)}
                    </div>
                    <div className="h-px flex-1 bg-gradient-to-l from-rose-200/70 via-slate-200 to-transparent" />
                    <div className={`text-[11px] font-semibold whitespace-nowrap ${dayNet < 0 ? "text-rose-600" : "text-slate-500"}`}>
                      {qty(items.length)} · {signedMoney(dayNet)}
                    </div>
                  </div>
                  <div>
                    {items.map((r, i) => {
                      const meta = typeMeta(r.moveType);
                      const Icon = meta.icon;
                      const inflow = r.amount >= 0;
                      const detail = r.invoiceNumber || r.returnNumber || r.reason?.trim() || "بدون ملاحظة";
                      return (
                        <div key={r.id}>
                          {i > 0 ? <LedgerDivider /> : null}
                          <article className="rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-3.5 hover:border-rose-200 hover:shadow-md transition">
                            <div className="flex items-start gap-3">
                              <div className={`h-12 w-12 rounded-2xl grid place-items-center shrink-0 border ${meta.tone}`}>
                                <Icon size={18} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-800">{meta.label}</div>
                                    <div className="text-sm text-slate-500 mt-0.5 leading-6">{detail}</div>
                                  </div>
                                  <div className="text-left shrink-0">
                                    <div
                                      className={`text-base font-black whitespace-nowrap tabular-nums ${
                                        inflow ? "text-emerald-700" : "text-rose-700"
                                      }`}
                                    >
                                      {signedMoney(r.amount)}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                    <CalendarDays size={12} className="text-slate-400" />
                                    {formatClock(r.occurredAt)}
                                  </span>
                                  <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold bg-slate-50 text-slate-600 border-slate-100">
                                    <Receipt size={12} />
                                    {r.sessionUser}
                                    {r.sessionStatus === "open" ? "" : " · وردية مغلقة"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </article>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="px-5 py-3.5 border-t border-slate-100 bg-rose-50/50 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-600">صافي المعروض</div>
            <div className={`text-base font-black tabular-nums ${shownIn + shownOut < 0 ? "text-rose-700" : "text-emerald-700"}`}>
              {signedMoney(shownIn + shownOut)}
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-slate-400 mt-4">
        التقرير التفصيلي للورديات السابقة من{" "}
        <button type="button" className="text-rose-700 font-bold" onClick={() => nav("/shifts")}>
          تاب الورديات
        </button>
      </p>

      <Modal
        open={moveOpen != null}
        title={moveOpen === "out" ? "سحب من الصندوق" : "توريد للصندوق"}
        onClose={() => !saving && setMoveOpen(null)}
      >
        <div className="space-y-4">
          <Field label="المبلغ">
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="!h-11 !rounded-xl !px-3.5 text-lg font-bold"
              autoFocus
            />
            {amountOk ? <p className="text-xs text-slate-500 mt-1.5">سيُسجَّل: {money(piastres)}</p> : null}
          </Field>
          <div className="flex flex-wrap gap-2">
            {QUICK.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAmount(String(n))}
                className="h-8 px-3 rounded-full text-xs font-bold border bg-slate-50 text-slate-600 border-slate-200 hover:border-rose-300 hover:text-rose-800"
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {reasonChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setReason(chip === "أخرى" ? "" : chip)}
                className={`h-8 px-3 rounded-full text-xs font-bold border ${
                  reason === chip ? "bg-rose-700 text-white border-rose-700" : "bg-slate-50 text-slate-600 border-slate-200"
                }`}
              >
                {chip}
              </button>
            ))}
          </div>
          <Field label="السبب">
            <Textarea
              rows={3}
              placeholder={moveOpen === "out" ? "لماذا يُسحب المبلغ؟" : "مصدر المبلغ المورَّد"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          {moveOpen === "out" && open ? (
            <p className="text-xs text-slate-500">المتاح للسحب: {money(open.expectedCash)}</p>
          ) : null}
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => setMoveOpen(null)} disabled={saving}>
              إلغاء
            </Button>
            <Button onClick={() => void saveMove()} disabled={saving || !amountOk || !reason.trim()}>
              {saving ? "جاري الحفظ…" : moveOpen === "out" ? "تأكيد السحب" : "تأكيد التوريد"}
            </Button>
          </div>
        </div>
      </Modal>
    </Page>
  );
}
