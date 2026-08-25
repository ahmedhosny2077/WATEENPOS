import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  FileText,
  MapPin,
  Pencil,
  Phone,
  Printer,
  Search,
  Sparkles,
  StickyNote,
  Undo2,
  Users,
  Wallet,
} from "lucide-react";
import { cmd, money, qty } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Input, SearchField, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { InvoiceTicket, ReturnComposer } from "@/components/returns/ReturnComposer";
import { PageHeader } from "@/components/ui/Page";
import { SuccessPopup } from "@/components/ui/SuccessPopup";
import { useToasts } from "@/components/ui/Toast";
import { cn } from "@/utils/cn";
import { useSession } from "@/stores/session";

type Party = {
  id: number;
  name: string;
  phone?: string | null;
  extra: number;
  isActive: number;
  notes?: string | null;
  address?: string | null;
  salesCount?: number;
};

type SaleRow = {
  id: number;
  invoiceNumber: string;
  grandTotal: number;
  status: string;
  createdAt: string;
  cashier: string;
  customer?: string | null;
  itemCount: number;
  returnedQty: number;
};

type SaleItem = {
  id: number;
  productName: string;
  variantName?: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  returnedQty: number;
};

type Payment = { method: string; amount: number };

const fld =
  "!h-12 !rounded-xl !px-3.5 !bg-slate-50 !border-slate-200 hover:!border-rose-200 focus:!bg-white focus:!border-rose-400 focus:!ring-4 focus:!ring-rose-50";

function formatWhen(iso: string) {
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso.replace("T", " ");
  return d.toLocaleString("ar-EG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusMeta(row: SaleRow) {
  if (row.status === "voided") {
    return { text: "ملغاة", cls: "bg-rose-50 text-rose-800 border-rose-100" };
  }
  const sold = row.itemCount || 0;
  const back = row.returnedQty || 0;
  if (sold > 0 && back >= sold) {
    return { text: "مرتجعة", cls: "bg-amber-50 text-amber-800 border-amber-100" };
  }
  if (back > 0) {
    return { text: "مرتجع جزئي", cls: "bg-orange-50 text-orange-800 border-orange-100" };
  }
  return { text: "مكتملة", cls: "bg-emerald-50 text-emerald-800 border-emerald-100" };
}

function canReturnRow(row: SaleRow) {
  if (row.status !== "completed") return false;
  return (row.itemCount || 0) > (row.returnedQty || 0);
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const push = useToasts((s) => s.push);
  const { can, shift, askOpenShift } = useSession();
  const canReturn = can("sales.return") || shift?.roleCode === "administrator";
  const customerId = Number(id);

  const [profile, setProfile] = useState<Party | null>(null);
  const [missing, setMissing] = useState(false);
  const [invoices, setInvoices] = useState<SaleRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [q, setQ] = useState("");
  const [sale, setSale] = useState<SaleRow | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [mode, setMode] = useState<"view" | "return">("view");
  const [qtyMap, setQtyMap] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [returnSaving, setReturnSaving] = useState(false);
  const [returnSaved, setReturnSaved] = useState(false);
  const [printing, setPrinting] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "", notes: "" });

  async function load() {
    if (!Number.isFinite(customerId) || customerId <= 0) {
      setMissing(true);
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const row = await cmd<Party | null>("get_customer", { id: customerId });
      if (!row) {
        setMissing(true);
        setProfile(null);
        setInvoices([]);
        return;
      }
      setMissing(false);
      setProfile(row);
      try {
        const list = await cmd<SaleRow[]>("list_sales", {
          query: "",
          from: null,
          to: null,
          customerId,
        });
        setInvoices(list);
      } catch (e) {
        setInvoices([]);
        push("err", (e as Error).message);
      }
    } catch (e) {
      push("err", (e as Error).message);
      setMissing(true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [customerId]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return invoices;
    return invoices.filter(
      (r) =>
        r.invoiceNumber.toLowerCase().includes(needle) ||
        r.cashier.toLowerCase().includes(needle) ||
        formatWhen(r.createdAt).includes(needle),
    );
  }, [invoices, q]);

  const spent = invoices.filter((r) => r.status !== "voided").reduce((s, r) => s + r.grandTotal, 0);
  const activeInvoices = invoices.filter((r) => r.status !== "voided").length;

  function openEdit() {
    if (!profile) return;
    setForm({
      name: profile.name,
      phone: profile.phone || "",
      address: profile.address || "",
      notes: profile.notes || "",
    });
    setEditOpen(true);
  }

  async function save() {
    const name = form.name.trim();
    if (!name) {
      push("err", "أدخل اسم العميل.");
      return;
    }
    setSaving(true);
    try {
      await cmd("save_customer", {
        id: customerId,
        name,
        mobile: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        address: form.address.trim() || null,
      });
      setEditOpen(false);
      setSaved(true);
      await load();
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function openInvoice(row: SaleRow, next: "view" | "return" = "view") {
    if (next === "return") {
      if (!shift) {
        askOpenShift();
        return;
      }
      if (!canReturn) {
        push("err", "ليست لديك صلاحية عمل مرتجع.");
        return;
      }
      if (!canReturnRow(row)) {
        push("err", "لا يمكن إرجاع هذه الفاتورة.");
        return;
      }
    }
    try {
      const detail = await cmd<{ header: SaleRow; items: SaleItem[]; payments: Payment[] }>("get_sale", {
        id: row.id,
      });
      setSale(detail.header);
      setItems(detail.items);
      setPayments(detail.payments);
      setQtyMap(
        Object.fromEntries(
          detail.items.map((i) => {
            const remain = Math.max(0, i.quantity - (i.returnedQty || 0));
            return [i.id, remain > 0 ? String(remain) : "0"];
          }),
        ),
      );
      setReason("");
      setMode(next);
    } catch (e) {
      push("err", (e as Error).message);
    }
  }

  function closeSale() {
    setSale(null);
    setItems([]);
    setPayments([]);
    setMode("view");
    setQtyMap({});
    setReason("");
  }

  const returnLines = useMemo(
    () =>
      items.map((i) => {
        const remain = Math.max(0, i.quantity - (i.returnedQty || 0));
        const n = Math.round(Number((qtyMap[i.id] || "0").replace(",", ".")));
        const take = Number.isFinite(n) ? Math.max(0, Math.min(remain, n)) : 0;
        const refund = i.quantity > 0 ? Math.round((i.lineTotal * take) / i.quantity) : 0;
        return { ...i, remain, take, refund };
      }),
    [items, qtyMap],
  );
  const selectedReturn = returnLines.filter((l) => l.take > 0);
  const refundTotal = selectedReturn.reduce((n, l) => n + l.refund, 0);

  async function saveReturn() {
    if (!sale) return;
    if (!selectedReturn.length) {
      push("err", "حدد كمية مرتجع لصنف واحد على الأقل.");
      return;
    }
    setReturnSaving(true);
    try {
      await cmd("pos_return_sale", {
        saleId: sale.id,
        lines: selectedReturn.map((l) => ({ saleItemId: l.id, quantity: l.take })),
        reason: reason.trim() || "مرتجع من تفاصيل العميل",
        overridePin: null,
      });
      closeSale();
      setReturnSaved(true);
      await load();
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setReturnSaving(false);
    }
  }

  async function printSale(saleId: number) {
    setPrinting(saleId);
    try {
      await cmd("print_sale_receipt", { saleId });
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setPrinting(null);
    }
  }

  if (busy && !profile) {
    return (
      <div className="h-full bg-app grid place-items-center text-sm text-slate-400">جاري تحميل بيانات العميل…</div>
    );
  }

  if (missing || !profile) {
    return (
      <div className="h-full bg-app overflow-auto">
        <div className="p-4 lg:p-5">
          <PageHeader
            title="العميل غير موجود"
            subtitle="قد يكون محذوفاً أو الرقم غير صحيح."
            icon={Users}
            leading={
              <button
                type="button"
                onClick={() => nav("/customers")}
                className="h-11 w-11 shrink-0 rounded-xl bg-white border border-slate-200 text-slate-500 hover:border-rose-200 hover:text-rose-700 hover:bg-rose-50 grid place-items-center"
                aria-label="رجوع"
              >
                <ArrowRight size={16} />
              </button>
            }
          />
        </div>
      </div>
    );
  }

  const stats = [
    { label: "الفواتير", value: qty(activeInvoices || profile.salesCount || 0), icon: FileText, tone: "text-rose-700 bg-rose-50" },
    { label: "إجمالي المشتريات", value: money(spent), icon: Wallet, tone: "text-emerald-700 bg-emerald-50" },
    { label: "نقاط الولاء", value: qty(profile.extra), icon: Sparkles, tone: "text-amber-700 bg-amber-50" },
    { label: "المعروض الآن", value: qty(visible.length), icon: Search, tone: "text-slate-700 bg-slate-100" },
  ];

  return (
    <div className="h-full bg-app overflow-auto">
      <div className="p-4 lg:p-5">
        <PageHeader
          title={profile.name}
          subtitle="بيانات العميل وكل فواتير الشراء المرتبطة به"
          icon={Users}
          className="mb-4"
          leading={
            <button
              type="button"
              onClick={() => nav("/customers")}
              className="h-11 w-11 shrink-0 rounded-xl bg-white border border-slate-200 text-slate-500 hover:border-rose-200 hover:text-rose-700 hover:bg-rose-50 grid place-items-center"
              aria-label="رجوع"
            >
              <ArrowRight size={16} />
            </button>
          }
          actions={
            <Button variant="secondary" onClick={openEdit}>
              <Pencil size={15} />
              تعديل البيانات
            </Button>
          }
        />

        <section className="relative overflow-hidden rounded-3xl border border-rose-100 bg-gradient-to-bl from-rose-50 via-white to-amber-50/40 p-5 mb-4">
          <div className="absolute inset-y-0 right-0 w-1.5 bg-gradient-to-b from-rose-400 via-rose-600 to-rose-800" />
          <div className="flex flex-wrap items-start gap-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-rose-100 to-rose-200 text-rose-800 grid place-items-center font-black text-2xl border border-rose-100 shadow-sm shrink-0">
              {(profile.name || "•").slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-black text-xl text-slate-800 leading-7">{profile.name}</div>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {profile.phone?.trim() ? (
                  <a
                    href={`tel:${profile.phone}`}
                    className="h-8 px-3 rounded-full bg-white border border-slate-200 text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5 hover:border-rose-200 hover:text-rose-700"
                    dir="ltr"
                  >
                    <Phone size={14} className="text-rose-400" />
                    {profile.phone}
                  </a>
                ) : (
                  <span className="h-8 px-3 rounded-full bg-white border border-slate-200 text-sm text-slate-400 inline-flex items-center gap-1.5">
                    <Phone size={14} />
                    لا يوجد رقم هاتف
                  </span>
                )}
                {profile.address?.trim() ? (
                  <span className="h-8 px-3 rounded-full bg-white border border-slate-200 text-sm text-slate-600 inline-flex items-center gap-1.5 max-w-full">
                    <MapPin size={14} className="text-rose-400 shrink-0" />
                    <span className="truncate">{profile.address}</span>
                  </span>
                ) : null}
              </div>
              {profile.notes?.trim() ? (
                <p className="text-sm text-slate-500 mt-3 leading-6 flex items-start gap-2">
                  <StickyNote size={15} className="text-slate-400 mt-0.5 shrink-0" />
                  {profile.notes}
                </p>
              ) : null}
            </div>
          </div>
        </section>

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
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="font-bold text-slate-800">فواتير الشراء</div>
              <div className="text-xs text-slate-400 mt-0.5">كل الفواتير المرتبطة بهذا العميل من نقطة البيع</div>
            </div>
            <span className="h-7 px-2.5 rounded-full bg-rose-50 text-rose-800 text-xs font-bold inline-flex items-center gap-1">
              <FileText size={12} /> {qty(invoices.length)}
            </span>
          </div>
          <SearchField
            placeholder="ابحث برقم الفاتورة أو الكاشير"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            wrapClassName="w-full min-w-0"
          />
        </div>

        {visible.length === 0 ? (
          <div className="rounded-3xl bg-white border border-slate-100 shadow-sm py-16 px-6 text-center">
            <div className="h-14 w-14 mx-auto mb-3 rounded-2xl bg-rose-50 text-rose-400 grid place-items-center">
              <FileText size={24} />
            </div>
            <div className="font-bold text-slate-800">
              {invoices.length === 0 ? "لا توجد فواتير لهذا العميل بعد" : "لا توجد نتائج مطابقة"}
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {invoices.length === 0
                ? "الفواتير المرتبطة برقم هاتفه تظهر هنا تلقائياً بعد إتمام البيع."
                : "جرّب كلمة بحث أخرى."}
            </p>
          </div>
        ) : (
          <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/80 font-bold text-slate-800">سجل الفواتير</div>
            <div className="p-4 bg-gradient-to-b from-slate-50/90 to-white space-y-2.5">
              {visible.map((r) => {
                const st = statusMeta(r);
                return (
                  <article
                    key={r.id}
                    className="rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-3.5 hover:border-rose-200 hover:shadow-md transition"
                  >
                    <button type="button" className="w-full text-right" onClick={() => void openInvoice(r)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800" dir="ltr">
                            {r.invoiceNumber}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {formatWhen(r.createdAt)} · {r.cashier}
                          </div>
                        </div>
                        <div className="text-left shrink-0">
                          <div className="text-base font-black text-rose-700 whitespace-nowrap">{money(r.grandTotal)}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{qty(r.itemCount)} صنف</div>
                        </div>
                      </div>
                    </button>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${st.cls}`}>{st.text}</span>
                      <div className="flex-1" />
                      <Button size="sm" variant="secondary" disabled={printing === r.id} onClick={() => void printSale(r.id)}>
                        <Printer size={14} />
                        {printing === r.id ? "…" : "طباعة"}
                      </Button>
                      {canReturnRow(r) ? (
                        <Button size="sm" onClick={() => void openInvoice(r, "return")}>
                          <Undo2 size={14} />
                          مرتجع
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Modal
        open={Boolean(sale)}
        title={mode === "return" ? "مرتجع من فاتورة" : sale?.invoiceNumber || "تفاصيل الفاتورة"}
        onClose={() => {
          if (!returnSaving) closeSale();
        }}
        className="max-w-[36rem]"
      >
        {sale ? (
          <div className="space-y-4">
            <InvoiceTicket
              invoiceNumber={sale.invoiceNumber}
              grandTotal={sale.grandTotal}
              statusText={statusMeta(sale).text}
              statusCls={statusMeta(sale).cls}
              customer={sale.customer || profile.name}
              cashier={sale.cashier}
              when={formatWhen(sale.createdAt)}
              itemCount={sale.itemCount}
              onDismiss={mode === "return" ? () => setMode("view") : closeSale}
              dismissLabel={mode === "return" ? "العودة للتفاصيل" : "العودة لفواتير العميل"}
            />
            {mode === "view" ? (
              <>
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-slate-500 px-0.5">الأصناف</div>
                  {items.map((l) => (
                    <div
                      key={l.id}
                      className="rounded-[1.35rem] border border-slate-200 bg-white px-3.5 py-3 flex items-center gap-3"
                    >
                      <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-rose-100 to-rose-200 text-rose-800 grid place-items-center font-black shrink-0 border border-rose-100">
                        {(l.productName || "•").slice(0, 1)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm text-slate-800 truncate">{l.productName}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                          {l.variantName ? `${l.variantName} · ` : ""}
                          {qty(l.quantity)} × {money(l.unitPrice)}
                        </div>
                        {(l.returnedQty || 0) > 0 ? (
                          <span className="mt-1 inline-flex h-5 px-1.5 rounded-full bg-amber-50 border border-amber-100 text-[10px] font-bold text-amber-800">
                            مرتجع {qty(l.returnedQty)}
                          </span>
                        ) : null}
                      </div>
                      <div className="font-black text-slate-800 shrink-0">{money(l.lineTotal)}</div>
                    </div>
                  ))}
                </div>
                {payments.length ? (
                  <div className="flex flex-wrap gap-2">
                    {payments.map((p, i) => (
                      <span
                        key={`${p.method}-${i}`}
                        className="rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600"
                      >
                        {p.method} · {money(p.amount)}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    className="h-11"
                    disabled={printing === sale.id}
                    onClick={() => void printSale(sale.id)}
                  >
                    <Printer size={16} />
                    {printing === sale.id ? "جاري الطباعة…" : "طباعة"}
                  </Button>
                  <Button
                    className="h-11"
                    disabled={!canReturnRow(sale)}
                    onClick={() => {
                      if (!shift) {
                        askOpenShift();
                        return;
                      }
                      if (!canReturn) {
                        push("err", "ليست لديك صلاحية عمل مرتجع.");
                        return;
                      }
                      setMode("return");
                    }}
                  >
                    <Undo2 size={16} />
                    مرتجع
                  </Button>
                </div>
              </>
            ) : (
              <ReturnComposer
                lines={returnLines}
                qtyMap={qtyMap}
                onQty={(id, value) => setQtyMap((m) => ({ ...m, [id]: value }))}
                reason={reason}
                onReason={setReason}
                refundTotal={refundTotal}
                saving={returnSaving}
                onSubmit={() => void saveReturn()}
              />
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={editOpen}
        title="تعديل العميل"
        onClose={() => !saving && setEditOpen(false)}
        className="max-w-[34rem]"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-slate-600">
              اسم العميل <span className="text-rose-500">*</span>
            </span>
            <Input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={cn(fld, "!h-12 !text-[15px] !font-semibold")}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-slate-600">الجوال</span>
            <Input
              dir="ltr"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={cn(fld, "!text-left")}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-slate-600">العنوان</span>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={fld} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-slate-600">ملاحظات</span>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="!rounded-2xl !min-h-[88px] !bg-slate-50 !border-slate-200 focus:!bg-white focus:!border-rose-300"
            />
          </label>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" className="flex-1 h-11" disabled={saving} onClick={() => setEditOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" className="flex-1 h-11" disabled={saving}>
              {saving ? "جاري الحفظ…" : "حفظ التعديل"}
            </Button>
          </div>
        </form>
      </Modal>

      <SuccessPopup open={saved} title="تم التحديث" message="تم حفظ بيانات العميل." onDone={() => setSaved(false)} />
      <SuccessPopup
        open={returnSaved}
        title="تم تسجيل المرتجع"
        message="أُعيدت الكمية إلى المخزون"
        onDone={() => setReturnSaved(false)}
      />
    </div>
  );
}
