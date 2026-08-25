import { useMemo, useState } from "react";
import { Check, Clock3, FileText, Minus, Plus, Search, Undo2, UserRound } from "lucide-react";
import { money, qty } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { cn } from "@/utils/cn";
import { cleanDisplayName, nameInitial } from "@/utils/text";

export type ReturnLineVm = {
  id: number;
  productName: string;
  variantName?: string | null;
  quantity: number;
  unitPrice: number;
  remain: number;
  take: number;
  refund: number;
  returnedQty: number;
};

const REASON_CHIPS = ["عيب في المنتج", "رغبة العميل", "تالف أو منتهي", "خطأ في البيع"];

export function InvoiceTicket({
  invoiceNumber,
  grandTotal,
  statusText,
  statusCls,
  customer,
  cashier,
  when,
  itemCount,
  onDismiss,
  dismissLabel,
}: {
  invoiceNumber: string;
  grandTotal: number;
  statusText: string;
  statusCls: string;
  customer?: string | null;
  cashier?: string | null;
  when?: string;
  itemCount?: number;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  return (
    <article className="rounded-2xl border border-rose-100 bg-rose-50/40 overflow-hidden">
      <div className="px-3.5 py-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-white text-rose-700 grid place-items-center border border-rose-100 shrink-0">
          <FileText size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-rose-700/80">فاتورة بيع</span>
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusCls}`}>
              {statusText}
            </span>
          </div>
          <div className="mt-0.5 font-black text-sm text-slate-800 tracking-wide" dir="ltr">
            {invoiceNumber}
          </div>
        </div>
        {onDismiss ? (
          <button
            type="button"
            className="h-8 px-2.5 rounded-xl text-[11px] font-bold text-rose-700 bg-white border border-rose-100 hover:bg-rose-50 shrink-0"
            onClick={onDismiss}
          >
            {dismissLabel || "تغيير"}
          </button>
        ) : null}
      </div>
      <div className="px-3.5 pb-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        <Meta label="العميل" value={customer?.trim() || "عميل نقدي"} icon={UserRound} />
        <Meta label="الكاشير" value={cashier || "—"} icon={UserRound} />
        {when ? <Meta label="التاريخ" value={when} icon={Clock3} /> : null}
        {itemCount != null ? <Meta label="الأصناف" value={`${qty(itemCount)} صنف`} icon={FileText} /> : null}
      </div>
      <div className="bg-rose-800 px-3.5 py-2 flex items-center justify-between text-white">
        <div className="text-[11px] font-semibold text-rose-100/90">إجمالي الفاتورة</div>
        <div className="text-sm font-black">{money(grandTotal)}</div>
      </div>
    </article>
  );
}

export function InvoicePickCard({
  invoiceNumber,
  grandTotal,
  customer,
  cashier,
  when,
  itemCount,
  statusText,
  onClick,
}: {
  invoiceNumber: string;
  grandTotal: number;
  customer?: string | null;
  cashier?: string | null;
  when?: string;
  itemCount?: number;
  statusText?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-right rounded-2xl border border-rose-100 bg-[#FFFBF8] hover:border-rose-300 hover:shadow-md transition overflow-hidden"
    >
      <div className="px-3 pt-3 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-rose-700/75">فاتورة بيع</span>
            {statusText ? (
              <span className="text-[10px] font-bold text-slate-500">{statusText}</span>
            ) : null}
          </div>
          <div className="font-black text-slate-800 mt-0.5" dir="ltr">
            {invoiceNumber}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate">
            {customer?.trim() || "عميل نقدي"}
            {cashier ? ` · ${cashier}` : ""}
          </div>
          {when ? <div className="text-[11px] text-slate-400 mt-0.5">{when}</div> : null}
        </div>
        <div className="text-left shrink-0">
          <div className="font-black text-rose-800">{money(grandTotal)}</div>
          {itemCount != null ? (
            <div className="text-[11px] text-slate-400 mt-0.5">{qty(itemCount)} صنف</div>
          ) : null}
        </div>
      </div>
      <div className="h-2 bg-[radial-gradient(circle,_#fce7f3_2.5px,_transparent_3px)] bg-[length:10px_8px] bg-bottom bg-repeat-x" />
    </button>
  );
}

export function InvoiceStub({
  invoiceNumber,
  customer,
}: {
  invoiceNumber?: string | null;
  customer?: string | null;
}) {
  if (!invoiceNumber) {
    return <span className="text-sm text-slate-400">بدون فاتورة</span>;
  }
  return (
    <div className="rounded-2xl border border-dashed border-rose-200 bg-[#FFFBF8] px-3 py-2 min-w-0">
      <div className="text-[10px] font-bold text-rose-700/70">فاتورة البيع</div>
      <div className="font-black text-slate-800 truncate" dir="ltr">
        {invoiceNumber}
      </div>
      {customer?.trim() ? (
        <div className="text-[11px] text-slate-500 truncate mt-0.5">{customer}</div>
      ) : null}
    </div>
  );
}

function Meta({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof UserRound;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold text-slate-400 inline-flex items-center gap-1">
        <Icon size={11} className="text-rose-400" />
        {label}
      </div>
      <div className="text-[11px] font-bold text-slate-700 truncate">{value}</div>
    </div>
  );
}

export function ReturnComposer({
  lines,
  qtyMap,
  onQty,
  reason,
  onReason,
  refundTotal,
  saving,
  onSubmit,
}: {
  lines: ReturnLineVm[];
  qtyMap: Record<number, string>;
  onQty: (id: number, value: string) => void;
  reason: string;
  onReason: (value: string) => void;
  refundTotal: number;
  saving: boolean;
  onSubmit: () => void;
}) {
  const [q, setQ] = useState("");
  const selected = lines.filter((l) => l.take > 0);
  const pieces = selected.reduce((n, l) => n + l.take, 0);
  const returnable = lines.filter((l) => l.remain > 0).length;
  const many = lines.length >= 5;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return lines;
    return lines.filter((l) => {
      const name = `${cleanDisplayName(l.productName)} ${cleanDisplayName(l.variantName)}`.toLowerCase();
      return name.includes(needle);
    });
  }, [lines, q]);

  function setTake(line: ReturnLineVm, next: number) {
    const v = Math.max(0, Math.min(line.remain, Math.round(next)));
    onQty(line.id, String(v));
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-3 mb-2 px-0.5">
          <div className="text-sm font-bold text-slate-700">حدد الكمية المراد إرجاعها</div>
          <div className="h-6 px-2 rounded-full bg-slate-50 border border-slate-100 text-[11px] font-semibold text-slate-500">
            {qty(returnable)} من {qty(lines.length)} قابل للإرجاع
          </div>
        </div>
        {many ? (
          <div className="relative mb-2">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث عن صنف داخل الفاتورة"
              className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 pr-9 pl-3 text-sm outline-none focus:bg-white focus:border-rose-300"
            />
          </div>
        ) : null}
        <div className={cn("space-y-1.5", many && "max-h-[min(40vh,320px)] overflow-y-auto pe-1")}>
          {shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
              لا يوجد صنف مطابق داخل الفاتورة.
            </div>
          ) : (
            shown.map((l) => {
              const done = l.remain <= 0;
              const active = l.take > 0;
              const name = cleanDisplayName(l.productName) || l.productName;
              const variant = cleanDisplayName(l.variantName) || l.variantName;
              return (
                <article
                  key={l.id}
                  className={cn(
                    "rounded-2xl border px-3 py-2.5 transition",
                    done && "bg-slate-50 border-slate-100 opacity-70",
                    !done && active && "bg-rose-50/60 border-rose-200",
                    !done && !active && "bg-white border-slate-200 hover:border-rose-200",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        "h-9 w-9 rounded-xl grid place-items-center font-black text-sm shrink-0 border",
                        done
                          ? "bg-slate-100 text-slate-400 border-slate-200"
                          : "bg-rose-50 text-rose-800 border-rose-100",
                      )}
                    >
                      {done ? <Check size={14} /> : nameInitial(name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[13px] text-slate-800 truncate leading-5">{name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {variant ? `${variant} · ` : ""}
                        مباع {qty(l.quantity)}
                        {(l.returnedQty || 0) > 0 ? ` · مرتجع ${qty(l.returnedQty)}` : ""}
                        {" · "}متبقي {qty(l.remain)}
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <div className="text-sm font-black text-rose-800 tabular-nums">
                        {l.take > 0 ? money(l.refund) : money(l.unitPrice)}
                      </div>
                    </div>
                  </div>
                  {!done ? (
                    <div className="mt-2 flex items-center justify-end gap-1.5">
                      <div className="flex items-center rounded-xl bg-white border border-slate-200 overflow-hidden">
                        <button
                          type="button"
                          className="h-8 w-8 grid place-items-center text-slate-500 hover:bg-slate-50 hover:text-rose-700"
                          onClick={() => setTake(l, l.take - 1)}
                          aria-label="إنقاص"
                        >
                          <Minus size={13} />
                        </button>
                        <input
                          inputMode="numeric"
                          className="h-8 w-9 text-center text-sm font-black text-rose-800 bg-transparent outline-none"
                          value={qtyMap[l.id] ?? "0"}
                          onChange={(e) => onQty(l.id, e.target.value)}
                          onBlur={() => setTake(l, Number((qtyMap[l.id] || "0").replace(",", ".")) || 0)}
                        />
                        <button
                          type="button"
                          className="h-8 w-8 grid place-items-center text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => setTake(l, l.take + 1)}
                          aria-label="زيادة"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="h-8 px-2.5 rounded-xl text-[11px] font-bold border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                        onClick={() => setTake(l, l.remain)}
                      >
                        الكل
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-500 mb-1.5">سبب المرتجع</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {REASON_CHIPS.map((chip) => {
            const on = reason === chip;
            return (
              <button
                key={chip}
                type="button"
                onClick={() => onReason(on ? "" : chip)}
                className={cn(
                  "h-8 px-3 rounded-full text-xs font-bold border transition",
                  on
                    ? "bg-rose-700 text-white border-rose-700"
                    : "bg-white text-slate-600 border-slate-200 hover:border-rose-200 hover:text-rose-700",
                )}
              >
                {chip}
              </button>
            );
          })}
        </div>
        <Textarea
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          placeholder="اختياري — مثال: عيب في المنتج أو رغبة العميل"
          className="!rounded-2xl !min-h-[64px] !bg-slate-50 !border-slate-200 focus:!bg-white focus:!border-rose-300"
        />
      </div>

      <div className="rounded-3xl overflow-hidden border border-rose-100">
        <div className="bg-rose-800 px-5 py-4 text-white flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold text-rose-100/90">المبلغ المسترد</div>
            <div className="text-2xl font-black mt-0.5 tracking-tight">
              {refundTotal ? money(refundTotal) : "—"}
            </div>
          </div>
          <div className="text-left text-rose-100 text-xs font-semibold leading-5">
            <div>{qty(selected.length)} صنف</div>
            <div>{qty(pieces)} قطعة</div>
          </div>
        </div>
        <div className="bg-white p-3">
          <Button className="w-full h-12 text-base" disabled={saving || !selected.length} onClick={onSubmit}>
            <Undo2 size={18} />
            {saving ? "جاري التسجيل…" : "تأكيد المرتجع"}
          </Button>
        </div>
      </div>
    </div>
  );
}
