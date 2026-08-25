import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Building2,
  ChevronLeft,
  Clock3,
  Download,
  FileText,
  Monitor,
  Moon,
  Touchpad,
  Palette,
  PanelRightClose,
  Percent,
  Printer,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sun,
  Volume2,
} from "lucide-react";
import { cmd } from "@/services/api";
import { useToasts } from "@/components/ui/Toast";
import { RestoreProgressPopup } from "@/components/ui/SuccessPopup";
import { FontScaleSlider } from "@/components/ui/FontScaleSlider";
import { settingFlag, usePrefs } from "@/stores/prefs";
import { normalizeTheme, type ThemeMode } from "@/theme";

export function QuickSettingsButton({ pageActive }: { pageActive: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        title="إعدادات سريعة"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`h-9 w-9 rounded-lg border grid place-items-center transition ${
          open || pageActive
            ? "bg-rose-700 text-white border-rose-700"
            : "bg-white text-slate-500 border-slate-200 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800"
        }`}
      >
        <Settings size={16} />
      </button>
      {open ? <QuickSettingsMenu onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function QuickSettingsMenu({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const push = useToasts((s) => s.push);
  const s = usePrefs((p) => p.values);
  const patch = usePrefs((p) => p.patch);
  const [busy, setBusy] = useState<"backup" | "print" | null>(null);
  const [jobOpen, setJobOpen] = useState(false);
  const [jobPct, setJobPct] = useState(0);
  const [jobLabel, setJobLabel] = useState("جاري أخذ النسخة");
  const [jobDone, setJobDone] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const theme = normalizeTheme(s["ui.theme"]);
  const font = s["ui.font_size"] || "13";
  const accent = s["ui.accent"] || "rose";
  const navColor = s["nav.color"] || "rose";

  function set(key: string, value: string) {
    patch(key, value, true);
  }
  function flag(key: string, on: boolean, defaultOn: boolean) {
    const current = settingFlag(s, key, defaultOn);
    if (current === on) return;
    set(key, on ? "1" : "0");
  }

  async function backupNow() {
    setBusy("backup");
    setJobDone(false);
    setJobError(null);
    setJobPct(4);
    setJobLabel("جاري أخذ النسخة");
    setJobOpen(true);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    let gotEvent = false;
    let stopListen: (() => void) | undefined;
    const creep = window.setInterval(() => {
      if (gotEvent) return;
      setJobPct((p) => (p < 90 ? p + 3 : p));
    }, 220);
    try {
      const { listen } = await import("@tauri-apps/api/event");
      stopListen = await listen<{ pct: number; label: string }>("backup-progress", (e) => {
        gotEvent = true;
        setJobPct(e.payload.pct);
        if (e.payload.label) setJobLabel(e.payload.label);
      });
    } catch {
      /* browser preview */
    }
    try {
      await cmd("backup_now", { dest: null });
      setJobPct(100);
      setJobLabel("تم حفظ النسخة");
      setJobDone(true);
    } catch (e) {
      setJobError((e as Error).message);
    } finally {
      window.clearInterval(creep);
      stopListen?.();
      setBusy(null);
    }
  }
  async function testPrint() {
    setBusy("print");
    try {
      await cmd("print_test_page");
      push("ok", "أُرسلت صفحة الاختبار إلى الطابعة");
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  function go(path: string) {
    nav(path);
    onClose();
  }

  return (
    <div
      role="menu"
      className="absolute top-[calc(100%+6px)] end-0 z-50 w-[360px] max-h-[min(80vh,620px)] overflow-auto rounded-2xl bg-white border border-slate-200 shadow-[0_16px_50px_rgba(15,23,42,0.18)] text-right"
    >
      <div className="px-3.5 py-2.5 border-b border-slate-100 sticky top-0 bg-white z-10">
        <div className="text-sm font-bold text-slate-800">إعدادات سريعة</div>
        <div className="text-[11px] text-slate-400">يُطبَّق فوراً — دون مغادرة الشاشة</div>
      </div>

      <Section title="المظهر">
        <div className="grid grid-cols-3 gap-1.5 mb-2.5">
          {(
            [
              ["light", "فاتح", Sun],
              ["dark", "ليلي", Moon],
              ["system", "تلقائي", Monitor],
            ] as const
          ).map(([id, label, Icon]) => (
            <Chip key={id} active={theme === id} onClick={() => set("ui.theme", id as ThemeMode)}>
              <Icon size={13} />
              {label}
            </Chip>
          ))}
        </div>
        <div className="text-[11px] font-semibold text-slate-500 mb-1.5">حجم الخط</div>
        <div className="mb-2.5 px-0.5">
          <FontScaleSlider compact value={font} onChange={(n) => set("ui.font_size", n)} />
        </div>
        <div className="text-[11px] font-semibold text-slate-500 mb-1.5">اللون الرئيسي</div>
        <div className="grid grid-cols-4 gap-1.5 mb-2.5">
          {(
            [
              ["rose", "وردي", "#9b2c4d"],
              ["gold", "ذهبي", "#c4a265"],
              ["emerald", "أخضر", "#047857"],
              ["navy", "كحلي", "#1d4ed8"],
            ] as const
          ).map(([id, label, color]) => (
            <Chip key={id} active={accent === id} onClick={() => set("ui.accent", id)}>
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
              {label}
            </Chip>
          ))}
        </div>
        <div className="text-[11px] font-semibold text-slate-500 mb-1.5">لون الشريط</div>
        <div className="grid grid-cols-6 gap-1">
          {(
            [
              ["white", "#ffffff", "#cbd5e1"],
              ["glass", "#f1f5f9", "#94a3b8"],
              ["rose", "#4a1426", "#4a1426"],
              ["slate", "#334155", "#334155"],
              ["gold", "#6b5424", "#6b5424"],
              ["navy", "#1e3a5f", "#1e3a5f"],
            ] as const
          ).map(([id, fill, ring]) => (
            <button
              key={id}
              type="button"
              title={id}
              onClick={() => set("nav.color", id)}
              className={`h-8 rounded-lg border ${navColor === id ? "border-rose-500 ring-2 ring-rose-200" : "border-slate-200"}`}
              style={{ background: fill, boxShadow: id === "white" || id === "glass" ? `inset 0 0 0 1px ${ring}` : undefined }}
            />
          ))}
        </div>
      </Section>

      <Section title="نقطة البيع">
        <div className="text-[11px] font-semibold text-slate-500 mb-1.5">وضع العرض</div>
        <div className="grid grid-cols-2 gap-1.5">
          <Chip
            className="!h-11"
            active={(s["pos.display_mode"] || "standard") !== "touch"}
            onClick={() => set("pos.display_mode", "standard")}
          >
            <Monitor size={13} />
            قياسي
          </Chip>
          <Chip
            className="!h-11"
            active={s["pos.display_mode"] === "touch"}
            onClick={() => set("pos.display_mode", "touch")}
          >
            <Touchpad size={13} />
            شاشة لمس
          </Chip>
        </div>
      </Section>

      <Section title="التشغيل اليومي">
        <Switch
          label="طي الشريط الجانبي"
          icon={<PanelRightClose size={14} />}
          checked={s["nav.collapsed"] === "1"}
          onChange={(v) => set("nav.collapsed", v ? "1" : "0")}
        />
        <Switch
          label="طباعة الإيصال بعد البيع"
          icon={<Printer size={14} />}
          checked={settingFlag(s, "pos.auto_print", true)}
          onChange={(v) => flag("pos.auto_print", v, true)}
        />
        <Switch
          label="صوت عند المسح أو الإضافة"
          icon={<Volume2 size={14} />}
          checked={settingFlag(s, "pos.beep", true)}
          onChange={(v) => flag("pos.beep", v, true)}
        />
        <Switch
          label="عميل إلزامي عند البيع"
          checked={s["pos.require_customer"] === "1"}
          onChange={(v) => set("pos.require_customer", v ? "1" : "0")}
        />
        <Switch
          label="تفعيل الضريبة"
          icon={<Percent size={14} />}
          checked={s["tax.enabled"] === "1"}
          onChange={(v) => set("tax.enabled", v ? "1" : "0")}
        />
        <Switch
          label="تنبيه المخزون المنخفض"
          icon={<Bell size={14} />}
          checked={settingFlag(s, "alert.low_stock", true)}
          onChange={(v) => flag("alert.low_stock", v, true)}
        />
        <Switch
          label="تنبيه عمليات البيع"
          checked={settingFlag(s, "alert.sales", true)}
          onChange={(v) => flag("alert.sales", v, true)}
        />
        <Switch
          label="نسخ احتياطي عند إغلاق الوردية"
          icon={<Clock3 size={14} />}
          checked={settingFlag(s, "backup.auto_on_close", true)}
          onChange={(v) => flag("backup.auto_on_close", v, true)}
        />
      </Section>

      <Section title="إجراءات">
        <ActionBtn disabled={busy === "backup"} onClick={() => void backupNow()}>
          <Download size={14} />
          {busy === "backup" ? "جاري النسخ…" : "نسخة احتياطية الآن"}
        </ActionBtn>
        <ActionBtn disabled={busy === "print"} onClick={() => void testPrint()}>
          <Printer size={14} />
          {busy === "print" ? "جاري الاختبار…" : "اختبار الطابعة الحرارية"}
        </ActionBtn>
      </Section>

      <Section title="فتح قسم">
        <Jump icon={<Building2 size={14} />} label="إعدادات المنشأة" onClick={() => go("/settings?s=store")} />
        <Jump icon={<Palette size={14} />} label="المظهر والاستخدام" onClick={() => go("/settings?s=appearance")} />
        <Jump icon={<Printer size={14} />} label="الطابعات" onClick={() => go("/settings?s=print")} />
        <Jump icon={<FileText size={14} />} label="الفواتير" onClick={() => go("/settings?s=invoices")} />
        <Jump icon={<Percent size={14} />} label="المبيعات والضريبة" onClick={() => go("/settings?s=sales")} />
        <Jump icon={<ShoppingBag size={14} />} label="شاشة البيع" onClick={() => go("/settings?s=pos_screen")} />
        <Jump icon={<ShieldCheck size={14} />} label="ترخيص البرنامج" onClick={() => go("/settings?s=license")} />
      </Section>

      <button
        type="button"
        onClick={() => go("/settings")}
        className="sticky bottom-0 w-full px-3.5 py-2.5 border-t border-slate-100 bg-rose-50 text-rose-800 text-sm font-bold flex items-center justify-between hover:bg-rose-100"
      >
        <span className="inline-flex items-center gap-2">
          <Settings size={15} />
          كل الإعدادات
        </span>
        <ChevronLeft size={16} />
      </button>
      <RestoreProgressPopup
        open={jobOpen}
        pct={jobPct}
        label={jobLabel}
        done={jobDone}
        error={jobError}
        workingTitle="جاري أخذ النسخة"
        successTitle="تم حفظ النسخة"
        successMessage="تم إنشاء نسخة احتياطية في مجلد النسخ"
        errorTitle="تعذر أخذ النسخة"
        onClose={() => {
          setJobOpen(false);
          setJobDone(false);
          setJobError(null);
          setJobPct(0);
        }}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-3 py-2.5 border-b border-slate-100">
      <div className="text-[11px] font-bold text-slate-400 mb-2">{title}</div>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  className = "",
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
      className={`h-8 px-1.5 rounded-lg border text-[11px] font-bold inline-flex items-center justify-center gap-1 transition ${
        active ? "bg-rose-700 text-white border-rose-700" : "bg-slate-50 text-slate-600 border-slate-200 hover:border-rose-300"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function Switch({
  label,
  hint,
  checked,
  onChange,
  icon,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 py-1.5 rounded-lg hover:bg-slate-50 px-1"
    >
      <span className="min-w-0 flex items-center gap-2">
        {icon ? <span className="text-slate-400 shrink-0">{icon}</span> : null}
        <span className="text-right">
          <span className="block text-[13px] font-semibold text-slate-800 leading-5">{label}</span>
          {hint ? <span className="block text-[11px] text-slate-400">{hint}</span> : null}
        </span>
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-rose-700" : "bg-slate-200"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "start-4" : "start-0.5"}`} />
      </span>
    </button>
  );
}

function ActionBtn({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full h-9 mb-1 last:mb-0 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-rose-200 text-[13px] font-semibold text-slate-700 inline-flex items-center justify-center gap-2 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Jump({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 py-1.5 px-1 rounded-lg hover:bg-slate-50 text-[13px] font-semibold text-slate-700"
    >
      <span className="inline-flex items-center gap-2">
        <span className="text-slate-400">{icon}</span>
        {label}
      </span>
      <ChevronLeft size={14} className="text-slate-300" />
    </button>
  );
}
