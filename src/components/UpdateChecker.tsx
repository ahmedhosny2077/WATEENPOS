import { useEffect, useRef, useState } from "react";
import { cmd } from "@/services/api";
import { Download, PartyPopper, RefreshCw, Rocket, Sparkles, X } from "lucide-react";
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

function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const colors = [
      "#f43f5e", "#ec4899", "#a855f7", "#6366f1",
      "#3b82f6", "#06b6d4", "#10b981", "#f59e0b",
      "#ef4444", "#84cc16", "#f97316", "#8b5cf6",
    ];

    type Particle = {
      x: number; y: number; vx: number; vy: number;
      size: number; color: string; rotation: number;
      rotationSpeed: number; shape: "circle" | "rect" | "star";
      opacity: number; gravity: number;
    };

    const particles: Particle[] = [];
    const shapes: ("circle" | "rect" | "star")[] = ["circle", "rect", "star"];

    for (let i = 0; i < 120; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 200,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 18,
        vy: -Math.random() * 20 - 5,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 15,
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        opacity: 1,
        gravity: 0.3 + Math.random() * 0.2,
      });
    }

    let animId: number;
    function animate() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      let alive = false;

      for (const p of particles) {
        p.x += p.vx;
        p.vy += p.gravity;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.vx *= 0.98;
        p.opacity -= 0.005;

        if (p.opacity <= 0) continue;
        alive = true;

        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate((p.rotation * Math.PI) / 180);
        ctx!.globalAlpha = p.opacity;
        ctx!.fillStyle = p.color;

        if (p.shape === "circle") {
          ctx!.beginPath();
          ctx!.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx!.fill();
        } else if (p.shape === "rect") {
          ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx!.beginPath();
          for (let j = 0; j < 5; j++) {
            const angle = (j * 4 * Math.PI) / 5 - Math.PI / 2;
            const r = j % 2 === 0 ? p.size / 2 : p.size / 4;
            if (j === 0) ctx!.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
            else ctx!.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
          }
          ctx!.closePath();
          ctx!.fill();
        }
        ctx!.restore();
      }

      if (alive) animId = requestAnimationFrame(animate);
    }

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 1 }}
    />
  );
}

function FloatingEmojis() {
  const emojis = ["🌹", "✨", "🎉", "🎊", "💫", "⭐", "🌟", "🎈", "🪄", "💐"];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
      {emojis.map((emoji, i) => (
        <span
          key={i}
          className="absolute text-2xl animate-float-up"
          style={{
            left: `${10 + (i * 8)}%`,
            animationDelay: `${i * 0.2}s`,
            animationDuration: `${2.5 + Math.random() * 1.5}s`,
          }}
        >
          {emoji}
        </span>
      ))}
    </div>
  );
}

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
      <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm grid place-items-center animate-in fade-in duration-300">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md text-center animate-in zoom-in-95 slide-in-from-bottom-4 duration-500 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-l from-rose-500 via-violet-500 to-blue-500" />

          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="absolute top-4 left-4 h-8 w-8 rounded-xl grid place-items-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X size={16} />
          </button>

          <div className="h-20 w-20 mx-auto mb-5 rounded-3xl bg-gradient-to-br from-rose-100 via-violet-100 to-blue-100 text-rose-600 grid place-items-center animate-pulse">
            <Rocket size={36} />
          </div>

          <h2 className="text-xl font-bold text-slate-800 mb-2">تحديث جديد متاح!</h2>

          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="h-7 px-3 rounded-full bg-slate-100 text-xs font-bold text-slate-500 inline-flex items-center">
              v{result.currentVersion}
            </span>
            <span className="text-slate-400">←</span>
            <span className="h-7 px-3 rounded-full bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700 inline-flex items-center gap-1">
              <Sparkles size={10} />
              v{result.info?.version}
            </span>
          </div>

          <p className="text-sm text-slate-600 mb-2">{result.info?.releaseNotesAr}</p>
          <p className="text-xs text-slate-400 mb-6">حجم الملف: {result.info?.fileSizeMb} MB</p>

          <div className="flex gap-3 justify-center">
            <Button onClick={() => void startDownload()} className="px-6">
              <Download size={16} />
              تحديث الآن
            </Button>
            <Button variant="secondary" onClick={() => setDismissed(true)} className="px-5">
              ذكّرني لاحقاً
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (downloading) {
    const pct = progress?.percent || 0;
    return (
      <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm grid place-items-center animate-in fade-in duration-300">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md text-center">
          <div className="h-20 w-20 mx-auto mb-5 rounded-3xl bg-gradient-to-br from-rose-100 to-violet-100 text-rose-600 grid place-items-center">
            <Download size={32} className={pct < 100 ? "animate-bounce" : ""} />
          </div>
          <div className="font-bold text-xl text-slate-800 mb-2">
            {pct >= 100 ? "جاري التثبيت…" : "جاري تنزيل التحديث"}
          </div>
          <div className="text-sm text-slate-500 mb-5">
            {pct >= 100
              ? "سيُغلق البرنامج ويُعاد تشغيله تلقائياً"
              : `${progress?.downloadedMb?.toFixed(1) || 0} / ${progress?.totalMb?.toFixed(1) || 0} MB`}
          </div>
          <div className="w-full h-4 rounded-full bg-slate-100 overflow-hidden shadow-inner">
            <div
              className="h-full rounded-full bg-gradient-to-l from-rose-500 via-violet-500 to-blue-500 transition-all duration-500 ease-out relative"
              style={{ width: `${pct}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
            </div>
          </div>
          <div className="text-sm font-bold text-slate-600 mt-3">{pct}%</div>
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
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    cmd<[string, string] | null>("get_just_updated").then((res) => {
      if (res) {
        setVersions({ old: res[0], new: res[1] });
        setShow(true);
        setTimeout(() => setShowConfetti(true), 300);
      }
    }).catch(() => {});
  }, []);

  function dismiss() {
    setShow(false);
    setShowConfetti(false);
    cmd("clear_just_updated").catch(() => {});
  }

  if (!show || !versions) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm grid place-items-center animate-in fade-in duration-300">
      {showConfetti && <Confetti />}
      {showConfetti && <FloatingEmojis />}

      <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md text-center animate-in zoom-in-90 duration-700 relative" style={{ zIndex: 2 }}>
        <div className="absolute top-0 left-0 right-0 h-2 rounded-t-3xl bg-gradient-to-l from-emerald-400 via-teal-400 to-cyan-400" />

        <div className="h-24 w-24 mx-auto mb-6 rounded-[2rem] bg-gradient-to-br from-emerald-100 via-teal-50 to-cyan-100 text-emerald-600 grid place-items-center shadow-lg shadow-emerald-100/50 animate-bounce-slow">
          <PartyPopper size={44} />
        </div>

        <h2 className="text-2xl font-black text-slate-800 mb-3">تم التحديث بنجاح! 🎉</h2>

        <div className="flex items-center justify-center gap-3 mb-4">
          <span className="h-8 px-4 rounded-full bg-slate-100 text-sm font-bold text-slate-400 inline-flex items-center line-through">
            v{versions.old}
          </span>
          <span className="text-emerald-500 text-lg">→</span>
          <span className="h-8 px-4 rounded-full bg-gradient-to-l from-emerald-50 to-teal-50 border-2 border-emerald-300 text-sm font-black text-emerald-700 inline-flex items-center gap-1.5 shadow-sm">
            <Sparkles size={12} className="text-emerald-500" />
            v{versions.new}
          </span>
        </div>

        <p className="text-base text-slate-500 mb-8 leading-relaxed">
          تم تحديث <span className="font-bold text-slate-700">WATEEN POS</span> إلى الإصدار الجديد بنجاح.
          <br />
          استمتع بالتحسينات الجديدة! ✨
        </p>

        <Button onClick={dismiss} className="px-8 py-2.5 text-base">
          🚀 متابعة العمل
        </Button>
      </div>
    </div>
  );
}
