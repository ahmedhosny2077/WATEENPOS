import { useEffect, useRef, useState } from "react";
import { SearchField } from "@/components/ui/Field";
import { SuccessPopup } from "@/components/ui/SuccessPopup";
import { money, qty } from "@/services/api";
import { looksLikePhone } from "@/pos/helpers";
import { StockLimitPopup } from "@/pos/StockLimitPopup";
import { OnScreenKeyboard, type OskKind, type OskLang } from "@/pos/touch/OnScreenKeyboard";
import { QUICK_CASH, type PosSession } from "@/pos/usePos";
import { usePrefs } from "@/stores/prefs";
import {
  ArrowLeftRight,
  Banknote,
  ChevronDown,
  CreditCard,
  Keyboard,
  Minus,
  Monitor,
  Phone,
  Plus,
  ShoppingCart,
  Trash2,
  UserRound,
  Warehouse,
  X,
} from "lucide-react";

/** Minimum supported touch layouts: 1024×600 landscape and 768×1024 portrait. */
type Target = "search" | "phone" | "disc" | "paid" | { qty: number };

export function TouchPosView({ pos }: { pos: PosSession }) {
  const patch = usePrefs((p) => p.patch);
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
    disc,
    tax,
    grand,
    change,
    visible,
    payOptions,
    focusSearch,
    load,
    onSearchKey,
    submitSearch,
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

  const [oskOpen, setOskOpen] = useState(false);
  const [oskKind, setOskKind] = useState<OskKind>("text");
  const [oskLang, setOskLang] = useState<OskLang>("ar");
  const [target, setTarget] = useState<Target>("search");
  const [moneyText, setMoneyText] = useState("");
  const [payMore, setPayMore] = useState(false);
  const pointerRef = useRef(false);
  const freshRef = useRef(true);

  useEffect(() => {
    function down() {
      pointerRef.current = true;
    }
    function up() {
      window.setTimeout(() => {
        pointerRef.current = false;
      }, 40);
    }
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
    };
  }, []);

  useEffect(() => {
    if (saleDone) setOskOpen(false);
  }, [saleDone]);

  function openOsk(next: Target, kind: OskKind) {
    setTarget(next);
    setOskKind(kind);
    freshRef.current = true;
    if (next === "phone" || next === "disc" || next === "paid") setPayMore(true);
    if (next === "disc") setMoneyText(invoiceDisc ? String(invoiceDisc / 100) : "");
    if (next === "paid") setMoneyText(paid ? String(paid / 100) : "");
    setOskOpen(true);
  }

  function onFieldFocus(next: Target, kind: OskKind) {
    if (pointerRef.current) openOsk(next, kind);
  }

  function applyMoney(raw: string, field: "disc" | "paid") {
    const n = Math.round(Number(raw || 0) * 100);
    if (!Number.isFinite(n)) return;
    if (field === "disc") setInvoiceDisc(Math.min(Math.max(0, n), maxDisc));
    else setPaid(Math.max(0, n));
  }

  function insert(ch: string) {
    if (target === "search") {
      setQ((v) => v + ch);
      return;
    }
    if (target === "phone") {
      setPhone((v) => v + ch);
      return;
    }
    if (typeof target === "object") {
      const line = cart.find((l) => l.variantId === target.qty);
      if (!line) return;
      const base = freshRef.current ? "" : String(line.qty);
      freshRef.current = false;
      const next = (base + ch).replace(/\D/g, "");
      setQty(line.variantId, Number(next) || 1);
      return;
    }
    if (target === "disc" || target === "paid") {
      let next = freshRef.current ? "" : moneyText;
      freshRef.current = false;
      if (ch === "." && next.includes(".")) return;
      if (ch === "00") next += "00";
      else next += ch;
      setMoneyText(next);
      applyMoney(next, target);
    }
  }

  function backspace() {
    if (target === "search") {
      setQ((v) => v.slice(0, -1));
      freshRef.current = false;
      return;
    }
    if (target === "phone") {
      setPhone((v) => v.slice(0, -1));
      freshRef.current = false;
      return;
    }
    if (typeof target === "object") {
      const line = cart.find((l) => l.variantId === target.qty);
      if (!line) return;
      const next = String(line.qty).slice(0, -1);
      setQty(line.variantId, Number(next) || 1);
      freshRef.current = false;
      return;
    }
    if (target === "disc" || target === "paid") {
      const next = moneyText.slice(0, -1);
      setMoneyText(next);
      applyMoney(next, target);
      freshRef.current = false;
    }
  }

  function clearField() {
    if (target === "search") setQ("");
    else if (target === "phone") clearCustomer();
    else if (typeof target === "object") setQty(target.qty, 1);
    else if (target === "disc") {
      setMoneyText("");
      setInvoiceDisc(0);
    } else if (target === "paid") {
      setMoneyText("");
      setPaid(0);
    }
    freshRef.current = true;
  }

  async function enter() {
    if (target === "search") {
      await submitSearch();
      setOskOpen(false);
      focusSearch();
      return;
    }
    if (target === "disc" || target === "paid") applyMoney(moneyText, target);
    setOskOpen(false);
    focusSearch();
  }

  function addProduct(p: Parameters<typeof add>[0], transfer: boolean) {
    setOskOpen(false);
    if (transfer) void quickTransfer(p);
    else add(p);
  }

  const discShown = oskOpen && target === "disc" ? moneyText : invoiceDisc ? String(invoiceDisc / 100) : "";
  const paidShown = oskOpen && target === "paid" ? moneyText : paid ? String(paid / 100) : "";

  return (
    <div className="h-full bg-app flex flex-col min-h-0 touch-manipulation text-[15px]">
      <div className="shrink-0 px-3 pt-2 pb-1 flex items-center justify-between gap-2">
        <div>
          <div className="text-base font-black text-slate-800">نقطة البيع</div>
          <div className="text-xs text-slate-400">وضع شاشة اللمس</div>
        </div>
        <button
          type="button"
          onClick={() => patch("pos.display_mode", "standard", true)}
          className="h-12 px-4 rounded-2xl bg-white border border-slate-200 text-sm font-bold text-slate-700 inline-flex items-center gap-2 hover:border-rose-300"
        >
          <Monitor size={18} />
          وضع الفأرة
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden touch-pos-grid">
        <aside dir="rtl" className="touch-pos-cart bg-white border-l border-slate-200 flex flex-col min-h-0 min-w-0">
          <div className="h-14 px-3 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-11 w-11 rounded-2xl bg-rose-50 text-rose-700 grid place-items-center">
                <ShoppingCart size={20} />
              </div>
              <div className="min-w-0">
                <div className="font-black text-slate-800 leading-5">سلة البيع</div>
                <div className="text-xs text-slate-400">{cart.length ? `${qty(cart.length)} أصناف` : "فارغة"}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={clearCart}
              disabled={!cart.length}
              className="h-12 px-4 rounded-2xl text-sm font-bold text-rose-700 bg-rose-50 disabled:opacity-40"
            >
              تفريغ
            </button>
          </div>

          <div ref={cartListRef} className="flex-1 min-h-0 overflow-auto p-2 space-y-2">
            {cart.length === 0 ? (
              <div className="h-full grid place-items-center text-center px-4 text-slate-400 text-sm">
                {shift ? "اضغط على المنتج لإضافته" : "افتح وردية أولاً"}
              </div>
            ) : (
              cart.map((l) => (
                <div
                  key={l.variantId}
                  className={`rounded-2xl border p-2.5 ${
                    lastAddedRef.current === l.variantId ? "border-rose-300 bg-rose-50/70" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 leading-5">{l.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {l.variantName ? `${l.variantName} · ` : ""}
                        {money(l.price)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(l.variantId)}
                      className="h-12 w-12 rounded-2xl bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-700 grid place-items-center shrink-0"
                      aria-label="حذف الصنف"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1 rounded-2xl bg-slate-100 p-1">
                      <button
                        type="button"
                        className="h-12 w-12 rounded-xl bg-white grid place-items-center"
                        onClick={() => setQty(l.variantId, l.qty - 1)}
                      >
                        <Minus size={18} />
                      </button>
                      <button
                        type="button"
                        className="w-14 h-12 text-lg font-black"
                        onClick={() => openOsk({ qty: l.variantId }, "numeric")}
                      >
                        {l.qty}
                      </button>
                      <button
                        type="button"
                        className="h-12 w-12 rounded-xl bg-white grid place-items-center"
                        onClick={() => setQty(l.variantId, l.qty + 1)}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    <div className="text-left font-black text-slate-800">{money(l.price * l.qty - l.discount)}</div>
                  </div>
                  {!allowNegative ? (
                    <div className="text-[11px] text-slate-400 mt-1">المتاح {qty(sellable(l.storeQty))}</div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white p-3 space-y-2">
            {payMore ? (
              <>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-100">
                  {payOptions.map((p) => {
                    const Icon = p.name === "نقدي" ? Banknote : p.name === "تحويل" ? ArrowLeftRight : CreditCard;
                    const short = p.name === "بطاقة بنكية" ? "بطاقة" : p.name;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPayId(p.id)}
                        className={`h-12 rounded-xl text-sm font-bold px-1 inline-flex items-center justify-center gap-1.5 ${
                          payId === p.id ? "bg-white border border-rose-100 text-rose-700 shadow-sm" : "text-slate-500"
                        }`}
                      >
                        <Icon size={16} />
                        {short}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <div className="relative col-span-3">
                    {looksLikePhone(phone) || /^\d/.test(phone.trim()) ? (
                      <Phone size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    ) : (
                      <UserRound size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    )}
                    <input
                      className={`w-full h-12 rounded-2xl border border-slate-200 px-3 pr-10 text-sm font-semibold outline-none focus:border-rose-400 ${
                        customerId ? "border-emerald-300 bg-emerald-50/40" : ""
                      }`}
                      inputMode="none"
                      autoComplete="off"
                      placeholder="اسم أو هاتف العميل"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onFocus={() => onFieldFocus("phone", "text")}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                    {phone ? (
                      <button
                        type="button"
                        className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl grid place-items-center text-slate-400"
                        onClick={clearCustomer}
                        aria-label="مسح العميل"
                      >
                        <X size={16} />
                      </button>
                    ) : null}
                  </div>
                  <input
                    className="h-12 rounded-2xl border border-slate-200 px-3 text-left text-sm font-bold outline-none focus:border-rose-400"
                    inputMode="none"
                    placeholder="خصم"
                    value={discShown}
                    onChange={(e) => {
                      const v = Math.round(Number(e.target.value || 0) * 100);
                      setInvoiceDisc(Math.min(Math.max(0, v), maxDisc));
                    }}
                    onFocus={() => onFieldFocus("disc", "numeric")}
                  />
                  <input
                    className="h-12 col-span-2 rounded-2xl border border-slate-200 px-3 text-left text-sm font-bold outline-none focus:border-rose-400"
                    inputMode="none"
                    placeholder="المدفوع"
                    value={paidShown}
                    onChange={(e) => setPaid(Math.round(Number(e.target.value || 0) * 100))}
                    onFocus={() => onFieldFocus("paid", "numeric")}
                  />
                </div>
                {customerName ? (
                  <div className="text-xs font-bold text-emerald-700 truncate">{customerName}</div>
                ) : phoneMiss ? (
                  <div className="text-xs text-slate-400">سيُحفظ كعميل جديد عند إتمام البيع</div>
                ) : null}

                <div className="grid grid-cols-4 gap-1.5">
                  {QUICK_CASH.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPaid(n * 100)}
                      className="h-12 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-black text-slate-600"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            <div className="rounded-2xl bg-slate-50 px-3 py-2 flex items-end justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold text-slate-400">الإجمالي</div>
                <div className="text-2xl font-black text-rose-700 leading-none mt-0.5">{money(grand)}</div>
              </div>
              {disc > 0 || change > 0 || (taxEnabled && taxBps > 0) ? (
                <div className="text-[11px] text-slate-500 text-left leading-5">
                  {disc > 0 ? <div>خصم {money(disc)}</div> : null}
                  {taxEnabled && taxBps > 0 ? <div>{taxInclusive ? "شاملة الضريبة" : `ضريبة ${money(tax)}`}</div> : null}
                  {change > 0 ? <div>الباقي {money(change)}</div> : null}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              disabled={!cart.length || busy}
              onClick={() => complete(true)}
              className="w-full h-14 rounded-2xl bg-[#059669] text-white text-lg font-black disabled:opacity-40"
            >
              إتمام البيع والطباعة
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPayMore((v) => !v)}
                className="h-12 rounded-2xl bg-slate-50 text-slate-700 text-sm font-bold inline-flex items-center justify-center gap-1 border border-slate-200"
              >
                <ChevronDown size={16} className={payMore ? "rotate-180" : ""} />
                {payMore ? "إخفاء الدفع" : "خصم ودفع"}
              </button>
              <button
                type="button"
                disabled={!cart.length}
                onClick={hold}
                className="h-12 rounded-2xl bg-orange-50 text-orange-700 text-sm font-bold disabled:opacity-40"
              >
                تعليق
              </button>
            </div>
            {payMore ? (
              <button
                type="button"
                disabled={!cart.length || busy}
                onClick={() => complete(false)}
                className="w-full h-12 rounded-2xl bg-blue-50 text-blue-700 text-sm font-bold disabled:opacity-40"
              >
                حفظ بدون طباعة
              </button>
            ) : null}
          </div>
        </aside>

        <section dir="rtl" className="touch-pos-catalog min-w-0 min-h-0 flex flex-col p-2 sm:p-3">
          <div className="flex-1 min-h-0 flex flex-col rounded-2xl bg-white border border-slate-200 overflow-hidden">
            <div className="shrink-0 p-3 border-b border-slate-100 space-y-2.5">
              <form
                className="flex gap-2 w-full"
                onSubmit={(e) => {
                  e.preventDefault();
                  void load(q);
                  focusSearch();
                }}
              >
                <SearchField
                  ref={searchRef}
                  autoFocus
                  inputMode="none"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="ابحث أو امسح الباركود"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={onSearchKey}
                  onFocus={() => onFieldFocus("search", "text")}
                  wrapClassName="flex-1 min-w-0"
                  className="!h-14 !text-lg !rounded-2xl !pl-[4.75rem]"
                  trailing={
                    <div className="flex items-center gap-0.5">
                      {q ? (
                        <button
                          type="button"
                          className="h-10 w-10 rounded-xl grid place-items-center text-slate-400"
                          onClick={() => {
                            setQ("");
                            focusSearch();
                          }}
                          aria-label="مسح البحث"
                        >
                          <X size={16} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={`h-10 w-10 rounded-xl grid place-items-center ${
                          oskOpen && target === "search" ? "text-rose-700 bg-rose-50" : "text-slate-400"
                        }`}
                        onClick={() => {
                          if (oskOpen && target === "search") {
                            setOskOpen(false);
                            focusSearch();
                          } else {
                            openOsk("search", "text");
                            focusSearch();
                          }
                        }}
                        aria-label="لوحة المفاتيح"
                      >
                        <Keyboard size={16} />
                      </button>
                    </div>
                  }
                />
                <button
                  type="submit"
                  className="h-14 px-6 shrink-0 rounded-2xl bg-[#2563eb] text-white text-base font-bold"
                >
                  بحث
                </button>
              </form>
              <div className="flex gap-2 overflow-x-auto pb-0.5 [mask-image:linear-gradient(to_left,transparent,black_1.25rem)]">
                <CatChip active={cat === null} onClick={() => setCat(null)}>
                  الكل
                </CatChip>
                {cats.map((c) => (
                  <CatChip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
                    {c.name}
                  </CatChip>
                ))}
              </div>
            </div>

            {!shift ? (
              <div className="shrink-0 mx-3 mt-3 rounded-2xl bg-amber-50 border border-amber-200 px-3 py-2.5 flex items-center justify-between gap-2">
                <span className="text-sm text-amber-800 font-semibold">افتح وردية لإضافة الأصناف إلى السلة</span>
                <button
                  type="button"
                  onClick={askOpenShift}
                  className="shrink-0 h-12 px-4 rounded-2xl bg-rose-700 text-white text-sm font-bold"
                >
                  فتح الوردية
                </button>
              </div>
            ) : null}

            <div className="flex-1 min-h-0 overflow-auto p-3 bg-app">
              {visible.length === 0 ? (
                <div className="h-full grid place-items-center text-slate-400">لا توجد منتجات مطابقة</div>
              ) : (
                <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]">
                  {visible.map((p) => {
                    const disabled = !allowNegative && p.storeQty <= 0 && !(p.warehouseQty > 0 && canQuickTransfer);
                    const transfer = p.storeQty <= 0 && p.warehouseQty > 0 && canQuickTransfer;
                    return (
                      <button
                        key={p.variantId}
                        type="button"
                        disabled={disabled || moving === p.variantId}
                        onClick={() => addProduct(p, transfer)}
                        className="min-h-[7rem] text-right rounded-2xl bg-white border border-slate-200 p-3 shadow-sm active:border-rose-400 active:bg-rose-50 disabled:opacity-45"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-rose-100 to-rose-200 text-rose-800 grid place-items-center font-black text-lg shrink-0">
                            {(p.name || "•").slice(0, 1)}
                          </div>
                          <span
                            className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 h-8 text-[11px] font-bold ${
                              p.storeQty > 0
                                ? "bg-amber-100 text-amber-800"
                                : p.warehouseQty > 0
                                  ? "bg-sky-100 text-sky-800"
                                  : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {p.storeQty > 0 ? (
                              `${qty(p.storeQty)}`
                            ) : p.warehouseQty > 0 ? (
                              <>
                                <Warehouse size={12} />
                                مخزن
                              </>
                            ) : (
                              "نافد"
                            )}
                          </span>
                        </div>
                        <div className="mt-2 font-bold text-[15px] text-slate-800 leading-5 line-clamp-2">{p.name}</div>
                        {p.variantName ? <div className="text-xs text-slate-400 mt-0.5 truncate">{p.variantName}</div> : null}
                        <div className="mt-2 flex items-end justify-between gap-2">
                          <div className="font-black text-[#2563eb]" dir="ltr">
                            {money(p.price)}
                          </div>
                          <span className="text-xs font-bold text-slate-500">
                            {transfer ? "تحويل +" : "+ إضافة"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {oskOpen ? (
        <OnScreenKeyboard
          kind={oskKind}
          lang={oskLang}
          allowText={target === "search" || target === "phone"}
          enterLabel={target === "search" ? "بحث" : "تم"}
          onInsert={insert}
          onBackspace={backspace}
          onClear={clearField}
          onEnter={() => void enter()}
          onClose={() => {
            setOskOpen(false);
            focusSearch();
          }}
          onLang={setOskLang}
          onKind={setOskKind}
        />
      ) : null}

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

function CatChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 h-12 min-w-[3rem] rounded-2xl text-sm font-bold whitespace-nowrap border ${
        active ? "bg-rose-700 text-white border-rose-700" : "bg-slate-50 text-slate-600 border-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
