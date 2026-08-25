import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Printer, Undo2 } from "lucide-react";
import { cmd, money, qty } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { SearchField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { InvoiceTicket, ReturnComposer } from "@/components/returns/ReturnComposer";
import { SuccessPopup } from "@/components/ui/SuccessPopup";
import { useToasts } from "@/components/ui/Toast";
import { Page, Panel } from "@/components/ui/Page";
import { useSession } from "@/stores/session";

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

function groupDateTitle(iso: string, today: string) {
  if (iso === today) return "اليوم";
  if (iso === daysAgoIso(1)) return "أمس";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" });
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

export function InvoicesPage() {
  const push = useToasts((s) => s.push);
  const { can, shift, askOpenShift } = useSession();
  const canReturn = can("sales.return") || shift?.roleCode === "administrator";

  const [rows, setRows] = useState<SaleRow[]>([]);
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [printing, setPrinting] = useState<number | null>(null);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "return">("view");
  const [sale, setSale] = useState<SaleRow | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [qtyMap, setQtyMap] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const loadGen = useRef(0);

  const today = todayIso();
  const from =
    period === "today" ? today : period === "week" ? daysAgoIso(6) : period === "month" ? `${today.slice(0, 7)}-01` : null;
  const to = period === "all" ? null : today;

  async function load() {
    const gen = ++loadGen.current;
    try {
      const list = await cmd<SaleRow[]>("list_sales", { query: q, from, to });
      if (gen !== loadGen.current) return;
      setRows(list);
    } catch (e) {
      if (gen !== loadGen.current) return;
      push("err", (e as Error).message);
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 180);
    return () => {
      window.clearTimeout(t);
      loadGen.current += 1;
    };
  }, [q, period]);

  const shownTotal = rows.reduce((s, r) => s + (r.status === "voided" ? 0 : r.grandTotal), 0);
  const completed = rows.filter((r) => r.status !== "voided").length;

  const grouped = useMemo(() => {
    const map = new Map<string, SaleRow[]>();
    for (const r of rows) {
      const key = dateKey(r.createdAt) || "—";
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [rows]);

  const periods: { id: Period; label: string }[] = [
    { id: "today", label: "اليوم" },
    { id: "week", label: "آخر 7 أيام" },
    { id: "month", label: "هذا الشهر" },
    { id: "all", label: "الكل" },
  ];

  async function printSale(id: number) {
    if (printing) return;
    setPrinting(id);
    try {
      await cmd("print_sale_receipt", { saleId: id });
      push("ok", "تم إرسال الفاتورة للطابعة");
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setPrinting(null);
    }
  }

  async function openSale(row: SaleRow, next: "view" | "return") {
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
      setOpen(true);
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

  async function saveReturn() {
    if (!sale) return;
    if (!selected.length) {
      push("err", "حدد كمية مرتجع لصنف واحد على الأقل.");
      return;
    }
    setSaving(true);
    try {
      await cmd("pos_return_sale", {
        saleId: sale.id,
        lines: selected.map((l) => ({ saleItemId: l.id, quantity: l.take })),
        reason: reason.trim() || "مرتجع من سجل الفواتير",
        overridePin: null,
      });
      setOpen(false);
      setSaved(true);
      await load();
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page
      title="الفواتير"
      subtitle="كل فواتير البيع — للطباعة أو الإرجاع لاحقاً"
      icon={FileText}
    >
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5 min-h-[96px]">
          <div className="text-sm text-slate-500 mb-2">عدد الفواتير</div>
          <div className="text-lg font-bold text-slate-800">{qty(rows.length)}</div>
        </div>
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5 min-h-[96px]">
          <div className="text-sm text-slate-500 mb-2">المكتملة</div>
          <div className="text-lg font-bold text-slate-800">{qty(completed)}</div>
        </div>
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5 min-h-[96px] col-span-2 xl:col-span-1">
          <div className="text-sm text-slate-500 mb-2">إجمالي المعروض</div>
          <div className="text-lg font-bold text-rose-700">{money(shownTotal)}</div>
        </div>
      </div>

      <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-4 mb-4">
        <SearchField
          placeholder="ابحث برقم الفاتورة أو اسم العميل أو الكاشير"
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
      </div>

      {rows.length === 0 ? (
        <Panel>
          <div className="py-16 px-6 text-center">
            <div className="h-12 w-12 mx-auto mb-3 rounded-2xl bg-rose-50 text-rose-700 grid place-items-center border border-rose-100">
              <FileText size={22} />
            </div>
            <div className="font-bold text-sm text-slate-700">لا توجد فواتير في هذه الفترة</div>
            <p className="text-xs text-slate-400 mt-1">الفواتير المكتملة من نقطة البيع تظهر هنا للطباعة والإرجاع.</p>
          </div>
        </Panel>
      ) : (
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/80 font-bold text-slate-800">سجل الفواتير</div>
          <div className="p-4 bg-gradient-to-b from-slate-50/90 to-white space-y-6">
            {grouped.map(([date, list]) => (
              <section key={date}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-8 px-3 rounded-full bg-white text-rose-800 border border-rose-100 shadow-sm text-xs font-bold">
                    {groupDateTitle(date, today)}
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-l from-rose-200/70 via-slate-200 to-transparent" />
                  <div className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                    {qty(list.length)} · {money(list.filter((r) => r.status !== "voided").reduce((s, r) => s + r.grandTotal, 0))}
                  </div>
                </div>
                <div className="space-y-2.5">
                  {list.map((r) => {
                    const st = statusMeta(r);
                    return (
                      <article
                        key={r.id}
                        className="rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-3.5 hover:border-rose-200 hover:shadow-md transition"
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-right"
                            onClick={() => void openSale(r, "view")}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-bold text-slate-800" dir="ltr">
                                  {r.invoiceNumber}
                                </div>
                                <div className="text-sm text-slate-500 mt-0.5 truncate">
                                  {r.customer?.trim() || "عميل نقدي"} · {r.cashier}
                                </div>
                                <div className="text-xs text-slate-400 mt-0.5">{formatWhen(r.createdAt)}</div>
                              </div>
                              <div className="text-left shrink-0">
                                <div className="text-base font-black text-rose-700 whitespace-nowrap">{money(r.grandTotal)}</div>
                                <div className="text-[11px] text-slate-400 mt-0.5">{qty(r.itemCount)} صنف</div>
                              </div>
                            </div>
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${st.cls}`}>{st.text}</span>
                          <div className="flex-1" />
                          <Button size="sm" variant="secondary" disabled={printing === r.id} onClick={() => void printSale(r.id)}>
                            <Printer size={14} />
                            {printing === r.id ? "…" : "طباعة"}
                          </Button>
                          {canReturnRow(r) ? (
                            <Button size="sm" onClick={() => void openSale(r, "return")}>
                              <Undo2 size={14} />
                              مرتجع
                            </Button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={open}
        title={mode === "return" ? "مرتجع من فاتورة" : sale?.invoiceNumber || "تفاصيل الفاتورة"}
        onClose={() => !saving && setOpen(false)}
        className="max-w-[34rem]"
      >
        {sale ? (
          <div className="space-y-4">
            <InvoiceTicket
              invoiceNumber={sale.invoiceNumber}
              grandTotal={sale.grandTotal}
              statusText={statusMeta(sale).text}
              statusCls={statusMeta(sale).cls}
              customer={sale.customer}
              cashier={sale.cashier}
              when={formatWhen(sale.createdAt)}
              itemCount={sale.itemCount}
              onDismiss={mode === "return" ? () => setMode("view") : undefined}
              dismissLabel="العودة للتفاصيل"
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
                  <Button variant="secondary" className="h-11" disabled={printing === sale.id} onClick={() => void printSale(sale.id)}>
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
                lines={lines}
                qtyMap={qtyMap}
                onQty={(id, value) => setQtyMap((m) => ({ ...m, [id]: value }))}
                reason={reason}
                onReason={setReason}
                refundTotal={refundTotal}
                saving={saving}
                onSubmit={() => void saveReturn()}
              />
            )}
          </div>
        ) : null}
      </Modal>

      <SuccessPopup open={saved} title="تم تسجيل المرتجع" message="أُعيدت الكمية إلى المخزون" onDone={() => setSaved(false)} />
    </Page>
  );
}
