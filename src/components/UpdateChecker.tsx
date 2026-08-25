import { useEffect, useState } from "react";
import { cmd } from "@/services/api";
import { Download, PartyPopper, RefreshCw, Rocket, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

type UpdateCheck = {
  currentVersion: string;
  available: boolean;
  info?: {
    version: string;
    downloadUrl: string;
    releaseNotesAr: string;
    fileSizeMb: number;
  } | null;
};

type Progress = { percent: number; downloadedMb: number; totalMb: number };

export function UpdateChecker({ auto = false }: { auto?: boolean }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheck | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  async function check() {
    setChecking(true);
    setError(null);
    try {
      const res = await cmd<UpdateCheck>("check_update");
      setResult(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function startDownload() {
    if (!result?.info) return;
    setDownloading(true);
    setProgress({ percent: 0, downloadedMb: 0, totalMb: result.info.fileSizeMb });

    const { listen } = await import("@tauri-apps/api/event");
    const unlisten1 = await listen<Progress>("update-progress", (e) => {
      setProgress(e.payload);
    });
    const unlisten2 = await listen<string>("update-error", (e) => {
      setError(e.payload);
      setDownloading(false);
    });
    const unlisten3 = await listen<boolean>("update-ready", () => {
      setProgress({ percent: 100, downloadedMb: result!.info!.fileSizeMb, totalMb: result!.info!.fileSizeMb });
    });

    try {
      await cmd("download_and_install_update", { url: result.info.downloadUrl });
    } catch (e) {
      setError((e as Error).message);
      setDownloading(false);
    }

    return () => {
      unlisten1();
      unlisten2();
      unlisten3();
    };
  }

  useEffect(() => {
    if (auto) {
      const t = window.setTimeout(() => void check(), 5000);
      return () => window.clearTimeout(t);
    }
  }, [auto]);

  if (dismissed) return null;

  if (auto && !result?.available) return null;

  if (auto && result?.available && !downloading) {
    return (
      <div className="fixed bottom-5 left-5 z-[9999] max-w-sm animate-in slide-in-from-bottom-4 duration-500">
        <div className="rounded-2xl bg-white border border-rose-200 shadow-xl p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-700 grid place-items-center shrink-0">
              <Rocket size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm text-slate-800">تحديث جديد متاح!</div>
              <div className="text-xs text-slate-500 mt-0.5">
                الإصدار {result.info?.version} — {result.info?.releaseNotesAr}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                حجم الملف: {result.info?.fileSizeMb} MB
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={() => void startDownload()}>
                  <Download size={14} />
                  تحديث الآن
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setDismissed(true)}>
                  لاحقاً
                </Button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="h-6 w-6 rounded-lg grid place-items-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (downloading) {
    const pct = progress?.percent || 0;
    return (
      <div className="fixed inset-0 z-[9999] bg-black/40 grid place-items-center animate-in fade-in duration-300">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md text-center">
          <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-rose-50 text-rose-700 grid place-items-center">
            <Download size={28} className={pct < 100 ? "animate-bounce" : ""} />
          </div>
          <div className="font-bold text-lg text-slate-800 mb-2">
            {pct >= 100 ? "جاري التثبيت…" : "جاري تنزيل التحديث"}
          </div>
          <div className="text-sm text-slate-500 mb-4">
            {pct >= 100
              ? "سيُغلق البرنامج ويُعاد تشغيله تلقائياً"
              : `${progress?.downloadedMb?.toFixed(1) || 0} / ${progress?.totalMb?.toFixed(1) || 0} MB`}
          </div>
          <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-l from-rose-500 to-rose-700 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-xs text-slate-400 mt-2">{pct}%</div>
          {error && (
            <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!auto) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-7 px-3 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 inline-flex items-center gap-1.5">
            v{result?.currentVersion || "..."}
          </div>
          <Button size="sm" variant="secondary" onClick={() => void check()} disabled={checking}>
            <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
            {checking ? "جاري الفحص…" : "البحث عن تحديثات"}
          </Button>
        </div>
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
            {error}
          </div>
        )}
        {result && !result.available && !error && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
            أنت تستخدم أحدث إصدار ✓
          </div>
        )}
        {result?.available && result.info && (
          <div className="p-4 rounded-xl bg-violet-50 border border-violet-200">
            <div className="flex items-center gap-2 mb-2">
              <Rocket size={16} className="text-violet-700" />
              <span className="font-bold text-sm text-violet-800">إصدار جديد: v{result.info.version}</span>
            </div>
            <p className="text-sm text-violet-700 mb-1">{result.info.releaseNotesAr}</p>
            <p className="text-xs text-violet-500 mb-3">حجم الملف: {result.info.fileSizeMb} MB</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void startDownload()}>
                <Download size={14} />
                تنزيل وتثبيت
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setResult(null)}>
                ذكّرني لاحقاً
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

export function JustUpdatedModal() {
  const [show, setShow] = useState(false);
  const [versions, setVersions] = useState<{ old: string; new: string } | null>(null);

  useEffect(() => {
    cmd<[string, string] | null>("get_just_updated").then((res) => {
      if (res) {
        setVersions({ old: res[0], new: res[1] });
        setShow(true);
      }
    }).catch(() => {});
  }, []);

  function dismiss() {
    setShow(false);
    cmd("clear_just_updated").catch(() => {});
  }

  if (!show || !versions) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 grid place-items-center animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md text-center animate-in zoom-in-95 duration-500">
        <div className="h-20 w-20 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700 grid place-items-center">
          <PartyPopper size={36} />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">تم التحديث بنجاح!</h2>
        <div className="flex items-center justify-center gap-3 mb-3">
          <span className="h-7 px-3 rounded-full bg-slate-100 text-xs font-bold text-slate-500 inline-flex items-center">
            v{versions.old}
          </span>
          <span className="text-slate-400">→</span>
          <span className="h-7 px-3 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 inline-flex items-center">
            v{versions.new}
          </span>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          تم تحديث WATEEN POS إلى الإصدار الجديد بنجاح. استمتع بالتحسينات الجديدة!
        </p>
        <Button onClick={dismiss}>متابعة</Button>
      </div>
    </div>
  );
}
