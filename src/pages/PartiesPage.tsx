import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Eye,
  FileText,
  Hash,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Sparkles,
  StickyNote,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cmd, money, qty } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Input, SearchField, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { SuccessPopup } from "@/components/ui/SuccessPopup";
import { useToasts } from "@/components/ui/Toast";
import { Page } from "@/components/ui/Page";
import { cn } from "@/utils/cn";

type Party = {
  id: number;
  name: string;
  phone?: string | null;
  extra: number;
  isActive: number;
  notes?: string | null;
  address?: string | null;
  phoneAlt?: string | null;
  taxNumber?: string | null;
  salesCount?: number;
};

type Filter = "all" | "phone" | "nophone";

const emptyForm = { name: "", phone: "", phoneAlt: "", taxNumber: "", address: "", notes: "" };

const fld =
  "!h-12 !rounded-xl !px-3.5 !bg-slate-50 !border-slate-200 hover:!border-rose-200 focus:!bg-white focus:!border-rose-400 focus:!ring-4 focus:!ring-rose-50";

function PartyPage({ kind }: { kind: "customers" | "suppliers" }) {
  const isCustomer = kind === "customers";
  const nav = useNavigate();
  const push = useToasts((s) => s.push);
  const [rows, setRows] = useState<Party[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saved, setSaved] = useState(false);
  const [savedCopy, setSavedCopy] = useState({ title: "", message: "" });

  const noun = isCustomer ? "عميل" : "مورد";
  const nounPlural = isCustomer ? "العملاء" : "الموردون";
  const Icon = isCustomer ? Users : Building2;

  async function load(query = q) {
    try {
      const list = await cmd<Party[]>(isCustomer ? "list_customers" : "list_suppliers", { query });
      setRows(list);
    } catch (e) {
      push("err", (e as Error).message);
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => void load(q), 200);
    return () => window.clearTimeout(t);
  }, [q, kind]);

  const visible = useMemo(() => {
    return rows.filter((r) => {
      const hasPhone = Boolean(r.phone?.trim());
      if (filter === "phone") return hasPhone;
      if (filter === "nophone") return !hasPhone;
      return true;
    });
  }, [rows, filter]);

  const withPhone = rows.filter((r) => r.phone?.trim()).length;
  const extraTotal = rows.reduce((s, r) => s + r.extra, 0);

  const stats = isCustomer
    ? [
        { label: "إجمالي العملاء", value: qty(rows.length), icon: Users, tone: "text-rose-700 bg-rose-50" },
        { label: "لديهم هاتف", value: qty(withPhone), icon: Phone, tone: "text-sky-700 bg-sky-50" },
        { label: "إجمالي النقاط", value: qty(extraTotal), icon: Sparkles, tone: "text-amber-700 bg-amber-50" },
        { label: "المعروض الآن", value: qty(visible.length), icon: Search, tone: "text-slate-700 bg-slate-100" },
      ]
    : [
        { label: "إجمالي الموردين", value: qty(rows.length), icon: Building2, tone: "text-rose-700 bg-rose-50" },
        { label: "لديهم هاتف", value: qty(withPhone), icon: Phone, tone: "text-sky-700 bg-sky-50" },
        { label: "إجمالي الأرصدة", value: money(extraTotal), icon: Wallet, tone: "text-emerald-700 bg-emerald-50" },
        { label: "المعروض الآن", value: qty(visible.length), icon: Search, tone: "text-slate-700 bg-slate-100" },
      ];

  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: "الكل" },
    { id: "phone", label: "لديهم هاتف" },
    { id: "nophone", label: "بدون هاتف" },
  ];

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(row: Party) {
    setEditing(row);
    setForm({
      name: row.name,
      phone: row.phone || "",
      phoneAlt: row.phoneAlt || "",
      taxNumber: row.taxNumber || "",
      address: row.address || "",
      notes: row.notes || "",
    });
    setOpen(true);
  }

  function openDetails(row: Party) {
    nav(`/customers/${row.id}`);
  }

  async function save() {
    const name = form.name.trim();
    if (!name) {
      push("err", `أدخل اسم ال${noun}.`);
      return;
    }
    setBusy(true);
    try {
      if (isCustomer) {
        await cmd("save_customer", {
          id: editing?.id ?? null,
          name,
          mobile: form.phone.trim() || null,
          notes: form.notes.trim() || null,
          address: form.address.trim() || null,
        });
      } else {
        await cmd("save_supplier", {
          id: editing?.id ?? null,
          name,
          phone: form.phone.trim() || null,
          phoneAlt: form.phoneAlt.trim() || null,
          taxNumber: form.taxNumber.trim() || null,
          address: form.address.trim() || null,
          notes: form.notes.trim() || null,
        });
      }
      const added = !editing;
      setSavedCopy({
        title: editing ? "تم التحديث" : isCustomer ? "تم إضافة العميل" : "تم إضافة المورد",
        message: isCustomer
          ? "أصبحت بياناته جاهزة في نقطة البيع."
          : added
            ? "يمكنك اختياره الآن عند استلام المشتريات."
            : "تم حفظ بيانات المورد.",
      });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setSaved(true);
      await load();
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page
      title={nounPlural}
      subtitle={isCustomer ? "سجل العملاء وفواتير كل عميل وبيانات التواصل" : "سجل الموردين وأرصدة الحساب وبيانات التواصل"}
      icon={Icon}
      actions={
        <Button onClick={openNew}>
          <Plus size={16} /> {isCustomer ? "عميل جديد" : "مورد جديد"}
        </Button>
      }
    >
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        {stats.map((s) => {
          const StatIcon = s.icon;
          return (
            <div key={s.label} className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5 min-h-[110px]">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="text-sm text-slate-500">{s.label}</div>
                <div className={`h-9 w-9 rounded-xl grid place-items-center ${s.tone}`}>
                  <StatIcon size={16} />
                </div>
              </div>
              <div className="text-lg font-bold text-slate-800 leading-6">{s.value}</div>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-4 mb-4">
        <SearchField
          placeholder={isCustomer ? "ابحث بالاسم أو رقم الجوال" : "ابحث بالاسم أو الهاتف أو الرقم الضريبي"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex gap-2 overflow-x-auto pt-3">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              className={`h-7 px-3 rounded-full text-xs whitespace-nowrap border ${
                filter === c.id ? "bg-rose-700 text-white border-rose-700" : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm py-16 px-6 text-center">
          <div className="h-14 w-14 mx-auto mb-3 rounded-2xl bg-rose-50 text-rose-400 grid place-items-center">
            <Icon size={24} />
          </div>
          <div className="font-bold text-slate-800">
            {rows.length === 0 ? (isCustomer ? "لا يوجد عملاء بعد" : "لا يوجد موردون بعد") : "لا توجد نتائج مطابقة"}
          </div>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            {rows.length === 0
              ? isCustomer
                ? "أضف عميلاً جديداً، أو اكتبه من نقطة البيع بالاسم أو رقم الهاتف ليُحفظ تلقائياً."
                : "أضف مورداً جديداً للبدء في حفظ البيانات."
              : "جرّب كلمة بحث أخرى أو غيّر التصفية."}
          </p>
          {rows.length === 0 ? (
            <Button onClick={openNew}>
              <Plus size={16} /> {isCustomer ? "عميل جديد" : "مورد جديد"}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((r) => (
            <article
              key={r.id}
              className={cn(
                "group rounded-3xl bg-white border border-slate-100 shadow-sm p-4 hover:border-rose-200 hover:shadow-md transition flex flex-col",
                isCustomer && "cursor-pointer",
              )}
              onClick={isCustomer ? () => openDetails(r) : undefined}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="h-12 w-12 shrink-0 rounded-2xl bg-gradient-to-br from-rose-100 to-rose-200 text-rose-800 grid place-items-center font-bold text-lg">
                  {(r.name || "•").slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-800 leading-6 truncate">{r.name}</div>
                  {r.phone?.trim() ? (
                    <a
                      href={`tel:${r.phone}`}
                      className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-rose-700"
                      dir="ltr"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone size={13} className="text-slate-400" />
                      {r.phone}
                    </a>
                  ) : (
                    <div className="text-sm text-slate-400 mt-0.5">لا يوجد رقم هاتف</div>
                  )}
                  {!isCustomer && r.phoneAlt?.trim() ? (
                    <a
                      href={`tel:${r.phoneAlt}`}
                      className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-700"
                      dir="ltr"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Phone size={12} />
                      {r.phoneAlt}
                    </a>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(r);
                  }}
                  className="h-8 w-8 shrink-0 rounded-xl border border-slate-200 text-slate-400 grid place-items-center hover:border-rose-200 hover:text-rose-700 hover:bg-rose-50"
                  title="تعديل"
                >
                  <Pencil size={14} />
                </button>
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-2">
                {isCustomer ? (
                  <>
                    <span className="h-7 px-2.5 rounded-full bg-amber-50 text-amber-800 text-xs font-bold inline-flex items-center gap-1">
                      <Sparkles size={12} /> {qty(r.extra)} نقطة
                    </span>
                    <span className="h-7 px-2.5 rounded-full bg-rose-50 text-rose-800 text-xs font-bold inline-flex items-center gap-1">
                      <FileText size={12} /> {qty(r.salesCount || 0)} فاتورة
                    </span>
                  </>
                ) : (
                  <span className="h-7 px-2.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold inline-flex items-center gap-1">
                    <Wallet size={12} /> {money(r.extra)}
                  </span>
                )}
                {r.address?.trim() ? (
                  <span className="h-7 px-2.5 rounded-full bg-slate-50 text-slate-600 text-xs font-semibold inline-flex items-center gap-1 max-w-full">
                    <MapPin size={12} className="shrink-0" />
                    <span className="truncate">{r.address}</span>
                  </span>
                ) : null}
                {!isCustomer && r.taxNumber?.trim() ? (
                  <span className="h-7 px-2.5 rounded-full bg-violet-50 text-violet-800 text-xs font-semibold inline-flex items-center gap-1" dir="ltr">
                    <Hash size={12} />
                    {r.taxNumber}
                  </span>
                ) : null}
              </div>
              {r.notes?.trim() ? (
                <p className="text-xs text-slate-500 mt-3 leading-5 line-clamp-2">{r.notes}</p>
              ) : null}
              {isCustomer ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDetails(r);
                  }}
                  className="mt-3 h-10 w-full rounded-xl border border-rose-100 bg-rose-50 text-rose-800 text-sm font-bold hover:bg-rose-100 hover:border-rose-200 inline-flex items-center justify-center gap-2"
                >
                  <Eye size={15} />
                  عرض التفاصيل
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <Modal
        open={open}
        title={editing ? `تعديل ${noun}` : isCustomer ? "عميل جديد" : "مورد جديد"}
        onClose={() => !busy && setOpen(false)}
        className="max-w-[34rem]"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="relative overflow-hidden rounded-[1.6rem] border border-rose-100 bg-gradient-to-bl from-rose-50 via-white to-amber-50/40 px-4 py-4">
            <div className="absolute inset-y-0 right-0 w-1.5 bg-gradient-to-b from-rose-400 via-rose-600 to-rose-800" />
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-rose-100 to-rose-200 text-rose-800 grid place-items-center font-black text-xl border border-rose-100 shadow-sm shrink-0">
                {(form.name.trim() || noun).slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-rose-700/80">
                  {editing ? `تعديل بيانات ال${noun}` : isCustomer ? "بطاقة عميل جديدة" : "بطاقة مورد جديدة"}
                </div>
                <div className="font-black text-slate-800 mt-0.5 truncate">
                  {form.name.trim() || (isCustomer ? "اسم العميل" : "اسم الشركة أو المورد")}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 truncate">
                  {form.phone.trim() || form.address.trim() || (isCustomer ? "بيانات التواصل اختيارية" : "الهاتف والعنوان والرقم الضريبي")}
                </div>
              </div>
            </div>
          </div>

          <section className="rounded-[1.35rem] border border-slate-100 bg-white overflow-hidden">
            <SectionHead icon={isCustomer ? Users : Building2} title="الهوية" hint={isCustomer ? "الاسم الظاهر في الفواتير." : "الاسم الظاهر في المشتريات والمخزون."} />
            <div className="p-3.5 space-y-3">
              <PartyField label={isCustomer ? "اسم العميل" : "اسم المورد / الشركة"} required>
                <Input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={isCustomer ? "مثال: سارة أحمد" : "مثال: شركة النور للتجميل"}
                  className={cn(fld, "!h-12 !text-[15px] !font-semibold")}
                />
              </PartyField>
              {!isCustomer ? (
                <PartyField label="الرقم الضريبي">
                  <IconBox icon={Hash}>
                    <Input
                      dir="ltr"
                      value={form.taxNumber}
                      onChange={(e) => setForm({ ...form, taxNumber: e.target.value })}
                      placeholder="اختياري"
                      className={cn(fld, "!pr-11 !text-left")}
                    />
                  </IconBox>
                </PartyField>
              ) : null}
            </div>
          </section>

          <section className="rounded-[1.35rem] border border-slate-100 bg-white overflow-hidden">
            <SectionHead icon={Phone} title="التواصل" hint="يظهر في البطاقة ويمكن الاتصال منه مباشرة." />
            <div className="p-3.5 grid sm:grid-cols-2 gap-3">
              <PartyField label={isCustomer ? "الجوال" : "هاتف أساسي"} className="sm:col-span-2">
                <IconBox icon={Phone}>
                  <Input
                    dir="ltr"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="05xxxxxxxx"
                    className={cn(fld, "!pr-11 !text-left")}
                  />
                </IconBox>
              </PartyField>
              {!isCustomer ? (
                <PartyField label="هاتف إضافي">
                  <IconBox icon={Phone}>
                    <Input
                      dir="ltr"
                      inputMode="tel"
                      value={form.phoneAlt}
                      onChange={(e) => setForm({ ...form, phoneAlt: e.target.value })}
                      placeholder="اختياري"
                      className={cn(fld, "!pr-11 !text-left")}
                    />
                  </IconBox>
                </PartyField>
              ) : null}
              <PartyField label="العنوان" className={isCustomer ? "sm:col-span-2" : undefined}>
                <IconBox icon={MapPin}>
                  <Input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder={isCustomer ? "اختياري" : "المدينة أو عنوان المستودع"}
                    className={cn(fld, "!pr-11")}
                  />
                </IconBox>
              </PartyField>
            </div>
          </section>

          <section className="rounded-[1.35rem] border border-slate-100 bg-white overflow-hidden">
            <SectionHead icon={StickyNote} title="ملاحظات" hint="شروط التوريد أو أي تنبيه للموظفين." />
            <div className="p-3.5">
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={isCustomer ? "اختياري — تفضيلات العميل" : "اختياري — مواعيد التوريد أو شروط الحساب"}
                className="!rounded-2xl !min-h-[88px] !bg-slate-50 !border-slate-200 focus:!bg-white focus:!border-rose-300"
              />
            </div>
          </section>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" className="flex-1 h-11" disabled={busy} onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" className="flex-1 h-11" disabled={busy}>
              {busy ? "جاري الحفظ…" : editing ? "حفظ التعديل" : isCustomer ? "إضافة العميل" : "إضافة المورد"}
            </Button>
          </div>
        </form>
      </Modal>

      <SuccessPopup
        open={saved}
        title={savedCopy.title}
        message={savedCopy.message}
        onDone={() => setSaved(false)}
      />
    </Page>
  );
}

export const CustomersPage = () => <PartyPage kind="customers" />;
export const SuppliersPage = () => <PartyPage kind="suppliers" />;

function SectionHead({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) {
  return (
    <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-start gap-2.5 bg-slate-50/80">
      <div className="h-8 w-8 rounded-xl bg-rose-50 text-rose-700 grid place-items-center shrink-0 border border-rose-100">
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-slate-800">{title}</div>
        <div className="text-[11px] text-slate-400 leading-4">{hint}</div>
      </div>
    </div>
  );
}

function PartyField({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5 min-w-0", className)}>
      <span className="text-xs font-bold text-slate-600">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function IconBox({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="relative">
      <Icon size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-rose-400 pointer-events-none" />
      {children}
    </div>
  );
}
