import { useEffect, useMemo, useState } from "react";
import { Undo2 } from "lucide-react";
import { cmd, money, qty } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Field, SearchField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { InvoicePickCard, InvoiceStub, InvoiceTicket, ReturnComposer } from "@/components/returns/ReturnComposer";
import { SuccessPopup } from "@/components/ui/SuccessPopup";
import { useToasts } from "@/components/ui/Toast";
import { Page, Panel } from "@/components/ui/Page";
import { useSession } from "@/stores/session";

type ReturnRow = {
  id: number;
  returnNumber: string;
  invoiceNumber?: string | null;
  customer?: string | null;
  cashier: string;
  refundTotal: number;
  reason?: string | null;
  createdAt: string;
  itemCount: number;
};

type SaleRow = {
  id: number;
  invoiceNumber: string;
  grandTotal: number;
  status: string;
  createdAt: string;
  cashier: string;
  customer?: string | null;
  itemCount?: number;
  returnedQty?: number;
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

export function ReturnsPage() {
  const push = useToasts((s) => s.push);
  const { can, shift, askOpenShift } = useSession();
  const canReturn = can("sales.return") || shift?.roleCode === "administrator";

  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [invoiceHits, setInvoiceHits] = useState<SaleRow[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [saleQuery, setSaleQuery] = useState("");
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [sale, setSale] = useState<SaleRow | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [qtyMap, setQtyMap] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");

  async function load(query = q) {
    setRows(await cmd<ReturnRow[]>("list_returns", { query }));
  }

  useEffect(() => {
    const needle = q.trim();
    const t = window.setTimeout(() => {
      load(q).catch((e) => push("err", e.message));
      if (!needle) {
        setInvoiceHits([]);
        return;
      }
      cmd<SaleRow[]>("list_sales", { query: needle, from: null, to: null })
        .then((list) => {
          setInvoiceHits(
            list
              .filter((s) => s.status === "completed" && (s.itemCount || 0) > (s.returnedQty || 0))
              .slice(0, 8),
          );
        })
        .catch(() => setInvoiceHits([]));
    }, 220);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const query = saleQuery.trim();
    let cancelled = false;
    const t = window.setTimeout(() => {
      cmd<SaleRow[]>("list_sales", { query, from: null, to: null })
        .then((list) => {
          if (!cancelled) setSales(list.filter((s) => s.status === "completed").slice(0, 12));
        })
        .catch(() => {
          if (!cancelled) setSales([]);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [saleQuery, open]);

  function openNew() {
    if (!shift) {
      askOpenShift();
      return;
    }
    if (!canReturn) {
      push("err", "ليست لديك صلاحية عمل مرتجع.");
      return;
    }
    setSaleQuery("");
    setSales([]);
    setSale(null);
    setItems([]);
    setQtyMap({});
    setReason("");
    setOpen(true);
  }

  async function startReturnFromHit(row: SaleRow) {
    if (!shift) {
      askOpenShift();
      return;
    }
    if (!canReturn) {
      push("err", "ليست لديك صلاحية عمل مرتجع.");
      return;
    }
    setOpen(true);
    await pickSale(row);
  }

  async function pickSale(row: SaleRow) {
    try {
      const detail = await cmd<{ items: SaleItem[] }>("get_sale", { id: row.id });
      setSale(row);
      setItems(detail.items);
      setQtyMap(
        Object.fromEntries(
          detail.items.map((i) => {
            const remain = Math.max(0, i.quantity - (i.returnedQty || 0));
            return [i.id, remain > 0 ? String(remain) : "0"];
          }),
        ),
      );
      setSaleQuery("");
      setSales([]);
    } catch (e) {
      push("err", (e as Error).message);
    }
  }

  const lines = useMemo(
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
  const selected = lines.filter((l) => l.take > 0);
  const refundTotal = selected.reduce((n, l) => n + l.refund, 0);

  async function save() {
    if (!sale) {
      push("err", "ابحث عن الفاتورة ثم اخترها.");
      return;
    }
    if (!selected.length) {
      push("err", "حدد كمية مرتجع لصنف واحد على الأقل.");
      return;
    }
    setSaving(true);
    try {
      await cmd("pos_return_sale", {
        saleId: sale.id,
        lines: selected.map((l) => ({ saleItemId: l.id, quantity: l.take })),
        reason: reason.trim() || "مرتجع من شاشة المرتجعات",
        overridePin: null,
      });
      setOpen(false);
      setSaved(true);
      await load(q);
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page
      title="المرتجعات"
      subtitle="إرجاع أصناف من فواتير مكتملة وإعادتها للمخزون"
      icon={Undo2}
      actions={
        <Button className="h-11 px-4" onClick={openNew}>
          <Undo2 size={16} />
          مرتجع جديد
        </Button>
      }
    >
      <Panel
        title="سجل المرتجعات"
        hint="ابحث برقم الفاتورة أو رقم المرتجع أو اسم العميل."
        actions={
          <SearchField
            placeholder="رقم الفاتورة…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            wrapClassName="w-64 min-w-0"
          />
        }
        padded={false}
      >
        {rows.length === 0 && invoiceHits.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="h-12 w-12 mx-auto mb-3 rounded-2xl bg-rose-50 text-rose-700 grid place-items-center border border-rose-100">
              <Undo2 size={22} />
            </div>
            <div className="font-bold text-sm text-slate-700">
              {q.trim() ? "لا توجد نتائج لهذا الرقم" : "لا توجد مرتجعات بعد"}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {q.trim()
                ? "تأكد من رقم الفاتورة، أو ابحث بالرقم فقط مثل 12 دون الأصفار."
                : "اختر فاتورة مكتملة وأرجع الكمية المطلوبة."}
            </p>
            <Button className="mt-4" onClick={openNew}>
              مرتجع جديد
            </Button>
          </div>
        ) : (
          <div className="p-4 space-y-4 bg-gradient-to-b from-slate-50/90 to-white">
            {invoiceHits.length > 0 ? (
              <section className="space-y-2.5">
                <div className="text-xs font-bold text-slate-500 px-0.5">فواتير مطابقة — اضغط لعمل مرتجع</div>
                {invoiceHits.map((s) => (
                  <InvoicePickCard
                    key={s.id}
                    invoiceNumber={s.invoiceNumber}
                    grandTotal={s.grandTotal}
                    customer={s.customer}
                    cashier={s.cashier}
                    when={formatWhen(s.createdAt)}
                    itemCount={s.itemCount}
                    statusText={(s.returnedQty || 0) > 0 ? "مرتجع جزئي" : "مكتملة"}
                    onClick={() => void startReturnFromHit(s)}
                  />
                ))}
              </section>
            ) : null}
            {rows.length > 0 ? (
              <section className="space-y-2.5">
                {q.trim() && invoiceHits.length > 0 ? (
                  <div className="text-xs font-bold text-slate-500 px-0.5">سجل المرتجعات</div>
                ) : null}
                {rows.map((r) => (
              <article
                key={r.id}
                className="rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-3.5 hover:border-rose-200 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="text-[11px] font-bold text-rose-700/80">إذن مرتجع</div>
                    <div className="font-black text-slate-800" dir="ltr">
                      {r.returnNumber}
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="text-[11px] font-semibold text-slate-400">المبلغ المسترد</div>
                    <div className="font-black text-rose-700">{money(r.refundTotal)}</div>
                  </div>
                </div>
                <InvoiceStub invoiceNumber={r.invoiceNumber} customer={r.customer} />
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="h-7 px-2.5 rounded-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600">
                    {qty(r.itemCount)} صنف
                  </span>
                  <span className="text-xs text-slate-400 truncate">
                    {r.cashier} · {formatWhen(r.createdAt)}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </span>
                </div>
              </article>
                ))}
              </section>
            ) : null}
          </div>
        )}
      </Panel>

      <Modal open={open} title="مرتجع جديد" onClose={() => !saving && setOpen(false)} className="max-w-[38rem]">
        <div className="space-y-5 overflow-x-hidden">
          {!sale ? (
            <Field label="الفاتورة">
              <SearchField
                autoFocus
                tone="soft"
                placeholder="ابحث برقم الفاتورة أو اسم العميل"
                value={saleQuery}
                wrapClassName="w-full min-w-0"
                onChange={(e) => setSaleQuery(e.target.value)}
              />
            </Field>
          ) : null}
          {sales.length > 0 && !sale ? (
            <div className="max-h-56 overflow-auto space-y-2">
              {sales.map((s) => {
                const sold = s.itemCount || 0;
                const back = s.returnedQty || 0;
                const statusText =
                  sold > 0 && back >= sold ? "مرتجعة بالكامل" : back > 0 ? "مرتجع جزئي" : "مكتملة";
                return (
                  <InvoicePickCard
                    key={s.id}
                    invoiceNumber={s.invoiceNumber}
                    grandTotal={s.grandTotal}
                    customer={s.customer}
                    cashier={s.cashier}
                    when={formatWhen(s.createdAt)}
                    itemCount={s.itemCount}
                    statusText={statusText}
                    onClick={() => void pickSale(s)}
                  />
                );
              })}
            </div>
          ) : saleQuery.trim() && !sale ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
              لا توجد فواتير مكتملة مطابقة.
            </div>
          ) : null}

          {sale ? (
            <InvoiceTicket
              invoiceNumber={sale.invoiceNumber}
              grandTotal={sale.grandTotal}
              statusText={
                (sale.itemCount || 0) > 0 && (sale.returnedQty || 0) >= (sale.itemCount || 0)
                  ? "مرتجعة"
                  : (sale.returnedQty || 0) > 0
                    ? "مرتجع جزئي"
                    : "جاهزة للإرجاع"
              }
              statusCls={
                (sale.returnedQty || 0) > 0
                  ? "bg-orange-50 text-orange-800 border-orange-100"
                  : "bg-emerald-50 text-emerald-800 border-emerald-100"
              }
              customer={sale.customer}
              cashier={sale.cashier}
              when={formatWhen(sale.createdAt)}
              itemCount={sale.itemCount}
              onDismiss={() => {
                setSale(null);
                setItems([]);
                setQtyMap({});
              }}
              dismissLabel="تغيير الفاتورة"
            />
          ) : null}

          {lines.length > 0 ? (
            <ReturnComposer
              lines={lines}
              qtyMap={qtyMap}
              onQty={(id, value) => setQtyMap((m) => ({ ...m, [id]: value }))}
              reason={reason}
              onReason={setReason}
              refundTotal={refundTotal}
              saving={saving}
              onSubmit={() => void save()}
            />
          ) : null}

          {sale && lines.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
              لا توجد أصناف قابلة للإرجاع في هذه الفاتورة.
            </div>
          ) : null}
        </div>
      </Modal>

      <SuccessPopup open={saved} title="تم تسجيل المرتجع" message="أُعيدت الكمية إلى المخزون" onDone={() => setSaved(false)} />
    </Page>
  );
}
