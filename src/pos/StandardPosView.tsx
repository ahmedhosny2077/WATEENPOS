import { memo } from "react";
import { SearchField } from "@/components/ui/Field";
import { SuccessPopup } from "@/components/ui/SuccessPopup";
import { PageHeader } from "@/components/ui/Page";
import { money, qty, type ProductRow } from "@/services/api";
import { looksLikePhone } from "@/pos/helpers";
import { StockLimitPopup } from "@/pos/StockLimitPopup";
import { QUICK_CASH, type Line, type PosSession } from "@/pos/usePos";
import {
  ArrowLeftRight,
  Banknote,
  CreditCard,
  Minus,
  Phone,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  UserRound,
  Warehouse,
  X,
} from "lucide-react";

const compactField =
  "w-full h-8 rounded-lg border border-slate-200 px-2 text-xs font-semibold placeholder:text-slate-400 focus:border-rose-400 outline-none";

const ProductCard = memo(function ProductCard({
  p, moving, canQuickTransfer, allowNegative, add, quickTransfer,
}: {
  p: ProductRow; moving: number | null; canQuickTransfer: boolean;
  allowNegative: boolean; add: (p: ProductRow) => void; quickTransfer: (p: ProductRow) => void;
}) {
  return (
    <div className="px-3.5 py-3 flex items-center gap-3 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-rose-200 hover:shadow-md hover:bg-rose-50/40 transition">
      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-rose-100 to-rose-200 text-rose-800 grid place-items-center font-bold text-sm shrink-0 border border-rose-100">
        {(p.name || "•").slice(0, 1)}
      </div>
      <div className="min-w-[140px] flex-1">
        <div className="font-semibold text-sm text-slate-800 leading-5">{p.name}</div>
        {p.variantName ? <div className="text-[11px] text-slate-400 mt-0.5">{p.variantName}</div> : null}
      </div>
      <span className="hidden xl:inline-flex rounded-full bg-slate-50 border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
        {p.category || "—"}
      </span>
      <span className="hidden md:block w-24 text-left text-[11px] text-slate-400 font-mono" dir="ltr">
        {p.barcode || p.sku || "—"}
      </span>
      <div className="w-24 text-left font-bold text-sm text-[#2563eb] whitespace-nowrap" dir="ltr">
        {money(p.price)}
      </div>
      <span
        className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
          p.storeQty > 0
            ? "bg-amber-100 text-amber-800"
            : p.warehouseQty > 0
              ? "bg-sky-100 text-sky-800"
              : "bg-rose-100 text-rose-700"
        }`}
        title={
          p.storeQty > 0
            ? undefined
            : p.warehouseQty > 0
              ? "موجود في المخزن وليس في محل البيع"
              : undefined
        }
      >
        {p.storeQty > 0 ? (
          `${qty(p.storeQty)} بالمتجر`
        ) : p.warehouseQty > 0 ? (
          <>
            <Warehouse size={12} />
            في المخزن
          </>
        ) : (
          "نافد"
        )}
      </span>
      {p.storeQty <= 0 && p.warehouseQty > 0 && canQuickTransfer ? (
        <button
          type="button"
          disabled={moving === p.variantId}
          onClick={() => void quickTransfer(p)}
          className="shrink-0 h-8 px-3 rounded-lg bg-sky-700 text-white text-xs font-bold hover:bg-sky-800 inline-flex items-center gap-1 disabled:opacity-60"
          title="تحويل قطعة من المخزن إلى المتجر وإضافتها للسلة"
        >
          <ArrowLeftRight size={13} />
          {moving === p.variantId ? "…" : "تحويل سريع"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => add(p)}
          disabled={!allowNegative && p.storeQty <= 0}
          className="shrink-0 h-8 px-3 rounded-lg bg-[#2563eb] text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-40"
        >
          إضافة
        </button>
      )}
    </div>
  );
});

const CartLine = memo(function CartLine({
  l, i, highlighted, allowNegative, sellable, setQty, remove,
}: {
  l: Line; i: number; highlighted: boolean; allowNegative: boolean;
  sellable: (n: number) => number; setQty: (id: number, q: number) => void; remove: (id: number) => void;
}) {
  return (
    <tr
      data-line={l.variantId}
      className={`border-b border-slate-50 ${highlighted ? "bg-rose-50/70" : i % 2 ? "bg-slate-50/50" : "bg-white"}`}
    >
      <td className="px-3 py-2 align-middle">
        <div className="font-bold text-slate-800 leading-4">{l.name}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          {l.variantName ? `${l.variantName} · ` : ""}
          {money(l.price)}
        </div>
      </td>
      <td className="px-1 py-2">
        <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5">
          <button type="button" className="h-7 w-7 rounded-md bg-white" onClick={() => setQty(l.variantId, l.qty - 1)}>
            <Minus size={12} className="mx-auto" />
          </button>
          <input
            className="w-7 text-center bg-transparent text-xs font-black"
            value={l.qty}
            onChange={(e) => setQty(l.variantId, Number(e.target.value) || 1)}
          />
          <button type="button" className="h-7 w-7 rounded-md bg-white" onClick={() => setQty(l.variantId, l.qty + 1)}>
            <Plus size={12} className="mx-auto" />
          </button>
        </div>
        {!allowNegative ? (
          <div className="text-[10px] text-slate-400 mt-0.5 text-center">المتاح {qty(sellable(l.storeQty))}</div>
        ) : null}
      </td>
      <td className="px-3 py-2 text-left align-middle">
        <div className="font-black text-slate-800 leading-4">{money(l.price * l.qty - l.discount)}</div>
        <button type="button" onClick={() => remove(l.variantId)} className="text-slate-300 hover:text-red-500 mt-1">
          <Trash2 size={13} className="ms-auto" />
        </button>
      </td>
    </tr>
  );
});

export function StandardPosView({ pos }: { pos: PosSession }) {
  const {
    searchRef,
    cartListRef,
    lastAddedRef,
    q,
    setQ,
    cat,
    setCat,
    cats,
    cart,
    payId,
    setPayId,
    phone,
    setPhone,
    customerId,
    customerName,
    phoneMiss,
    invoiceDisc,
    setInvoiceDisc,
    paid,
    setPaid,
    busy,
    shift,
    askOpenShift,
    moving,
    stockAlert,
    setStockAlert,
    saleDone,
    setSaleDone,
    canQuickTransfer,
    allowNegative,
    taxEnabled,
    taxInclusive,
    taxBps,
    maxDisc,
    subtotal,
    disc,
    tax,
    grand,
    change,
    visible,
    payOptions,
    focusSearch,
    load,
    onSearchKey,
    add,
    quickTransfer,
    setQty,
    remove,
    clearCart,
    clearCustomer,
    complete,
    hold,
    sellable,
  } = pos;

  return (
    <div className="h-full bg-app flex flex-col min-h-0">
      <div className="px-3 pt-3 pb-3 shrink-0">
        <PageHeader
          title="نقطة البيع"
          subtitle="ابحث عن الصنف ثم أضفه للسلة وأتمّ البيع"
          icon={ShoppingBag}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden" style={{ direction: "ltr", display: "grid", gridTemplateColumns: "328px 1fr" }}>
      <aside dir="rtl" className="bg-white border-l border-slate-200 flex flex-col min-h-0">
        <div className="h-12 px-3 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-xl bg-rose-50 text-rose-700 grid place-items-center">
              <ShoppingCart size={16} />
            </div>
            <div className="min-w-0">
              <div className="font-black text-slate-800 leading-4 text-sm">سلة البيع</div>
              <div className="text-[11px] text-slate-400">
                {cart.length ? `${qty(cart.length)} أصناف` : "أضف من الجدول"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={clearCart}
            className="h-8 px-2.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-40"
            disabled={!cart.length}
          >
            تفريغ
          </button>
        </div>

        <div ref={cartListRef} className="flex-1 min-h-0 overflow-auto">
          {cart.length === 0 ? (
            <div className="h-full grid place-items-center text-center px-5 py-8">
              <div>
                <div className="h-12 w-12 mx-auto mb-2 rounded-2xl bg-rose-50 grid place-items-center">
                  <ShoppingCart size={22} className="text-rose-300" />
                </div>
                <div className="font-bold text-slate-700 text-sm">لا توجد أصناف بعد</div>
                <div className="text-xs text-slate-400 mt-1 leading-5">
                  {shift ? "اضغط «إضافة» بجانب المنتج ليظهر هنا فوراً" : "افتح وردية أولاً ثم أضف الأصناف"}
                </div>
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-slate-500 z-10">
                <tr className="border-b border-slate-100">
                  <th className="text-right font-semibold px-3 py-2">الصنف</th>
                  <th className="text-center font-semibold px-1 py-2 w-[92px]">كمية</th>
                  <th className="text-left font-semibold px-3 py-2 w-[88px]">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((l, i) => (
                  <CartLine
                    key={l.variantId}
                    l={l}
                    i={i}
                    highlighted={lastAddedRef.current === l.variantId}
                    allowNegative={allowNegative}
                    sellable={sellable}
                    setQty={setQty}
                    remove={remove}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white p-2.5 space-y-2">
          <div className="grid grid-cols-3 gap-1 p-0.5 rounded-xl bg-slate-100">
            {payOptions.map((p) => {
              const Icon = p.name === "نقدي" ? Banknote : p.name === "تحويل" ? ArrowLeftRight : CreditCard;
              const short = p.name === "بطاقة بنكية" ? "بطاقة" : p.name;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPayId(p.id)}
                  className={`h-9 rounded-lg text-[11px] font-bold px-1 inline-flex items-center justify-center gap-1 ${
                    payId === p.id ? "bg-white border border-rose-100 text-rose-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Icon size={13} />
                  {short}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.85fr)_minmax(0,0.85fr)] gap-1">
            <div className="relative min-w-0">
              {looksLikePhone(phone) || /^\d/.test(phone.trim()) ? (
                <Phone size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              ) : (
                <UserRound size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              )}
              <input
                className={`${compactField} ${phone ? "pr-11" : "pr-7"} ${customerId ? "border-emerald-300 bg-emerald-50/40" : ""}`}
                inputMode={looksLikePhone(phone) || /^\d/.test(phone.trim()) ? "tel" : "text"}
                dir={looksLikePhone(phone) || /^\d/.test(phone.trim()) ? "ltr" : "rtl"}
                placeholder="اسم أو هاتف"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
              {phone ? (
                <button
                  type="button"
                  className="absolute right-6 top-1/2 -translate-y-1/2 h-5 w-5 rounded grid place-items-center text-slate-400 hover:text-slate-700"
                  onClick={clearCustomer}
                  aria-label="مسح العميل"
                >
                  <X size={11} />
                </button>
              ) : null}
            </div>
            <input
              className={`${compactField} text-left`}
              value={invoiceDisc ? invoiceDisc / 100 : ""}
              placeholder="خصم"
              onChange={(e) => {
                const v = Math.round(Number(e.target.value || 0) * 100);
                setInvoiceDisc(Math.min(Math.max(0, v), maxDisc));
              }}
            />
            <input
              className={`${compactField} text-left`}
              value={paid ? paid / 100 : ""}
              placeholder="المدفوع"
              onChange={(e) => setPaid(Math.round(Number(e.target.value || 0) * 100))}
            />
          </div>
          {customerName ? (
            <div className="text-[10px] font-bold text-emerald-700 truncate leading-4 -mt-1" title={customerName}>
              {customerName}
            </div>
          ) : phoneMiss ? (
            <div className="text-[10px] text-slate-400 truncate leading-4 -mt-1">
              سيُحفظ كعميل جديد عند إتمام البيع
            </div>
          ) : null}

          <div className="grid grid-cols-4 gap-1">
            {QUICK_CASH.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPaid(n * 100)}
                className="h-7 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold text-slate-600 hover:border-rose-300 hover:text-rose-700"
              >
                {n}
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-2 space-y-1">
            <Row k="المجموع" v={money(subtotal)} />
            <Row k="الخصم" v={money(disc)} />
            {taxEnabled && taxBps > 0 ? <Row k={taxInclusive ? "الضريبة (شاملة)" : "الضريبة"} v={money(tax)} /> : null}
            <Row k="الباقي" v={money(change)} />
            <div className="flex justify-between items-end pt-1.5 mt-0.5 border-t border-slate-200">
              <span className="text-xs font-bold text-slate-500">الإجمالي</span>
              <span className="text-lg font-bold text-rose-700 leading-none">{money(grand)}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={!cart.length || busy}
            onClick={() => complete(true)}
            className="w-full h-10 rounded-xl bg-[#059669] text-white text-sm font-black disabled:opacity-40 hover:brightness-110"
          >
            حفظ وطباعة · F10
          </button>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={!cart.length}
              onClick={hold}
              className="h-9 rounded-xl bg-orange-50 text-orange-700 text-xs font-bold disabled:opacity-40 hover:bg-orange-100"
            >
              تعليق · F8
            </button>
            <button
              type="button"
              disabled={!cart.length || busy}
              onClick={() => complete(false)}
              className="h-9 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold disabled:opacity-40 hover:bg-blue-100"
            >
              حفظ · F9
            </button>
          </div>
        </div>
      </aside>

      <section dir="rtl" className="min-w-0 min-h-0 flex flex-col p-3">
        <div className="flex-1 min-h-0 flex flex-col rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="shrink-0 p-3 border-b border-slate-100 space-y-2.5">
            <form
              className="flex gap-2 w-full"
              onSubmit={(e) => {
                e.preventDefault();
                load(q);
                focusSearch();
              }}
            >
              <SearchField
                ref={searchRef}
                autoFocus
                placeholder="اكتب اسم المنتج أو امسح الباركود هنا"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onSearchKey}
                wrapClassName="flex-[1_1_auto] min-w-[24rem]"
                className="!h-12 text-[15px]"
              />
              <button type="submit" className="h-12 px-5 shrink-0 rounded-xl bg-[#2563eb] text-white text-sm font-bold hover:bg-blue-700">
                بحث
              </button>
            </form>

            <div className="flex gap-2 overflow-x-auto pb-0.5">
              <Chip active={cat === null} onClick={() => setCat(null)}>
                الكل
              </Chip>
              {cats.map((c) => (
                <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
                  {c.name}
                </Chip>
              ))}
            </div>
          </div>

          <div className="shrink-0 h-10 px-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="font-bold text-sm text-slate-700">المنتجات</div>
            <div className="text-xs text-slate-400">{qty(visible.length)} نتيجة</div>
          </div>

          {!shift ? (
            <div className="shrink-0 mx-3 mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-xs text-amber-800 font-semibold leading-5">
                لا توجد وردية مفتوحة. يمكنك تصفح المنتجات، وإضافة الأصناف متاحة بعد فتح وردية.
              </span>
              <button
                type="button"
                onClick={askOpenShift}
                className="shrink-0 h-8 px-3 rounded-lg bg-rose-700 text-white text-xs font-bold hover:bg-rose-800"
              >
                فتح الوردية
              </button>
            </div>
          ) : null}

          <div className="flex-1 min-h-0 overflow-auto p-3 bg-app">
            {visible.length === 0 ? (
              <div className="h-full grid place-items-center text-slate-400 text-sm">لا توجد منتجات مطابقة للبحث</div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {visible.map((p) => (
                  <ProductCard
                    key={p.variantId}
                    p={p}
                    moving={moving}
                    canQuickTransfer={canQuickTransfer}
                    allowNegative={allowNegative}
                    add={add}
                    quickTransfer={quickTransfer}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
    <StockLimitPopup
      open={!!stockAlert}
      name={stockAlert?.name || ""}
      available={stockAlert?.available ?? 0}
      onClose={() => {
        setStockAlert(null);
        focusSearch();
      }}
    />
    <SuccessPopup
      open={!!saleDone}
      title="تمت الفاتورة بنجاح"
      detail={saleDone?.invoice}
      message={saleDone?.printHint}
      duration={saleDone?.printHint ? 3200 : 2400}
      onDone={() => setSaleDone(null)}
    />
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-xs text-slate-500">
      <span>{k}</span>
      <span className="font-semibold text-slate-700">{v}</span>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 h-7 rounded-full text-xs whitespace-nowrap border transition ${
        active
          ? "bg-rose-700 text-white border-rose-700 shadow-sm"
          : "bg-slate-50 text-slate-600 border-slate-200 hover:border-rose-300"
      }`}
    >
      {children}
    </button>
  );
}
