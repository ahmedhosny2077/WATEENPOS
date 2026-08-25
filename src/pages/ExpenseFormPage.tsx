import { useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeftRight,
  ArrowRight,
  Banknote,
  Building2,
  Car,
  CreditCard,
  FileText,
  Megaphone,
  MoreHorizontal,
  Package,
  Receipt,
  Users,
  Wallet,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cmd, money } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/Page";
import { useToasts } from "@/components/ui/Toast";
import { SuccessPopup } from "@/components/ui/SuccessPopup";

type Named = { id: number; name: string };
type Pay = { id: number; name: string; isCash: number };

const box = "!h-11 !rounded-xl !px-3.5";
const QUICK = [50, 100, 200, 500, 1000];

const CAT_ICON: Record<string, LucideIcon> = {
  إيجار: Building2,
  كهرباء: Zap,
  رواتب: Users,
  مواصلات: Car,
  صيانة: Wrench,
  تغليف: Package,
  تسويق: Megaphone,
  متنوعة: MoreHorizontal,
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function isoFrom(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayIso() {
  return isoFrom(new Date());
}

function yesterdayIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoFrom(d);
}

function formatDate(iso: string) {
  const [y, m, d] = (iso || "").split("-");
  if (!y || !m || !d) return iso || "—";
  return `${d}/${m}/${y}`;
}

function payIcon(name: string) {
  if (name.includes("بطاقة")) return CreditCard;
  if (name.includes("تحويل")) return ArrowLeftRight;
  return Banknote;
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden ${className || ""}`}>
      <div className="px-4 py-3 border-b border-slate-100 flex items-start gap-3 bg-slate-50/70">
        <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-700 grid place-items-center shrink-0">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-sm text-slate-800">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5 leading-5">{hint}</p>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function ExpenseFormPage() {
  const nav = useNavigate();
  const push = useToasts((s) => s.push);
  const [cats, setCats] = useState<Named[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [form, setForm] = useState({
    categoryId: 0,
    amount: "",
    date: todayIso(),
    paymentMethodId: 0,
    description: "",
  });

  useEffect(() => {
    cmd<Named[]>("list_expense_categories")
      .then((c) => {
        setCats(c);
        if (c[0]) setForm((f) => (f.categoryId ? f : { ...f, categoryId: c[0].id }));
      })
      .catch(() => {});
    cmd<Pay[]>("list_payment_methods")
      .then((p) => {
        setPays(p);
        if (p[0]) setForm((f) => (f.paymentMethodId ? f : { ...f, paymentMethodId: p[0].id }));
      })
      .catch(() => {});
  }, []);

  const piastres = Math.round(Number((form.amount || "0").replace(",", ".")) * 100);
  const amountOk = Number.isFinite(piastres) && piastres > 0;
  const cat = cats.find((c) => c.id === form.categoryId);
  const pay = pays.find((p) => p.id === form.paymentMethodId);
  const today = todayIso();
  const yesterday = yesterdayIso();

  const preview = useMemo(
    () => [
      ["التصنيف", cat?.name || "—"],
      ["التاريخ", formatDate(form.date)],
      ["الدفع", pay?.name || "—"],
      ["المبلغ", amountOk ? money(piastres) : "—"],
    ],
    [cat, form.date, pay, amountOk, piastres],
  );

  async function save() {
    if (!form.categoryId) {
      push("err", "اختر تصنيف المصروف.");
      return;
    }
    if (!amountOk) {
      push("err", "أدخل مبلغاً صالحاً.");
      return;
    }
    setSaving(true);
    try {
      await cmd("save_expense", {
        categoryId: form.categoryId,
        amount: piastres,
        expenseDate: form.date || todayIso(),
        description: form.description.trim() || null,
        paymentMethodId: form.paymentMethodId || null,
      });
      setSavedOpen(true);
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const closeSaved = useCallback(() => {
    setSavedOpen(false);
    nav("/expenses");
  }, [nav]);

  return (
    <div className="h-full bg-app overflow-auto">
      <div className="p-4 lg:p-5 space-y-4">
        <PageHeader
          title="مصروف جديد"
          subtitle="التصنيف والمبلغ والدفع في شاشة واحدة — احفظ من الملخص أو من الأعلى."
          icon={Wallet}
          leading={
            <button
              type="button"
              onClick={() => nav("/expenses")}
              className="h-11 w-11 shrink-0 rounded-xl bg-slate-50 border border-slate-200 hover:bg-white hover:border-rose-200 grid place-items-center"
              aria-label="رجوع"
            >
              <ArrowRight size={16} />
            </button>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => nav("/expenses")} disabled={saving}>
                إلغاء
              </Button>
              <Button type="submit" form="expense-new-form" disabled={saving}>
                {saving ? "جاري الحفظ…" : "حفظ المصروف"}
              </Button>
            </div>
          }
        />

        <form
          id="expense-new-form"
          className="grid lg:grid-cols-12 gap-4 items-start"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="lg:col-span-8 space-y-4 min-w-0">
            <Section icon={Receipt} title="التصنيف" hint="حدد نوع المصروف ليظهر بشكل صحيح في التقارير.">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {cats.map((c) => {
                  const Icon = CAT_ICON[c.name] || MoreHorizontal;
                  const active = form.categoryId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, categoryId: c.id }))}
                      className={`min-h-[72px] rounded-2xl border px-3 py-2.5 text-right transition ${
                        active
                          ? "bg-rose-50 border-rose-300 shadow-sm"
                          : "bg-white border-slate-200 hover:border-rose-200"
                      }`}
                    >
                      <div
                        className={`h-8 w-8 rounded-lg grid place-items-center mb-1.5 ${
                          active ? "bg-rose-700 text-white" : "bg-slate-50 text-slate-500"
                        }`}
                      >
                        <Icon size={15} />
                      </div>
                      <div className={`text-sm font-bold truncate ${active ? "text-rose-800" : "text-slate-800"}`}>
                        {c.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section icon={Wallet} title="المبلغ والتاريخ والدفع" hint="أدخل المبلغ واختر التاريخ وطريقة الدفع.">
              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-ink-muted">المبلغ (ج.م) *</span>
                  <Input
                    autoFocus
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="!h-12 !min-h-12 !rounded-xl !px-4 !text-lg !font-bold"
                  />
                  <div className="flex flex-wrap gap-2 pt-1">
                    {QUICK.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, amount: String(n) }))}
                        className={`h-9 px-3 rounded-xl border text-sm font-semibold ${
                          form.amount === String(n)
                            ? "bg-rose-700 text-white border-rose-700"
                            : "bg-slate-50 border-slate-200 text-slate-700 hover:border-rose-200 hover:bg-rose-50"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  {amountOk ? <p className="text-xs text-slate-500">سيُسجَّل: {money(piastres)}</p> : null}
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-ink-muted">التاريخ</span>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        [today, "اليوم"],
                        [yesterday, "أمس"],
                      ] as const
                    ).map(([iso, label]) => (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, date: iso }))}
                        className={`h-9 px-3 rounded-xl text-sm font-semibold border ${
                          form.date === iso
                            ? "bg-rose-700 text-white border-rose-700"
                            : "bg-slate-50 text-slate-600 border-slate-200"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className={`${box} !min-h-11`}
                  />
                  <p className="text-xs text-slate-500">المحدد: {formatDate(form.date)}</p>
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <span className="text-xs font-semibold text-ink-muted">طريقة الدفع</span>
                  <div className="grid sm:grid-cols-3 gap-2">
                    {pays.map((p) => {
                      const Icon = payIcon(p.name);
                      const active = form.paymentMethodId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, paymentMethodId: p.id }))}
                          className={`h-11 rounded-xl border px-3 inline-flex items-center justify-start gap-2.5 text-sm font-bold transition ${
                            active
                              ? "bg-rose-50 border-rose-300 text-rose-800"
                              : "bg-white border-slate-200 text-slate-600 hover:border-rose-200"
                          }`}
                        >
                          <Icon size={16} />
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Section>

            <Section icon={FileText} title="الوصف" hint="اختياري — مفيد عند مراجعة التقارير لاحقاً.">
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="مثال: فاتورة الكهرباء لشهر أغسطس"
                rows={4}
                className="!min-h-[96px] !h-auto !rounded-xl !px-3.5 !py-2.5"
              />
            </Section>
          </div>

          <aside className="lg:col-span-4 lg:sticky lg:top-4 rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
            <div className="text-xs font-bold text-slate-400 mb-3">ملخص القيد</div>
            <div className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-4 mb-4">
              <div className="text-[11px] font-semibold text-rose-700/80">المبلغ</div>
              <div className="text-2xl font-black text-rose-800 mt-1 leading-none">
                {amountOk ? money(piastres) : "—"}
              </div>
            </div>
            <div className="space-y-2">
              {preview.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                  <span className="text-xs text-slate-500">{k}</span>
                  <span className="text-sm font-bold text-slate-800 truncate">{v}</span>
                </div>
              ))}
              {form.description.trim() ? (
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-500 mb-1">الوصف</div>
                  <div className="text-sm text-slate-700 leading-5">{form.description.trim()}</div>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 mt-4">
              <Button type="submit" disabled={saving} className="w-full h-11">
                {saving ? "جاري الحفظ…" : "حفظ المصروف"}
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => nav("/expenses")} disabled={saving}>
                إلغاء
              </Button>
            </div>
          </aside>
        </form>
        <SuccessPopup
          open={savedOpen}
          title="تم الحفظ"
          message="تم حفظ المصروف بنجاح"
          onDone={closeSaved}
        />
      </div>
    </div>
  );
}
