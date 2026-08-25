import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Barcode,
  Layers3,
  PackagePlus,
  Sparkles,
  Tag,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { cmd, money } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/Page";
import { useToasts } from "@/components/ui/Toast";
import { cn } from "@/utils/cn";

type Named = { id: number; name: string };

const fld =
  "!h-11 !rounded-xl !px-3.5 !bg-slate-50 !border-slate-200 hover:!border-rose-200 focus:!bg-white focus:!border-rose-400 focus:!ring-4 focus:!ring-rose-50";

const emptyForm = {
  nameAr: "",
  nameEn: "",
  variantName: "",
  sku: "",
  barcode: "",
  retailPrice: "",
  purchaseCost: "",
  wholesalePrice: "",
  categoryId: "",
  brandId: "",
  unitId: "1",
  minStock: "0",
  qtyStore: "0",
  qtyWarehouse: "0",
  description: "",
};

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-start gap-3 bg-slate-50/80">
        <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-700 grid place-items-center shrink-0">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-sm text-slate-800">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5 leading-5">{hint}</p>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5 min-w-0">
      <span className="text-xs font-bold text-slate-600">
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function MoneyField({
  label,
  required,
  value,
  onChange,
  placeholder = "0.00",
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <FormField label={label} required={required}>
      <div className="relative">
        <Input
          dir="ltr"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(fld, "!pl-12 !text-left !font-semibold")}
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 pointer-events-none">
          ج.م
        </span>
      </div>
    </FormField>
  );
}

export function ProductFormPage() {
  const nav = useNavigate();
  const push = useToasts((s) => s.push);
  const [cats, setCats] = useState<Named[]>([]);
  const [brands, setBrands] = useState<Named[]>([]);
  const [units, setUnits] = useState<Named[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  function set<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  useEffect(() => {
    cmd<Named[]>("list_categories").then(setCats).catch(() => {});
    cmd<Named[]>("list_brands").then(setBrands).catch(() => {});
    cmd<Named[]>("list_units")
      .then((rows) => {
        setUnits(rows);
        if (rows[0]) setForm((f) => ({ ...f, unitId: String(rows[0].id) }));
      })
      .catch(() => {});
  }, []);

  const retail = Number(form.retailPrice);
  const cost = Number(form.purchaseCost || 0);
  const storeQty = Math.max(0, Math.round(Number(form.qtyStore) || 0));
  const warehouseQty = Math.max(0, Math.round(Number(form.qtyWarehouse) || 0));
  const catName = cats.find((c) => String(c.id) === form.categoryId)?.name;
  const brandName = brands.find((b) => String(b.id) === form.brandId)?.name;
  const unitName = units.find((u) => String(u.id) === form.unitId)?.name;
  const priceOk = Number.isFinite(retail) && retail >= 0 && form.retailPrice.trim() !== "";

  const preview = useMemo(
    () => [
      ["الاسم", form.nameAr.trim() || "—"],
      ["الدرجة", form.variantName.trim() || "—"],
      ["التصنيف", catName || "بدون تصنيف"],
      ["الماركة", brandName || "بدون ماركة"],
      ["الوحدة", unitName || "—"],
      ["SKU", form.sku.trim() || "—"],
      ["الباركود", form.barcode.trim() || "—"],
    ],
    [form.nameAr, form.variantName, form.sku, form.barcode, catName, brandName, unitName],
  );

  async function save() {
    if (!form.nameAr.trim()) {
      push("err", "اسم المنتج مطلوب.");
      return;
    }
    const retailN = Number(form.retailPrice);
    const costN = Number(form.purchaseCost || 0);
    const wholesale = Number(form.wholesalePrice || 0);
    if (!Number.isFinite(retailN) || retailN < 0) {
      push("err", "سعر البيع غير صالح.");
      return;
    }
    if (!Number.isFinite(costN) || costN < 0) {
      push("err", "التكلفة غير صالحة.");
      return;
    }
    setSaving(true);
    try {
      await cmd("save_product", {
        input: {
          id: null,
          nameAr: form.nameAr.trim(),
          nameEn: form.nameEn.trim() || null,
          sku: form.sku.trim() || null,
          barcode: form.barcode.trim() || null,
          brandId: form.brandId ? Number(form.brandId) : null,
          categoryId: form.categoryId ? Number(form.categoryId) : null,
          unitId: form.unitId ? Number(form.unitId) : 1,
          purchaseCost: Math.round(costN * 100),
          retailPrice: Math.round(retailN * 100),
          wholesalePrice: Math.round((Number.isFinite(wholesale) ? wholesale : 0) * 100),
          minStock: Number(form.minStock) || 0,
          reorderLevel: Number(form.minStock) || 0,
          description: form.description.trim() || null,
          isActive: true,
          openingStoreQty: Math.max(0, Math.round(Number(form.qtyStore) || 0)),
          openingWarehouseQty: Math.max(0, Math.round(Number(form.qtyWarehouse) || 0)),
          variants: form.variantName.trim()
            ? [
                {
                  id: null,
                  name: form.variantName.trim(),
                  sku: form.sku.trim() || null,
                  barcode: form.barcode.trim() || null,
                  colorCode: null,
                  size: null,
                  retailPrice: Math.round(retailN * 100),
                  isActive: true,
                },
              ]
            : [],
        },
      });
      push("ok", "تم حفظ المنتج");
      nav("/products");
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full bg-app overflow-auto">
      <div className="p-4 lg:p-5 space-y-4">
        <PageHeader
          title="منتج جديد"
          subtitle="الهوية والتصنيف والأسعار والمخزون — عبّئ ثم احفظ من الملخص أو من الأعلى."
          icon={PackagePlus}
          leading={
            <button
              type="button"
              onClick={() => nav("/products")}
              className="h-11 w-11 shrink-0 rounded-xl bg-slate-50 border border-slate-200 hover:bg-white hover:border-rose-200 grid place-items-center"
              aria-label="رجوع"
            >
              <ArrowRight size={16} />
            </button>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => nav("/products")} disabled={saving}>
                إلغاء
              </Button>
              <Button type="submit" form="product-new-form" disabled={saving}>
                {saving ? "جاري الحفظ…" : "حفظ المنتج"}
              </Button>
            </div>
          }
        />

        <form
          id="product-new-form"
          className="grid lg:grid-cols-12 gap-4 items-start"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="lg:col-span-8 xl:col-span-9 space-y-4 min-w-0">
            <Section icon={Sparkles} title="هوية المنتج" hint="الاسم الظاهر في نقطة البيع والقوائم.">
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                <div className="sm:col-span-2 xl:col-span-3">
                  <FormField label="اسم المنتج (عربي)" required>
                    <Input
                      autoFocus
                      value={form.nameAr}
                      onChange={(e) => set("nameAr", e.target.value)}
                      placeholder="مثال: كريم أساس مات"
                      className={cn(fld, "!h-12 !text-[15px] !font-semibold")}
                    />
                  </FormField>
                </div>
                <FormField label="الاسم بالإنجليزية">
                  <Input
                    dir="ltr"
                    value={form.nameEn}
                    onChange={(e) => set("nameEn", e.target.value)}
                    placeholder="Foundation Matte"
                    className={fld}
                  />
                </FormField>
                <FormField label="درجة / لون">
                  <Input
                    value={form.variantName}
                    onChange={(e) => set("variantName", e.target.value)}
                    placeholder="مثال: بيج 02"
                    className={fld}
                  />
                </FormField>
                <FormField label="وصف مختصر">
                  <Input
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="ملاحظة قصيرة للصنف…"
                    className={fld}
                  />
                </FormField>
              </div>
            </Section>

            <Section icon={Layers3} title="التصنيف" hint="التصنيف والماركة والوحدة — صف واحد بدون فراغ.">
              <div className="grid sm:grid-cols-3 gap-4">
                <FormField label="التصنيف">
                  <Select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={fld}>
                    <option value="">بدون تصنيف</option>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="الماركة">
                  <Select value={form.brandId} onChange={(e) => set("brandId", e.target.value)} className={fld}>
                    <option value="">بدون ماركة</option>
                    {brands.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="وحدة القياس">
                  <Select value={form.unitId} onChange={(e) => set("unitId", e.target.value)} className={fld}>
                    {units.length === 0 ? <option value="1">قطعة</option> : null}
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
            </Section>

            <div className="grid xl:grid-cols-2 gap-4">
              <Section icon={Barcode} title="الترقيم" hint="للبحث السريع في الكاشير.">
                <div className="grid sm:grid-cols-2 gap-4">
                  <FormField label="SKU">
                    <Input
                      dir="ltr"
                      value={form.sku}
                      onChange={(e) => set("sku", e.target.value)}
                      placeholder="SKU-001"
                      className={cn(fld, "font-mono")}
                    />
                  </FormField>
                  <FormField label="الباركود">
                    <Input
                      dir="ltr"
                      value={form.barcode}
                      onChange={(e) => set("barcode", e.target.value)}
                      placeholder="628xxxxxxxx"
                      className={cn(fld, "font-mono")}
                    />
                  </FormField>
                </div>
              </Section>

              <Section icon={Tag} title="الأسعار" hint="بالجنيه المصري. سعر البيع مطلوب للكاشير.">
                <div className="grid sm:grid-cols-3 gap-4">
                  <MoneyField
                    label="سعر البيع"
                    required
                    value={form.retailPrice}
                    onChange={(v) => set("retailPrice", v)}
                  />
                  <MoneyField label="تكلفة الشراء" value={form.purchaseCost} onChange={(v) => set("purchaseCost", v)} />
                  <MoneyField label="سعر الجملة" value={form.wholesalePrice} onChange={(v) => set("wholesalePrice", v)} />
                </div>
              </Section>
            </div>

            <Section icon={Warehouse} title="المخزون الافتتاحي" hint="يُسجَّل مرة عند إنشاء المنتج. حد التنبيه يظهر عند انخفاض الكمية.">
              <div className="grid sm:grid-cols-3 gap-4">
                <FormField label="كمية المتجر">
                  <Input
                    inputMode="numeric"
                    value={form.qtyStore}
                    onChange={(e) => set("qtyStore", e.target.value)}
                    className={fld}
                  />
                </FormField>
                <FormField label="كمية المخزن">
                  <Input
                    inputMode="numeric"
                    value={form.qtyWarehouse}
                    onChange={(e) => set("qtyWarehouse", e.target.value)}
                    className={fld}
                  />
                </FormField>
                <FormField label="حد التنبيه">
                  <Input
                    inputMode="numeric"
                    value={form.minStock}
                    onChange={(e) => set("minStock", e.target.value)}
                    className={fld}
                  />
                </FormField>
              </div>
            </Section>
          </div>

          <aside className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-4 rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
            <div className="text-xs font-bold text-slate-400 mb-3">ملخص الصنف</div>
            <div className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-4 mb-4">
              <div className="text-[11px] font-semibold text-rose-700/80">سعر البيع</div>
              <div className="text-2xl font-black text-rose-800 mt-1 leading-none">
                {priceOk ? money(Math.round(retail * 100)) : "—"}
              </div>
              {Number.isFinite(cost) && form.purchaseCost.trim() ? (
                <div className="text-[11px] text-rose-700/70 mt-2">التكلفة {money(Math.round(cost * 100))}</div>
              ) : null}
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5 mb-3">
              <div className="text-[11px] text-slate-500">المخزون الافتتاحي</div>
              <div className="text-sm font-bold text-slate-800 mt-0.5">
                متجر {storeQty} · مخزن {warehouseQty}
              </div>
            </div>
            <div className="space-y-2">
              {preview.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                  <span className="text-xs text-slate-500 shrink-0">{k}</span>
                  <span className="text-sm font-bold text-slate-800 truncate" dir={k === "SKU" || k === "الباركود" ? "ltr" : undefined}>
                    {v}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-4">الحقول المعلّمة بـ * مطلوبة قبل الحفظ.</p>
            <div className="flex flex-col gap-2 mt-3">
              <Button type="submit" disabled={saving} className="w-full h-11">
                {saving ? "جاري الحفظ…" : "حفظ المنتج"}
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => nav("/products")} disabled={saving}>
                إلغاء
              </Button>
            </div>
          </aside>
        </form>
      </div>
    </div>
  );
}
