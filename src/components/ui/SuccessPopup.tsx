import { useEffect } from "react";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function SuccessPopup({
  open,
  title,
  message,
  detail,
  duration = 2200,
  onDone,
}: {
  open: boolean;
  title: string;
  message?: string;
  detail?: string;
  duration?: number;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(onDone, duration);
    return () => window.clearTimeout(t);
  }, [open, onDone, duration]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/30 p-4">
      <div
        className="w-full max-w-xs rounded-3xl bg-white border border-slate-100 shadow-pop px-8 py-8 text-center"
        style={{ animation: "saved-pop 0.28s ease-out" }}
      >
        <div className="relative mx-auto h-16 w-16">
          <div
            className="absolute inset-0 rounded-full bg-emerald-50 border border-emerald-100"
            style={{ animation: "saved-ring 0.35s ease-out" }}
          />
          <div
            className="absolute inset-0 grid place-items-center text-emerald-600"
            style={{ animation: "saved-check 0.45s ease-out" }}
          >
            <Check size={34} strokeWidth={2.75} />
          </div>
        </div>
        <div className="mt-4 text-lg font-black text-slate-800">{title}</div>
        {detail ? (
          <div className="mt-2 text-xl font-black text-rose-700 tracking-wide" dir="ltr">
            {detail}
          </div>
        ) : null}
        {message ? <p className="text-xs text-slate-500 mt-2 leading-5">{message}</p> : null}
      </div>
    </div>
  );
}

export function RestoreProgressPopup({
  open,
  pct,
  label,
  done,
  error,
  onClose,
  workingTitle = "جاري استعادة النسخة",
  successTitle = "تمت الاستعادة بنجاح",
  successMessage = "عادت بيانات البرنامج من النسخة الاحتياطية. أعد فتح البرنامج إذا لزم.",
  errorTitle = "تعذرت الاستعادة",
}: {
  open: boolean;
  pct: number;
  label: string;
  done: boolean;
  error?: string | null;
  onClose: () => void;
  workingTitle?: string;
  successTitle?: string;
  successMessage?: string;
  errorTitle?: string;
}) {
  useEffect(() => {
    if (!open || !done || error) return;
    const t = window.setTimeout(onClose, 4200);
    return () => window.clearTimeout(t);
  }, [open, done, error, onClose]);

  if (!open) return null;

  const value = Math.max(0, Math.min(100, Math.round(pct)));
  const failed = Boolean(error);

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-900/45 p-4">
      <div
        className="w-full max-w-sm rounded-3xl bg-white border border-slate-100 shadow-pop px-7 py-7 text-center"
        style={{ animation: "saved-pop 0.28s ease-out" }}
      >
        {failed ? (
          <>
            <div className="mx-auto h-16 w-16 rounded-full bg-rose-50 border border-rose-100 text-rose-700 grid place-items-center">
              <AlertTriangle size={30} />
            </div>
            <div className="mt-4 text-lg font-black text-slate-800">{errorTitle}</div>
            <p className="text-sm text-slate-500 mt-2 leading-6">{error}</p>
            <Button className="mt-5 w-full justify-center" onClick={onClose}>
              حسناً
            </Button>
          </>
        ) : done ? (
          <>
            <div className="relative mx-auto h-16 w-16">
              <div
                className="absolute inset-0 rounded-full bg-emerald-50 border border-emerald-100"
                style={{ animation: "saved-ring 0.35s ease-out" }}
              />
              <div
                className="absolute inset-0 grid place-items-center text-emerald-600"
                style={{ animation: "saved-check 0.45s ease-out" }}
              >
                <Check size={34} strokeWidth={2.75} />
              </div>
            </div>
            <div className="mt-4 text-lg font-black text-slate-800">{successTitle}</div>
            <p className="text-sm text-slate-500 mt-2 leading-6">{successMessage}</p>
            <Button className="mt-5 w-full justify-center" onClick={onClose}>
              حسناً
            </Button>
          </>
        ) : (
          <>
            <div className="mx-auto h-16 w-16 rounded-full bg-rose-50 border border-rose-100 text-rose-700 grid place-items-center">
              <RefreshCw size={28} className="animate-spin" />
            </div>
            <div className="mt-4 text-lg font-black text-slate-800">{workingTitle}</div>
            <p className="text-sm text-slate-500 mt-2 leading-6 min-h-[48px]">{label}</p>
            <div
              className="mt-4 h-3 rounded-full bg-slate-100 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={value}
            >
              <div
                className="h-full rounded-full bg-rose-600"
                style={{ width: `${value}%`, transition: "width 0.35s ease-out" }}
              />
            </div>
            <div className="mt-2 text-sm font-bold text-rose-800 tabular-nums">{value}٪</div>
          </>
        )}
      </div>
    </div>
  );
}
