import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { I18nProvider } from "@/i18n";
import { ToastHost } from "@/components/ui/Toast";
import { AppShell } from "@/layouts/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { PosPage } from "@/pages/PosPage";
import { InvoicesPage } from "@/pages/InvoicesPage";
import { ReturnsPage } from "@/pages/ReturnsPage";
import { ProductsPage } from "@/pages/ProductsPage";
import { ProductFormPage } from "@/pages/ProductFormPage";
import { InventoryPage } from "@/pages/InventoryPage";
import { PurchasesPage } from "@/pages/PurchasesPage";
import { CustomersPage, SuppliersPage } from "@/pages/PartiesPage";
import { CustomerDetailPage } from "@/pages/CustomerDetailPage";
import { ExpensesPage } from "@/pages/ExpensesPage";
import { ExpenseFormPage } from "@/pages/ExpenseFormPage";
import { CashPage } from "@/pages/CashPage";
import { NotificationsPage } from "@/pages/NotificationsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { ShiftsPage } from "@/pages/ShiftsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { cmd, type AppStatus, type LicenseStatus } from "@/services/api";
import { useSession } from "@/stores/session";
import { usePrefs } from "@/stores/prefs";
import { useLicense } from "@/stores/license";
import { applyChrome, applyTheme, normalizeTheme } from "@/theme";
import { LicensePage } from "@/pages/LicensePage";
import { BrandLogo } from "@/components/BrandLogo";
import { JustUpdatedModal, UpdateChecker } from "@/components/UpdateChecker";

function hideSplash() {
  const el = document.getElementById("splash");
  if (el) {
    el.classList.add("hide");
    setTimeout(() => el.remove(), 700);
  }
}

function LoadingMark({ text }: { text: string }) {
  return (
    <div className="h-full grid place-items-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <BrandLogo className="h-20 w-20 rounded-2xl shadow-lg animate-pulse" />
        <div className="space-y-1.5">
          <div className="text-lg font-bold bg-gradient-to-l from-rose-600 to-violet-600 bg-clip-text text-transparent">
            مرحباً بك في نظام الوتين
          </div>
          <div className="text-sm text-slate-400">{text}</div>
        </div>
        <div className="w-48 h-1 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full w-1/3 rounded-full bg-gradient-to-l from-rose-500 to-violet-500 animate-[splash-loading_1.4s_ease-in-out_infinite]" />
        </div>
      </div>
    </div>
  );
}

function ThemeSync() {
  const mode = usePrefs((p) => normalizeTheme(p.values["ui.theme"]));
  useEffect(() => {
    applyTheme(mode);
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);
  useEffect(() => {
    const onResize = () => applyChrome(usePrefs.getState().values);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return null;
}

function LicenseGate() {
  const info = useLicense((s) => s.info);
  const setInfo = useLicense((s) => s.setInfo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cmd<LicenseStatus>("check_license")
      .then(setInfo)
      .catch((e) => setError((e as Error).message));
  }, [setInfo]);

  if (error) {
    return (
      <div className="h-full grid place-items-center p-6 text-center">
        <div className="max-w-md space-y-2">
          <div className="font-bold text-slate-800">تعذر التحقق من الترخيص</div>
          <p className="text-sm text-ink-muted">{error}</p>
          <p className="text-xs text-slate-400">أغلق البرنامج ثم شغّله من جديد بعد تحديثه.</p>
        </div>
      </div>
    );
  }
  if (!info) {
    return <LoadingMark text="جاري التحقق من الترخيص…" />;
  }
  if (info.status === "expired") {
    return <LicensePage info={info} onActivated={setInfo} />;
  }
  return <Gate />;
}

function Gate() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const { setShift } = useSession();

  async function refresh() {
    const s = await cmd<AppStatus>("app_status");
    setStatus(s);
    setShift(s.openShift);
  }
  useEffect(() => {
    refresh().catch(() => setStatus({ initialized: true, openShift: null, lockMinutes: 10 }));
  }, []);

  useEffect(() => {
    if (status) hideSplash();
  }, [status]);

  if (!status) return <LoadingMark text="جاري التحميل…" />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/pos" replace />} />
        <Route path="/home" element={<Dashboard />} />
        <Route path="/pos" element={<PosPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/new" element={<ProductFormPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/expenses/new" element={<ExpenseFormPage />} />
        <Route path="/cash" element={<CashPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/shifts" element={<ShiftsPage />} />
        <Route path="/users" element={<Navigate to="/shifts" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/backup" element={<Navigate to="/settings" replace />} />
        <Route path="*" element={<Navigate to="/pos" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <BrowserRouter>
        <ThemeSync />
        <LicenseGate />
        <ToastHost />
        <UpdateChecker auto />
        <JustUpdatedModal />
      </BrowserRouter>
    </I18nProvider>
  );
}
