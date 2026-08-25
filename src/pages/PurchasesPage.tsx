import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Package, Truck, Warehouse, X } from "lucide-react";
import { cmd, money, qty, type ProductRow } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Field, Input, SearchField, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { SuccessPopup } from "@/components/ui/SuccessPopup";
import { useToasts } from "@/components/ui/Toast";
import { Page, Panel } from "@/components/ui/Page";
import { settingFlag, usePrefs } from "@/stores/prefs";

type Party = { id: number; name: string; phone?: string | null; extra: number; isActive: number };
type Purchase = {
  id: number;
  invoiceNumber: string;
  supplier: string;
  grandTotal: number;
  paidTotal: number;
  invoiceDate: string;
};
type Loc = { id: number; name: string; typeName: string; isActive?: number };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultBatch() {
  const d = new Date();
  return `R${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function formatDate(iso: string) {
  const [y, m, d] = (iso || "").split("-");
  if (!y || !m || !d) return iso || "—";
  return `${d}/${m}/${y}`;
}

export function PurchasesPage() {
  const push = useToasts((s) => s.push);
  const vals = usePrefs((p) => p.values);
  const requireLot = settingFlag(vals, "batch.require_lot", true);
  const requireExp = settingFlag(vals, "batch.require_expiry", true);

  const [rows, setRows] = useState<Purchase[]>([]);
  const [open, setOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [locs, setLocs] = useState<Loc[]>([]);
  const [form, setForm] = useState({
    supplierId: 0,
    locationId: 0,
    invoiceNo: "",
    invoiceDate: todayIso(),
    qty: "1",
    cost: "",
    batch: "",
    exp: "",
  });
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductRow[]>([]);
  const [picked, setPicked] = useState<ProductRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const warehouses = useMemo(
    () => locs.filter((l) => l.typeName === "warehouse" && l.isActive !== 0),
    [locs],
  );
  const quantity = Math.round(Number((form.qty || "0").replace(",", ".")));
  const unitPounds = Number((form.cost || "0").replace(",", "."));
  const unitPiastres = Math.round(unitPounds * 100);
  const qtyOk = Number.isFinite(quantity) && quantity > 0;
  const costOk = Number.isFinite(unitPounds) && unitPounds >= 0 && form.cost.trim() !== "";
  const lineTotal = qtyOk && costOk ? quantity * unitPiastres : 0;

  async function load() {
    setRows(await cmd("list_purchases"));
    setSuppliers(await cmd("list_suppliers", { query: "" }));
    setLocs(await cmd("list_locations"));
  }

  useEffect(() => {
    load().catch((e) => push("err", e.message));
  }, []);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      cmd<ProductRow[]>("search_products", { query: q, categoryId: null })
        .then((list) => {
          if (!cancelled) setHits(list.filter((r) => r.isActive).slice(0, 8));
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, open]);

  function openReceive() {
    const wh = warehouses[0];
    const supplier = suppliers.find((s) => s.isActive) || suppliers[0];
    setForm({
      supplierId: supplier?.id || 0,
      locationId: wh?.id || 0,
      invoiceNo: "",
      invoiceDate: todayIso(),
      qty: "1",
      cost: "",
      batch: defaultBatch(),
      exp: "",
    });
    setQuery("");
    setHits([]);
    setPicked(null);
    setOpen(true);
  }

  function pickProduct(p: ProductRow) {
    setPicked(p);
    setQuery("");
    setHits([]);
  }

  async function pickByBarcode() {
    const code = query.trim();
    if (!code) return;
    try {
      const p = await cmd<ProductRow>("lookup_barcode", { code });
      pickProduct(p);
      return;
    } catch {
      /* بحث بالاسم */
    }
    try {
      const list = await cmd<ProductRow[]>("search_products", { query: code, categoryId: null });
      const hit = list.find((r) => r.isActive);
      if (hit) pickProduct(hit);
      else push("err", "لم يُعثر على صنف بهذا الاسم أو الباركود.");
    } catch (e) {
      push("err", (e as Error).message);
    }
  }

  async function save() {
    if (!form.supplierId) {
      push("err", "اختر المورد.");
      return;
    }
    if (!form.locationId) {
      push("err", "اختر المخزن.");
      return;
    }
    if (!picked) {
      push("err", "ابحث عن الصنف ثم اختره من النتائج.");
      return;
    }
    if (!qtyOk) {
      push("err", "أدخل كمية صالحة أكبر من صفر.");
      return;
    }
    if (!costOk) {
      push("err", "أدخل تكلفة الوحدة.");
      return;
    }
    if (requireLot && !form.batch.trim()) {
      push("err", "رقم الدفعة مطلوب.");
      return;
    }
    if (requireExp && !form.exp) {
      push("err", "تاريخ الصلاحية مطلوب.");
      return;
    }
    setSaving(true);
    try {
      await cmd("receive_purchase_cmd", {
        input: {
          supplierId: form.supplierId,
          supplierInvoiceNo: form.invoiceNo.trim() || null,
          locationId: form.locationId,
          invoiceDate: form.invoiceDate || todayIso(),
          dueDate: null,
          items: [
            {
              variantId: picked.variantId,
              quantity,
              unitCost: unitPiastres,
              discount: 0,
              batchNumber: form.batch.trim() || defaultBatch(),
              expirationDate: form.exp || null,
              productionDate: null,
            },
          ],
          discount: 0,
          taxTotal: 0,
          paidTotal: 0,
          paymentMethodId: null,
          notes: null,
        },
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

  const supplierName = suppliers.find((s) => s.id === form.supplierId)?.name;
  const warehouseName = warehouses.find((l) => l.id === form.locationId)?.name;

  return (
    <Page
      title="المشتريات"
      subtitle="استلام البضاعة إلى المخزن"
      icon={Truck}
      actions={
        <Button className="h-11 px-4" onClick={openReceive}>
          <Package size={16} />
          استلام مشترى
        </Button>
      }
    >
      <Panel padded={false}>
        {rows.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="h-12 w-12 mx-auto mb-3 rounded-2xl bg-rose-50 text-rose-700 grid place-items-center border border-rose-100">
              <Truck size={22} />
            </div>
            <div className="font-bold text-sm text-slate-700">لا توجد مشتريات بعد</div>
            <p className="text-xs text-slate-400 mt-1">ابدأ باستلام أول مشترى إلى المخزن.</p>
            <Button className="mt-4" onClick={openReceive}>
              استلام مشترى
            </Button>
          </div>
        ) : (
          rows.map((r, i) => (
            <div key={r.id} className={`px-6 py-4 flex justify-between gap-4 ${i % 2 ? "bg-slate-50/70" : "bg-white"}`}>
              <div>
                <div className="font-bold text-slate-800">{r.invoiceNumber}</div>
                <div className="text-sm text-slate-500 mt-0.5">
                  {r.supplier} · {formatDate(r.invoiceDate)}
                </div>
              </div>
              <div className="text-left">
                <div className="font-black text-rose-700">{money(r.grandTotal)}</div>
                <div className="text-xs text-slate-400 mt-0.5">مدفوع {money(r.paidTotal)}</div>
              </div>
            </div>
          ))
        )}
      </Panel>

      <Modal open={open} title="استلام مشترى" onClose={() => !saving && setOpen(false)} wide>
        <div className="space-y-4">
          <p className="text-xs text-slate-500 -mt-1">أضف الكمية إلى المخزن مع تكلفة الشراء ورقم الدفعة.</p>

          <section className="rounded-2xl border border-slate-100 bg-slate-50/80 overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-100">
              <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-700 grid place-items-center border border-rose-100">
                <Truck size={16} />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800">المورد والموقع</div>
                <div className="text-[11px] text-slate-500">جهة التوريد والمخزن الذي تُستلم إليه البضاعة</div>
              </div>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="المورد *">
                <Select
                  value={form.supplierId}
                  onChange={(e) => setForm((f) => ({ ...f, supplierId: Number(e.target.value) }))}
                  className="h-11"
                >
                  <option value={0}>اختر المورد</option>
                  {suppliers
                    .filter((s) => s.isActive)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="المخزن *">
                <Select
                  value={form.locationId}
                  onChange={(e) => setForm((f) => ({ ...f, locationId: Number(e.target.value) }))}
                  className="h-11"
                >
                  <option value={0}>اختر المخزن</option>
                  {warehouses.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="رقم فاتورة المورد">
                <Input
                  value={form.invoiceNo}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceNo: e.target.value }))}
                  className="h-11"
                  placeholder="اختياري"
                />
              </Field>
              <Field label="تاريخ الفاتورة">
                <Input
                  type="date"
                  value={form.invoiceDate}
                  onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))}
                  className="h-11"
                />
              </Field>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-100 bg-white">
              <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-700 grid place-items-center border border-rose-100">
                <Package size={16} />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800">الصنف</div>
                <div className="text-[11px] text-slate-500">ابحث بالاسم أو امسح الباركود ثم اختر النتيجة</div>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <SearchField
                autoFocus
                placeholder="ابحث بالاسم أو امسح الباركود"
                value={query}
                wrapClassName="w-full min-w-0"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void pickByBarcode();
                  }
                }}
              />
              {hits.length > 0 ? (
                <div className="max-h-48 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-1.5 space-y-1">
                  {hits.map((p) => (
                    <button
                      key={p.variantId}
                      type="button"
                      onClick={() => pickProduct(p)}
                      className="w-full text-right rounded-xl bg-white border border-slate-100 hover:border-rose-200 hover:bg-rose-50 px-3 py-2.5"
                    >
                      <div className="font-bold text-sm text-slate-800 truncate">{p.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {[p.variantName, p.barcode || p.sku].filter(Boolean).join(" · ") || "بدون باركود"}
                      </div>
                    </button>
                  ))}
                </div>
              ) : query.trim() ? (
                <div className="text-xs text-slate-400 px-1">لا توجد نتائج مطابقة — جرّب الاسم أو الباركود.</div>
              ) : null}
              {picked ? (
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 flex items-start gap-3">
                  <div className="h-11 w-11 rounded-xl bg-white text-rose-700 grid place-items-center font-black border border-rose-100 shrink-0">
                    {(picked.name || "•").slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-rose-700/80">الصنف المحدد</div>
                    <div className="font-bold text-slate-800 mt-0.5 truncate">{picked.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                      {[picked.variantName, picked.barcode || picked.sku].filter(Boolean).join(" · ") || "بدون باركود"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="h-8 w-8 rounded-lg grid place-items-center text-slate-400 hover:bg-white hover:text-rose-700"
                    onClick={() => setPicked(null)}
                    aria-label="إلغاء الصنف"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-100">
              <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-700 grid place-items-center border border-rose-100">
                <Warehouse size={16} />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800">الكمية والتكلفة</div>
                <div className="text-[11px] text-slate-500">تكلفة الوحدة بالجنيه المصري</div>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="الكمية *">
                  <Input
                    inputMode="numeric"
                    value={form.qty}
                    onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                    className="h-11"
                  />
                </Field>
                <Field label="تكلفة الوحدة (ج.م) *">
                  <Input
                    inputMode="decimal"
                    value={form.cost}
                    onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                    className="h-11"
                    placeholder="0.00"
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                {[1, 5, 10, 20, 50].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, qty: String(n) }))}
                    className={`h-8 px-3 rounded-lg text-xs font-bold border ${
                      form.qty === String(n)
                        ? "bg-rose-700 text-white border-rose-700"
                        : "bg-slate-50 text-slate-600 border-slate-200"
                    }`}
                  >
                    {qty(n)}
                  </button>
                ))}
              </div>
              <div className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-rose-700/80">إجمالي البند</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {qtyOk ? qty(quantity) : "—"} × {costOk ? money(unitPiastres) : "—"}
                  </div>
                </div>
                <div className="font-black text-lg text-rose-800">{lineTotal ? money(lineTotal) : "—"}</div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-100">
              <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-700 grid place-items-center border border-rose-100">
                <CalendarDays size={16} />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800">الدفعة والصلاحية</div>
                <div className="text-[11px] text-slate-500">لتتبع الكمية عند البيع والتحويل</div>
              </div>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={requireLot ? "رقم الدفعة *" : "رقم الدفعة"}>
                <Input
                  value={form.batch}
                  onChange={(e) => setForm((f) => ({ ...f, batch: e.target.value }))}
                  className="h-11"
                />
              </Field>
              <Field label={requireExp ? "تاريخ الصلاحية *" : "تاريخ الصلاحية"}>
                <Input
                  type="date"
                  value={form.exp}
                  onChange={(e) => setForm((f) => ({ ...f, exp: e.target.value }))}
                  className="h-11"
                />
              </Field>
            </div>
          </section>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 leading-6">
            {supplierName ? <span>المورد: {supplierName}</span> : <span>لم يُختر مورد</span>}
            {" · "}
            {warehouseName ? <span>المخزن: {warehouseName}</span> : <span>لم يُختر مخزن</span>}
            {picked ? (
              <>
                {" · "}
                <span>الصنف: {picked.name}</span>
              </>
            ) : null}
          </div>

          <Button className="w-full h-12 text-base" disabled={saving} onClick={() => void save()}>
            {saving ? "جاري الحفظ…" : "حفظ الاستلام"}
          </Button>
        </div>
      </Modal>

      <SuccessPopup
        open={saved}
        title="تم استلام المشترى"
        message="أُضيفت الكمية إلى المخزن"
        onDone={() => setSaved(false)}
      />
    </Page>
  );
}
