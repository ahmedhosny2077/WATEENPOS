import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  BarChart3,
  Keyboard,
  LogIn,
  LogOut,
  Maximize2,
  Minimize2,
  Moon,
  Package,
  PauseCircle,
  ShoppingBag,
  Sun,
  Undo2,
  Warehouse,
  Wallet,
} from "lucide-react";
import { cmd, money } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useToasts } from "@/components/ui/Toast";
import { useSession } from "@/stores/session";
import { usePrefs } from "@/stores/prefs";
import { normalizeTheme, resolvedDark } from "@/theme";
import { QuickSettingsButton } from "@/layouts/QuickSettings";
import { NotificationsBell } from "@/layouts/NotificationsBell";

type HeldRow = { id: number; createdAt: string; itemCount: number };
type ShiftCashRow = { id: number; expectedCash: number; openingCash: number; status: string };

const ROLE: Record<string, string> = {
  administrator: "مدير النظام",
  manager: "مدير",
  cashier: "كاشير",
  warehouse_clerk: "أمين مخزن",
};

const SHORTCUTS = [
  { key: "F1", to: "/pos", label: "نقطة البيع", icon: ShoppingBag, perm: "sales.create", navKey: "pos" },
  { key: "F3", to: "/products", label: "المنتجات", icon: Package, perm: "products.view", navKey: "products" },
  { key: "F4", to: "/inventory", label: "المخزون", icon: Warehouse, perm: "stock.view", navKey: "inventory" },
  { key: "F6", to: "/returns", label: "المرتجعات", icon: Undo2, perm: "sales.return", navKey: "returns" },
  { key: "F7", to: "/expenses", label: "المصروفات", icon: Wallet, perm: "expenses.manage", navKey: "expenses" },
  { key: "F12", to: "/reports", label: "التقارير", icon: BarChart3, perm: "reports.view", navKey: "reports" },
] as const;

const HELP = [
  ["F1", "نقطة البيع"],
  ["F2", "البحث في نقطة البيع"],
  ["F3", "المنتجات"],
  ["F4", "المخزون"],
  ["F6", "المرتجعات"],
  ["F7", "المصروفات"],
  ["F8", "تعليق الفاتورة"],
  ["F9", "حفظ الفاتورة"],
  ["F10", "حفظ وطباعة"],
  ["F11", "تكبير / استعادة النافذة"],
  ["F12", "التقارير"],
  ["Esc", "إغلاق النوافذ"],
];

export function TopBar() {
  const nav = useNavigate();
  const loc = useLocation();
  const push = useToasts((s) => s.push);
  const { shift, setShift, setResumeCart, can, askOpenShift } = useSession();
  const show = usePrefs((p) => p.show);
  const store = usePrefs((p) => p.values["store.name"] || "WATEEN POS");
  const themeMode = usePrefs((p) => normalizeTheme(p.values["ui.theme"]));
  const patch = usePrefs((p) => p.patch);
  const shiftPrefs = usePrefs((p) => p.values);
  const dark = resolvedDark(themeMode);
  const [clock, setClock] = useState(nowLabel());
  const [maximized, setMaximized] = useState(false);
  const [heldCount, setHeldCount] = useState(0);
  const [closeOpen, setCloseOpen] = useState(false);
  const [actual, setActual] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [expectedCash, setExpectedCash] = useState<number | null>(null);
  const [heldOpen, setHeldOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [held, setHeld] = useState<HeldRow[]>([]);
  const [busy, setBusy] = useState(false);

  const allowed = (perm: string) => can(perm) || shift?.roleCode === "administrator";

  const shortcuts = useMemo(
    () => SHORTCUTS.filter((s) => show[s.navKey] !== false && (!shift || allowed(s.perm))),
    [show, shift],
  );

  useEffect(() => {
    refreshHeldCount();
    syncMax();
    const t = window.setInterval(() => {
      setClock(nowLabel());
      refreshHeldCount();
    }, 20000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return;
      if (e.key === "Escape") {
        setHeldOpen(false);
        setCloseOpen(false);
        setHelpOpen(false);
        return;
      }
      const blocked = heldOpen || closeOpen || helpOpen;
      if (blocked) return;
      const go = shortcuts.find((s) => s.key === e.key);
      if (go) {
        e.preventDefault();
        nav(go.to);
        return;
      }
      if (e.key === "F11") {
        e.preventDefault();
        toggleMax();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts, heldOpen, closeOpen, helpOpen, nav]);

  const requireCloseCount = shiftPrefs["shift.require_close_count"] !== "0";
  const showExpected = shiftPrefs["shift.show_expected"] !== "0";
  const noteOnClose = shiftPrefs["shift.note_on_close"] === "1";
  const maxHours = Number(shiftPrefs["shift.max_hours"] || 12);
  const openedHours = shift
    ? (() => {
        const raw = shift.openedAt;
        const d = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
        if (Number.isNaN(d.getTime())) return 0;
        return (Date.now() - d.getTime()) / 3600000;
      })()
    : 0;
  const overtime = maxHours > 0 && openedHours > maxHours;

  useEffect(() => {
    if (!closeOpen || !shift) return;
    setCloseNotes("");
    setExpectedCash(null);
    const requireCount = usePrefs.getState().values["shift.require_close_count"] !== "0";
    cmd<ShiftCashRow[]>("list_shifts")
      .then((rows) => {
        const row = rows.find((r) => r.id === shift.id);
        const expected = row?.expectedCash ?? shift.openingCash;
        setExpectedCash(expected);
        setActual(requireCount ? "" : (expected / 100).toFixed(2));
      })
      .catch(() => {
        setExpectedCash(shift.openingCash);
        setActual(requireCount ? "" : (shift.openingCash / 100).toFixed(2));
      });
  }, [closeOpen, shift]);

  async function syncMax() {
    try {
      setMaximized(await getCurrentWindow().isMaximized());
    } catch {
      /* browser preview */
    }
  }

  async function refreshHeldCount() {
    try {
      const rows = await cmd<HeldRow[]>("list_held");
      setHeldCount(rows.length);
    } catch {
      /* ignore */
    }
  }

  async function toggleMax() {
    try {
      await getCurrentWindow().toggleMaximize();
      await syncMax();
    } catch {
      /* browser preview */
    }
  }

  async function closeShift() {
    if (requireCloseCount && actual.trim() === "") {
      push("err", "اكتب المبلغ الفعلي في الصندوق.");
      return;
    }
    const actualCash = Math.round(Number(actual || "0") * 100);
    if (!Number.isFinite(actualCash) || actualCash < 0) {
      push("err", "المبلغ الفعلي غير صالح.");
      return;
    }
    setBusy(true);
    try {
      await cmd("close_shift", {
        actualCash,
        notes: noteOnClose ? closeNotes.trim() || null : null,
      });
      const autoBackup = usePrefs.getState().values["backup.auto_on_close"] !== "0";
      if (autoBackup) {
        try {
          await cmd("backup_now", { dest: null });
        } catch {
          /* backup is best-effort after close */
        }
      }
      push("ok", "تم إغلاق الوردية");
      setShift(null);
      setCloseOpen(false);
      nav("/pos");
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openHeld() {
    setHeldOpen(true);
    try {
      const rows = await cmd<HeldRow[]>("list_held");
      setHeld(rows);
      setHeldCount(rows.length);
    } catch (e) {
      push("err", (e as Error).message);
    }
  }

  async function resume(id: number) {
    setBusy(true);
    try {
      const r = await cmd<{
        customerId: number | null;
        invoiceDiscount: number;
        items: { variantId: number; name: string; variantName: string; price: number; qty: number; discount: number; storeQty: number }[];
      }>("resume_held", { id });
      setResumeCart({
        customerId: r.customerId,
        invoiceDiscount: r.invoiceDiscount,
        lines: r.items,
      });
      setHeldOpen(false);
      setHeldCount((n) => Math.max(0, n - 1));
      nav("/pos");
      push("ok", "تم استئناف الفاتورة");
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const role = ROLE[shift?.roleCode || ""] || shift?.roleCode || "";

  return (
    <>
      <header className="h-14 shrink-0 bg-white border-b border-slate-100 shadow-sm flex items-center gap-2.5 px-4">
        <div className="flex items-center gap-2.5 min-w-0 w-[220px]" data-tauri-drag-region>
          <div className="min-w-0">
            <div className="font-bold text-sm text-slate-800 truncate leading-4">{store}</div>
            <div className="text-[10px] text-slate-400 truncate mt-0.5">
              {shift ? (
                <>
                  {shift.userName}
                  {role ? ` · ${role}` : ""}
                  {` · ${clock}`}
                </>
              ) : (
                <>لا توجد وردية · {clock}</>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto">
          {shortcuts.map((s) => {
            const Icon = s.icon;
            const active = loc.pathname === s.to;
            return (
              <button
                key={s.to}
                type="button"
                onClick={() => nav(s.to)}
                className={`h-9 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border whitespace-nowrap transition ${
                  active
                    ? "bg-rose-700 text-white border-rose-700"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:border-rose-300 hover:bg-rose-50"
                }`}
              >
                <Icon size={15} />
                {s.label}
                <Kbd active={active}>{s.key}</Kbd>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {shift ? (
            <>
              <TopBtn icon={<Undo2 size={15} />} onClick={() => nav("/returns")}>
                مرتجع
              </TopBtn>
              <TopBtn icon={<PauseCircle size={15} />} onClick={openHeld} badge={heldCount || undefined}>
                معلّقة
              </TopBtn>
              <TopBtn icon={<LogOut size={15} />} onClick={() => setCloseOpen(true)} danger>
                إغلاق الوردية
              </TopBtn>
            </>
          ) : (
            <TopBtn icon={<LogIn size={15} />} onClick={askOpenShift} primary>
              فتح الوردية
            </TopBtn>
          )}
          <span className="w-px h-9 bg-slate-200 mx-0.5" />
          <NotificationsBell />
          <IconBtn
            title={dark ? "الوضع الفاتح" : "الوضع الليلي"}
            onClick={() => patch("ui.theme", dark ? "light" : "dark", true)}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </IconBtn>
          <IconBtn title="اختصارات لوحة المفاتيح" onClick={() => setHelpOpen(true)}>
            <Keyboard size={16} />
          </IconBtn>
          {show.settings !== false && (!shift || allowed("settings.manage")) ? (
            <QuickSettingsButton pageActive={loc.pathname === "/settings"} />
          ) : null}
          <IconBtn title={maximized ? "استعادة النافذة · F11" : "تكبير · F11"} onClick={toggleMax}>
            {maximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </IconBtn>
        </div>
      </header>

      <Modal open={closeOpen} title="إغلاق الوردية" onClose={() => setCloseOpen(false)}>
        <p className="text-slate-500 text-sm mb-3 leading-7">اكتب المبلغ الفعلي في الصندوق ثم أكّد الإغلاق.</p>
        {overtime ? (
          <div className="mb-3 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
            تجاوزت الوردية الحد الأقصى ({maxHours} ساعة). المدة الحالية حوالي {openedHours.toFixed(1)} ساعة.
          </div>
        ) : null}
        {showExpected ? (
          <div className="mb-3 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">النقد المتوقع</span>
            <span className="font-bold text-slate-800">{expectedCash == null ? "…" : money(expectedCash)}</span>
          </div>
        ) : null}
        <label className="block space-y-1.5 mb-3">
          <span className="text-xs font-semibold text-slate-600">
            المبلغ الفعلي في الصندوق{requireCloseCount ? " *" : ""}
          </span>
          <Input value={actual} onChange={(e) => setActual(e.target.value)} inputMode="decimal" className="h-9" />
        </label>
        {noteOnClose ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">ملاحظة الإغلاق</span>
            <Textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} placeholder="سبب العجز أو الزيادة إن وُجد" />
          </label>
        ) : null}
        <Button className="w-full mt-4" disabled={busy} onClick={closeShift}>
          تأكيد الإغلاق
        </Button>
      </Modal>

      <Modal open={heldOpen} title="الفواتير المعلقة" onClose={() => setHeldOpen(false)}>
        {held.length === 0 ? (
          <p className="text-slate-400 text-center py-8">لا توجد فواتير معلّقة.</p>
        ) : (
          <div className="space-y-2">
            {held.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5">
                <div>
                  <div className="font-bold text-slate-800">فاتورة #{h.id}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {h.itemCount} صنف · {h.createdAt.replace("T", " ")}
                  </div>
                </div>
                <Button size="sm" disabled={busy} onClick={() => resume(h.id)}>
                  استئناف
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={helpOpen} title="اختصارات لوحة المفاتيح" onClose={() => setHelpOpen(false)}>
        <div className="grid grid-cols-1 gap-1.5">
          {HELP.map(([k, label]) => (
            <div key={k} className="flex items-center justify-between rounded-xl px-3 py-2.5 bg-slate-50">
              <span className="text-slate-700">{label}</span>
              <Kbd>{k}</Kbd>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}

function Kbd({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={`text-[10px] font-bold rounded-md px-1.5 py-0.5 leading-none ${
        active ? "bg-white/20 text-white" : "bg-white text-slate-400 border border-slate-200"
      }`}
    >
      {children}
    </span>
  );
}

function TopBtn({
  children,
  icon,
  onClick,
  badge,
  danger,
  primary,
}: {
  children: string;
  icon: ReactNode;
  onClick: () => void;
  badge?: number;
  danger?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative h-9 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition ${
        primary
          ? "bg-rose-700 text-white border-rose-700 hover:bg-rose-800"
          : danger
            ? "bg-white text-rose-800 border-rose-100 hover:bg-rose-50 hover:border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800"
            : "bg-white text-slate-600 border-slate-200 hover:border-rose-300 hover:bg-rose-50"
      }`}
    >
      {icon}
      {children}
      {badge ? (
        <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-700 text-white text-[10px] grid place-items-center">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`h-9 w-9 rounded-lg border grid place-items-center transition ${
        active
          ? "bg-rose-700 text-white border-rose-700"
          : "bg-white text-slate-500 border-slate-200 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800"
      }`}
    >
      {children}
    </button>
  );
}

function nowLabel() {
  return new Date().toLocaleString("ar-EG", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
