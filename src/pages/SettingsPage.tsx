import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  HardDrive,
  PanelRight,
  Percent,
  Bell,
  Printer,
  FileText,
  Clock3,
  Code2,
  ScrollText,
  ChevronLeft,
  Download,
  Upload,
  ShieldCheck,
  ShieldAlert,
  Folder,
  AlertTriangle,
  Copy,
  CheckCircle2,
  Settings,
  Search,
  ShoppingBag,
  Package,
  Users,
  Sparkles,
  Monitor,
  Database,
  RefreshCw,
  Shield,
  History,
  X,
  Palette,
  Building2,
  Droplets,
  ScanLine,
  Landmark,
  Save,
  MessageCircle,
  Image as ImageIcon,
  Receipt,
  RotateCcw,
  Trash2,
  Mail,
  Globe,
  Phone,
  MapPin,
  Type,
  Check,
  Coins,
  Volume2,
  UserRound,
  Touchpad,
  Instagram,
  Facebook,
  Hash,
  Clock,
  Rocket,
} from "lucide-react";
import { cmd, qty, money } from "@/services/api";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/Button";
import { Input, SearchField, Select, Textarea } from "@/components/ui/Field";
import { Confirm } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/Page";
import { useToasts } from "@/components/ui/Toast";
import { SuccessPopup, RestoreProgressPopup } from "@/components/ui/SuccessPopup";
import { NAV_BOTTOM, NAV_GROUPS, NAV_TOP } from "@/nav";
import { useT } from "@/i18n";
import { usePrefs } from "@/stores/prefs";
import { useSession } from "@/stores/session";
import { LicensePanel } from "@/pages/LicensePanel";
import { UpdateChecker } from "@/components/UpdateChecker";
import { normalizeTheme, type ThemeMode } from "@/theme";
import { FontScaleSlider } from "@/components/ui/FontScaleSlider";

type Section =
  | "home"
  | "appearance"
  | "alerts"
  | "print"
  | "invoices"
  | "catalog"
  | "store"
  | "backup"
  | "sidebar"
  | "sales"
  | "pos_screen"
  | "inventory"
  | "shifts"
  | "dev"
  | "license"
  | "audit"
  | "updates"
  | "reset";

type Audit = { id: number; occurredAt: string; userName?: string | null; action: string; summary: string };
type Info = {
  version: string;
  dataDir: string;
  dbPath: string;
  backupsDir: string;
  logsDir: string;
  sqliteVersion?: string;
  dbSizeBytes?: number;
  walSizeBytes?: number;
};
type BackupRow = {
  id: number;
  createdAt: string;
  path: string;
  fileName: string;
  kind: string;
  schemaVersion: number;
  isValid: boolean;
  exists: boolean;
  sizeBytes?: number | null;
  slot?: string;
  sha256?: string | null;
  appVersion?: string | null;
};
type DbHealth = {
  ok: boolean;
  dirtyShutdown: boolean;
  path: string;
  sqliteVersion: string;
  schemaVersion: number;
  appVersion: string;
  journalMode: string;
  synchronous: string;
  foreignKeys: boolean;
  busyTimeoutMs: number;
  walAutocheckpoint: number;
  dbSizeBytes: number;
  walSizeBytes: number;
  lastIntegrityAt: string;
  lastQuickCheckAt: string;
  lastBackupAt: string;
  lastBackupPath: string;
  warning: string | null;
};
type Setter = (k: string, v: string, immediate?: boolean) => void;
type CardId = Exclude<Section, "home">;

function settingsDirty(a: Record<string, string>, b: Record<string, string>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if ((a[k] ?? "") !== (b[k] ?? "")) return true;
  }
  return false;
}

const CARDS: { id: CardId; title: string; desc: string; keywords: string; icon: typeof HardDrive }[] = [
  { id: "store", title: "بيانات المحل", desc: "اسم المحل والشعار والعنوان والهاتف والبريد والسجل التجاري وبيانات التواصل", keywords: "محل متجر شعار عنوان هاتف ايميل ضريبي واتساب منشأة سجل فرع انستغرام", icon: Building2 },
  { id: "appearance", title: "التخصيص", desc: "الوضع الفاتح أو الليلي، حجم الخط، اللون الرئيسي وشكل القوائم", keywords: "ثيم ليلي فاتح dark light theme خط لون قائمة تخصيص مظهر", icon: Palette },
  { id: "alerts", title: "التنبيهات", desc: "مخزون منخفض، صلاحية، الدفعات، المبيعات والنسخ الاحتياطي", keywords: "تنبيه مخزون صلاحية باتش بيع نسخة", icon: Bell },
  { id: "print", title: "الطابعات والأجهزة", desc: "الحرارية وA4 ودرج النقود وقارئ الباركود واختبار الطباعة", keywords: "طابعة حرارية a4 درج باركود سكانر اختبار print", icon: Printer },
  { id: "invoices", title: "الفواتير", desc: "شكل الفاتورة والبادئة ورقم البداية وحجم الورق وإظهار الشعار والضريبة والباركود", keywords: "فاتورة بادئة رقم شعار ضريبة باركود ورق", icon: FileText },
  { id: "catalog", title: "مستحضرات التجميل", desc: "الألوان والأحجام والدرجات والأنواع والماركات والفئات والباركود والدفعات", keywords: "ماركة فئة لون حجم درجة shade باتش باركود كاتالوج", icon: Droplets },
  { id: "backup", title: "قاعدة البيانات والنسخ", desc: "نسخة كاملة من كل بيانات البرنامج والاستعادة الآمنة", keywords: "backup استعادة نسخة طوارئ سلامة wal sqlite zip شعار صور", icon: HardDrive },
  { id: "reset", title: "إعادة ضبط المصنع", desc: "مسح المنتجات والمبيعات والمخزون للبدء من جديد مع الإبقاء على المستخدمين والإعدادات", keywords: "مسح حذف ضبط مصنع بيانات منتجات فواتير عملاء مخزون reset factory", icon: RotateCcw },
  { id: "sidebar", title: "الشريط الجانبي", desc: "لون الشريط وعرضه وطيّه وإظهار أو إخفاء عناصر القائمة", keywords: "قائمة تنقل عرض nav sidebar أبيض شفاف لون طي طيّ مصغر أيقونات", icon: PanelRight },
  { id: "sales", title: "المبيعات والضريبة", desc: "الضريبة والخصومات وحدود الكاشير ونقاط الولاء", keywords: "ضريبة خصم كاشير فاتورة بيع vat نقاط", icon: Percent },
  { id: "pos_screen", title: "شاشة البيع", desc: "الوضع القياسي أو شاشة اللمس وإعدادات نقطة البيع", keywords: "لمس شاشة قياسي touch pos display نقطة بيع كاشير صوت عميل", icon: ShoppingBag },
  { id: "inventory", title: "المخزون والصرف", desc: "البيع بالسالب والصلاحية وFEFO والمرتجعات", keywords: "صلاحية منتهي راكد fefo مخزون سالب تنبيه", icon: Package },
  { id: "shifts", title: "الورديات", desc: "فتح الصندوق والإغلاق والجرد وقفل الشاشة", keywords: "صندوق وردية إغلاق عهدة جرد قفل", icon: Clock3 },
  { id: "license", title: "ترخيص البرنامج", desc: "حالة التفعيل ومعرّف الجهاز وإدخال مفتاح الترخيص", keywords: "ترخيص مفتاح تفعيل جهاز license keygen تجربة", icon: ShieldCheck },
  { id: "dev", title: "المطور", desc: "تواصل مع المطوّر", keywords: "احمد حسني واتساب هاتف تواصل مطور", icon: Code2 },
  { id: "updates", title: "تحديثات البرنامج", desc: "البحث عن إصدارات جديدة وتنزيلها وتثبيتها تلقائياً", keywords: "تحديث اصدار نسخة جديد update version", icon: Rocket },
  { id: "audit", title: "سجل النشاط", desc: "آخر العمليات المنفذة على النظام", keywords: "تدقيق سجل عمليات مستخدمين", icon: ScrollText },
];

const STORE_TABS: { id: CardId; label: string; icon: typeof HardDrive }[] = [
  { id: "store", label: "بيانات المحل", icon: Building2 },
  { id: "invoices", label: "الفواتير", icon: FileText },
  { id: "sales", label: "المبيعات والضريبة", icon: Percent },
  { id: "pos_screen", label: "شاشة البيع", icon: ShoppingBag },
  { id: "print", label: "الطابعات", icon: Printer },
];

const LOOK_TABS: { id: CardId; label: string; icon: typeof HardDrive }[] = [
  { id: "appearance", label: "التخصيص", icon: Palette },
  { id: "sidebar", label: "الشريط الجانبي", icon: PanelRight },
];

const NESTED_IDS = new Set<CardId>([...STORE_TABS, ...LOOK_TABS].map((t) => t.id));

const HOME_CARDS: typeof CARDS = [
  {
    id: "store",
    title: "إعدادات المنشأة",
    desc: "بيانات المحل والفواتير والمبيعات وشاشة البيع والطابعة الحرارية",
    keywords: "منشأة محل فاتورة ضريبة طابعة لمس شاشة بيع",
    icon: Building2,
  },
  {
    id: "appearance",
    title: "المظهر والاستخدام",
    desc: "الوضع الفاتح أو الليلي وحجم الخط والشريط الجانبي",
    keywords: "مظهر تخصيص ثيم شريط",
    icon: Palette,
  },
  ...CARDS.filter((c) => !NESTED_IDS.has(c.id)),
];

function hubOf(id: Section) {
  if (STORE_TABS.some((t) => t.id === id)) {
    return {
      title: "إعدادات المنشأة",
      desc: "كل ما يخص هوية المحل على الفاتورة وعملية البيع",
      icon: Building2,
      tabs: STORE_TABS,
    };
  }
  if (LOOK_TABS.some((t) => t.id === id)) {
    return {
      title: "المظهر والاستخدام",
      desc: "شكل البرنامج والقائمة كما يظهران على شاشتك",
      icon: Palette,
      tabs: LOOK_TABS,
    };
  }
  return null;
}

const RECENT_KEY = "wateen-pos-settings-recent";
const MAX_RECENT = 5;

function readRecent(): CardId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((id): id is CardId => CARDS.some((c) => c.id === id)).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function writeRecent(ids: CardId[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
}

export function SettingsPage() {
  const [search, setSearch] = useSearchParams();
  const [section, setSection] = useState<Section>("home");
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<CardId[]>(() => readRecent());
  const [printers, setPrinters] = useState<{ name: string }[]>([]);
  const committed = usePrefs((p) => p.values);
  const apply = usePrefs((p) => p.applySettings);
  const patch = usePrefs((p) => p.patch);
  const push = useToasts((s) => s.push);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const baselineRef = useRef(baseline);
  const draftRef = useRef(draft);
  const readyRef = useRef(false);
  const card = CARDS.find((c) => c.id === section);
  const hub = hubOf(section);
  const headerTitle = hub?.title || card?.title || "الإعدادات";
  const headerDesc = hub?.desc || card?.desc;
  const HeaderIcon = hub?.icon || card?.icon || Settings;
  const s = Object.keys(draft).length ? draft : committed;
  const dirty = ready && settingsDirty(s, baseline);

  useEffect(() => {
    baselineRef.current = baseline;
  }, [baseline]);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    cmd<Record<string, string>>("get_settings").then((v) => {
      apply(v);
      setBaseline(v);
      setDraft(v);
      setReady(true);
    });
    cmd<{ name: string }[]>("list_printers_cmd").then(setPrinters).catch(() => {});
  }, [apply]);

  useEffect(() => {
    return () => {
      if (!readyRef.current) return;
      if (settingsDirty(draftRef.current, baselineRef.current)) {
        apply(baselineRef.current);
      }
    };
  }, [apply]);

  const sectionParam = search.get("s");
  useEffect(() => {
    if (sectionParam && CARDS.some((c) => c.id === sectionParam)) {
      const id = sectionParam as CardId;
      setSection(id);
      setRecent((prev) => {
        const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT);
        writeRecent(next);
        return next;
      });
      return;
    }
    if (!sectionParam) setSection("home");
  }, [sectionParam]);

  function set(k: string, v: string, _immediate = false) {
    setDraft((d) => {
      const next = { ...(Object.keys(d).length ? d : committed), [k]: v };
      apply(next);
      return next;
    });
  }

  function liveSet(k: string, v: string) {
    patch(k, v, true);
    setDraft((d) => ({ ...(Object.keys(d).length ? d : committed), [k]: v }));
    setBaseline((b) => ({ ...b, [k]: v }));
  }

  function revert() {
    apply(baseline);
    setDraft(baseline);
  }

  async function save() {
    setSaving(true);
    try {
      const values = Object.keys(draft).length ? draft : committed;
      await cmd("save_settings", { values, overridePin: null });
      apply(values);
      setBaseline(values);
      setDraft(values);
      setSavedOpen(true);
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function openSection(id: CardId) {
    setSection(id);
    setQuery("");
    setSearch({ s: id }, { replace: true });
    setRecent((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT);
      writeRecent(next);
      return next;
    });
  }

  function goHome() {
    if (dirty) revert();
    setSection("home");
    setSearch({}, { replace: true });
  }

  const q = query.trim().toLowerCase();
  const listed = q ? CARDS : HOME_CARDS;
  const filtered = q
    ? listed.filter((c) => `${c.title} ${c.desc} ${c.keywords}`.toLowerCase().includes(q))
    : listed;
  const recentCards = recent
    .map((id) => CARDS.find((c) => c.id === id))
    .filter((c): c is (typeof CARDS)[number] => !!c);

  return (
    <div className="h-full bg-app flex flex-col min-h-0">
      <div className="flex-1 min-h-0 overflow-auto p-4 lg:p-5">
        {section === "home" ? (
          <>
            <PageHeader
              title="الإعدادات"
              subtitle="عدّل أي قسم ثم اضغط حفظ. إن خرجت دون حفظ تُلغى التغييرات."
              icon={Settings}
              className="mb-4"
            />
            <div className="mb-4">
              <SearchField
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filtered[0]) openSection(filtered[0].id);
                }}
                placeholder="ابحث في الإعدادات: المظهر، النسخ، الضريبة، الطابعة…"
                autoFocus
                wrapClassName="w-full min-w-0"
                trailing={
                  query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="h-7 w-7 rounded-lg grid place-items-center text-gold-dark hover:bg-gold/15"
                      aria-label="مسح البحث"
                    >
                      <X size={14} />
                    </button>
                  ) : null
                }
              />
            </div>

            {!q && recentCards.length > 0 ? (
              <section className="mb-4 rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-rose-50 text-rose-700 grid place-items-center">
                    <History size={15} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-800">آخر الزيارات</div>
                    <div className="text-[11px] text-slate-400">اختصارات سريعة للأقسام التي فتحتها مؤخراً</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentCards.map((c) => {
                    const Icon = c.icon;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => openSection(c.id)}
                        className="h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-rose-200 hover:bg-rose-50 text-sm font-semibold text-slate-700 inline-flex items-center gap-2"
                      >
                        <Icon size={14} className="text-rose-700" />
                        {c.title}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {q ? (
              <div className="text-xs font-semibold text-slate-500 mb-3">
                {filtered.length ? `${filtered.length} نتيجة` : "لا توجد نتائج مطابقة"}
              </div>
            ) : null}

            {filtered.length === 0 ? (
              <div className="rounded-2xl bg-white border border-slate-100 shadow-sm py-14 text-center">
                <div className="h-12 w-12 rounded-2xl bg-slate-50 text-slate-400 grid place-items-center mx-auto mb-3">
                  <Search size={22} />
                </div>
                <div className="font-semibold text-sm text-slate-700">لا يوجد قسم بهذا الاسم</div>
                <p className="text-xs text-slate-500 mt-1">جرّب كلمة أخرى مثل «نسخ» أو «ضريبة» أو «طابعة».</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((c) => {
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => openSection(c.id)}
                      className="group text-right rounded-2xl bg-white border border-slate-100 shadow-sm p-4 hover:border-rose-200 hover:shadow-md transition min-h-[132px] flex flex-col"
                    >
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-700 grid place-items-center">
                          <Icon size={18} />
                        </div>
                        <ChevronLeft size={18} className="text-slate-300 group-hover:text-rose-500 mt-1" />
                      </div>
                      <div className="font-bold text-sm text-slate-800">{c.title}</div>
                      <div className="text-xs text-slate-500 mt-1.5 leading-5 flex-1">{c.desc}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <PageHeader
              title={headerTitle}
              subtitle={headerDesc}
              icon={HeaderIcon}
              className="mb-4"
              leading={
                <button
                  type="button"
                  onClick={goHome}
                  className="h-11 w-11 shrink-0 rounded-xl bg-slate-50 border border-slate-200 hover:bg-white hover:border-rose-200 grid place-items-center"
                  aria-label="رجوع"
                >
                  <ArrowRight size={16} />
                </button>
              }
              actions={
                section !== "audit" && section !== "license" && section !== "dev" && section !== "reset" && dirty ? (
                  <div className="h-9 px-3 shrink-0 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800 inline-flex items-center">
                    تغييرات غير محفوظة
                  </div>
                ) : undefined
              }
            />
            {hub ? (
              <nav className="mb-5 flex flex-wrap gap-1 p-1.5 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
                {hub.tabs.map((t) => {
                  const active = section === t.id;
                  const TabIcon = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => openSection(t.id)}
                      className={cn(
                        "h-10 px-3.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap transition",
                        active
                          ? "bg-rose-50 text-rose-800 ring-1 ring-rose-100"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-800",
                      )}
                    >
                      <TabIcon size={15} strokeWidth={2.1} />
                      {t.label}
                    </button>
                  );
                })}
              </nav>
            ) : null}
            {section === "appearance" && <AppearancePanel s={s} set={set} />}
            {section === "alerts" && <AlertsPanel s={s} set={set} />}
            {section === "backup" && <BackupPanel s={s} set={set} />}
            {section === "sidebar" && <SidebarPanel s={s} set={set} />}
            {section === "sales" && <SalesPanel s={s} set={set} />}
            {section === "pos_screen" && <PosScreenPanel s={s} set={set} liveSet={liveSet} />}
            {section === "inventory" && <InventoryPanel s={s} set={set} />}
            {section === "print" && <PrintPanel s={s} set={set} printers={printers} />}
            {section === "invoices" && <InvoicesPanel s={s} set={set} />}
            {section === "catalog" && <CatalogPanel s={s} set={set} />}
            {section === "store" && <StorePanel s={s} set={set} />}
            {section === "shifts" && <ShiftsPanel s={s} set={set} />}
            {section === "license" && <LicensePanel />}
            {section === "dev" && <DevPanel />}
            {section === "updates" && <UpdatesPanel />}
            {section === "audit" && <AuditPanel />}
            {section === "reset" && <FactoryResetPanel />}
          </>
        )}
      </div>
      {section !== "home" && section !== "audit" && section !== "license" && section !== "dev" && section !== "reset" ? (
        <div className="shrink-0 border-t border-slate-200/80 bg-white/90 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {dirty ? "هناك تغييرات لم تُحفظ بعد. اضغط حفظ لتثبيتها، أو تراجع لإلغائها." : "لا توجد تغييرات جديدة."}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={!dirty || saving} onClick={revert}>
              تراجع
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              <Save size={15} />
              {saving ? "جاري الحفظ…" : "حفظ الإعدادات"}
            </Button>
          </div>
        </div>
      ) : null}
      <SuccessPopup
        open={savedOpen}
        title="تم الحفظ"
        message="تم حفظ إعداداتك بنجاح"
        onDone={() => setSavedOpen(false)}
      />
    </div>
  );
}

function Block({
  title,
  hint,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  hint?: string;
  icon?: typeof HardDrive;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl bg-white border border-slate-200/70 shadow-sm overflow-hidden", className)}>
      <div className="px-5 pt-4 flex items-start gap-3">
        {Icon ? (
          <div className="mt-0.5 h-9 w-9 rounded-xl bg-slate-50 text-rose-700 border border-slate-100 grid place-items-center shrink-0">
            <Icon size={16} strokeWidth={2.1} />
          </div>
        ) : null}
        <div className="min-w-0 pb-3">
          <h2 className="font-bold text-[13px] text-slate-800 tracking-tight">{title}</h2>
          {hint ? <p className="text-xs text-slate-500 mt-1 leading-5">{hint}</p> : null}
        </div>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}

function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return (
    <div className={cols === 3 ? "grid sm:grid-cols-2 xl:grid-cols-3 gap-4" : "grid md:grid-cols-2 gap-4"}>
      {children}
    </div>
  );
}

function joinParts(sep: string, ...xs: Array<string | undefined>) {
  return xs.map((x) => (x || "").trim()).filter(Boolean).join(sep);
}

function storeAddressLine(s: Record<string, string>) {
  return joinParts("، ", s["store.address"], s["store.district"], s["store.city"]);
}

function storePhoneLine(s: Record<string, string>) {
  return joinParts(" · ", s["store.phone"], s["store.phone2"]);
}

function storeTaxLine(s: Record<string, string>) {
  const tax = (s["store.tax_number"] || "").trim();
  const cr = (s["store.commercial_register"] || "").trim();
  return joinParts(" · ", tax, cr ? `س.ت ${cr}` : "");
}

const GOVERNORATES = [
  "القاهرة",
  "الجيزة",
  "الإسكندرية",
  "القليوبية",
  "بورسعيد",
  "السويس",
  "الإسماعيلية",
  "دمياط",
  "الدقهلية",
  "الشرقية",
  "الغربية",
  "المنوفية",
  "البحيرة",
  "كفر الشيخ",
  "الفيوم",
  "بني سويف",
  "المنيا",
  "أسيوط",
  "سوهاج",
  "قنا",
  "الأقصر",
  "أسوان",
  "البحر الأحمر",
  "الوادي الجديد",
  "مطروح",
  "شمال سيناء",
  "جنوب سيناء",
];

function Label({ text, children }: { text: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-bold text-slate-500">{text}</span>
      {children}
    </label>
  );
}

function ToggleGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-slate-100">{children}</div>;
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
  compact,
  icon: Icon,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
  icon?: typeof HardDrive;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4",
        compact ? "py-2" : "py-3.5 first:pt-0.5 last:pb-0.5",
        disabled && "opacity-45",
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        {Icon ? (
          <span
            className={cn(
              "mt-0.5 h-9 w-9 rounded-xl grid place-items-center shrink-0 border",
              checked ? "bg-rose-50 text-rose-700 border-rose-100" : "bg-slate-50 text-slate-400 border-slate-100",
            )}
          >
            <Icon size={15} />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="font-semibold text-sm text-slate-800 leading-5">{label}</div>
          {hint ? <div className="text-xs text-slate-500 mt-1 leading-5">{hint}</div> : null}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-rose-600" : "bg-slate-300")}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all",
            checked ? "start-[22px]" : "start-0.5",
          )}
        />
      </button>
    </div>
  );
}

function Choice({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-right rounded-2xl border transition",
        active
          ? "bg-rose-50/80 border-rose-200 ring-1 ring-rose-100 shadow-sm"
          : "bg-white border-slate-200 hover:border-rose-200 hover:bg-slate-50/70",
        className,
      )}
    >
      {children}
    </button>
  );
}

function ThemePreview({ mode }: { mode: ThemeMode }) {
  if (mode === "dark") {
    return (
      <div className="h-[72px] rounded-xl overflow-hidden border border-slate-700 bg-[#1a1418]">
        <div className="h-3 bg-[#241c20] flex items-center gap-1 px-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
        </div>
        <div className="flex h-[60px]">
          <div className="w-5 bg-[#4a1426]" />
          <div className="flex-1 p-1.5 space-y-1">
            <div className="h-1.5 w-10 rounded bg-white/10" />
            <div className="h-8 rounded-md bg-[#241c20] border border-white/5" />
          </div>
        </div>
      </div>
    );
  }
  if (mode === "system") {
    return (
      <div className="h-[72px] rounded-xl overflow-hidden border border-slate-200 relative">
        <div className="absolute inset-0 flex">
          <div className="w-1/2 bg-[#f4f6fa]" />
          <div className="w-1/2 bg-[#1a1418]" />
        </div>
        <div className="relative h-3 flex">
          <div className="w-1/2 bg-white/90 border-b border-slate-100" />
          <div className="w-1/2 bg-[#241c20]" />
        </div>
        <div className="relative flex h-[60px]">
          <div className="w-5 bg-rose-800" />
          <div className="flex-1 p-1.5">
            <div className="h-8 rounded-md bg-white/30 border border-white/20" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="h-[72px] rounded-xl overflow-hidden border border-slate-200 bg-[#f4f6fa]">
      <div className="h-3 bg-white border-b border-slate-100 flex items-center gap-1 px-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
      </div>
      <div className="flex h-[60px]">
        <div className="w-5 bg-rose-800" />
        <div className="flex-1 p-1.5 space-y-1">
          <div className="h-1.5 w-10 rounded bg-slate-200" />
          <div className="h-8 rounded-md bg-white border border-slate-100" />
        </div>
      </div>
    </div>
  );
}

function AppearancePanel({
  s,
  set,
}: {
  s: Record<string, string>;
  set: Setter;
}) {
  const mode = normalizeTheme(s["ui.theme"]);
  const options: { id: ThemeMode; title: string; desc: string }[] = [
    { id: "light", title: "فاتح", desc: "مناسب لإضاءة المتجر القوية" },
    { id: "dark", title: "ليلي", desc: "أخف على العين في الإضاءة الخافتة" },
    { id: "system", title: "تلقائي", desc: "يتبع مظهر ويندوز الحالي" },
  ];
  const font = s["ui.font_size"] || "13";
  const shape = s["ui.nav_shape"] || "rounded";
  const accent = s["ui.accent"] || "rose";
  return (
    <div className="space-y-5">
      <Block title="وضع العرض" hint="يمكنك التبديل أيضاً من أيقونة القمر أو الشمس في الشريط العلوي. الاختيار يُحفظ على هذا الجهاز." icon={Monitor}>
        <div className="grid sm:grid-cols-3 gap-3">
          {options.map((o) => {
            const active = mode === o.id;
            return (
              <Choice key={o.id} active={active} onClick={() => set("ui.theme", o.id, true)} className="p-3">
                <ThemePreview mode={o.id} />
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-sm text-slate-800">{o.title}</div>
                    <p className="text-xs text-slate-500 mt-1 leading-5">{o.desc}</p>
                  </div>
                  {active ? (
                    <span className="h-5 w-5 rounded-full bg-rose-700 text-white grid place-items-center shrink-0 mt-0.5">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  ) : (
                    <span className="h-5 w-5 rounded-full border border-slate-200 shrink-0 mt-0.5" />
                  )}
                </div>
              </Choice>
            );
          })}
        </div>
      </Block>
      <Block title="حجم العرض" hint="حرّك الشريط لتصغير أو تكبير كل واجهة البرنامج. الحجم يتأقلم مع مقاس الشاشة حتى لا يُقص المحتوى." icon={Type}>
        <FontScaleSlider value={font} onChange={(v) => set("ui.font_size", v, true)} />
      </Block>
      <div className="grid lg:grid-cols-2 gap-5">
        <Block title="شكل القوائم" hint="زوايا عناصر الشريط الجانبي." icon={PanelRight}>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["rounded", "مستدير", "12px"],
                ["pill", "حبة", "999px"],
                ["square", "مربع", "6px"],
              ] as const
            ).map(([id, label, radius]) => {
              const active = shape === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => set("ui.nav_shape", id, true)}
                  className={cn(
                    "rounded-xl border p-2.5 text-center transition",
                    active ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50/50 hover:border-rose-200",
                  )}
                >
                  <div className="h-8 bg-rose-800/90" style={{ borderRadius: radius }} />
                  <div className="text-[11px] font-bold text-slate-700 mt-2">{label}</div>
                </button>
              );
            })}
          </div>
        </Block>
        <Block title="اللون الرئيسي" hint="العناصر البارزة وشريط التنقل." icon={Palette}>
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                ["rose", "وردي", "#9b2c4d"],
                ["gold", "ذهبي", "#c4a265"],
                ["emerald", "أخضر", "#047857"],
                ["navy", "كحلي", "#1d4ed8"],
              ] as const
            ).map(([id, label, color]) => {
              const active = accent === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => set("ui.accent", id, true)}
                  className="flex flex-col items-center gap-1.5 group"
                >
                  <span
                    className={cn(
                      "h-11 w-11 rounded-full grid place-items-center ring-2 ring-offset-2 transition",
                      active ? "ring-slate-800" : "ring-transparent group-hover:ring-slate-200",
                    )}
                    style={{ background: color }}
                  >
                    {active ? <Check size={16} className="text-white" strokeWidth={3} /> : null}
                  </span>
                  <span className={cn("text-[11px] font-bold", active ? "text-slate-800" : "text-slate-500")}>{label}</span>
                </button>
              );
            })}
          </div>
        </Block>
      </div>
    </div>
  );
}

function BackupPanel({
  s,
  set,
}: {
  s: Record<string, string>;
  set: Setter;
}) {
  const push = useToasts((x) => x.push);
  const autoOn =
    s["backup.auto_on_close"] !== "0" ||
    s["backup.auto_on_start"] !== "0" ||
    s["backup.on_exit"] !== "0" ||
    (s["backup.interval_minutes"] || "360") !== "0";
  const [info, setInfo] = useState<Info | null>(null);
  const [health, setHealth] = useState<DbHealth | null>(null);
  const [rows, setRows] = useState<BackupRow[]>([]);
  const [busy, setBusy] = useState<
    "backup" | "saveas" | "restore" | "emergency" | "maintain" | "verify" | "delete" | null
  >(null);
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restorePct, setRestorePct] = useState(0);
  const [restoreLabel, setRestoreLabel] = useState("جاري استعادة النسخة");
  const [restoreDone, setRestoreDone] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [jobKind, setJobKind] = useState<"backup" | "restore">("restore");
  const [jobSuccess, setJobSuccess] = useState(
    "عادت بيانات البرنامج من النسخة الاحتياطية. أعد فتح البرنامج إذا لزم.",
  );
  const [deleteRow, setDeleteRow] = useState<BackupRow | null>(null);
  const [deletedOpen, setDeletedOpen] = useState(false);
  const [copied, setCopied] = useState<"dir" | "db" | null>(null);

  const load = async () => {
    const [nextInfo, nextRows, nextHealth] = await Promise.all([
      cmd<Info>("app_info").catch(() => null),
      cmd<BackupRow[]>("list_backups").catch(() => [] as BackupRow[]),
      cmd<DbHealth>("db_health").catch(() => null),
    ]);
    if (nextInfo) setInfo(nextInfo);
    if (nextHealth) setHealth(nextHealth);
    setRows(nextRows);
  };

  useEffect(() => {
    void load();
  }, []);

  const last = rows.find((r) => r.exists) || rows[0];
  const keepDaily = s["backup.keep_daily"] || "10";
  const keepWeekly = s["backup.keep_weekly"] || "4";
  const keepMonthly = s["backup.keep_monthly"] || "12";
  const interval = s["backup.interval_minutes"] || "360";
  const customDir = (s["backup.dir"] || "").trim();
  const healthy = health?.ok !== false && !health?.warning && !health?.dirtyShutdown;

  async function waitPaint() {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 40));
  }

  async function runWithProgress(
    eventName: "backup-progress" | "backup-restore-progress",
    work: () => Promise<void>,
  ) {
    await waitPaint();
    let gotEvent = false;
    let stopListen: (() => void) | undefined;
    const creep = window.setInterval(() => {
      if (gotEvent) return;
      setRestorePct((p) => (p < 90 ? p + 3 : p));
    }, 220);
    try {
      const { listen } = await import("@tauri-apps/api/event");
      stopListen = await listen<{ pct: number; label: string }>(eventName, (e) => {
        gotEvent = true;
        setRestorePct(e.payload.pct);
        if (e.payload.label) setRestoreLabel(e.payload.label);
      });
    } catch {
      /* browser preview without tauri events */
    }
    try {
      await work();
      setRestorePct(100);
      setRestoreDone(true);
    } catch (e) {
      setRestoreError((e as Error).message);
    } finally {
      window.clearInterval(creep);
      stopListen?.();
      setBusy(null);
    }
  }

  function openJobOverlay(
    kind: "backup" | "restore",
    label: string,
    successMessage: string,
  ) {
    setJobKind(kind);
    setJobSuccess(successMessage);
    setRestoreDone(false);
    setRestoreError(null);
    setRestorePct(4);
    setRestoreLabel(label);
    setRestoreOpen(true);
  }

  async function runBackup(pickPath: boolean) {
    setBusy(pickPath ? "saveas" : "backup");
    try {
      const dest = pickPath ? await cmd<string | null>("pick_backup_path", { save: true }) : null;
      if (pickPath && !dest) {
        setBusy(null);
        return;
      }
      const successMessage = pickPath
        ? "تم حفظ النسخة في المكان الذي اخترته"
        : "تم إنشاء نسخة احتياطية في مجلد النسخ";
      openJobOverlay("backup", "جاري أخذ النسخة", successMessage);
      await runWithProgress("backup-progress", async () => {
        await cmd<string>("backup_now", { dest });
        setRestoreLabel("تم حفظ النسخة");
        await load();
      });
    } catch (e) {
      setBusy(null);
      setRestoreOpen(false);
      push("err", (e as Error).message);
    }
  }

  async function pickRestore() {
    try {
      const path = await cmd<string | null>("pick_backup_path", { save: false });
      if (path) setRestorePath(path);
    } catch (e) {
      push("err", (e as Error).message);
    }
  }

  async function confirmRestore() {
    if (!restorePath) return;
    const path = restorePath;
    setRestorePath(null);
    setBusy("restore");
    openJobOverlay(
      "restore",
      "جاري استعادة النسخة",
      "عادت بيانات البرنامج من النسخة الاحتياطية. أعد فتح البرنامج إذا لزم.",
    );
    await runWithProgress("backup-restore-progress", async () => {
      await cmd("restore_backup", { path, overridePin: null });
      setRestoreLabel("اكتملت الاستعادة");
      await load();
    });
  }

  async function confirmDelete() {
    if (!deleteRow) return;
    setBusy("delete");
    try {
      await cmd("delete_backup", { id: deleteRow.id });
      setDeleteRow(null);
      setDeletedOpen(true);
      await load();
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function copyPath(text: string | undefined, key: "dir" | "db") {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      push("err", "تعذر نسخ المسار");
    }
  }

  async function runEmergency() {
    setBusy("emergency");
    openJobOverlay("backup", "جاري أخذ النسخة", "تم إنشاء نسخة طوارئ");
    await runWithProgress("backup-progress", async () => {
      await cmd<string>("emergency_backup");
      setRestoreLabel("تم حفظ النسخة");
      await load();
    });
  }

  async function runMaintain() {
    setBusy("maintain");
    try {
      await cmd("run_db_maintenance");
      push("ok", "اكتملت صيانة قاعدة البيانات");
      await load();
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function verifyOne(path: string) {
    setBusy("verify");
    try {
      await cmd<string>("verify_backup_file", { path });
      push("ok", "النسخة سليمة وقابلة للاستعادة");
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function pickFolder() {
    try {
      const folder = await cmd<string | null>("pick_backup_folder");
      if (!folder) return;
      set("backup.dir", folder, true);
      push("ok", "تم تغيير مجلد النسخ. يُفضَّل أن يكون على قرص مختلف عن قاعدة البيانات.");
      await load();
    } catch (e) {
      push("err", (e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <section
        className={`relative overflow-hidden rounded-2xl border p-5 ${
          autoOn ? "bg-rose-800 border-rose-800 text-white" : "bg-white border-amber-200"
        }`}
      >
        <div
          className={`pointer-events-none absolute -left-8 -top-10 h-36 w-36 rounded-full ${
            autoOn ? "bg-white/5" : "bg-amber-100/80"
          }`}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`h-12 w-12 shrink-0 rounded-2xl grid place-items-center ${
                autoOn ? "bg-white/15 text-gold-light" : "bg-amber-100 text-amber-700"
              }`}
            >
              {autoOn ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
            </div>
            <div className="min-w-0">
              <div className={`text-base font-bold ${autoOn ? "text-white" : "text-slate-800"}`}>
                {autoOn ? "بيانات المتجر محمية" : "النسخ التلقائي غير مفعّل"}
              </div>
              <p className={`text-sm mt-1 leading-6 ${autoOn ? "text-rose-100" : "text-slate-500"}`}>
                {autoOn
                  ? "نسخة كاملة: قاعدة البيانات والشعار والصور والترخيص وكل ملفات البرنامج. عند التشغيل والإغلاق والوردية، بالإضافة إلى النسخ الدورية واليدوية."
                  : "فعّل النسخ التلقائي حتى لا تضيع بيانات آخر يوم عمل."}
              </p>
              <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${autoOn ? "text-rose-100/90" : "text-slate-500"}`}>
                <span>
                  آخر نسخة:{" "}
                  <strong className={autoOn ? "text-white" : "text-slate-700"}>
                    {last ? formatBackupWhen(last.createdAt) : "لا توجد بعد"}
                  </strong>
                </span>
                <span>
                  النسخ المحفوظة:{" "}
                  <strong className={autoOn ? "text-white" : "text-slate-700"}>{rows.length}</strong>
                </span>
              </div>
            </div>
          </div>
          <span
            className={`h-8 px-3 rounded-full text-xs font-bold inline-flex items-center gap-1.5 ${
              autoOn ? "bg-white/15 text-gold-light" : "bg-amber-100 text-amber-800"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${autoOn ? "bg-emerald-300" : "bg-amber-500"}`} />
            {autoOn ? "تلقائي مفعّل" : "يدوي فقط"}
          </span>
        </div>
      </section>

      <section className="rounded-2xl bg-white border border-slate-200/70 shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-start gap-3">
          <div className="mt-0.5 h-9 w-9 rounded-xl bg-slate-50 text-rose-700 border border-slate-100 grid place-items-center shrink-0">
            <Database size={16} strokeWidth={2.1} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-[13px] text-slate-800 tracking-tight">حالة قاعدة البيانات</h2>
              <span
                className={`h-6 px-2 rounded-full text-[10px] font-bold inline-flex items-center gap-1.5 border ${
                  healthy
                    ? "bg-emerald-50 text-emerald-800 border-emerald-100"
                    : "bg-amber-50 text-amber-800 border-amber-100"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${healthy ? "bg-emerald-500" : "bg-amber-500"}`} />
                {healthy ? "سليمة" : "تحتاج متابعة"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 leading-5">
              {healthy
                ? "القاعدة تعمل بشكل طبيعي. المزامنة كاملة والمفاتيح الأجنبية مفعّلة."
                : "تم فحص القاعدة وهي تعمل. راجع التنبيه أدناه ثم شغّل الصيانة إذا رغبت."}
            </p>
          </div>
          <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => void runMaintain()}>
            <RefreshCw size={14} className={busy === "maintain" ? "animate-spin" : ""} />
            {busy === "maintain" ? "جاري الفحص…" : "صيانة"}
          </Button>
        </div>

        {!healthy ? (
          <div className="mx-5 mb-3 rounded-xl bg-amber-50/70 border border-amber-100 px-3.5 py-2.5 text-xs text-amber-900 leading-5 flex gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              {health?.warning ||
                "الإغلاق السابق لم يكن سليماً. تم فحص القاعدة وهي تعمل — لم يُفقد شيء تلقائياً."}
            </span>
          </div>
        ) : null}

        <div className="px-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-xl overflow-hidden border border-slate-100 bg-slate-100">
            {(
              [
                ["الحجم", formatBytes(health?.dbSizeBytes || info?.dbSizeBytes || 0)],
                ["WAL", formatBytes(health?.walSizeBytes || info?.walSizeBytes || 0)],
                ["SQLite", health?.sqliteVersion || info?.sqliteVersion || "—"],
                ["المخطط", health ? String(health.schemaVersion) : "—"],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="bg-slate-50/90 px-4 py-3 min-w-0">
                <div className="text-[10px] font-semibold text-slate-400 mb-1">{k}</div>
                <div className="text-sm font-bold text-slate-800 truncate" dir="ltr" title={v}>
                  {v}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 h-10 rounded-xl border border-slate-100 bg-slate-50/70 px-3 flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 shrink-0">المسار</span>
            <span
              className="min-w-0 flex-1 truncate text-xs text-slate-600"
              dir="ltr"
              title={info?.dbPath || health?.path}
            >
              {info?.dbPath || health?.path || "—"}
            </span>
            <button
              type="button"
              onClick={() => void copyPath(info?.dbPath || health?.path, "db")}
              className="h-7 w-7 shrink-0 rounded-lg grid place-items-center text-slate-500 hover:bg-white hover:text-rose-700"
              title="نسخ المسار"
            >
              {copied === "db" ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {(
              [
                ["التسجيل", (health?.journalMode || "wal").toUpperCase()],
                ["المزامنة", (health?.synchronous || "FULL").toUpperCase()],
                ["المفاتيح الأجنبية", health?.foreignKeys ? "مفعّلة" : "—"],
              ] as const
            ).map(([k, v]) => (
              <span
                key={k}
                className="h-7 px-2.5 rounded-lg bg-slate-50 border border-slate-100 text-[11px] font-semibold text-slate-600 inline-flex items-center gap-1.5"
              >
                <span className="text-slate-400 font-medium">{k}</span>
                <span className="text-slate-800">{v}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 px-5 py-3 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
          <span>
            آخر فحص سلامة{" "}
            <strong className="text-slate-600 font-semibold">
              {health?.lastIntegrityAt ? formatBackupWhen(health.lastIntegrityAt) : "—"}
            </strong>
          </span>
          <span>
            آخر نسخة ناجحة{" "}
            <strong className="text-slate-600 font-semibold">
              {health?.lastBackupAt
                ? formatBackupWhen(health.lastBackupAt)
                : last
                  ? formatBackupWhen(last.createdAt)
                  : "—"}
            </strong>
          </span>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="rounded-2xl bg-white border border-slate-200/70 shadow-sm p-5 flex flex-col">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-slate-50 text-rose-700 border border-slate-100 grid place-items-center shrink-0">
              <Download size={18} />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-800">إنشاء نسخة جديدة</h2>
              <p className="text-xs text-slate-500 mt-1 leading-5">
                النسخة تشمل كل شيء داخل البرنامج: المبيعات والمخزون والعملاء والإعدادات والشعار والصور والترخيص. لا يُترك شيء خارج الأرشيف.
              </p>
            </div>
          </div>
          <div className="mt-auto flex flex-col gap-2">
            <Button size="lg" className="w-full justify-center" disabled={!!busy} onClick={() => void runBackup(false)}>
              <Download size={16} />
              {busy === "backup" ? "جاري إنشاء النسخة…" : "نسخ احتياطي الآن"}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="w-full justify-center"
              disabled={!!busy}
              onClick={() => void runBackup(true)}
            >
              {busy === "saveas" ? "جاري الحفظ…" : "حفظ نسخة في مكان آخر…"}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="w-full justify-center"
              disabled={!!busy}
              onClick={() => void runEmergency()}
            >
              <Shield size={16} />
              {busy === "emergency" ? "جاري نسخة الطوارئ…" : "نسخة طوارئ"}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl bg-white border border-slate-200/70 shadow-sm p-5 flex flex-col">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-slate-50 text-rose-700 border border-slate-100 grid place-items-center shrink-0">
              <Upload size={18} />
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-800">استعادة نسخة</h2>
              <p className="text-xs text-slate-500 mt-1 leading-5">
                تستعيد قاعدة البيانات مع الشعار والصور والترخيص وكل ملفات البرنامج. تُأخذ نسخة أمان تلقائياً من الوضع الحالي أولاً.
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-danger/5 border border-danger/10 px-3 py-2.5 text-xs text-danger leading-5 mb-4 flex gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            لا يمكن التراجع بعد الاستعادة إلا من نسخة أخرى. تأكد من اختيار الملف الصحيح.
          </div>
          <Button
            variant="danger"
            size="lg"
            className="w-full justify-center mt-auto"
            disabled={!!busy}
            onClick={() => void pickRestore()}
          >
            <Upload size={16} />
            اختيار ملف واستعادة
          </Button>
        </section>
      </div>

      <section className="rounded-2xl bg-white border border-slate-200/70 shadow-sm p-5">
        <h2 className="font-bold text-sm text-slate-800 mb-1">الجدولة والاحتفاظ</h2>
        <p className="text-xs text-slate-500 mb-4 leading-5">
          النسخ تُحفظ في daily / weekly / monthly / emergency. يُفضَّل مجلد على قرص مختلف عن قاعدة البيانات.
        </p>
        <Toggle
          label="نسخ عند تشغيل البرنامج"
          hint="مرة واحدة في اليوم إذا لم توجد نسخة لنفس اليوم"
          checked={s["backup.auto_on_start"] !== "0"}
          onChange={(v) => set("backup.auto_on_start", v ? "1" : "0", true)}
        />
        <Toggle
          label="نسخ عند إغلاق البرنامج"
          hint="بعد إغلاق النافذة بشكل طبيعي، مع دمج WAL أولاً"
          checked={s["backup.on_exit"] !== "0"}
          onChange={(v) => set("backup.on_exit", v ? "1" : "0", true)}
        />
        <Toggle
          label="نسخ احتياطي عند إغلاق الوردية"
          hint="يُنشئ نسخة تلقائياً بعد إغلاق الصندوق في نهاية اليوم"
          checked={s["backup.auto_on_close"] !== "0"}
          onChange={(v) => set("backup.auto_on_close", v ? "1" : "0", true)}
        />
        <Toggle
          label="نسخة طوارئ قبل تحديث قاعدة البيانات"
          checked={s["backup.before_migrate"] !== "0"}
          onChange={(v) => set("backup.before_migrate", v ? "1" : "0", true)}
        />
        <Toggle
          label="فحص سلامة كامل عند التشغيل"
          hint="أبطأ قليلاً وأأمن. يُنفَّذ أيضاً بعد إغلاق غير سليم"
          checked={s["db.integrity_on_start"] !== "0"}
          onChange={(v) => set("db.integrity_on_start", v ? "1" : "0", true)}
        />
        <div className="grid md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
          <Label text="التكرار أثناء التشغيل">
            <Select value={interval} onChange={(e) => set("backup.interval_minutes", e.target.value, true)}>
              <option value="0">إيقاف الدوري</option>
              <option value="60">كل ساعة</option>
              <option value="360">كل 6 ساعات</option>
              <option value="1440">مرة يومياً</option>
            </Select>
          </Label>
          <Label text="يومي / أسبوعي / شهري">
            <div className="grid grid-cols-3 gap-2">
              <Select value={keepDaily} onChange={(e) => set("backup.keep_daily", e.target.value, true)}>
                {[...new Set(["5", "10", "14", "30", keepDaily])].map((n) => (
                  <option key={n} value={n}>
                    {n} يومي
                  </option>
                ))}
              </Select>
              <Select value={keepWeekly} onChange={(e) => set("backup.keep_weekly", e.target.value, true)}>
                {[...new Set(["2", "4", "8", keepWeekly])].map((n) => (
                  <option key={n} value={n}>
                    {n} أسبوعي
                  </option>
                ))}
              </Select>
              <Select value={keepMonthly} onChange={(e) => set("backup.keep_monthly", e.target.value, true)}>
                {[...new Set(["6", "12", "24", keepMonthly])].map((n) => (
                  <option key={n} value={n}>
                    {n} شهري
                  </option>
                ))}
              </Select>
            </div>
          </Label>
          <div className="min-w-0 md:col-span-2">
            <div className="text-xs font-semibold text-slate-600 mb-2">مجلد النسخ</div>
            <div className="h-[38px] rounded-lg border border-line bg-slate-50 px-2.5 flex items-center gap-2">
              <Folder size={15} className="text-slate-400 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-xs text-slate-600" dir="ltr" title={info?.backupsDir}>
                {info?.backupsDir || "—"}
              </span>
              <button
                type="button"
                onClick={() => void copyPath(info?.backupsDir, "dir")}
                className="h-7 w-7 shrink-0 rounded-lg grid place-items-center text-slate-500 hover:bg-white hover:text-rose-700"
                title="نسخ المسار"
              >
                {copied === "dir" ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => void pickFolder()}>
                تغيير المجلد…
              </Button>
              {customDir ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!!busy}
                  onClick={() => {
                    set("backup.dir", "", true);
                    void load();
                  }}
                >
                  المجلد الافتراضي
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white border border-slate-200/70 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-sm text-slate-800">النسخ المحفوظة</h2>
            <p className="text-xs text-slate-500 mt-0.5">أحدث النسخ على هذا الجهاز. يمكن استعادة أي نسخة ما زال ملفها موجوداً.</p>
          </div>
          <span className="h-7 px-2.5 rounded-full bg-slate-50 border border-slate-100 text-xs font-semibold text-slate-500">
            {rows.length} نسخة
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="py-14 px-5 text-center">
            <div className="h-12 w-12 rounded-2xl bg-slate-50 text-slate-400 grid place-items-center mx-auto mb-3">
              <HardDrive size={22} />
            </div>
            <div className="font-semibold text-sm text-slate-700">لا توجد نسخ بعد</div>
            <p className="text-xs text-slate-500 mt-1">أنشئ أول نسخة من الزر أعلاه للاحتفاظ ببيانات المتجر.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((r) => (
              <div key={r.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50/70">
                <div
                  className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${
                    r.exists ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <HardDrive size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-slate-800">{formatBackupWhen(r.createdAt)}</span>
                    <span className="h-5 px-1.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">
                      {kindLabel(r.kind)}
                    </span>
                    {r.slot ? (
                      <span className="h-5 px-1.5 rounded-md bg-slate-50 text-[10px] font-bold text-slate-400">
                        {r.slot}
                      </span>
                    ) : null}
                    {!r.exists ? (
                      <span className="h-5 px-1.5 rounded-md bg-amber-50 text-[10px] font-bold text-amber-700">
                        الملف غير موجود
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate" dir="ltr" title={r.path}>
                    {r.fileName}
                    {r.sizeBytes ? ` · ${formatBytes(r.sizeBytes)}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!busy || !r.exists}
                    onClick={() => void verifyOne(r.path)}
                  >
                    تحقق
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!busy || !r.exists}
                    onClick={() => setRestorePath(r.path)}
                  >
                    استعادة
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!!busy}
                    onClick={() => setDeleteRow(r)}
                  >
                    <Trash2 size={14} />
                    حذف
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Confirm
        open={!!restorePath}
        title="استعادة نسخة احتياطية"
        body="سيتم أخذ نسخة طوارئ من الوضع الحالي، ثم استعادة الملف إلى نسخة مؤقتة والتحقق منها قبل استبدال القاعدة. لا يمكن التراجع إلا من النسخ الأخرى."
        danger
        onClose={() => {
          if (busy === "restore") return;
          setRestorePath(null);
        }}
        onConfirm={() => void confirmRestore()}
      />
      <Confirm
        open={!!deleteRow}
        title="حذف النسخة الاحتياطية"
        body={
          deleteRow
            ? `سيتم حذف «${deleteRow.fileName}» من الجهاز ومن القائمة. لا يمكن التراجع عن الحذف.`
            : ""
        }
        danger
        onClose={() => {
          if (busy === "delete") return;
          setDeleteRow(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
      <SuccessPopup
        open={deletedOpen}
        title="تم حذف النسخة الاحتياطية"
        message="أُزيلت النسخة من الجهاز ومن القائمة."
        onDone={() => setDeletedOpen(false)}
      />
      <RestoreProgressPopup
        open={restoreOpen}
        pct={restorePct}
        label={restoreLabel}
        done={restoreDone}
        error={restoreError}
        workingTitle={jobKind === "backup" ? "جاري أخذ النسخة" : "جاري استعادة النسخة"}
        successTitle={jobKind === "backup" ? "تم حفظ النسخة" : "تمت الاستعادة بنجاح"}
        successMessage={jobSuccess}
        errorTitle={jobKind === "backup" ? "تعذر أخذ النسخة" : "تعذرت الاستعادة"}
        onClose={() => {
          setRestoreOpen(false);
          setRestoreDone(false);
          setRestoreError(null);
          setRestorePct(0);
        }}
      />
    </div>
  );
}

function kindLabel(kind: string) {
  const map: Record<string, string> = {
    manual: "يدوي",
    startup: "عند التشغيل",
    periodic: "دوري",
    exit: "عند الإغلاق",
    emergency: "طوارئ",
    "pre-restore": "قبل الاستعادة",
    "pre-migrate": "قبل التحديث",
    "pre-import": "قبل الاستيراد",
    "shift-close": "إغلاق وردية",
  };
  return map[kind] || kind;
}

function formatBackupWhen(iso: string) {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso.replace("T", " ");
  return d.toLocaleString("ar-EG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`;
  return `${(n / (1024 * 1024)).toFixed(1)} م.ب`;
}

function SidebarPanel({
  s,
  set,
}: {
  s: Record<string, string>;
  set: Setter;
}) {
  const t = useT();
  const width = Number(s["nav.width"] || 252);
  const color = s["nav.color"] || "rose";
  const colors: { id: string; title: string; desc: string; swatch: string; ring?: string }[] = [
    { id: "white", title: "أبيض", desc: "واضح ونهاري", swatch: "#ffffff", ring: "#cbd5e1" },
    {
      id: "glass",
      title: "شفاف",
      desc: "زجاجي خفيف",
      swatch:
        "linear-gradient(135deg, rgba(255,255,255,.72), rgba(241,245,249,.4)), repeating-conic-gradient(#e2e8f0 0% 25%, #fff 0% 50%)",
    },
    { id: "rose", title: "وردي", desc: "لون المتجر", swatch: "#4a1426" },
    { id: "slate", title: "رمادي", desc: "هادئ", swatch: "#334155" },
    { id: "gold", title: "ذهبي", desc: "فاخر", swatch: "#6b5424" },
    { id: "navy", title: "كحلي", desc: "رسمي", swatch: "#1e3a5f" },
  ];
  return (
    <div className="space-y-5">
      <Block title="لون الشريط" hint="يُطبَّق فوراً على القائمة الجانبية. الأبيض والشفاف الأنسب للوضع النهاري." icon={Palette}>
        <div className="grid sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
          {colors.map((c) => {
            const active = color === c.id;
            return (
              <Choice key={c.id} active={active} onClick={() => set("nav.color", c.id, true)} className="p-2.5">
                <div
                  className="h-12 w-full rounded-xl border border-slate-200/80"
                  style={{
                    background: c.swatch,
                    backgroundSize: c.id === "glass" ? "100% 100%, 10px 10px" : undefined,
                    boxShadow: c.ring ? `inset 0 0 0 1px ${c.ring}` : undefined,
                  }}
                />
                <div className="mt-2 flex items-center justify-between gap-1">
                  <div>
                    <div className="text-sm font-bold text-slate-800">{c.title}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{c.desc}</div>
                  </div>
                  {active ? (
                    <span className="h-5 w-5 rounded-full bg-rose-700 text-white grid place-items-center shrink-0">
                      <Check size={11} strokeWidth={3} />
                    </span>
                  ) : null}
                </div>
                {c.id === "white" || c.id === "glass" ? (
                  <div className="text-[10px] font-semibold text-slate-400 mt-1">موصى به نهاراً</div>
                ) : null}
              </Choice>
            );
          })}
        </div>
      </Block>
      <Block title="عرض الشريط" hint="يمكنك طيّ الشريط من هنا أو من زر السهم أعلى القائمة. نقطة البيع والإعدادات تبقيان ظاهرتين دائماً." icon={PanelRight}>
        <ToggleGroup>
          <Toggle
            label="طي الشريط الجانبي"
            hint="يظهر كشريط أيقونات ضيّق لتوسيع مساحة العمل"
            checked={s["nav.collapsed"] === "1"}
            onChange={(v) => set("nav.collapsed", v ? "1" : "0", true)}
          />
        </ToggleGroup>
        <div className={cn("pt-4", s["nav.collapsed"] === "1" && "opacity-45")}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500">العرض عند التوسيع</span>
            <span className="text-xs font-bold text-slate-700 tabular-nums">{width} بكسل</span>
          </div>
          <input
            type="range"
            min={248}
            max={300}
            value={Math.min(300, Math.max(248, width))}
            onChange={(e) => set("nav.width", e.target.value)}
            className="w-full h-2 accent-rose-700"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>أضيق</span>
            <span>أوسع</span>
          </div>
        </div>
      </Block>
      <Block title="عناصر القائمة" hint="إخفاء تاب من الشريط لا يحذف بياناته. الأقسام تُطوى من الشريط الجانبي نفسه." icon={Settings}>
        <div className="space-y-5">
          {[
            { label: "مثبّتة", items: [...NAV_TOP, ...NAV_BOTTOM] },
            ...NAV_GROUPS.map((g) => ({ label: g.label, items: g.items })),
          ].map((g) => (
            <div key={g.label}>
              <div className="text-[11px] font-bold text-slate-400 mb-1">{g.label}</div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-x-8 rounded-xl bg-slate-50/60 border border-slate-100 px-3">
                {g.items.map((i) => (
                  <Toggle
                    key={i.key}
                    compact
                    label={t.nav[i.key as keyof typeof t.nav]}
                    hint={i.locked ? "لا يمكن إخفاؤه" : undefined}
                    checked={i.locked || s[`nav.show.${i.key}`] !== "0"}
                    disabled={i.locked}
                    onChange={(v) => {
                      if (i.locked) return;
                      set(`nav.show.${i.key}`, v ? "1" : "0", true);
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Block>
    </div>
  );
}

function SalesPanel({
  s,
  set,
}: {
  s: Record<string, string>;
  set: Setter;
}) {
  const rate = (Number(s["tax.rate_bps"] || 0) / 100).toString();
  const cashier = (Number(s["pos.cashier_discount_bps"] || 0) / 100).toString();
  const manager = (Number(s["pos.manager_discount_bps"] || 0) / 100).toString();
  const points = s["loyalty.points_per_100"] || "1";
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Block title="الضريبة" hint="تظهر على الفاتورة إذا كانت مفعّلة وإظهار الضريبة مفعّل في الفواتير." icon={Percent}>
        <ToggleGroup>
          <Toggle label="تفعيل الضريبة" checked={s["tax.enabled"] === "1"} onChange={(v) => set("tax.enabled", v ? "1" : "0", true)} />
          <Toggle
            label="السعر شامل الضريبة"
            hint="إذا كانت الأسعار المعروضة تتضمن الضريبة مسبقاً"
            checked={s["tax.inclusive"] !== "0"}
            onChange={(v) => set("tax.inclusive", v ? "1" : "0", true)}
          />
        </ToggleGroup>
        <div className="pt-4">
          <Label text="نسبة الضريبة %">
            <Input className="h-10" value={rate} onChange={(e) => set("tax.rate_bps", String(Math.round(Number(e.target.value || 0) * 100)))} />
          </Label>
        </div>
      </Block>
      <Block title="الخصومات" icon={Percent}>
        <Grid>
          <Label text="حد خصم الكاشير %">
            <Input className="h-10" value={cashier} onChange={(e) => set("pos.cashier_discount_bps", String(Math.round(Number(e.target.value || 0) * 100)))} />
          </Label>
          <Label text="حد خصم المدير %">
            <Input className="h-10" value={manager} onChange={(e) => set("pos.manager_discount_bps", String(Math.round(Number(e.target.value || 0) * 100)))} />
          </Label>
        </Grid>
      </Block>
      <Block title="نقاط الولاء" icon={Sparkles}>
        <ToggleGroup>
          <Toggle
            label="نظام النقاط"
            hint="احتساب نقاط للعملاء عند الشراء"
            checked={s["loyalty.enabled"] === "1"}
            onChange={(v) => set("loyalty.enabled", v ? "1" : "0", true)}
          />
        </ToggleGroup>
        <div className="pt-4">
          <Label text="نقطة لكل 100 ج.م">
            <Input className="h-10" value={points} onChange={(e) => set("loyalty.points_per_100", e.target.value)} />
          </Label>
        </div>
      </Block>
    </div>
  );
}

function PosScreenPanel({
  s,
  set,
  liveSet,
}: {
  s: Record<string, string>;
  set: Setter;
  liveSet: Setter;
}) {
  const displayMode = s["pos.display_mode"] === "touch" ? "touch" : "standard";
  const modes = [
    {
      id: "standard" as const,
      title: "قياسي",
      desc: "للفأرة ولوحة المفاتيح. صفوف منتجات دقيقة واختصارات لوحة المفاتيح.",
      preview: <PosModePreview mode="standard" active={displayMode === "standard"} />,
    },
    {
      id: "touch" as const,
      title: "شاشة لمس",
      desc: "أزرار أكبر، بطاقات بالشبكة، ولوحة مفاتيح على الشاشة عند الحاجة.",
      preview: <PosModePreview mode="touch" active={displayMode === "touch"} />,
    },
  ];
  return (
    <div className="space-y-5">
      <Block
        title="وضع العرض"
        hint="يغيّر شكل نقطة البيع فقط. السلة والأسعار والمخزون والوردية والطباعة تبقى كما هي، ويُطبَّق فوراً دون إعادة تشغيل."
        icon={Monitor}
      >
        <div className="flex items-center justify-between gap-3 mb-4 rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">
          <div>
            <div className="text-[11px] font-bold text-slate-400">الوضع الحالي</div>
            <div className="text-sm font-black text-slate-800 mt-0.5">
              {displayMode === "touch" ? "شاشة لمس" : "قياسي — فأرة ولوحة مفاتيح"}
            </div>
          </div>
          <span
            className={cn(
              "h-8 px-3 rounded-full text-[11px] font-bold inline-flex items-center gap-1.5",
              displayMode === "touch" ? "bg-rose-700 text-white" : "bg-white text-slate-600 border border-slate-200",
            )}
          >
            {displayMode === "touch" ? <Touchpad size={13} /> : <Monitor size={13} />}
            مفعّل الآن
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {modes.map((m) => {
            const active = displayMode === m.id;
            return (
              <Choice key={m.id} active={active} onClick={() => liveSet("pos.display_mode", m.id)} className="p-3">
                {m.preview}
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-800">{m.title}</div>
                    <p className="text-xs text-slate-500 mt-1 leading-5">{m.desc}</p>
                  </div>
                  {active ? (
                    <span className="h-5 w-5 rounded-full bg-rose-700 text-white grid place-items-center shrink-0 mt-0.5">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  ) : (
                    <span className="h-5 w-5 rounded-full border border-slate-200 shrink-0 mt-0.5" />
                  )}
                </div>
              </Choice>
            );
          })}
        </div>
      </Block>
      <Block title="سلوك نقطة البيع" hint="تنطبق على الوضع القياسي وشاشة اللمس معاً." icon={ShoppingBag}>
        <div className="grid md:grid-cols-3 gap-3">
          <PosBehaviorCard
            icon={UserRound}
            label="عميل إلزامي"
            hint="لا يُتم البيع إلا بعد اختيار عميل"
            checked={s["pos.require_customer"] === "1"}
            onChange={(v) => set("pos.require_customer", v ? "1" : "0", true)}
          />
          <PosBehaviorCard
            icon={Volume2}
            label="صوت عند المسح"
            hint="تنبيه صوتي عند الإضافة أو مسح الباركود"
            checked={s["pos.beep"] !== "0"}
            onChange={(v) => set("pos.beep", v ? "1" : "0", true)}
          />
          <PosBehaviorCard
            icon={Coins}
            label="تقريب النقد"
            hint="تقريب المبلغ النقدي لأقرب قرش"
            checked={s["pos.round_cash"] === "1"}
            onChange={(v) => set("pos.round_cash", v ? "1" : "0", true)}
          />
        </div>
      </Block>
    </div>
  );
}

function PosModePreview({ mode, active }: { mode: "standard" | "touch"; active: boolean }) {
  const touch = mode === "touch";
  return (
    <div
      className={cn(
        "h-[118px] rounded-xl overflow-hidden border",
        active ? "border-rose-200" : "border-slate-200",
      )}
    >
      <div className="h-4 bg-white border-b border-slate-100 flex items-center justify-between px-2">
        <span className="h-1.5 w-10 rounded-full bg-slate-200" />
        <span className={cn("h-1.5 w-6 rounded-full", touch ? "bg-rose-300" : "bg-slate-200")} />
      </div>
      <div className="flex h-[102px] bg-[#f5f7fb]" dir="ltr">
        <div className="w-[38%] bg-white border-r border-slate-100 flex flex-col p-1.5 gap-1">
          <div className="flex items-center justify-between">
            <span className="h-1.5 w-8 rounded bg-rose-200" />
            <span className="h-3 w-6 rounded bg-rose-50" />
          </div>
          <div className={cn("rounded bg-slate-50 border border-slate-100", touch ? "h-7" : "h-4")} />
          <div className={cn("rounded bg-slate-50 border border-slate-100", touch ? "h-7" : "h-4")} />
          <div className="mt-auto h-4 rounded-md bg-emerald-500/80" />
        </div>
        <div className="flex-1 p-1.5 space-y-1">
          <div className={cn("rounded-md bg-white border border-slate-200", touch ? "h-5" : "h-3.5")} />
          {touch ? (
            <div className="grid grid-cols-2 gap-1 pt-0.5">
              <div className="h-9 rounded-md bg-white border border-slate-200" />
              <div className="h-9 rounded-md bg-white border border-slate-200" />
              <div className="h-9 rounded-md bg-rose-50 border border-rose-100" />
              <div className="h-9 rounded-md bg-white border border-slate-200" />
            </div>
          ) : (
            <div className="space-y-1 pt-0.5">
              <div className="h-4 rounded bg-white border border-slate-200" />
              <div className="h-4 rounded bg-white border border-slate-200" />
              <div className="h-4 rounded bg-white border border-slate-200" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PosBehaviorCard({
  icon: Icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: typeof HardDrive;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/40 px-3.5 py-3.5 flex flex-col min-h-[132px]">
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "h-10 w-10 rounded-xl grid place-items-center shrink-0 border",
            checked ? "bg-rose-50 text-rose-700 border-rose-100" : "bg-white text-slate-400 border-slate-200",
          )}
        >
          <Icon size={16} />
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-rose-600" : "bg-slate-300")}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all",
              checked ? "start-[22px]" : "start-0.5",
            )}
          />
        </button>
      </div>
      <div className="font-bold text-sm text-slate-800 mt-3 leading-5">{label}</div>
      <p className="text-xs text-slate-500 mt-1 leading-5">{hint}</p>
    </div>
  );
}

function InventoryPanel({
  s,
  set,
}: {
  s: Record<string, string>;
  set: Setter;
}) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Block title="قواعد الصرف" hint="تحدد كيف يُخصم المخزون عند البيع.">
        <Toggle
          label="السماح بالبيع بالسالب"
          hint="يمكن إتمام البيع حتى لو المخزون غير كافٍ"
          checked={s["inventory.negative_stock"] === "1"}
          onChange={(v) => set("inventory.negative_stock", v ? "1" : "0", true)}
        />
        <Toggle
          label="صرف FEFO"
          hint="الأقرب انتهاءً يُصرف أولاً"
          checked={s["inventory.fefo"] !== "0"}
          onChange={(v) => set("inventory.fefo", v ? "1" : "0", true)}
        />
        <Toggle
          label="منع بيع منتهي الصلاحية"
          checked={s["inventory.block_expired"] !== "0"}
          onChange={(v) => set("inventory.block_expired", v ? "1" : "0", true)}
        />
        <Toggle
          label="إظهار كمية المخزن في نقطة البيع"
          checked={s["inventory.show_wh_qty"] !== "0"}
          onChange={(v) => set("inventory.show_wh_qty", v ? "1" : "0", true)}
        />
        <div className="pt-4">
          <Label text="سياسة المنتجات بدون تاريخ صلاحية">
            <Select
              value={s["inventory.no_expiry_policy"] || "after_dated"}
              onChange={(e) => set("inventory.no_expiry_policy", e.target.value, true)}
            >
              <option value="after_dated">بعد المنتجات المؤرخة</option>
              <option value="before_dated">قبل المنتجات المؤرخة</option>
              <option value="mixed">مخلوط</option>
            </Select>
          </Label>
        </div>
      </Block>
      <Block title="التنبيهات والمرتجعات">
        <Grid>
          <Label text="تنبيه انتهاء الصلاحية قبل (يوم)">
            <Input
              value={s["inventory.expiry_warning_days"] || "90"}
              onChange={(e) => set("inventory.expiry_warning_days", e.target.value)}
            />
          </Label>
          <Label text="أيام الركود للتنبيه">
            <Input value={s["slow_moving.days"] || "60"} onChange={(e) => set("slow_moving.days", e.target.value)} />
          </Label>
        </Grid>
        <div className="pt-4">
          <Label text="سياسة إعادة المرتجع للمخزون">
            <Select
              value={s["inventory.return_restock"] || "original_batch"}
              onChange={(e) => set("inventory.return_restock", e.target.value, true)}
            >
              <option value="original_batch">نفس الدفعة الأصلية</option>
              <option value="new_batch">دفعة جديدة</option>
              <option value="no_restock">بدون إعادة للمخزون</option>
            </Select>
          </Label>
        </div>
      </Block>
    </div>
  );
}

function DeviceStatus({ ok, okText, offText }: { ok: boolean; okText: string; offText: string }) {
  return (
    <span
      className={`h-6 px-2 rounded-full text-[11px] font-bold inline-flex items-center ${
        ok ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {ok ? okText : offText}
    </span>
  );
}

function PrintPanel({
  s,
  set,
  printers,
}: {
  s: Record<string, string>;
  set: Setter;
  printers: { name: string }[];
}) {
  const push = useToasts((x) => x.push);
  const [testing, setTesting] = useState(false);
  const thermal = (s["printer.thermal"] || "").trim();
  const a4 = (s["printer.a4"] || "").trim();
  const drawer = s["printer.cash_drawer"] === "1";
  const scanner = s["scanner.enabled"] !== "0";
  async function testPrint() {
    setTesting(true);
    try {
      await cmd("print_test_page");
      push("ok", "أُرسلت صفحة الاختبار إلى الطابعة الحرارية");
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setTesting(false);
    }
  }
  const options = (
    <>
      <option value="">— غير محددة —</option>
      {printers.map((p) => (
        <option key={p.name} value={p.name}>
          {p.name}
        </option>
      ))}
    </>
  );
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { icon: Printer, title: "حرارية", value: thermal || "غير محددة", ok: !!thermal },
          { icon: FileText, title: "A4 / تقارير", value: a4 || "غير محددة", ok: !!a4 },
          { icon: Landmark, title: "درج النقود", value: drawer ? "متصل" : "غير مفعّل", ok: drawer },
          { icon: ScanLine, title: "قارئ الباركود", value: scanner ? "جاهز" : "متوقف", ok: scanner },
        ].map((d) => {
          const Icon = d.icon;
          return (
            <div key={d.title} className="rounded-2xl bg-white border border-slate-200/70 p-3.5 flex items-center gap-3">
              <div className={cn("h-10 w-10 rounded-xl grid place-items-center shrink-0", d.ok ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-400")}>
                <Icon size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-bold text-slate-800">{d.title}</div>
                  <DeviceStatus ok={d.ok} okText="جاهز" offText="غير معدّ" />
                </div>
                <div className="text-xs text-slate-500 mt-0.5 truncate" title={d.value} dir={d.value.match(/[A-Za-z]/) ? "ltr" : "rtl"}>
                  {d.value}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Block title="الطابعة الحرارية" hint="إيصال البيع السريع عند الكاشير. اختر الطابعة ثم اختبرها قبل الاعتماد عليها." icon={Printer}>
          <ToggleGroup>
            <Toggle
              label="طباعة الإيصال تلقائياً بعد البيع"
              checked={s["pos.auto_print"] !== "0"}
              onChange={(v) => set("pos.auto_print", v ? "1" : "0", true)}
            />
          </ToggleGroup>
          <div className="pt-4 space-y-4">
            <Label text="طابعة الفواتير الحرارية">
              <Select value={thermal} onChange={(e) => set("printer.thermal", e.target.value, true)}>
                {options}
              </Select>
            </Label>
            <Grid>
              <Label text="عرض الإيصال">
                <Select value={s["pos.receipt_width"] || "80"} onChange={(e) => set("pos.receipt_width", e.target.value, true)}>
                  <option value="58">58 مم</option>
                  <option value="80">80 مم</option>
                </Select>
              </Label>
              <Label text="عدد النسخ">
                <Input className="h-10" value={s["pos.copies"] || "1"} onChange={(e) => set("pos.copies", e.target.value)} />
              </Label>
            </Grid>
            <Button variant="secondary" disabled={testing || !thermal} onClick={() => void testPrint()}>
              <Printer size={15} />
              {testing ? "جاري الاختبار…" : "اختبار الطباعة"}
            </Button>
            {!thermal ? <p className="text-xs text-amber-700">اختر طابعة أولاً لإرسال صفحة الاختبار.</p> : null}
          </div>
        </Block>

        <div className="space-y-5">
          <Block title="طابعة A4 والتقارير" icon={FileText}>
            <Label text="طابعة التقارير وA4">
              <Select value={a4} onChange={(e) => set("printer.a4", e.target.value, true)}>
                {options}
              </Select>
            </Label>
            <p className="text-xs text-slate-500 mt-3 leading-5">تُستخدم لفواتير A4 والتقارير التفصيلية، مستقلة عن الإيصال الحراري.</p>
          </Block>
          <Block title="درج النقود" icon={Landmark}>
            <ToggleGroup>
              <Toggle
                label="درج النقود متصل بالطابعة الحرارية"
                hint="يُفتح مع عملية البيع إذا كان الدرج مربوطاً بالطابعة"
                checked={drawer}
                onChange={(v) => set("printer.cash_drawer", v ? "1" : "0", true)}
              />
              <Toggle
                label="فتح الدرج عند إتمام البيع"
                checked={s["printer.drawer_on_sale"] === "1"}
                onChange={(v) => set("printer.drawer_on_sale", v ? "1" : "0", true)}
                disabled={!drawer}
              />
            </ToggleGroup>
          </Block>
          <Block title="قارئ الباركود" icon={ScanLine}>
            <ToggleGroup>
              <Toggle
                label="قارئ الباركود (لوحة مفاتيح)"
                hint="معظم القوارئ تعمل كحقل بحث: امسح الباركود في نقطة البيع"
                checked={scanner}
                onChange={(v) => set("scanner.enabled", v ? "1" : "0", true)}
              />
            </ToggleGroup>
            <div className="pt-4">
              <Label text="مفتاح إنهاء المسح">
                <Select value={s["scanner.suffix"] || "Enter"} onChange={(e) => set("scanner.suffix", e.target.value, true)}>
                  <option value="Enter">Enter</option>
                  <option value="Tab">Tab</option>
                  <option value="None">بدون</option>
                </Select>
              </Label>
            </div>
          </Block>
        </div>
      </div>
    </div>
  );
}

function useLogoSrc(path: string) {
  const [src, setSrc] = useState("");
  const [ready, setReady] = useState(() => !path.trim());
  useEffect(() => {
    const p = path.trim();
    if (!p) {
      setSrc("");
      setReady(true);
      return;
    }
    setReady(false);
    setSrc("");
    let cancelled = false;
    cmd<string | null>("store_logo_src", { path: p })
      .then((url) => {
        if (cancelled) return;
        setSrc(url || "");
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setSrc("");
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return { src, ready };
}

function FakeBarcode({ value }: { value: string }) {
  const bars = [...value].flatMap((ch) => {
    const n = ch.charCodeAt(0);
    return [1 + (n % 3), 1 + ((n >> 2) % 2), 1 + ((n >> 3) % 3)];
  });
  return (
    <div className="flex items-end justify-center h-10 gap-px px-3" aria-hidden>
      {bars.map((w, i) => (
        <span key={i} className="bg-slate-900 h-full rounded-[0.5px]" style={{ width: w }} />
      ))}
    </div>
  );
}

type InvoiceSample = {
  store: string;
  address: string;
  phone: string;
  taxNo: string;
  extra: string;
  logoPath: string;
  showLogo: boolean;
  showTax: boolean;
  showBarcode: boolean;
  taxEnabled: boolean;
  taxInclusive: boolean;
  taxBps: number;
  prefix: string;
  next: string;
  footer: string;
  paper: string;
  items: { name: string; qty: number; price: number }[];
};

function invoiceSample(s: Record<string, string>): InvoiceSample {
  const hours = (s["store.hours"] || "").trim();
  const note = (s["store.invoice_note"] || "").trim();
  return {
    store: (s["store.name"] || "متجر التجميل").trim() || "متجر التجميل",
    address: storeAddressLine(s) || "العنوان يظهر هنا",
    phone: storePhoneLine(s),
    taxNo: storeTaxLine(s),
    extra: joinParts(" · ", hours ? `الدوام: ${hours}` : "", note),
    logoPath: (s["store.logo_path"] || "").trim(),
    showLogo: s["invoice.show_logo"] !== "0",
    showTax: s["invoice.show_tax"] !== "0" && s["tax.enabled"] === "1",
    showBarcode: s["invoice.show_barcode"] === "1",
    taxEnabled: s["tax.enabled"] === "1",
    taxInclusive: s["tax.inclusive"] !== "0",
    taxBps: Number(s["tax.rate_bps"] || 0),
    prefix: (s["invoice.prefix"] || "COS").trim() || "COS",
    next: String(Math.max(1, Number(s["invoice.next_number"] || 1) || 1)).padStart(6, "0"),
    footer: (s["invoice.footer"] || "شكراً لزيارتكم").trim() || "شكراً لزيارتكم",
    paper: s["invoice.paper"] || "80mm",
    items: [
      { name: "كريم أساس Shade 02", qty: 1, price: 35000 },
      { name: "ماسكارا سوداء", qty: 1, price: 18500 },
      { name: "أحمر شفاه وردي", qty: 2, price: 9500 },
    ],
  };
}

function invoiceTotals(sample: InvoiceSample) {
  const subtotal = sample.items.reduce((n, i) => n + i.price * i.qty, 0);
  const rate = sample.taxBps / 10000;
  let tax = 0;
  let grand = subtotal;
  if (sample.showTax && sample.taxBps > 0) {
    if (sample.taxInclusive) {
      tax = Math.round(subtotal - subtotal / (1 + rate));
      grand = subtotal;
    } else {
      tax = Math.round(subtotal * rate);
      grand = subtotal + tax;
    }
  }
  return { subtotal, tax, grand };
}

function InvoiceLogo({ path, name, size }: { path: string; name: string; size: number }) {
  const { src, ready } = useLogoSrc(path);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  if (path && !ready) {
    return (
      <div className="rounded-full bg-slate-100 border border-slate-200" style={{ width: size, height: size }} />
    );
  }
  if (!src || broken) {
    return (
      <div
        className="rounded-full bg-rose-700 text-white grid place-items-center font-black"
        style={{ width: size, height: size, fontSize: size * 0.38 }}
      >
        {name.slice(0, 1)}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="object-contain rounded-full bg-white border border-slate-200"
      style={{ width: size, height: size }}
      onError={() => setBroken(true)}
    />
  );
}

function ReceiptPreview({ sample }: { sample: InvoiceSample }) {
  const { subtotal, tax, grand } = invoiceTotals(sample);
  const number = `${sample.prefix}-${sample.next}`;
  const when = new Date().toLocaleString("ar-EG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const width = sample.paper === "58mm" ? 220 : 280;
  return (
    <div
      className="mx-auto bg-[#fffef8] text-slate-900 shadow-[0_12px_40px_rgba(15,23,42,0.18)] border border-slate-200"
      style={{ width, fontFamily: "Cairo, Tahoma, sans-serif" }}
    >
      <div className="h-2 bg-[repeating-linear-gradient(90deg,#fff_0_8px,transparent_8px_10px)] bg-slate-200" />
      <div className="px-3 py-4 text-center">
        {sample.showLogo ? (
          <div className="flex justify-center mb-2">
            <InvoiceLogo path={sample.logoPath} name={sample.store} size={52} />
          </div>
        ) : null}
        <div className="font-black text-[15px] leading-6">{sample.store}</div>
        {sample.address ? <div className="text-[10px] text-slate-600 mt-1 leading-4">{sample.address}</div> : null}
        {sample.phone ? (
          <div className="text-[10px] text-slate-600" dir="ltr">
            {sample.phone}
          </div>
        ) : null}
        {sample.taxNo ? <div className="text-[10px] text-slate-500 mt-0.5">الرقم الضريبي: {sample.taxNo}</div> : null}
        {sample.extra ? <div className="text-[10px] text-slate-500 mt-0.5 leading-4">{sample.extra}</div> : null}
        <div className="border-t border-dashed border-slate-400 my-3" />
        <div className="flex justify-between text-[10px] font-bold">
          <span>فاتورة {number}</span>
          <span>{when}</span>
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">كاشير: أحمد · نقدي</div>
        <div className="border-t border-dashed border-slate-400 my-3" />
        <div className="text-[10px] font-bold flex justify-between text-slate-500 mb-1">
          <span>الصنف</span>
          <span>المبلغ</span>
        </div>
        {sample.items.map((i) => (
          <div key={i.name} className="mb-1.5 text-right">
            <div className="flex justify-between gap-2 text-[11px] font-semibold">
              <span className="min-w-0 truncate">{i.name}</span>
              <span className="shrink-0" dir="ltr">
                {money(i.price * i.qty)}
              </span>
            </div>
            <div className="text-[10px] text-slate-500">
              {i.qty} × {money(i.price)}
            </div>
          </div>
        ))}
        <div className="border-t border-dashed border-slate-400 my-3" />
        <div className="space-y-0.5 text-[11px]">
          <div className="flex justify-between">
            <span>المجموع</span>
            <span dir="ltr">{money(subtotal)}</span>
          </div>
          {sample.showTax && tax > 0 ? (
            <div className="flex justify-between">
              <span>
                الضريبة {sample.taxInclusive ? "(شاملة)" : `${(sample.taxBps / 100).toFixed(0)}%`}
              </span>
              <span dir="ltr">{money(tax)}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-black text-[13px] pt-1">
            <span>الإجمالي</span>
            <span dir="ltr">{money(grand)}</span>
          </div>
        </div>
        {sample.showBarcode ? (
          <div className="mt-3">
            <FakeBarcode value={number} />
            <div className="text-[10px] tracking-[0.2em] mt-1" dir="ltr">
              {number}
            </div>
          </div>
        ) : null}
        <div className="border-t border-dashed border-slate-400 my-3" />
        <div className="text-[10px] font-semibold leading-4">{sample.footer}</div>
      </div>
      <div className="h-2 bg-[repeating-linear-gradient(90deg,#fff_0_8px,transparent_8px_10px)] bg-slate-200" />
    </div>
  );
}

function A4Preview({ sample }: { sample: InvoiceSample }) {
  const { subtotal, tax, grand } = invoiceTotals(sample);
  const number = `${sample.prefix}-${sample.next}`;
  const when = new Date().toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
  const compact = sample.paper === "a5";
  return (
    <div
      className="mx-auto bg-white shadow-[0_16px_50px_rgba(15,23,42,0.16)] border border-slate-200 overflow-hidden"
      style={{ width: compact ? 360 : 460 }}
    >
      <div className="h-1.5 bg-rose-800" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="min-w-0">
            <div className="text-[10px] font-bold tracking-[0.2em] text-rose-800">INVOICE</div>
            <div className="font-black text-lg text-slate-900 leading-7 mt-0.5">{sample.store}</div>
            {sample.address ? <div className="text-[11px] text-slate-500 mt-1 leading-4">{sample.address}</div> : null}
            {sample.phone ? (
              <div className="text-[11px] text-slate-500" dir="ltr">
                {sample.phone}
              </div>
            ) : null}
            {sample.taxNo ? <div className="text-[11px] text-slate-500">ضريبي: {sample.taxNo}</div> : null}
            {sample.extra ? <div className="text-[11px] text-slate-500 mt-0.5 leading-4">{sample.extra}</div> : null}
          </div>
          {sample.showLogo ? <InvoiceLogo path={sample.logoPath} name={sample.store} size={56} /> : null}
        </div>
        <div className="grid grid-cols-3 gap-2 py-3 text-[11px]">
          <div>
            <div className="text-slate-400 font-semibold">رقم الفاتورة</div>
            <div className="font-bold text-slate-800" dir="ltr">
              {number}
            </div>
          </div>
          <div>
            <div className="text-slate-400 font-semibold">التاريخ</div>
            <div className="font-bold text-slate-800">{when}</div>
          </div>
          <div>
            <div className="text-slate-400 font-semibold">طريقة الدفع</div>
            <div className="font-bold text-slate-800">نقدي</div>
          </div>
        </div>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="text-right font-bold p-2">الصنف</th>
              <th className="text-center font-bold p-2 w-10">الكمية</th>
              <th className="text-left font-bold p-2 w-24">السعر</th>
              <th className="text-left font-bold p-2 w-24">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {sample.items.map((i) => (
              <tr key={i.name} className="border-b border-slate-100">
                <td className="p-2 font-semibold text-slate-800">{i.name}</td>
                <td className="p-2 text-center">{i.qty}</td>
                <td className="p-2" dir="ltr">
                  {money(i.price)}
                </td>
                <td className="p-2 font-bold" dir="ltr">
                  {money(i.price * i.qty)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end pt-3">
          <div className="w-48 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">المجموع</span>
              <span dir="ltr">{money(subtotal)}</span>
            </div>
            {sample.showTax && tax > 0 ? (
              <div className="flex justify-between">
                <span className="text-slate-500">{sample.taxInclusive ? "الضريبة (شاملة)" : `الضريبة ${(sample.taxBps / 100).toFixed(0)}%`}</span>
                <span dir="ltr">{money(tax)}</span>
              </div>
            ) : null}
            <div className="flex justify-between font-black text-sm border-t border-slate-200 pt-1.5 text-rose-800">
              <span>المستحق</span>
              <span dir="ltr">{money(grand)}</span>
            </div>
          </div>
        </div>
        {sample.showBarcode ? (
          <div className="mt-4 max-w-[180px]">
            <FakeBarcode value={number} />
            <div className="text-[10px] text-center tracking-widest mt-1" dir="ltr">
              {number}
            </div>
          </div>
        ) : null}
        <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 text-center">{sample.footer}</div>
      </div>
    </div>
  );
}

function InvoicesPanel({
  s,
  set,
}: {
  s: Record<string, string>;
  set: Setter;
}) {
  const sample = invoiceSample(s);
  const style = s["invoice.style"] || "receipt";
  const showReceipt = style !== "a4";
  const showA4 = style !== "receipt";
  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] gap-5 items-start">
      <div className="space-y-5">
        <Block title="شكل الفاتورة والترقيم" hint="المعاينة على اليسار تتحدّث فوراً مع كل تغيير. بيانات المحل والشعار من إعدادات المنشأة." icon={Receipt}>
          <div className="grid sm:grid-cols-3 gap-2.5 mb-5">
            {(
              [
                ["receipt", "إيصال حراري", "ورق الكاشير"],
                ["a4", "فاتورة A4", "صفحة كاملة"],
                ["both", "الاثنان معاً", "حراري وA4"],
              ] as const
            ).map(([id, title, desc]) => {
              const active = style === id;
              return (
                <Choice key={id} active={active} onClick={() => set("invoice.style", id, true)} className="p-3">
                  <div className="font-bold text-sm text-slate-800">{title}</div>
                  <div className="text-[11px] text-slate-500 mt-1">{desc}</div>
                </Choice>
              );
            })}
          </div>
          <Grid>
            <Label text="حجم الورق">
              <Select value={s["invoice.paper"] || "80mm"} onChange={(e) => set("invoice.paper", e.target.value, true)}>
                <option value="58mm">حراري 58 مم</option>
                <option value="80mm">حراري 80 مم</option>
                <option value="a5">A5</option>
                <option value="a4">A4</option>
              </Select>
            </Label>
            <Label text="بادئة رقم الفاتورة">
              <Input className="h-10" value={s["invoice.prefix"] || "COS"} onChange={(e) => set("invoice.prefix", e.target.value)} />
            </Label>
            <Label text="رقم البداية (الرقم التالي)">
              <Input
                className="h-10"
                inputMode="numeric"
                value={s["invoice.next_number"] || "1"}
                onChange={(e) => set("invoice.next_number", e.target.value)}
              />
            </Label>
            <Label text="تذييل الإيصال">
              <Input className="h-10" value={s["invoice.footer"] || ""} onChange={(e) => set("invoice.footer", e.target.value)} />
            </Label>
          </Grid>
        </Block>
        <Block title="ما يظهر على الفاتورة" icon={FileText}>
          <ToggleGroup>
            <Toggle
              icon={ImageIcon}
              label="إظهار شعار المحل"
              hint={(s["store.logo_path"] || "").trim() ? "يظهر الشعار المحفوظ من إعدادات المنشأة" : "أضف الشعار أولاً من إعدادات المنشأة ثم احفظ"}
              checked={s["invoice.show_logo"] !== "0"}
              onChange={(v) => set("invoice.show_logo", v ? "1" : "0", true)}
            />
            <Toggle
              icon={Percent}
              label="إظهار الضريبة"
              hint="تظهر فقط إذا كانت الضريبة مفعّلة في المبيعات"
              checked={s["invoice.show_tax"] !== "0"}
              onChange={(v) => set("invoice.show_tax", v ? "1" : "0", true)}
            />
            <Toggle
              icon={ScanLine}
              label="إظهار باركود رقم الفاتورة"
              checked={s["invoice.show_barcode"] === "1"}
              onChange={(v) => set("invoice.show_barcode", v ? "1" : "0", true)}
            />
          </ToggleGroup>
        </Block>
      </div>
      <div className="xl:sticky xl:top-4">
        <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-lg bg-white border border-slate-200 text-rose-700 grid place-items-center">
              <Receipt size={15} />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800">معاينة الفاتورة</div>
              <div className="text-[11px] text-slate-500">شكل تقريبي للطباعة الحقيقية — بيانات تجريبية</div>
            </div>
          </div>
          <div className={`flex flex-wrap justify-center gap-6 ${showReceipt && showA4 ? "xl:flex-col 2xl:flex-row" : ""}`}>
            {showReceipt ? <ReceiptPreview sample={sample} /> : null}
            {showA4 ? <A4Preview sample={sample} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShiftsPanel({
  s,
  set,
}: {
  s: Record<string, string>;
  set: Setter;
}) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Block title="فتح الوردية" hint="يظهر عند الضغط على «فتح الوردية» من الشريط العلوي.">
        <Toggle
          label="الرصيد الافتتاحي مطلوب"
          hint="لا تُفتح الوردية إلا بعد كتابة مبلغ الصندوق"
          checked={s["shift.require_opening_cash"] !== "0"}
          onChange={(v) => set("shift.require_opening_cash", v ? "1" : "0", true)}
        />
        <div className="pt-4 max-w-xs">
          <Label text="الحد الأقصى لساعات الوردية">
            <Input
              inputMode="numeric"
              value={s["shift.max_hours"] || "12"}
              onChange={(e) => set("shift.max_hours", e.target.value)}
            />
          </Label>
          <p className="text-[11px] text-slate-400 mt-1.5">تنبيه عند تجاوز المدة أثناء الإغلاق. 0 للتعطيل.</p>
        </div>
      </Block>
      <Block title="إغلاق الوردية" hint="اكتب المبلغ الفعلي في الصندوق ثم أكّد. الفرق يُحفظ تلقائياً.">
        <Toggle
          label="جرد الصندوق إلزامي عند الإغلاق"
          hint="يجب كتابة المبلغ الفعلي قبل تأكيد الإغلاق"
          checked={s["shift.require_close_count"] !== "0"}
          onChange={(v) => set("shift.require_close_count", v ? "1" : "0", true)}
        />
        <Toggle
          label="إظهار النقد المتوقع"
          hint="يعرض مبلغ الصندوق المحسوب من المبيعات والحركات"
          checked={s["shift.show_expected"] !== "0"}
          onChange={(v) => set("shift.show_expected", v ? "1" : "0", true)}
        />
        <Toggle
          label="ملاحظة عند الإغلاق"
          hint="حقل لتسجيل سبب العجز أو الزيادة"
          checked={s["shift.note_on_close"] === "1"}
          onChange={(v) => set("shift.note_on_close", v ? "1" : "0", true)}
        />
        <Toggle
          label="نسخ احتياطي عند إغلاق الوردية"
          checked={s["backup.auto_on_close"] !== "0"}
          onChange={(v) => set("backup.auto_on_close", v ? "1" : "0", true)}
        />
      </Block>
      <Block title="الأمان أثناء التوقف">
        <Label text="دقائق قفل الشاشة عند التوقف (0 للتعطيل)">
          <Input value={s["security.lock_minutes"] || "0"} onChange={(e) => set("security.lock_minutes", e.target.value)} />
        </Label>
      </Block>
    </div>
  );
}

function AlertsPanel({
  s,
  set,
}: {
  s: Record<string, string>;
  set: Setter;
}) {
  return (
    <div className="max-w-3xl space-y-5">
      <p className="text-sm text-slate-500 leading-6 px-0.5">
        اختر ما يظهر في جرس التنبيهات والرئيسية. إيقاف تنبيه يخفيه من الواجهة دون حذف أي بيانات.
      </p>
      <Block title="المخزون والصلاحية" hint="عدد أيام التنبيه يُضبط من قسم المخزون والصرف." icon={Package}>
        <ToggleGroup>
          <Toggle
            icon={Package}
            label="مخزون منخفض"
            hint="يظهر في الرئيسية عند وصول الصنف لحد التنبيه"
            checked={s["alert.low_stock"] !== "0"}
            onChange={(v) => set("alert.low_stock", v ? "1" : "0", true)}
          />
          <Toggle
            icon={Clock3}
            label="اقتراب انتهاء الصلاحية"
            hint="تنبيه قبل نفاد صلاحية المنتج بفترة كافية للتصرف"
            checked={s["alert.expiry"] !== "0"}
            onChange={(v) => set("alert.expiry", v ? "1" : "0", true)}
          />
          <Toggle
            icon={AlertTriangle}
            label="انتهاء دفعة / Batch"
            hint="تنبيه للدفعات المنتهية أو القريبة من الانتهاء"
            checked={s["alert.batch_expiry"] !== "0"}
            onChange={(v) => set("alert.batch_expiry", v ? "1" : "0", true)}
          />
        </ToggleGroup>
      </Block>
      <Block title="تنبيهات التشغيل" hint="إشعارات لحظية أثناء العمل اليومي على الصندوق والنسخ." icon={Bell}>
        <ToggleGroup>
          <Toggle
            icon={ShoppingBag}
            label="عمليات البيع"
            hint="تأكيد مرئي بعد إتمام أو إلغاء البيع"
            checked={s["alert.sales"] !== "0"}
            onChange={(v) => set("alert.sales", v ? "1" : "0", true)}
          />
          <Toggle
            icon={HardDrive}
            label="النسخ الاحتياطي"
            hint="إشعار عند نجاح أو فشل النسخة"
            checked={s["alert.backup"] !== "0"}
            onChange={(v) => set("alert.backup", v ? "1" : "0", true)}
          />
        </ToggleGroup>
      </Block>
    </div>
  );
}

function StorePanel({
  s,
  set,
}: {
  s: Record<string, string>;
  set: Setter;
}) {
  const push = useToasts((x) => x.push);
  const [picking, setPicking] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  async function pickLogo() {
    setPicking(true);
    try {
      const path = await cmd<string | null>("pick_store_logo");
      if (path) {
        set("store.logo_path", path, true);
        setLogoBroken(false);
        push("ok", "تم اختيار الشعار. اضغط حفظ الإعدادات لتثبيته.");
      }
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setPicking(false);
    }
  }
  const logo = (s["store.logo_path"] || "").trim();
  const { src, ready } = useLogoSrc(logo);
  const name = (s["store.name"] || "").trim() || "المحل";
  useEffect(() => {
    setLogoBroken(false);
  }, [src]);
  const showLogo = Boolean(src) && !logoBroken;
  const address = storeAddressLine(s);
  const phone = storePhoneLine(s);
  const taxNo = storeTaxLine(s);
  const branch = (s["store.branch"] || "").trim();
  const hours = (s["store.hours"] || "").trim();
  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white border border-slate-200/70 shadow-sm overflow-hidden">
        <div className="p-5 lg:p-6 flex flex-col lg:flex-row gap-5 items-start">
          <div className="h-32 w-32 rounded-2xl bg-slate-50 border border-slate-200 grid place-items-center overflow-hidden shrink-0">
            {logo && !ready ? (
              <div className="h-10 w-10 rounded-xl bg-slate-100" />
            ) : showLogo ? (
              <img src={src} alt="" className="h-full w-full object-contain p-3" onError={() => setLogoBroken(true)} />
            ) : (
              <div className="h-16 w-16 rounded-2xl bg-rose-700 text-white grid place-items-center text-3xl font-black">
                {name.slice(0, 1)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold text-slate-400">معاينة الهوية على الفاتورة</div>
            <div className="text-xl font-bold text-slate-800 leading-7 mt-1">{name}</div>
            {branch ? <div className="text-sm text-slate-500 mt-0.5">فرع {branch}</div> : null}
            <div className="flex items-start gap-1.5 text-sm text-slate-500 mt-2 leading-5">
              <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
              <span>{address || "أضف العنوان والمدينة ليظهرا على الفاتورة"}</span>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2 text-xs text-slate-500">
              {phone ? (
                <span className="inline-flex items-center gap-1" dir="ltr">
                  <Phone size={12} className="text-slate-400" />
                  {phone}
                </span>
              ) : (
                <span className="text-slate-400">بدون هاتف</span>
              )}
              {taxNo ? (
                <span className="inline-flex items-center gap-1">
                  <Hash size={12} className="text-slate-400" />
                  {taxNo}
                </span>
              ) : null}
              {hours ? (
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} className="text-slate-400" />
                  {hours}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Button variant="secondary" disabled={picking} onClick={() => void pickLogo()}>
              <ImageIcon size={14} />
              {picking ? "جاري الاختيار…" : logo ? "تغيير الشعار" : "اختيار الشعار"}
            </Button>
            {logo ? (
              <button type="button" className="text-xs font-semibold text-slate-500 hover:text-rose-700" onClick={() => set("store.logo_path", "", true)}>
                إزالة الشعار
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid xl:grid-cols-3 gap-5">
        <Block title="بيانات المحل" hint="الاسم الظاهر للعملاء وفي الشريط العلوي." icon={Building2} className="xl:col-span-2">
          <Grid cols={3}>
            <Label text="اسم المحل">
              <Input className="h-10" value={s["store.name"] || ""} onChange={(e) => set("store.name", e.target.value)} placeholder="مثال: متجر غرام" />
            </Label>
            <Label text="الاسم القانوني">
              <Input className="h-10" value={s["store.legal_name"] || ""} onChange={(e) => set("store.legal_name", e.target.value)} placeholder="كما في السجل التجاري" />
            </Label>
            <Label text="اسم الفرع">
              <Input className="h-10" value={s["store.branch"] || ""} onChange={(e) => set("store.branch", e.target.value)} placeholder="الرئيسي / القوصية…" />
            </Label>
            <Label text="نوع النشاط">
              <Select value={s["store.activity"] || ""} onChange={(e) => set("store.activity", e.target.value)}>
                <option value="">— اختر —</option>
                <option value="تجميل">مستحضرات تجميل</option>
                <option value="عطور">عطور</option>
                <option value="عناية">عناية بالبشرة والشعر</option>
                <option value="صيدلية">صيدلية تجميل</option>
                <option value="جملة">جملة وتجزئة</option>
                <option value="أخرى">أخرى</option>
              </Select>
            </Label>
            <Label text="اسم المسؤول">
              <Input className="h-10" value={s["store.manager"] || ""} onChange={(e) => set("store.manager", e.target.value)} placeholder="مدير المحل" />
            </Label>
            <Label text="مواعيد العمل">
              <Input className="h-10" value={s["store.hours"] || ""} onChange={(e) => set("store.hours", e.target.value)} placeholder="10ص — 11م" />
            </Label>
          </Grid>
        </Block>
        <Block title="السجل والترخيص" hint="تظهر على الفاتورة عند إدخالها." icon={FileText}>
          <div className="space-y-4">
            <Label text="الرقم الضريبي">
              <Input className="h-10" dir="ltr" value={s["store.tax_number"] || ""} onChange={(e) => set("store.tax_number", e.target.value)} />
            </Label>
            <Label text="السجل التجاري">
              <Input className="h-10" dir="ltr" value={s["store.commercial_register"] || ""} onChange={(e) => set("store.commercial_register", e.target.value)} />
            </Label>
            <Label text="رخصة مزاولة / صحية">
              <Input className="h-10" value={s["store.license"] || ""} onChange={(e) => set("store.license", e.target.value)} />
            </Label>
          </div>
        </Block>
      </div>

      <div className="grid xl:grid-cols-2 gap-5">
        <Block title="العنوان" hint="يُركَّب تلقائياً على الفاتورة: الشارع ثم الحي ثم المحافظة." icon={MapPin}>
          <div className="space-y-4">
            <Label text="العنوان التفصيلي">
              <Input className="h-10" value={s["store.address"] || ""} onChange={(e) => set("store.address", e.target.value)} placeholder="الشارع والمعلم القريب" />
            </Label>
            <Grid>
              <Label text="المحافظة">
                <Select value={s["store.city"] || ""} onChange={(e) => set("store.city", e.target.value)}>
                  <option value="">— اختر المحافظة —</option>
                  {s["store.city"] && !GOVERNORATES.includes(s["store.city"]) ? (
                    <option value={s["store.city"]}>{s["store.city"]}</option>
                  ) : null}
                  {GOVERNORATES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
              </Label>
              <Label text="المركز / الحي">
                <Input className="h-10" value={s["store.district"] || ""} onChange={(e) => set("store.district", e.target.value)} placeholder="القوصية، المنيا…" />
              </Label>
            </Grid>
          </div>
        </Block>
        <Block title="التواصل" hint="الهاتف والواتساب يظهران للعملاء على الفاتورة والتقارير." icon={MessageCircle}>
          <Grid>
            <Label text="الهاتف">
              <div className="relative">
                <Phone size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <Input className="h-10 pr-9" dir="ltr" value={s["store.phone"] || ""} onChange={(e) => set("store.phone", e.target.value)} />
              </div>
            </Label>
            <Label text="هاتف إضافي">
              <div className="relative">
                <Phone size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <Input className="h-10 pr-9" dir="ltr" value={s["store.phone2"] || ""} onChange={(e) => set("store.phone2", e.target.value)} />
              </div>
            </Label>
            <Label text="واتساب">
              <div className="relative">
                <MessageCircle size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <Input className="h-10 pr-9" dir="ltr" value={s["store.whatsapp"] || ""} onChange={(e) => set("store.whatsapp", e.target.value)} />
              </div>
            </Label>
            <Label text="البريد الإلكتروني">
              <div className="relative">
                <Mail size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <Input className="h-10 pr-9" dir="ltr" value={s["store.email"] || ""} onChange={(e) => set("store.email", e.target.value)} />
              </div>
            </Label>
            <Label text="الموقع الإلكتروني">
              <div className="relative">
                <Globe size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <Input className="h-10 pr-9" dir="ltr" value={s["store.website"] || ""} onChange={(e) => set("store.website", e.target.value)} />
              </div>
            </Label>
            <Label text="إنستغرام">
              <div className="relative">
                <Instagram size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <Input className="h-10 pr-9" dir="ltr" value={s["store.instagram"] || ""} onChange={(e) => set("store.instagram", e.target.value)} placeholder="@username" />
              </div>
            </Label>
            <Label text="فيسبوك">
              <div className="relative">
                <Facebook size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <Input className="h-10 pr-9" value={s["store.facebook"] || ""} onChange={(e) => set("store.facebook", e.target.value)} />
              </div>
            </Label>
          </Grid>
        </Block>
      </div>

      <Block title="سطر إضافي على الفاتورة" hint="يظهر تحت بيانات المحل على الإيصال وفاتورة A4. تذييل الشكر يُضبط من تبويب الفواتير." icon={Receipt}>
        <Textarea
          value={s["store.invoice_note"] || ""}
          onChange={(e) => set("store.invoice_note", e.target.value)}
          placeholder="مثال: الاستبدال خلال 14 يوماً بشرط سلامة العبوة"
        />
      </Block>
    </div>
  );
}

function CatalogPanel({
  s,
  set,
}: {
  s: Record<string, string>;
  set: Setter;
}) {
  const push = useToasts((x) => x.push);
  const [brands, setBrands] = useState<{ id: number; name: string }[]>([]);
  const [cats, setCats] = useState<{ id: number; name: string }[]>([]);
  const [brandName, setBrandName] = useState("");
  const [catName, setCatName] = useState("");

  async function reload() {
    const [b, c] = await Promise.all([
      cmd<{ id: number; name: string }[]>("list_brands").catch(() => []),
      cmd<{ id: number; name: string }[]>("list_categories").catch(() => []),
    ]);
    setBrands(b);
    setCats(c);
  }
  useEffect(() => {
    void reload();
  }, []);

  async function addBrand() {
    const name = brandName.trim();
    if (!name) return;
    try {
      await cmd("save_brand", { name });
      setBrandName("");
      push("ok", "تمت إضافة الماركة");
      await reload();
    } catch (e) {
      push("err", (e as Error).message);
    }
  }
  async function addCat() {
    const name = catName.trim();
    if (!name) return;
    try {
      await cmd("save_category", { name });
      setCatName("");
      push("ok", "تمت إضافة التصنيف");
      await reload();
    } catch (e) {
      push("err", (e as Error).message);
    }
  }
  async function hide(kind: "brand" | "category", id: number) {
    try {
      await cmd("deactivate_catalog_item", { kind, id });
      await reload();
    } catch (e) {
      push("err", (e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-l from-rose-50 to-white border border-rose-100 p-4 flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-rose-700 text-white grid place-items-center shrink-0">
          <Droplets size={20} />
        </div>
        <div>
          <div className="font-bold text-sm text-slate-800">كتالوج مستحضرات التجميل</div>
          <p className="text-xs text-slate-500 mt-0.5 leading-5">
            الماركات والفئات والألوان والدرجات تُستخدم عند إضافة منتج جديد. الأرقام تُحدَّث فور الإضافة.
          </p>
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <NamedList
          title="الماركات"
          items={brands}
          value={brandName}
          onChange={setBrandName}
          onAdd={addBrand}
          onHide={(id) => void hide("brand", id)}
          placeholder="ماركة جديدة"
        />
        <NamedList
          title="الفئات"
          items={cats}
          value={catName}
          onChange={setCatName}
          onAdd={addCat}
          onHide={(id) => void hide("category", id)}
          placeholder="فئة جديدة"
        />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <ChipEditor
          title="الألوان"
          hint="تظهر عند إضافة درجة أو لون للمنتج"
          value={s["cosmetics.colors"] || ""}
          onChange={(v) => set("cosmetics.colors", v)}
          placeholder="لون جديد"
        />
        <ChipEditor
          title="الدرجات Shade"
          hint="درجات كريم الأساس والبودرة وغيرها"
          value={s["cosmetics.shades"] || ""}
          onChange={(v) => set("cosmetics.shades", v)}
          placeholder="درجة جديدة"
        />
        <ChipEditor
          title="الأحجام"
          value={s["cosmetics.sizes"] || ""}
          onChange={(v) => set("cosmetics.sizes", v)}
          placeholder="مثال: 50ml"
        />
        <ChipEditor
          title="النوع"
          hint="كريم، سيروم، ماسكارا…"
          value={s["cosmetics.types"] || ""}
          onChange={(v) => set("cosmetics.types", v)}
          placeholder="نوع جديد"
        />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Block title="الباركود">
          <Toggle
            label="توليد باركود تلقائي عند إضافة منتج بلا باركود"
            checked={s["barcode.auto"] === "1"}
            onChange={(v) => set("barcode.auto", v ? "1" : "0", true)}
          />
          <div className="pt-3">
            <Label text="بادئة الباركود التلقائي">
              <Input dir="ltr" value={s["barcode.prefix"] || ""} onChange={(e) => set("barcode.prefix", e.target.value)} />
            </Label>
          </div>
        </Block>
        <Block title="الدفعة / Batch و Lot">
          <Toggle
            label="رقم الدفعة مطلوب عند الاستلام"
            checked={s["batch.require_lot"] !== "0"}
            onChange={(v) => set("batch.require_lot", v ? "1" : "0", true)}
          />
          <Toggle
            label="تاريخ الصلاحية مطلوب عند الاستلام"
            checked={s["batch.require_expiry"] !== "0"}
            onChange={(v) => set("batch.require_expiry", v ? "1" : "0", true)}
          />
        </Block>
      </div>
    </div>
  );
}

function NamedList({
  title,
  items,
  value,
  onChange,
  onAdd,
  onHide,
  placeholder,
}: {
  title: string;
  items: { id: number; name: string }[];
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  onHide: (id: number) => void;
  placeholder: string;
}) {
  return (
    <Block title={`${title}${items.length ? ` · ${items.length}` : ""}`}>
      <div className="flex gap-2 mb-3">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
        />
        <Button onClick={onAdd}>إضافة</Button>
      </div>
      <div className="flex flex-wrap gap-2 max-h-40 overflow-auto">
        {items.length === 0 ? (
          <span className="text-xs text-slate-400">لا توجد عناصر بعد</span>
        ) : (
          items.map((i) => (
            <span
              key={i.id}
              className="h-8 px-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 inline-flex items-center gap-2"
            >
              {i.name}
              <button type="button" className="text-slate-400 hover:text-rose-700" onClick={() => onHide(i.id)} aria-label="إخفاء">
                <X size={12} />
              </button>
            </span>
          ))
        )}
      </div>
    </Block>
  );
}

function ChipEditor({
  title,
  hint,
  value,
  onChange,
  placeholder,
}: {
  title: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const items = value
    .split(/[\r\n،,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  function add() {
    const t = draft.trim();
    if (!t || items.includes(t)) {
      setDraft("");
      return;
    }
    onChange([...items, t].join("\n"));
    setDraft("");
  }
  function remove(name: string) {
    onChange(items.filter((x) => x !== name).join("\n"));
  }
  return (
    <Block title={`${title}${items.length ? ` · ${items.length}` : ""}`} hint={hint}>
      <div className="flex gap-2 mb-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="secondary" onClick={add}>
          إضافة
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 min-h-[2rem]">
        {items.length === 0 ? (
          <span className="text-xs text-slate-400">أضف عناصر لتظهر هنا</span>
        ) : (
          items.map((name) => (
            <span
              key={name}
              className="h-8 px-2.5 rounded-lg bg-rose-50 border border-rose-100 text-xs font-semibold text-rose-800 inline-flex items-center gap-2"
            >
              {name}
              <button type="button" className="text-rose-400 hover:text-rose-800" onClick={() => remove(name)} aria-label="حذف">
                <X size={12} />
              </button>
            </span>
          ))
        )}
      </div>
    </Block>
  );
}

function DevPanel() {
  const [copied, setCopied] = useState("");
  async function copy(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      /* ignore */
    }
  }
  const contacts = [
    {
      id: "kw",
      label: "واتساب الكويت",
      value: "+96550107672",
      display: "+965 5010 7672",
      href: "https://wa.me/96550107672",
    },
    {
      id: "eg",
      label: "واتساب مصر",
      value: "+201070037001",
      display: "+20 107 003 7001",
      href: "https://wa.me/201070037001",
    },
  ] as const;
  const langs = ["Rust", "TypeScript", "React", "Tailwind CSS", "SQLite"];

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-5 flex items-start gap-4">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-rose-100 to-rose-200 text-rose-800 grid place-items-center font-black text-lg border border-rose-100 shrink-0">
            م.أ
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-rose-700/80">مطوّر البرنامج</div>
            <h2 className="text-xl font-black text-slate-800 mt-0.5">م. أحمد حسني</h2>
            <p className="text-sm text-slate-600 mt-2 leading-7">
              برنامج نقطة بيع لمحلات مستحضرات التجميل، يعمل بالكامل على جهازك بدون إنترنت: مبيعات، مخزون، فواتير، عملاء وتقارير من شاشة واحدة.
            </p>
          </div>
        </div>
        <div className="px-5 pb-5">
          <div className="text-[11px] font-bold text-slate-400 mb-2">بُني باللغات والتقنيات التالية</div>
          <div className="flex flex-wrap gap-2">
            {langs.map((l) => (
              <span
                key={l}
                className="h-8 px-3 rounded-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 inline-flex items-center"
                dir="ltr"
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5">
        <div className="font-bold text-slate-800">تواصل عبر واتساب فقط</div>
        <p className="text-sm text-slate-500 mt-1 mb-4">الرقمان للواتساب. اضغط للفتح أو انسخ الرقم.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {contacts.map((c) => (
            <div key={c.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-2 flex items-center gap-2">
              <a
                href={c.href}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white transition"
              >
                <div className="h-12 w-12 rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-700 grid place-items-center shrink-0">
                  <MessageCircle size={20} />
                </div>
                <div className="min-w-0 text-right">
                  <div className="text-[11px] font-semibold text-slate-500">{c.label}</div>
                  <div className="font-bold text-slate-800 mt-0.5" dir="ltr">
                    {c.display}
                  </div>
                </div>
              </a>
              <button
                type="button"
                onClick={() => void copy(c.id, c.value)}
                className="h-11 w-11 shrink-0 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-rose-700 hover:border-rose-200 grid place-items-center"
                title="نسخ الرقم"
                aria-label={`نسخ ${c.label}`}
              >
                {copied === c.id ? <CheckCircle2 size={18} className="text-emerald-600" /> : <Copy size={16} />}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const RESET_PHRASE = "حذف";

function FactoryResetPanel() {
  const push = useToasts((s) => s.push);
  const { setShift, askOpenShift } = useSession();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const ready = phrase.trim() === RESET_PHRASE;

  async function run() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      await cmd("factory_reset", { confirmation: phrase });
      setPhrase("");
      setShift(null);
      setDone(true);
      askOpenShift();
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-2xl border border-rose-200 bg-rose-50 p-5">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 shrink-0 rounded-2xl bg-white text-rose-700 grid place-items-center border border-rose-100">
            <AlertTriangle size={22} />
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold text-rose-900">هذه العملية لا يمكن التراجع عنها من هنا</div>
            <p className="text-sm text-rose-800/80 mt-1 leading-6">
              تُنشأ نسخة احتياطية تلقائياً قبل المسح. بعدها يصبح البرنامج فارغاً من البضاعة والفواتير لتدخل بياناتك بنفسك.
            </p>
          </div>
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-700 grid place-items-center">
              <Trash2 size={16} />
            </div>
            <div className="font-bold text-slate-800">يُمسح</div>
          </div>
          <ul className="space-y-2 text-sm text-slate-600">
            {[
              "كل المنتجات والماركات والباركود",
              "المخزون والدفعات والحركات",
              "فواتير البيع والمرتجعات والمعلّقة",
              "المشتريات والموردين وأرصدتهم",
              "العملاء (عدا عميل نقدي) ونقاط الولاء",
              "المصروفات وحركة الصندوق والورديات",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                {t}
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center">
              <ShieldCheck size={16} />
            </div>
            <div className="font-bold text-slate-800">يبقى كما هو</div>
          </div>
          <ul className="space-y-2 text-sm text-slate-600">
            {[
              "المستخدمون ورموز الدخول والصلاحيات",
              "اسم المحل والشعار وإعدادات الطابعة",
              "التصنيفات والوحدات وطرق الدفع",
              "المخازن والترخيص والنسخ الاحتياطية",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                {t}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5 space-y-4">
        <div>
          <div className="font-bold text-slate-800">تأكيد كتابي</div>
          <p className="text-sm text-slate-500 mt-1 leading-6">
            اكتب كلمة <span className="font-black text-rose-700">حذف</span> في الحقل ثم اضغط الزر. بدون هذه الكلمة لن يُمسح شيء.
          </p>
        </div>
        <Label text="اكتب كلمة التأكيد">
          <Input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="حذف"
            className="h-12 rounded-xl text-base font-bold"
            autoComplete="off"
            disabled={busy}
          />
        </Label>
        <Button
          variant="danger"
          className="h-12 w-full sm:w-auto"
          disabled={!ready || busy}
          onClick={() => void run()}
        >
          <RotateCcw size={16} className={busy ? "animate-spin" : ""} />
          {busy ? "جاري المسح وإنشاء نسخة احتياطية…" : "مسح البيانات وإعادة الضبط"}
        </Button>
      </section>

      <SuccessPopup
        open={done}
        title="تمت إعادة الضبط"
        message="البرنامج جاهز كمحل جديد. افتح وردية ثم أضف بضاعتك."
        duration={2800}
        onDone={() => setDone(false)}
      />
    </div>
  );
}

function UpdatesPanel() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-violet-50 text-violet-700 grid place-items-center">
            <Rocket size={18} />
          </div>
          <div>
            <div className="font-bold text-slate-800">تحديثات البرنامج</div>
            <div className="text-xs text-slate-400">ابحث عن إصدار أحدث وثبّته بضغطة واحدة</div>
          </div>
        </div>
        <UpdateChecker />
      </div>
    </div>
  );
}

function AuditPanel() {
  const push = useToasts((s) => s.push);
  const [rows, setRows] = useState<Audit[]>([]);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<AuditKind | "all">("all");

  useEffect(() => {
    cmd<Audit[]>("list_audit")
      .then(setRows)
      .catch((e) => push("err", (e as Error).message));
  }, [push]);

  const todayKey = todayIsoKey();

  const filtered = useMemo(() => {
    const query = q.trim();
    return rows.filter((r) => {
      const meta = auditMeta(r.action);
      if (kind !== "all" && meta.kind !== kind) return false;
      if (query) {
        const hay = `${meta.label} ${r.action} ${r.summary} ${r.userName || ""}`;
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [rows, q, kind]);

  const todayCount = rows.filter((r) => r.occurredAt.slice(0, 10) === todayKey).length;
  const users = new Set(rows.map((r) => r.userName).filter(Boolean)).size;
  const last = rows[0];

  const stats = [
    { label: "إجمالي الأحداث", value: qty(rows.length), icon: ScrollText, tone: "text-rose-700 bg-rose-50" },
    { label: "أحداث اليوم", value: qty(todayCount), icon: Sparkles, tone: "text-amber-700 bg-amber-50" },
    { label: "المستخدمون", value: qty(users), icon: Users, tone: "text-sky-700 bg-sky-50" },
    { label: "آخر نشاط", value: last ? relativeAudit(last.occurredAt) : "—", icon: Clock3, tone: "text-slate-700 bg-slate-100" },
  ];

  const chips: { id: AuditKind | "all"; label: string }[] = [
    { id: "all", label: "الكل" },
    { id: "sales", label: "المبيعات" },
    { id: "inventory", label: "المخزون" },
    { id: "people", label: "الأشخاص" },
    { id: "shifts", label: "الورديات" },
    { id: "system", label: "النظام" },
  ];

  const groups = useMemo(() => {
    const map = new Map<string, Audit[]>();
    for (const r of filtered) {
      const key = r.occurredAt.slice(0, 10) || "—";
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => {
          const StatIcon = s.icon;
          return (
            <div key={s.label} className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5 min-h-[110px]">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="text-sm text-slate-500">{s.label}</div>
                <div className={`h-9 w-9 rounded-xl grid place-items-center ${s.tone}`}>
                  <StatIcon size={16} />
                </div>
              </div>
              <div className="text-lg font-bold text-slate-800 leading-6">{s.value}</div>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-4">
        <SearchField
          placeholder="ابحث بالإجراء أو المستخدم أو التفاصيل"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex gap-2 overflow-x-auto pt-3">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setKind(c.id)}
              className={`h-7 px-3 rounded-full text-xs whitespace-nowrap border ${
                kind === c.id ? "bg-rose-700 text-white border-rose-700" : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm py-16 px-6 text-center">
          <div className="h-14 w-14 mx-auto mb-3 rounded-2xl bg-rose-50 text-rose-400 grid place-items-center">
            <ScrollText size={24} />
          </div>
          <div className="font-bold text-slate-800">{rows.length === 0 ? "لا يوجد نشاط بعد" : "لا توجد نتائج مطابقة"}</div>
          <p className="text-sm text-slate-500 mt-1">
            {rows.length === 0 ? "ستظهر هنا المبيعات والإعدادات والورديات فور حدوثها." : "جرّب كلمة بحث أخرى أو غيّر التصفية."}
          </p>
        </div>
      ) : (
        <div className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm text-slate-800">العمليات الأخيرة</h2>
              <p className="text-xs text-slate-500 mt-0.5">يُعرض أحدث 300 حدث على النظام.</p>
            </div>
            <span className="h-7 px-2.5 rounded-full bg-slate-50 border border-slate-100 text-xs font-semibold text-slate-500">
              {qty(filtered.length)} حدث
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {groups.map(([day, items]) => (
              <div key={day}>
                <div className="px-5 py-2 bg-slate-50/80 text-xs font-bold text-slate-500 sticky top-0">
                  {auditDayLabel(day)}
                </div>
                {items.map((r) => {
                  const meta = auditMeta(r.action);
                  const KindIcon = KIND_UI[meta.kind].icon;
                  return (
                    <div key={r.id} className="px-5 py-3.5 flex items-start gap-3 hover:bg-slate-50/70">
                      <div className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${KIND_UI[meta.kind].tone}`}>
                        <KindIcon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-slate-800">{meta.label}</span>
                          <span className={`h-5 px-1.5 rounded-md text-[10px] font-bold ${KIND_UI[meta.kind].tone}`}>
                            {KIND_UI[meta.kind].label}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mt-0.5 leading-5">{r.summary || "—"}</p>
                        <div className="text-xs text-slate-400 mt-1">
                          {r.userName || "النظام"} · {formatAuditClock(r.occurredAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type AuditKind = "sales" | "inventory" | "people" | "shifts" | "system";

const KIND_UI: Record<AuditKind, { label: string; tone: string; icon: typeof ShoppingBag }> = {
  sales: { label: "مبيعات", tone: "bg-rose-50 text-rose-700", icon: ShoppingBag },
  inventory: { label: "مخزون", tone: "bg-amber-50 text-amber-800", icon: Package },
  people: { label: "أشخاص", tone: "bg-sky-50 text-sky-800", icon: Users },
  shifts: { label: "وردية", tone: "bg-violet-50 text-violet-800", icon: Clock3 },
  system: { label: "نظام", tone: "bg-slate-100 text-slate-700", icon: Settings },
};

const ACTION_META: Record<string, { label: string; kind: AuditKind }> = {
  sale_create: { label: "بيع جديد", kind: "sales" },
  sale_void: { label: "إلغاء فاتورة", kind: "sales" },
  sale_return: { label: "مرتجع", kind: "sales" },
  purchase_receive: { label: "استلام مشتريات", kind: "inventory" },
  transfer_request: { label: "طلب تحويل", kind: "inventory" },
  transfer_quick: { label: "تحويل سريع", kind: "inventory" },
  transfer_advance: { label: "تقدم تحويل", kind: "inventory" },
  stock_adjust: { label: "تسوية مخزون", kind: "inventory" },
  product_save: { label: "حفظ منتج", kind: "inventory" },
  brand_create: { label: "إضافة علامة", kind: "inventory" },
  warehouse_save: { label: "حفظ مخزن", kind: "inventory" },
  import_products: { label: "استيراد منتجات", kind: "inventory" },
  customer_save: { label: "حفظ عميل", kind: "people" },
  supplier_save: { label: "حفظ مورد", kind: "people" },
  user_save: { label: "حفظ مستخدم", kind: "people" },
  shift_opened: { label: "فتح وردية", kind: "shifts" },
  shift_closed: { label: "إغلاق وردية", kind: "shifts" },
  first_run: { label: "إعداد أول مرة", kind: "system" },
  factory_reset: { label: "إعادة ضبط المصنع", kind: "system" },
  settings_save: { label: "تحديث الإعدادات", kind: "system" },
  restore: { label: "استعادة نسخة", kind: "system" },
};

function auditMeta(action: string) {
  return ACTION_META[action] || { label: action, kind: "system" as AuditKind };
}

function todayIsoKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function auditDayLabel(key: string) {
  const today = todayIsoKey();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yest = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  if (key === today) return "اليوم";
  if (key === yest) return "أمس";
  const [yy, mm, dd] = key.split("-");
  if (!yy || !mm || !dd) return key;
  return `${dd}/${mm}/${yy}`;
}

function formatAuditClock(iso: string) {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso.replace("T", " ");
  return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

function relativeAudit(iso: string) {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso.replace("T", " ");
  const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}
