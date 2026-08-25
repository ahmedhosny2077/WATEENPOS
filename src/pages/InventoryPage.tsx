import { useEffect, useMemo, useRef, useState } from "react";
import { cmd, money, qty, type ProductRow } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Field, Input, SearchField, Select } from "@/components/ui/Field";
import { Confirm, Modal } from "@/components/ui/Modal";
import { useToasts } from "@/components/ui/Toast";
import { Page, Panel, Tabs } from "@/components/ui/Page";
import { settingFlag, usePrefs } from "@/stores/prefs";
import { useSession } from "@/stores/session";
import { ArrowLeftRight, Boxes, PackagePlus, Pencil, Plus, Power, Warehouse, X } from "lucide-react";

type Loc = { id: number; name: string; typeName: string; isSystem: number; isActive: number };
type Stock = {
  variantId: number;
  productName: string;
  variantName: string;
  batchId: number;
  batchNumber: string;
  expirationDate?: string | null;
  locationId: number;
  locationName: string;
  quantity: number;
  unitCost: number;
};
type Transfer = { id: number; transferNumber: string; fromName: string; toName: string; status: string; createdAt: string };

function transferStatus(status: string) {
  switch (status) {
    case "received":
      return { text: "تم التحويل", cls: "bg-emerald-50 text-emerald-800 border-emerald-100" };
    case "requested":
    case "approved":
    case "preparing":
    case "dispatched":
      return { text: "بانتظار التنفيذ", cls: "bg-amber-50 text-amber-800 border-amber-100" };
    case "rejected":
      return { text: "مرفوض", cls: "bg-rose-50 text-rose-800 border-rose-100" };
    case "cancelled":
      return { text: "ملغى", cls: "bg-slate-100 text-slate-600 border-slate-200" };
    default:
      return { text: status, cls: "bg-slate-100 text-slate-600 border-slate-200" };
  }
}

const COLS =
  "grid grid-cols-[minmax(0,1.4fr)_4.5rem_auto] md:grid-cols-[minmax(0,1.4fr)_minmax(7rem,0.8fr)_5rem_minmax(5.5rem,auto)_auto] lg:grid-cols-[minmax(0,1.4fr)_minmax(6.5rem,0.5fr)_minmax(8rem,0.7fr)_minmax(7.5rem,0.7fr)_5rem_minmax(6rem,0.55fr)_auto] gap-x-4 gap-y-0 items-center";

function expiryMeta(date?: string | null) {
  if (!date) return { text: "بدون صلاحية", cls: "bg-slate-100 text-slate-500" };
  const d = new Date(date.includes("T") ? date : `${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return { text: date, cls: "bg-slate-100 text-slate-500" };
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  const text = d.toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" });
  if (days < 0) return { text, cls: "bg-rose-100 text-rose-700" };
  if (days <= 90) return { text, cls: "bg-amber-100 text-amber-800" };
  return { text, cls: "bg-emerald-50 text-emerald-700 border border-emerald-100" };
}

function defaultBatch() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `R${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function InventoryPage() {
  const push = useToasts((s) => s.push);
  const vals = usePrefs((p) => p.values);
  const { shift, can } = useSession();
  const [tab, setTab] = useState<"stock" | "transfer" | "wh">("stock");
  const [stock, setStock] = useState<Stock[]>([]);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [loc, setLoc] = useState<number>(0);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [tFrom, setTFrom] = useState(0);
  const [tTo, setTTo] = useState(0);
  const [tVar, setTVar] = useState(0);
  const [tQty, setTQty] = useState("1");
  const [tQuery, setTQuery] = useState("");
  const [tHits, setTHits] = useState<ProductRow[]>([]);
  const [tPicked, setTPicked] = useState<ProductRow | null>(null);
  const [sending, setSending] = useState(false);
  const [askConfirm, setAskConfirm] = useState(false);
  const [pendingCompleteId, setPendingCompleteId] = useState<number | null>(null);
  const [whName, setWhName] = useState("");
  const [whBusy, setWhBusy] = useState(false);
  const [editNames, setEditNames] = useState<Record<number, string>>({});
  const [restock, setRestock] = useState<ProductRow | null>(null);
  const [restocking, setRestocking] = useState(false);
  const [transferring, setTransferring] = useState<string | null>(null);
  const [stockQuery, setStockQuery] = useState("");
  const [restockForm, setRestockForm] = useState({
    locationId: 0,
    qty: "1",
    cost: "0",
    batch: "",
    exp: "",
  });

  const requireLot = settingFlag(vals, "batch.require_lot", true);
  const requireExp = settingFlag(vals, "batch.require_expiry", true);
  const canRestock = can("stock.adjust") || shift?.roleCode === "administrator";
  const canManageWh =
    can("stock.adjust") || can("settings.manage") || shift?.roleCode === "administrator";
  const canQuickTransfer =
    can("transfers.request") ||
    can("stock.adjust") ||
    can("transfers.dispatch") ||
    shift?.roleCode === "administrator";

  function locType(id: number) {
    return locs.find((l) => l.id === id)?.typeName || "";
  }

  async function reload() {
    const L = await cmd<Loc[]>("list_locations");
    setLocs(L);
    setEditNames((prev) => {
      const next = { ...prev };
      for (const loc of L) next[loc.id] = next[loc.id] ?? loc.name;
      return next;
    });
    setStock(await cmd("list_stock", { locationId: null, query: "" }));
    setTransfers(await cmd("list_transfers"));
    const p = await cmd<ProductRow[]>("list_products", {
      query: "",
      categoryId: null,
      page: 0,
    });
    setProducts(p);
  }
  useEffect(() => {
    reload().catch((e) => push("err", e.message));
  }, []);

  const searchMounted = useRef(false);
  useEffect(() => {
    if (!searchMounted.current) { searchMounted.current = true; return; }
    const q = stockQuery.trim();
    const locId = loc || null;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const s = await cmd<Stock[]>("list_stock", { locationId: locId, query: q });
        if (!cancelled) setStock(s);
        const p = await cmd<ProductRow[]>("list_products", { query: q, categoryId: null, page: 0 });
        if (!cancelled) setProducts(p);
      } catch { /* keep last results */ }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [stockQuery, loc]);

  useEffect(() => {
    if (!open) return;
    const q = tQuery.trim();
    if (q.length < 1) {
      setTHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      cmd<ProductRow[]>("search_products", { query: q, categoryId: null })
        .then((rows) => {
          if (!cancelled) setTHits(rows.filter((r) => r.isActive).slice(0, 8));
        })
        .catch(() => {
          if (!cancelled) setTHits([]);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [tQuery, open]);

  function qtyAt(variantId: number, locationId: number) {
    return stock
      .filter((s) => s.variantId === variantId && s.locationId === locationId)
      .reduce((n, s) => n + s.quantity, 0);
  }

  function openTransfer() {
    const wh = locs.find((l) => l.typeName === "warehouse" && l.isActive) || locs.find((l) => l.typeName === "warehouse");
    const store = locs.find((l) => l.typeName === "store");
    setTFrom(wh?.id || 0);
    setTTo(store?.id || 0);
    setTVar(0);
    setTQty("1");
    setTQuery("");
    setTHits([]);
    setTPicked(null);
    setOpen(true);
  }

  function pickTransferProduct(p: ProductRow) {
    setTPicked(p);
    setTVar(p.variantId);
    setTQuery("");
    setTHits([]);
  }

  async function pickByBarcode() {
    const code = tQuery.trim();
    if (!code) return;
    try {
      const p = await cmd<ProductRow>("lookup_barcode", { code });
      pickTransferProduct(p);
      return;
    } catch {
      /* بحث بالاسم */
    }
    try {
      const rows = await cmd<ProductRow[]>("search_products", { query: code, categoryId: null });
      const hit = rows.find((r) => r.isActive);
      if (hit) pickTransferProduct(hit);
      else push("err", "لم يُعثر على صنف بهذا الاسم أو الباركود.");
    } catch (e) {
      push("err", (e as Error).message);
    }
  }

  function transferQuantity() {
    return Math.round(Number(tQty || "0"));
  }

  function validateTransfer() {
    if (!tFrom || !tTo) {
      push("err", "اختر موقع المصدر والوجهة.");
      return false;
    }
    if (tFrom === tTo) {
      push("err", "موقع المصدر والوجهة يجب أن يختلفا.");
      return false;
    }
    if (!tVar) {
      push("err", "ابحث عن الصنف ثم اختره من النتائج.");
      return false;
    }
    const quantity = transferQuantity();
    if (!Number.isFinite(quantity) || quantity <= 0) {
      push("err", "أدخل كمية صالحة.");
      return false;
    }
    return true;
  }

  function requestSendTransfer() {
    if (!validateTransfer()) return;
    setAskConfirm(true);
  }

  async function sendTransfer() {
    if (!validateTransfer()) {
      setAskConfirm(false);
      return;
    }
    const quantity = transferQuantity();
    setAskConfirm(false);
    setSending(true);
    try {
      await cmd("create_transfer_cmd", {
        fromLocationId: tFrom,
        toLocationId: tTo,
        items: [{ variantId: tVar, quantity, batchId: null }],
        notes: null,
      });
      push("ok", "تم التحويل");
      setOpen(false);
      await reload();
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function completePendingTransfer() {
    if (pendingCompleteId == null) return;
    const id = pendingCompleteId;
    setPendingCompleteId(null);
    try {
      await cmd("complete_transfer_cmd", { transferId: id });
      push("ok", "تم التحويل");
      await reload();
    } catch (e) {
      push("err", (e as Error).message);
    }
  }

  const visibleStock = useMemo(() => stock, [stock]);

  const emptyProducts = useMemo(() => {
    const active = products.filter((p) => p.isActive);
    const stocked = new Set(stock.map((s) => s.variantId));
    return active.filter((p) => !stocked.has(p.variantId) && p.storeQty + p.warehouseQty <= 0);
  }, [products, stock]);

  function openRestock(p: ProductRow) {
    const warehouses = locs.filter((l) => l.typeName === "warehouse");
    const preferred =
      (loc && locs.find((l) => l.id === loc)) ||
      warehouses[0] ||
      locs.find((l) => l.typeName === "store") ||
      locs[0];
    setRestockForm({
      locationId: preferred?.id || 0,
      qty: "1",
      cost: "0",
      batch: defaultBatch(),
      exp: "",
    });
    setRestock(p);
  }

  async function confirmRestock() {
    if (!restock) return;
    const quantity = Math.round(Number(restockForm.qty || "0"));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      push("err", "أدخل كمية صالحة أكبر من صفر.");
      return;
    }
    if (!restockForm.locationId) {
      push("err", "اختر موقع التزويد.");
      return;
    }
    if (requireLot && !restockForm.batch.trim()) {
      push("err", "رقم الدفعة مطلوب.");
      return;
    }
    if (requireExp && !restockForm.exp) {
      push("err", "تاريخ الصلاحية مطلوب.");
      return;
    }
    setRestocking(true);
    try {
      await cmd("opening_balance", {
        variantId: restock.variantId,
        locationId: restockForm.locationId,
        quantity,
        unitCost: Math.round(Number(restockForm.cost || "0") * 100),
        batchNumber: restockForm.batch.trim() || defaultBatch(),
        expirationDate: restockForm.exp || null,
      });
      push("ok", `تم تزويد ${restock.name} بكمية ${qty(quantity)}`);
      setRestock(null);
      await reload();
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setRestocking(false);
    }
  }

  const warehouses = locs.filter((l) => l.typeName === "warehouse");
  const activeWarehouses = warehouses.filter((l) => l.isActive);

  async function saveWarehouse(id: number | null, name: string, isActive: boolean, okMsg: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      push("err", "اسم المخزن مطلوب.");
      return;
    }
    setWhBusy(true);
    try {
      await cmd("save_warehouse", { id, name: trimmed, isActive });
      push("ok", okMsg);
      if (id == null) setWhName("");
      await reload();
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setWhBusy(false);
    }
  }

  async function quickToStore(variantId: number, fromLocationId?: number, batchId?: number, key?: string) {
    const lock = key || String(variantId);
    if (transferring) return;
    setTransferring(lock);
    try {
      await cmd("quick_transfer_to_store", {
        variantId,
        quantity: 1,
        fromLocationId: fromLocationId ?? null,
        batchId: batchId ?? null,
      });
      push("ok", "تم تحويل قطعة إلى المتجر — أصبحت متاحة في نقطة البيع");
      await reload();
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setTransferring(null);
    }
  }

  return (
    <Page title="المخزون" subtitle="الأرصدة والتحويلات بين المتجر والمخزن" icon={Warehouse}>
      <Tabs
        value={tab}
        onChange={(id) => setTab(id as typeof tab)}
        items={[
          {
            id: "stock",
            label: "الأرصدة",
            hint: "كميات الأصناف في المتجر والمخزن",
            icon: Boxes,
            count: visibleStock.filter((s) => s.quantity > 0).length,
          },
          {
            id: "transfer",
            label: "التحويلات",
            hint: "طلبات النقل بين المواقع",
            icon: ArrowLeftRight,
            count: transfers.length,
          },
          {
            id: "wh",
            label: "المخازن",
            hint: "مواقع التخزين وإدارتها",
            icon: Warehouse,
            count: warehouses.length,
          },
        ]}
      />
      {tab === "stock" && (
        <Panel
          title="أرصدة الأصناف"
          hint="الأصناف بدون رصيد تظهر أولاً مع زر تزويد لإضافة الكمية مباشرة."
          actions={null}
          padded={false}
        >
          <div className="px-4 py-3 border-b border-slate-100 bg-white space-y-3">
            <SearchField
              placeholder="ابحث بالاسم أو الباركود"
              value={stockQuery}
              onChange={(e) => setStockQuery(e.target.value)}
              tone="soft"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Select value={loc} onChange={(e) => setLoc(Number(e.target.value))} className="w-44 h-9 py-0 text-sm">
                <option value={0}>كل المواقع</option>
                {locs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
              <div className="flex items-center gap-2 ms-auto">
                {emptyProducts.length > 0 && (
                  <div className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-rose-50 border border-rose-200">
                    <div className="h-2 w-2 rounded-full bg-rose-500" />
                    <span className="text-xs font-bold text-rose-800">{qty(emptyProducts.length)}</span>
                    <span className="text-[11px] text-rose-600">نافد</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-bold text-emerald-800">{qty(visibleStock.length)}</span>
                  <span className="text-[11px] text-emerald-600">متوفر</span>
                </div>
              </div>
            </div>
          </div>
          {visibleStock.length === 0 && emptyProducts.length === 0 ? (
            <div className="py-16 px-6 text-center">
              <div className="h-12 w-12 mx-auto mb-3 rounded-2xl bg-slate-50 text-slate-400 grid place-items-center">
                <Warehouse size={22} />
              </div>
              <div className="font-bold text-sm text-slate-700">لا توجد أصناف</div>
              <p className="text-xs text-slate-400 mt-1">أضف منتجات أولاً ثم زوّد كمياتها من هنا.</p>
            </div>
          ) : (
            <div className="overflow-auto p-3">
              <div className={`${COLS} px-4 py-2.5 mb-2 rounded-xl bg-slate-100/80 border border-slate-200/60 text-[11px] font-bold text-slate-500 uppercase tracking-wide`}>
                <div>الصنف</div>
                <div className="hidden lg:block">دفعة</div>
                <div className="hidden lg:block">صلاحية</div>
                <div className="hidden md:block">الموقع</div>
                <div>كمية</div>
                <div className="hidden md:block">تكلفة</div>
                <div className="text-left">إجراء</div>
              </div>
              <div className="flex flex-col gap-2.5">
                {emptyProducts.map((p) => (
                  <article
                    key={`empty-${p.variantId}`}
                    className={`${COLS} rounded-2xl bg-white border border-rose-200 shadow-sm px-4 py-3`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-700 grid place-items-center font-black shrink-0 border border-rose-100">
                        {(p.name || "•").slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 leading-5 truncate">{p.name}</div>
                        <div className="text-xs text-rose-600 mt-0.5 truncate">
                          {p.variantName ? `${p.variantName} · ` : ""}بدون رصيد
                        </div>
                      </div>
                    </div>
                    <div className="hidden lg:block text-xs text-slate-400">—</div>
                    <div className="hidden lg:block text-xs text-slate-400">—</div>
                    <div className="hidden md:block text-xs text-slate-400">—</div>
                    <div>
                      <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-bold bg-rose-100 text-rose-700">نافد</span>
                    </div>
                    <div className="hidden md:block text-xs text-slate-400">—</div>
                    <div className="justify-self-end">
                      {canRestock ? (
                        <Button size="sm" onClick={() => openRestock(p)}>
                          <PackagePlus size={14} />
                          تزويد
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">نافد</span>
                      )}
                    </div>
                  </article>
                ))}
                {visibleStock.map((s) => {
                  const exp = expiryMeta(s.expirationDate);
                  const empty = s.quantity <= 0;
                  const product = products.find((p) => p.variantId === s.variantId);
                  const warehouse = locType(s.locationId) === "warehouse";
                  const rowKey = `${s.batchId}-${s.locationId}`;
                  return (
                    <article
                      key={rowKey}
                      className={`${COLS} rounded-2xl bg-white border shadow-sm px-4 py-3 hover:shadow-md transition ${
                        empty ? "border-rose-200" : warehouse ? "border-sky-200 hover:border-sky-300 hover:bg-sky-50/40" : "border-slate-200 hover:border-rose-200 hover:bg-rose-50/30"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`h-12 w-12 rounded-2xl grid place-items-center font-black shrink-0 border ${
                            warehouse
                              ? "bg-sky-50 text-sky-800 border-sky-100"
                              : "bg-gradient-to-br from-rose-100 to-rose-200 text-rose-800 border-rose-100"
                          }`}
                          title={warehouse ? "متوفر في المخزن وليس في المتجر" : undefined}
                        >
                          {warehouse ? <Warehouse size={20} /> : (s.productName || "•").slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800 leading-5 truncate">{s.productName}</div>
                          <div className="text-xs text-slate-400 mt-0.5 truncate">{s.variantName || "بدون درجة"}</div>
                        </div>
                      </div>
                      <div className="hidden lg:block min-w-0">
                        <span className="font-mono text-xs text-slate-500" dir="ltr">
                          {s.batchNumber || "—"}
                        </span>
                      </div>
                      <div className="hidden lg:block">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${exp.cls}`}>{exp.text}</span>
                      </div>
                      <div className="hidden md:block min-w-0">
                        <span
                          className={`inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-1 text-xs ${
                            warehouse ? "bg-sky-50 border border-sky-100 text-sky-800" : "bg-slate-50 border border-slate-200 text-slate-600"
                          }`}
                        >
                          {warehouse ? <Warehouse size={12} /> : null}
                          {s.locationName}
                        </span>
                      </div>
                      <div>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                            empty
                              ? "bg-rose-100 text-rose-700"
                              : warehouse
                                ? "bg-sky-100 text-sky-800"
                                : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {empty ? "نافد" : warehouse ? (
                            <>
                              <Warehouse size={12} />
                              {qty(s.quantity)}
                            </>
                          ) : (
                            qty(s.quantity)
                          )}
                        </span>
                      </div>
                      <div className="hidden md:block font-black text-rose-700 whitespace-nowrap">{money(s.unitCost)}</div>
                      <div className="justify-self-end">
                        {empty && canRestock && product ? (
                          <Button size="sm" onClick={() => openRestock(product)}>
                            <PackagePlus size={14} />
                            تزويد
                          </Button>
                        ) : warehouse && !empty && canQuickTransfer ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={transferring === rowKey}
                            onClick={() => void quickToStore(s.variantId, s.locationId, s.batchId, rowKey)}
                            title="تحويل قطعة إلى محل البيع بدون نافذة"
                          >
                            <ArrowLeftRight size={14} />
                            {transferring === rowKey ? "…" : "تحويل سريع"}
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </Panel>
      )}
      {tab === "transfer" && (
        <Panel title="التحويلات" actions={<Button onClick={openTransfer}>تحويل جديد</Button>} padded={false}>
          {transfers.length === 0 ? (
            <div className="p-10 text-center text-slate-400">لا توجد تحويلات</div>
          ) : (
            transfers.map((t, i) => {
              const st = transferStatus(t.status);
              const pending =
                t.status === "requested" ||
                t.status === "approved" ||
                t.status === "preparing" ||
                t.status === "dispatched";
              return (
              <div key={t.id} className={`px-6 py-4 flex justify-between items-center gap-4 ${i % 2 ? "bg-slate-50/70" : "bg-white"}`}>
                <div>
                  <div className="font-bold">{t.transferNumber}</div>
                  <div className="text-sm text-slate-500 mt-0.5">
                    {t.fromName} → {t.toName}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${st.cls}`}>{st.text}</span>
                  {pending ? (
                    <Button size="sm" onClick={() => setPendingCompleteId(t.id)}>
                      تنفيذ
                    </Button>
                  ) : null}
                </div>
              </div>
              );
            })
          )}
        </Panel>
      )}
      {tab === "wh" && (
        <div className="space-y-4">
          {canManageWh ? (
            <Panel
              title="إضافة مخزن جديد"
              hint="إذا توسّع المشروع أضف مخزناً ثانياً أو فرع تخزين. استقبل إليه المشتريات أو حوّل منه إلى المتجر."
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  value={whName}
                  onChange={(e) => setWhName(e.target.value)}
                  className="h-11 flex-1"
                  placeholder="مثال: مخزن الفرع الثاني"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveWarehouse(null, whName, true, "تم إضافة المخزن");
                    }
                  }}
                />
                <Button
                  className="h-11 shrink-0"
                  disabled={whBusy}
                  onClick={() => void saveWarehouse(null, whName, true, "تم إضافة المخزن")}
                >
                  <Plus size={16} />
                  إضافة المخزن
                </Button>
              </div>
            </Panel>
          ) : (
            <Panel title="إضافة مخزن">
              <p className="text-sm text-slate-500 leading-7">
                إضافة مخزن جديد تحتاج صلاحية تسوية المخزون (مدير أو أمين مخزن) ووردية مفتوحة.
              </p>
            </Panel>
          )}

          {warehouses.length === 0 ? (
            <Panel>
              <div className="py-10 text-center text-slate-400 text-sm">لا توجد مخازن بعد. أضف أول مخزن من البطاقة أعلاه.</div>
            </Panel>
          ) : (
            warehouses.map((wh) => {
              const rows = stock.filter((s) => s.locationId === wh.id && s.quantity > 0);
              const active = wh.isActive === 1;
              return (
                <Panel
                  key={wh.id}
                  title={wh.name}
                  hint={
                    active
                      ? "يمكنك استلام المشتريات هنا والتحويل منه إلى المتجر أو مخزن آخر."
                      : "موقوف — لن يظهر في المشتريات حتى تعيد تفعيله."
                  }
                  actions={
                    <span
                      className={`h-7 px-2.5 rounded-full text-xs font-bold border ${
                        active
                          ? "bg-emerald-50 text-emerald-800 border-emerald-100"
                          : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}
                    >
                      {active ? "نشط" : "موقوف"}
                    </span>
                  }
                  padded={false}
                >
                  {canManageWh ? (
                    <div className="px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row gap-2">
                      <Input
                        value={editNames[wh.id] ?? wh.name}
                        onChange={(e) => setEditNames((m) => ({ ...m, [wh.id]: e.target.value }))}
                        className="h-10 flex-1"
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          disabled={whBusy || (editNames[wh.id] ?? wh.name).trim() === wh.name}
                          onClick={() =>
                            void saveWarehouse(wh.id, editNames[wh.id] ?? wh.name, active, "تم تحديث اسم المخزن")
                          }
                        >
                          <Pencil size={14} />
                          حفظ الاسم
                        </Button>
                        <Button
                          variant={active ? "ghost" : "secondary"}
                          disabled={whBusy || (active && activeWarehouses.length <= 1)}
                          onClick={() =>
                            void saveWarehouse(
                              wh.id,
                              editNames[wh.id] ?? wh.name,
                              !active,
                              active ? "تم إيقاف المخزن" : "تم تفعيل المخزن",
                            )
                          }
                        >
                          <Power size={14} />
                          {active ? "إيقاف" : "تفعيل"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  {rows.length === 0 ? (
                    <div className="px-6 py-8 text-sm text-slate-400">لا توجد أصناف في هذا المخزن حالياً.</div>
                  ) : (
                    <div className="p-3 bg-slate-50/80 flex flex-col gap-2.5">
                      {rows.map((s) => {
                        const rowKey = `wh-${s.batchId}-${s.locationId}`;
                        return (
                          <article
                            key={rowKey}
                            className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-center rounded-2xl bg-white border border-sky-100 shadow-sm px-4 py-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="h-12 w-12 rounded-2xl bg-sky-50 text-sky-800 grid place-items-center shrink-0 border border-sky-100"
                                title="متوفر في المخزن وليس في المتجر"
                              >
                                <Warehouse size={20} />
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-800 leading-5 truncate">{s.productName}</div>
                                <div className="text-xs text-slate-400 mt-0.5 truncate">
                                  {s.variantName || "بدون درجة"} · {wh.name}
                                </div>
                              </div>
                            </div>
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold bg-sky-100 text-sky-800">
                              <Warehouse size={12} />
                              {qty(s.quantity)}
                            </span>
                            {canQuickTransfer ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={transferring === rowKey}
                                onClick={() => void quickToStore(s.variantId, s.locationId, s.batchId, rowKey)}
                              >
                                <ArrowLeftRight size={14} />
                                {transferring === rowKey ? "…" : "تحويل سريع"}
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400">في المخزن</span>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </Panel>
              );
            })
          )}
        </div>
      )}
      <Modal
        open={open}
        title="تحويل مخزون"
        onClose={() => {
          if (sending) return;
          setOpen(false);
          setAskConfirm(false);
        }}
      >
        <div className="space-y-3">
          <Field label="من">
            <Select value={tFrom} onChange={(e) => setTFrom(Number(e.target.value))} className="h-11">
              <option value={0}>اختر المصدر</option>
              {locs
                .filter((l) => l.typeName !== "transit")
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.isActive ? "" : " (موقوف)"}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="إلى">
            <Select value={tTo} onChange={(e) => setTTo(Number(e.target.value))} className="h-11">
              <option value={0}>اختر الوجهة</option>
              {locs
                .filter((l) => l.typeName !== "transit")
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.isActive ? "" : " (موقوف)"}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="الصنف">
            <SearchField
              autoFocus
              placeholder="ابحث بالاسم أو امسح الباركود"
              value={tQuery}
              wrapClassName="w-full min-w-0"
              onChange={(e) => setTQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void pickByBarcode();
                }
              }}
            />
          </Field>
          {tHits.length > 0 ? (
            <div className="max-h-52 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-1.5 space-y-1">
              {tHits.map((p) => (
                <button
                  key={p.variantId}
                  type="button"
                  onClick={() => pickTransferProduct(p)}
                  className="w-full text-right rounded-xl bg-white border border-slate-100 hover:border-rose-200 hover:bg-rose-50 px-3 py-2.5"
                >
                  <div className="font-bold text-sm text-slate-800 truncate">{p.name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                    {[p.variantName, p.barcode || p.sku].filter(Boolean).join(" · ") || "بدون باركود"}
                    {tFrom ? ` · رصيد المصدر ${qty(qtyAt(p.variantId, tFrom))}` : ""}
                  </div>
                </button>
              ))}
            </div>
          ) : tQuery.trim() ? (
            <div className="text-xs text-slate-400 px-1">لا توجد نتائج مطابقة — جرّب الاسم أو الباركود.</div>
          ) : null}
          {tPicked ? (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-rose-700/80">الصنف المحدد</div>
                <div className="font-bold text-slate-800 mt-0.5 truncate">{tPicked.name}</div>
                <div className="text-xs text-slate-500 mt-0.5 truncate">
                  {[tPicked.variantName, tPicked.barcode || tPicked.sku].filter(Boolean).join(" · ")}
                  {tFrom ? ` · رصيد المصدر ${qty(qtyAt(tPicked.variantId, tFrom))}` : ""}
                </div>
              </div>
              <button
                type="button"
                className="h-8 w-8 rounded-lg grid place-items-center text-slate-400 hover:bg-white hover:text-rose-700"
                onClick={() => {
                  setTPicked(null);
                  setTVar(0);
                }}
                aria-label="إلغاء الصنف"
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
          <Field label="الكمية">
            <Input
              inputMode="numeric"
              value={tQty}
              onChange={(e) => setTQty(e.target.value)}
              className="h-11"
            />
          </Field>
          <Button className="w-full h-11" disabled={sending} onClick={requestSendTransfer}>
            {sending ? "جاري التحويل…" : "تحويل"}
          </Button>
        </div>
      </Modal>
      <Confirm
        open={askConfirm}
        title="تأكيد التحويل"
        body="هل أنت متأكد من التحويل؟"
        onClose={() => !sending && setAskConfirm(false)}
        onConfirm={() => void sendTransfer()}
      />
      <Confirm
        open={pendingCompleteId != null}
        title="تأكيد التحويل"
        body="هل أنت متأكد من التحويل؟"
        onClose={() => setPendingCompleteId(null)}
        onConfirm={() => void completePendingTransfer()}
      />
      <Modal open={!!restock} title="تزويد المخزون" onClose={() => !restocking && setRestock(null)}>
        {restock ? (
          <div className="space-y-3">
            <div className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3">
              <div className="text-[11px] font-semibold text-rose-700/80">الصنف</div>
              <div className="font-bold text-slate-800 mt-0.5">{restock.name}</div>
              {restock.variantName ? <div className="text-xs text-slate-500 mt-0.5">{restock.variantName}</div> : null}
            </div>
            <Field label="الموقع *">
              <Select
                value={restockForm.locationId}
                onChange={(e) => setRestockForm((f) => ({ ...f, locationId: Number(e.target.value) }))}
              >
                <option value={0}>اختر الموقع</option>
                {locs
                  .filter((l) => l.typeName !== "transit" && l.isActive)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="الكمية *">
              <Input
                autoFocus
                inputMode="numeric"
                value={restockForm.qty}
                onChange={(e) => setRestockForm((f) => ({ ...f, qty: e.target.value }))}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              {[1, 5, 10, 20].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRestockForm((f) => ({ ...f, qty: String(n) }))}
                  className={`h-8 px-3 rounded-lg text-xs font-bold border ${
                    restockForm.qty === String(n)
                      ? "bg-rose-700 text-white border-rose-700"
                      : "bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <Field label="تكلفة الوحدة (ج.م)">
              <Input
                inputMode="decimal"
                value={restockForm.cost}
                onChange={(e) => setRestockForm((f) => ({ ...f, cost: e.target.value }))}
              />
            </Field>
            <Field label={requireLot ? "رقم الدفعة *" : "رقم الدفعة"}>
              <Input
                value={restockForm.batch}
                onChange={(e) => setRestockForm((f) => ({ ...f, batch: e.target.value }))}
              />
            </Field>
            <Field label={requireExp ? "تاريخ الصلاحية *" : "تاريخ الصلاحية"}>
              <Input
                type="date"
                value={restockForm.exp}
                onChange={(e) => setRestockForm((f) => ({ ...f, exp: e.target.value }))}
              />
            </Field>
            <Button className="w-full" disabled={restocking} onClick={() => void confirmRestock()}>
              {restocking ? "جاري التزويد…" : "تأكيد التزويد"}
            </Button>
          </div>
        ) : null}
      </Modal>
    </Page>
  );
}
