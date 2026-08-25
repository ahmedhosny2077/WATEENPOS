import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cmd, type ProductRow } from "@/services/api";
import { useToasts } from "@/components/ui/Toast";
import { useSession } from "@/stores/session";
import { settingFlag, settingNum, usePrefs } from "@/stores/prefs";
import {
  looksLikeCode,
  looksLikePhone,
  normalizeName,
  phoneDigits,
  phoneLooksComplete,
  saleTax,
} from "@/pos/helpers";

export type Named = { id: number; name: string };
export type Line = {
  variantId: number;
  name: string;
  variantName: string;
  price: number;
  qty: number;
  discount: number;
  storeQty: number;
};
export type Pay = { id: number; name: string; isCash: number };
export type Party = { id: number; name: string; phone?: string | null; isActive?: number };

export const QUICK_CASH = [50, 100, 200, 500];

export function usePos() {
  const push = useToasts((s) => s.push);
  const searchRef = useRef<HTMLInputElement>(null);
  const cartListRef = useRef<HTMLDivElement>(null);
  const lastAddedRef = useRef<number | null>(null);
  const pendingAddRef = useRef<ProductRow | null>(null);
  const skipSearchRef = useRef(false);
  const searchGen = useRef(0);
  const phoneGen = useRef(0);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<number | null>(null);
  const [cats, setCats] = useState<Named[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [cart, setCart] = useState<Line[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [payId, setPayId] = useState<number>(1);
  const [phone, setPhone] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [phoneMiss, setPhoneMiss] = useState(false);
  const [invoiceDisc, setInvoiceDisc] = useState(0);
  const [paid, setPaid] = useState(0);
  const [busy, setBusy] = useState(false);
  const { resumeCart, setResumeCart, shift, askOpenShift, can } = useSession();
  const settings = usePrefs((p) => p.values);
  const autoPrint = settingFlag(settings, "pos.auto_print", true);
  const taxEnabled = settings["tax.enabled"] === "1";
  const taxInclusive = settingFlag(settings, "tax.inclusive", true);
  const taxBps = settingNum(settings, "tax.rate_bps", 0);
  const allowNegative = settingFlag(settings, "inventory.negative_stock", false);
  const [moving, setMoving] = useState<number | null>(null);
  const [stockAlert, setStockAlert] = useState<{ name: string; available: number } | null>(null);
  const [saleDone, setSaleDone] = useState<{ invoice: string; printHint?: string } | null>(null);
  const canQuickTransfer =
    can("transfers.request") ||
    can("stock.adjust") ||
    can("transfers.dispatch") ||
    shift?.roleCode === "administrator";

  function focusSearch() {
    searchRef.current?.focus();
  }

  useEffect(() => {
    cmd<Named[]>("list_categories").then(setCats).catch(() => {});
    cmd<Pay[]>("list_payment_methods").then((p) => {
      setPays(p);
      if (p[0]) setPayId(p[0].id);
    });
    focusSearch();
  }, []);

  useEffect(() => {
    if (!resumeCart) return;
    const resume = resumeCart;
    setCart(resume.lines);
    setInvoiceDisc(resume.invoiceDiscount);
    setResumeCart(null);
    if (resume.customerId) {
      cmd<Party | null>("get_customer", { id: resume.customerId })
        .then((c) => {
          if (!c) {
            setCustomerId(null);
            setCustomerName("");
            setPhone("");
            return;
          }
          setCustomerId(c.id);
          setCustomerName(c.name);
          setPhone(c.phone || c.name);
        })
        .catch(() => {
          setCustomerId(resume.customerId);
        });
    } else {
      setCustomerId(null);
      setCustomerName("");
      setPhone("");
    }
    focusSearch();
  }, [resumeCart, setResumeCart]);

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    if (looksLikeCode(q)) return;
    const gen = ++searchGen.current;
    const t = window.setTimeout(() => {
      void load(q, gen);
    }, 180);
    return () => window.clearTimeout(t);
  }, [q, cat]);

  useEffect(() => {
    const raw = phone.trim();
    const digits = phoneDigits(raw);
    const asPhone = looksLikePhone(raw);
    const name = normalizeName(raw);

    if (!raw) {
      setCustomerId(null);
      setCustomerName("");
      setPhoneMiss(false);
      return;
    }

    if (!asPhone && name.length < 2) {
      setCustomerId(null);
      setCustomerName("");
      setPhoneMiss(false);
      return;
    }

    if (asPhone && digits.length < 6) {
      setCustomerId(null);
      setCustomerName("");
      setPhoneMiss(false);
      return;
    }

    const gen = ++phoneGen.current;
    const complete = asPhone && phoneLooksComplete(digits);
    const t = window.setTimeout(() => {
      const lookup = asPhone
        ? cmd<Party | null>("lookup_customer_phone", { phone: raw })
        : cmd<Party | null>("lookup_customer_name", { name });
      lookup
        .then(async (c) => {
          if (gen !== phoneGen.current) return;
          if (c) {
            setCustomerId(c.id);
            setCustomerName(c.name);
            setPhoneMiss(false);
            return;
          }
          if (complete) {
            try {
              const created = await cmd<Party>("ensure_customer_phone", { phone: raw });
              if (gen !== phoneGen.current) return;
              setCustomerId(created.id);
              setCustomerName(created.name);
              setPhoneMiss(false);
            } catch {
              if (gen !== phoneGen.current) return;
              setCustomerId(null);
              setCustomerName("");
              setPhoneMiss(true);
            }
            return;
          }
          setCustomerId(null);
          setCustomerName("");
          setPhoneMiss(true);
        })
        .catch(() => {
          if (gen !== phoneGen.current) return;
          setCustomerId(null);
          setCustomerName("");
          setPhoneMiss(false);
        });
    }, complete ? 420 : asPhone ? 180 : 320);
    return () => window.clearTimeout(t);
  }, [phone]);

  async function load(query: string, gen?: number) {
    const mine = gen ?? ++searchGen.current;
    try {
      const rows = await cmd<ProductRow[]>("search_products", {
        query,
        categoryId: cat,
        activeOnly: true,
      });
      if (mine !== searchGen.current) return;
      setProducts(rows.filter((r) => r.isActive));
    } catch (e) {
      if (mine !== searchGen.current) return;
      const msg = (e as Error).message;
      if (msg.includes("وردية")) {
        setProducts([]);
        return;
      }
      push("err", msg);
    }
  }

  useEffect(() => {
    if (!shift) {
      setCart([]);
      setPaid(0);
      setInvoiceDisc(0);
    }
  }, [shift]);

  function requireShift() {
    if (shift) return true;
    askOpenShift();
    return false;
  }

  async function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    await submitSearch();
  }

  async function submitSearch() {
    const code = q.trim();
    if (!code) return;
    try {
      const p = await cmd<ProductRow>("lookup_barcode", { code });
      add(p);
      skipSearchRef.current = true;
      setQ("");
      focusSearch();
    } catch {
      void load(code);
      focusSearch();
    }
  }

  function warnStock(name: string, available: number) {
    setStockAlert({ name, available });
  }

  function sellable(n: number) {
    return Math.max(0, Math.round(n) || 0);
  }

  function addToCart(p: ProductRow) {
    const max = sellable(p.storeQty);
    let blocked = false;
    setCart((c) => {
      const i = c.findIndex((x) => x.variantId === p.variantId);
      const current = i >= 0 ? c[i].qty : 0;
      if (!allowNegative && current + 1 > max) {
        blocked = true;
        return c;
      }
      if (i >= 0) {
        const updated = { ...c[i], qty: c[i].qty + 1, storeQty: max };
        return [updated, ...c.filter((_, idx) => idx !== i)];
      }
      return [
        {
          variantId: p.variantId,
          name: p.name,
          variantName: p.variantName,
          price: p.price,
          qty: 1,
          discount: 0,
          storeQty: max,
        },
        ...c,
      ];
    });
    if (blocked) {
      warnStock(p.name, max);
      return;
    }
    lastAddedRef.current = p.variantId;
    focusSearch();
  }

  function add(p: ProductRow) {
    if (!requireShift()) {
      pendingAddRef.current = p;
      return;
    }
    pendingAddRef.current = null;
    addToCart(p);
  }

  async function quickTransfer(p: ProductRow) {
    if (!requireShift()) return;
    if (moving) return;
    setMoving(p.variantId);
    try {
      const r = await cmd<{ storeQty: number; warehouseQty: number }>("quick_transfer_to_store", {
        variantId: p.variantId,
        quantity: 1,
        fromLocationId: null,
        batchId: null,
      });
      const updated = { ...p, storeQty: r.storeQty, warehouseQty: r.warehouseQty };
      setProducts((rows) => rows.map((x) => (x.variantId === p.variantId ? updated : x)));
      addToCart(updated);
      push("ok", "تم التحويل إلى المتجر وإضافة الصنف للسلة");
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setMoving(null);
      focusSearch();
    }
  }

  useEffect(() => {
    if (!shift) return;
    const p = pendingAddRef.current;
    if (!p) return;
    pendingAddRef.current = null;
    addToCart(p);
  }, [shift]);

  useEffect(() => {
    if (!lastAddedRef.current) return;
    cartListRef.current?.scrollTo({ top: 0 });
  }, [cart]);

  function setQty(id: number, qtyVal: number) {
    const line = cart.find((x) => x.variantId === id);
    if (!line) return;
    const next = Math.max(1, Math.round(Number(qtyVal)) || 1);
    const max = sellable(line.storeQty);
    if (!allowNegative && next > max) {
      warnStock(line.name, max);
      if (max >= 1) {
        setCart((c) => c.map((x) => (x.variantId === id ? { ...x, qty: max } : x)));
      }
      return;
    }
    setCart((c) => c.map((x) => (x.variantId === id ? { ...x, qty: next } : x)));
  }

  function remove(id: number) {
    setCart((c) => c.filter((x) => x.variantId !== id));
    focusSearch();
  }

  function clearCart() {
    setCart([]);
    setPaid(0);
    setInvoiceDisc(0);
  }

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty - l.discount, 0);
  const maxDiscBps =
    shift?.roleCode === "administrator"
      ? 10_000
      : shift?.roleCode === "manager"
        ? settingNum(settings, "pos.manager_discount_bps", 2000)
        : settingNum(settings, "pos.cashier_discount_bps", 500);
  const maxDisc = Math.round((subtotal * Math.max(0, maxDiscBps)) / 10_000);
  const disc = Math.min(Math.max(0, invoiceDisc), maxDisc);
  const afterDisc = Math.max(0, subtotal - disc);
  const { tax, grand } = saleTax(afterDisc, taxEnabled, taxInclusive, taxBps);
  const paidAmt = paid > 0 ? paid : grand;
  const change = Math.max(0, paidAmt - grand);

  async function resolveCustomerId() {
    const raw = phone.trim();
    if (!raw) return customerId;
    if (looksLikePhone(raw) || phoneDigits(raw).length >= 8) {
      const digits = phoneDigits(raw);
      if (digits.length < 8) return customerId;
      const c = await cmd<Party>("ensure_customer_phone", { phone: raw });
      setCustomerId(c.id);
      setCustomerName(c.name);
      setPhoneMiss(false);
      return c.id;
    }
    const name = normalizeName(raw);
    if (name.length < 2) return customerId;
    const c = await cmd<Party>("ensure_customer_name", { name });
    setCustomerId(c.id);
    setCustomerName(c.name);
    setPhoneMiss(false);
    return c.id;
  }

  async function complete(doPrint: boolean) {
    if (!requireShift()) return;
    if (!cart.length || busy) return;
    if (paid > 0 && paidAmt < grand) {
      push("err", "المبلغ المدفوع أقل من إجمالي الفاتورة.");
      return;
    }
    if (!allowNegative) {
      const over = cart.find((l) => l.qty > sellable(l.storeQty));
      if (over) {
        warnStock(over.name, sellable(over.storeQty));
        return;
      }
    }
    setBusy(true);
    const sold = cart;
    try {
      const cid = await resolveCustomerId();
      const sale = await cmd<{ id: number; invoiceNumber: string; grandTotal: number }>(
        "pos_complete_sale",
        {
          input: {
            lines: sold.map((l) => ({
              variantId: l.variantId,
              quantity: l.qty,
              unitPrice: l.price,
              discount: l.discount,
              batchId: null,
            })),
            customerId: cid,
            invoiceDiscount: disc,
            payments: [{ paymentMethodId: payId, amount: grand }],
            notes: null,
          },
          overridePin: null,
        },
      );
      setProducts((rows) =>
        rows.map((p) => {
          const line = sold.find((l) => l.variantId === p.variantId);
          return line ? { ...p, storeQty: Math.max(0, p.storeQty - line.qty) } : p;
        }),
      );
      setCart([]);
      setInvoiceDisc(0);
      setPaid(0);
      phoneGen.current += 1;
      setCustomerId(null);
      setCustomerName("");
      setPhone("");
      setPhoneMiss(false);
      focusSearch();
      setSaleDone({ invoice: sale.invoiceNumber });
      if (doPrint || autoPrint) {
        void cmd("print_sale_receipt", { saleId: sale.id }).catch(() => {
          setSaleDone((cur) =>
            cur && cur.invoice === sale.invoiceNumber
              ? {
                  invoice: sale.invoiceNumber,
                  printHint: "يمكنك طباعتها لاحقاً من الفواتير بعد اختيار الطابعة في الإعدادات.",
                }
              : cur,
          );
        });
      }
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function hold() {
    if (!requireShift()) return;
    if (!cart.length || busy) return;
    setBusy(true);
    try {
      const cid = await resolveCustomerId();
      await cmd("hold_invoice", {
        customerId: cid,
        invoiceDiscount: disc,
        items: cart.map((l) => [l.variantId, l.qty, l.price, l.discount]),
      });
      push("ok", "تم تعليق الفاتورة");
      setCart([]);
      setPaid(0);
      setInvoiceDisc(0);
      phoneGen.current += 1;
      setCustomerId(null);
      setCustomerName("");
      setPhone("");
      setPhoneMiss(false);
      focusSearch();
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function clearCustomer() {
    phoneGen.current += 1;
    setPhone("");
    setCustomerId(null);
    setCustomerName("");
    setPhoneMiss(false);
  }

  const visible = useMemo(() => products, [products]);
  const payOptions = useMemo(() => {
    const order = ["نقدي", "بطاقة بنكية", "تحويل"];
    const picked = order
      .map((n) => pays.find((p) => p.name === n))
      .filter((p): p is Pay => !!p);
    return picked.length ? picked : pays.slice(0, 3);
  }, [pays]);

  useEffect(() => {
    if (payOptions.length && !payOptions.some((p) => p.id === payId)) {
      setPayId(payOptions[0].id);
    }
  }, [payOptions, payId]);

  const actionsRef = useRef({ hold, complete, remove, cart, stockAlert });
  actionsRef.current = { hold, complete, remove, cart, stockAlert };

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      const a = actionsRef.current;
      if (e.key === "Escape" && a.stockAlert) {
        e.preventDefault();
        setStockAlert(null);
        focusSearch();
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        focusSearch();
      }
      if (e.key === "F8") {
        e.preventDefault();
        a.hold();
      }
      if (e.key === "F9") {
        e.preventDefault();
        a.complete(false);
      }
      if (e.key === "F10") {
        e.preventDefault();
        a.complete(true);
      }
      if (e.key === "Delete" && a.cart.length) a.remove(a.cart[0].variantId);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return {
    searchRef,
    cartListRef,
    lastAddedRef,
    phoneGen,
    q,
    setQ,
    cat,
    setCat,
    cats,
    products,
    cart,
    pays,
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
  };
}

export type PosSession = ReturnType<typeof usePos>;
