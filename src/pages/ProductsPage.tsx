import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  Boxes,
  Download,
  FolderOpen,
  Layers3,
  Package,
  PackagePlus,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { cmd, money, qty, type ProductRow } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { SearchField } from "@/components/ui/Field";
import { Empty } from "@/components/ui/Empty";
import { useToasts } from "@/components/ui/Toast";
import { Page, Panel } from "@/components/ui/Page";
import { Modal } from "@/components/ui/Modal";
import { useSession } from "@/stores/session";

type Named = { id: number; name: string };
type CatalogStats = {
  products: number;
  variants: number;
  categories: number;
  brands: number;
  outOfStore: number;
  warehouseOnly: number;
  lowStock: number;
};
type ImportResult = { imported: number; skipped: number; brands: number; message: string };

const EMPTY_STATS: CatalogStats = {
  products: 0,
  variants: 0,
  categories: 0,
  brands: 0,
  outOfStore: 0,
  warehouseOnly: 0,
  lowStock: 0,
};

const COLS =
  "grid grid-cols-[minmax(0,1.4fr)_minmax(6rem,auto)_4.75rem_4.75rem] md:grid-cols-[minmax(0,1.4fr)_minmax(7rem,0.7fr)_minmax(6.5rem,auto)_4.75rem_4.75rem] lg:grid-cols-[minmax(0,1.4fr)_minmax(8rem,0.7fr)_minmax(8rem,0.8fr)_minmax(7rem,0.6fr)_5.75rem_5.75rem] gap-3 items-center";

const LIMITS = [
  { n: 2000, label: "٢٬٠٠٠" },
  { n: 5000, label: "٥٬٠٠٠" },
  { n: 25000, label: "الكل" },
];

export function ProductsPage() {
  const nav = useNavigate();
  const push = useToasts((s) => s.push);
  const { shift, can } = useSession();
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<number | null>(null);
  const [cats, setCats] = useState<Named[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [stats, setStats] = useState<CatalogStats>(EMPTY_STATS);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [limit, setLimit] = useState(25000);
  const loadGen = useRef(0);

  const total = stats.products;
  const allow = (perm: string) => can(perm) || !shift;

  async function loadStats() {
    try {
      setStats(await cmd<CatalogStats>("catalog_stats"));
    } catch {
      /* keep last known counts */
    }
  }


  async function load(query = q, categoryId = cat, pageNum = 0, append = false) {
    const gen = ++loadGen.current;
    try {
      const list = await cmd<ProductRow[]>("list_products", { query, categoryId, page: pageNum });
      if (gen !== loadGen.current) return;
      setHasMore(list.length === 80);
      setRows((prev) => (append ? [...prev, ...list] : list));
      setPage(pageNum);
    } catch (e) {
      if (gen !== loadGen.current) return;
      push("err", (e as Error).message);
    }
  }
  useEffect(() => {
    cmd<Named[]>("list_categories").then(setCats).catch(() => {});
    void loadStats();
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => void load(q, cat, 0, false), 200);
    return () => {
      window.clearTimeout(t);
      loadGen.current += 1;
    };
  }, [q, cat]);

  async function runImport(path?: string) {
    setImporting(true);
    try {
      const res = await cmd<ImportResult>("import_test_catalog", {
        limit,
        path: path ?? null,
      });
      push("ok", res.message);
      setImportOpen(false);
      await Promise.all([load(q, cat, 0, false), loadStats()]);
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function pickIncidbFile() {
    try {
      const path = await cmd<string | null>("pick_catalog_csv");
      if (!path) return;
      await runImport(path);
    } catch (e) {
      push("err", (e as Error).message);
    }
  }

  return (
    <Page
      title="المنتجات"
      subtitle="الأصناف والدرجات والباركود"
      icon={Package}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            كتالوج حقيقي
          </Button>
          <Button onClick={() => nav("/products/new")}>إضافة منتج</Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <StatCard
          label="المنتجات"
          value={qty(stats.products)}
          hint="إجمالي الأصناف في الكتالوج"
          icon={Package}
          tone="text-rose-700 bg-rose-50"
        />
        <StatCard
          label="الدرجات"
          value={qty(stats.variants)}
          hint={`${qty(stats.categories)} تصنيف · ${qty(stats.brands)} ماركة`}
          icon={Layers3}
          tone="text-violet-700 bg-violet-50"
        />
        <StatCard
          label="نافد من المتجر"
          value={qty(stats.outOfStore)}
          hint="بدون كمية صالحة للبيع"
          icon={AlertTriangle}
          tone="text-amber-700 bg-amber-50"
          onClick={allow("stock.view") ? () => nav("/inventory") : undefined}
        />
        <StatCard
          label="نواقص"
          value={qty(stats.lowStock)}
          hint="وصلت لحد إعادة الطلب"
          icon={Bell}
          tone="text-orange-700 bg-orange-50"
          onClick={allow("stock.view") ? () => nav("/notifications") : undefined}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { to: "/products/new", label: "إضافة منتج", hint: "صنف جديد", icon: PackagePlus, show: allow("products.edit") },
          { to: "/inventory", label: "المخزون", hint: "كميات ومواقع", icon: Warehouse, show: allow("stock.view") },
          {
            to: "/inventory",
            label: "في المخزن فقط",
            hint: `${qty(stats.warehouseOnly)} صنف`,
            icon: Boxes,
            show: allow("stock.view"),
          },
          { to: "/purchases", label: "المشتريات", hint: "توريد بضاعة", icon: Truck, show: allow("purchases.view") },
          { to: "/notifications", label: "التنبيهات", hint: "نواقص وصلاحية", icon: Bell, show: allow("stock.view") },
          { to: "/reports?r=top_sellers", label: "الأكثر مبيعاً", hint: "هذا الشهر", icon: TrendingUp, show: allow("reports.view") || allow("sales.view") },
          { to: "/reports?r=least_sellers", label: "الأقل مبيعاً", hint: "وما لم يُبع", icon: TrendingDown, show: allow("reports.view") || allow("sales.view") },
          { to: "/pos", label: "نقطة البيع", hint: "F1", icon: ShoppingBag, show: allow("sales.create") },
        ]
          .filter((s) => s.show)
          .map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={`${s.to}-${s.label}`}
                type="button"
                onClick={() => nav(s.to)}
                className="rounded-2xl bg-white border border-slate-100 shadow-sm p-3.5 text-right hover:border-rose-200 hover:bg-rose-50/40 transition"
              >
                <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-700 grid place-items-center mb-2">
                  <Icon size={16} />
                </div>
                <div className="text-sm font-bold text-slate-800 leading-5">{s.label}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{s.hint}</div>
              </button>
            );
          })}
      </div>

      <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-4 mb-4">
        <SearchField
          placeholder="ابحث بالاسم أو الباركود"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex gap-2 overflow-x-auto pt-3">
          <button
            type="button"
            onClick={() => setCat(null)}
            className={`h-7 px-3 rounded-full text-xs whitespace-nowrap border ${
              cat === null ? "bg-rose-700 text-white border-rose-700" : "bg-slate-50 text-slate-600 border-slate-200"
            }`}
          >
            الكل
          </button>
          {cats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              className={`h-7 px-3 rounded-full text-xs whitespace-nowrap border ${
                cat === c.id ? "bg-rose-700 text-white border-rose-700" : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 && total === 0 ? (
        <Panel>
          <div className="py-16 px-6 text-center">
            <div className="h-14 w-14 mx-auto mb-3 rounded-2xl bg-rose-50 text-rose-700 grid place-items-center border border-rose-100">
              <Package size={24} />
            </div>
            <div className="font-bold text-slate-800">لا توجد منتجات بعد</div>
            <p className="text-sm text-slate-500 mt-1 mb-4 max-w-md mx-auto leading-6">
              حمّل كتالوج تجميل حقيقي من Open Beauty Facts (آلاف المنتجات بأسماء وباركود) لاختبار سرعة البحث ونقطة البيع.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => setImportOpen(true)}>
                <Download size={16} />
                تحميل كتالوج حقيقي
              </Button>
              <Button variant="secondary" onClick={() => nav("/products/new")}>
                إضافة منتج يدوياً
              </Button>
            </div>
          </div>
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <Empty title="لا توجد منتجات مطابقة" action="إضافة منتج" onAction={() => nav("/products/new")} />
        </Panel>
      ) : (
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="font-bold text-slate-800">جدول الأصناف</div>
              <div className="text-[11px] text-slate-400 mt-0.5">كل صنف في بطاقة مستقلة لسهولة القراءة</div>
            </div>
            <div className="h-7 px-2.5 rounded-full bg-rose-50 border border-rose-100 text-xs font-bold text-rose-700">
              {qty(rows.length)}
              {total > rows.length ? ` من ${qty(total)}` : ""} صنف
            </div>
          </div>
          <div className="overflow-auto p-3 bg-slate-50/80">
            <div className={`${COLS} px-4 pb-2 text-[11px] font-bold text-slate-400`}>
              <div>المنتج</div>
              <div className="hidden md:block">التصنيف</div>
              <div className="hidden lg:block">الباركود</div>
              <div>السعر</div>
              <div>المتجر</div>
              <div>المخزن</div>
            </div>
            <div className="flex flex-col gap-2.5">
              {rows.map((r) => (
                <article
                  key={r.variantId}
                  className={`${COLS} rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-3 hover:border-rose-200 hover:shadow-md hover:bg-rose-50/30 transition`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-rose-100 to-rose-200 text-rose-800 grid place-items-center font-black shrink-0 border border-rose-100">
                      {(r.name || "•").slice(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 leading-5 truncate">{r.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5 truncate">
                        {[r.variantName, r.brand, r.sku].filter(Boolean).join(" · ") || "بدون درجة"}
                      </div>
                    </div>
                  </div>
                  <div className="hidden md:block min-w-0">
                    <span className="inline-flex max-w-full truncate rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 text-xs text-slate-600">
                      {r.category || "—"}
                    </span>
                  </div>
                  <div className="hidden lg:block min-w-0">
                    <span className="font-mono text-xs text-slate-500 whitespace-nowrap" dir="ltr" title={r.barcode || ""}>
                      {r.barcode || "—"}
                    </span>
                  </div>
                  <div className="font-black text-rose-700 whitespace-nowrap">{money(r.price)}</div>
                  <div>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                        r.storeQty > 0 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {r.storeQty > 0 ? qty(r.storeQty) : "نافد"}
                    </span>
                  </div>
                  <div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                        r.warehouseQty > 0
                          ? "bg-sky-50 text-sky-800 border border-sky-100"
                          : "bg-slate-100 text-slate-500"
                      }`}
                      title={r.storeQty <= 0 && r.warehouseQty > 0 ? "موجود في المخزن وليس في المتجر" : undefined}
                    >
                      {r.warehouseQty > 0 ? <Warehouse size={12} /> : null}
                      {qty(r.warehouseQty)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
            {hasMore ? (
              <div className="pt-3 flex justify-center">
                <Button
                  variant="secondary"
                  onClick={() => void load(q, cat, page + 1, true)}
                >
                  عرض المزيد
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <Modal
        open={importOpen}
        title="كتالوج منتجات حقيقي"
        onClose={() => !importing && setImportOpen(false)}
      >
        <p className="text-sm text-slate-600 leading-7">
          سننزّل قاعدة <span className="font-semibold">Open Beauty Facts</span> — منتجات تجميل وعناية حقيقية (أسماء، ماركات، باركود) بحجم يقارب ١٩ ألف صنف. مناسبة لاختبار البحث والكاشير والمخزون.
        </p>
        <p className="text-xs text-slate-400 mt-2 leading-6">
          البيانات مرخّصة ODbL. الأسعار والكميات تجريبية بالجنيه. يلزم وردية مفتوحة. اختر «الكل» لتجربة الكفاءة على الحجم الكامل، أو ٢٬٠٠٠ للتجربة السريعة.
        </p>
        <div className="flex gap-2 mt-4">
          {LIMITS.map((x) => (
            <button
              key={x.n}
              type="button"
              disabled={importing}
              onClick={() => setLimit(x.n)}
              className={`h-8 px-3 rounded-full text-xs font-bold border ${
                limit === x.n
                  ? "bg-rose-700 text-white border-rose-700"
                  : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 mt-5">
          <Button disabled={importing} onClick={() => void runImport()}>
            <Download size={16} />
            {importing ? "جاري التنزيل والاستيراد…" : "تنزيل واستيراد الكتالوج"}
          </Button>
          <Button variant="secondary" disabled={importing} onClick={() => void pickIncidbFile()}>
            <FolderOpen size={16} />
            اختيار ملف INCIDB
          </Button>
        </div>
      </Modal>
    </Page>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone: string;
  onClick?: () => void;
}) {
  const cls = "rounded-3xl bg-white border border-slate-100 shadow-sm p-5 min-h-[110px] text-right w-full";
  const body = (
    <>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-sm text-slate-500">{label}</div>
        <div className={`h-9 w-9 rounded-xl grid place-items-center ${tone}`}>
          <Icon size={16} />
        </div>
      </div>
      <div className="text-lg font-bold text-slate-800 leading-6">{value}</div>
      {hint ? <div className="text-xs text-slate-400 mt-1.5">{hint}</div> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${cls} hover:border-rose-200 hover:shadow-md transition`}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

