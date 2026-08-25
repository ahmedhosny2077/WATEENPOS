import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  MessageCircle,
  Phone,
  ShieldCheck,
  ShieldAlert,
  Timer,
  CalendarDays,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BrandLogo } from "@/components/BrandLogo";
import { cmd, type LicenseStatus } from "@/services/api";
import { useToasts } from "@/components/ui/Toast";
import { useLicense } from "@/stores/license";

function formatKey(raw: string) {
  const clean = raw
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 16);
  return (clean.match(/.{1,4}/g) ?? []).join("-");
}

function statusTone(status?: LicenseStatus["status"]) {
  if (status === "licensed") {
    return {
      banner: "from-emerald-700 to-emerald-950",
      pill: "bg-emerald-50 text-emerald-800 border-emerald-100",
      icon: "bg-white/15 text-white",
      label: "مفعّل",
    };
  }
  if (status === "trial") {
    return {
      banner: "from-amber-600 to-amber-900",
      pill: "bg-amber-50 text-amber-800 border-amber-100",
      icon: "bg-white/15 text-white",
      label: "فترة تجريبية",
    };
  }
  return {
    banner: "from-rose-800 to-rose-950",
    pill: "bg-rose-50 text-rose-800 border-rose-100",
    icon: "bg-white/15 text-white",
    label: "غير مفعّل",
  };
}

export function LicensePanel() {
  const push = useToasts((s) => s.push);
  const license = useLicense((s) => s.info);
  const setLicense = useLicense((s) => s.setInfo);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cmd<LicenseStatus>("check_license")
      .then(setLicense)
      .catch((e) => push("err", (e as Error).message));
  }, [setLicense, push]);

  const tone = statusTone(license?.status);
  const licensed = license?.status === "licensed";
  const trial = license?.status === "trial";

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      push("ok", "تم النسخ");
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      push("err", "تعذر النسخ.");
    }
  }

  async function activate() {
    const clean = key.replace(/-/g, "").trim();
    if (clean.length !== 16) {
      setError("صيغة المفتاح غير صحيحة. استخدم 16 خانة بالشكل XXXX-XXXX-XXXX-XXXX.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await cmd<LicenseStatus>("activate_license", { key: key.trim() });
      setLicense(next);
      if (next.status === "licensed") {
        setKey("");
        push("ok", next.message);
      } else {
        setError(next.message || "تعذر التفعيل");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className={`rounded-3xl overflow-hidden border border-slate-100 shadow-sm bg-gradient-to-l ${tone.banner} text-white`}>
        <div className="p-6 lg:p-7 flex flex-col lg:flex-row lg:items-center gap-5">
          <BrandLogo className="h-16 w-16 rounded-2xl ring-1 ring-white/25" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold tracking-[0.22em] text-white/70">WATEEN POS LICENSE</div>
            <h2 className="text-2xl font-black mt-1">ترخيص البرنامج</h2>
            <p className="text-sm text-white/85 mt-1.5 leading-6">{license?.message || "جاري التحقق من حالة الترخيص…"}</p>
          </div>
          <div className={`self-start lg:self-center rounded-2xl border px-4 py-2 text-sm font-black ${tone.pill}`}>
            {tone.label}
          </div>
        </div>
      </section>

      <div className="grid sm:grid-cols-3 gap-3">
        <Kpi
          icon={licensed ? ShieldCheck : trial ? Timer : ShieldAlert}
          label="الحالة"
          value={tone.label}
          hint={license?.message || "—"}
        />
        <Kpi
          icon={Timer}
          label="الأيام المتبقية"
          value={license ? String(license.daysRemaining) : "—"}
          hint={trial ? "من الفترة التجريبية" : licensed ? "حتى انتهاء الترخيص" : "انتهت الصلاحية"}
        />
        <Kpi
          icon={CalendarDays}
          label="تاريخ الانتهاء"
          value={license?.expiry || (trial ? "تجربة 4 أشهر" : "—")}
          hint={licensed ? "بعد هذا التاريخ يلزم تجديد المفتاح" : "فعّل الترخيص لتحديد تاريخ الانتهاء"}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-slate-50 text-slate-700 grid place-items-center shrink-0">
              <Cpu size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">معرّف هذا الجهاز</h3>
              <p className="text-xs text-slate-500 mt-0.5 leading-5">يُربط المفتاح بهذا الجهاز فقط. أرسله للمطوّر لإصدار الترخيص.</p>
            </div>
          </div>
          <div
            dir="ltr"
            className="rounded-2xl bg-slate-950 text-emerald-300 px-4 py-4 font-mono text-lg font-black tracking-[0.28em] text-center select-all"
          >
            {license?.machineId || "••••••••••••"}
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-full mt-3 h-11"
            disabled={!license?.machineId}
            onClick={() => void copy("mid", license?.machineId || "")}
          >
            {copied === "mid" ? <Check size={16} /> : <Copy size={16} />}
            {copied === "mid" ? "تم نسخ المعرّف" : "نسخ معرّف الجهاز"}
          </Button>
        </section>

        <section className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-700 grid place-items-center shrink-0">
              <KeyRound size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">{licensed ? "الترخيص الحالي" : "تفعيل المفتاح"}</h3>
              <p className="text-xs text-slate-500 mt-0.5 leading-5">
                {licensed
                  ? "البرنامج مفعّل على هذا الجهاز. يمكنك إدخال مفتاح جديد عند التجديد."
                  : "الصق المفتاح بالشكل XXXX-XXXX-XXXX-XXXX ثم اضغط تفعيل."}
              </p>
            </div>
          </div>

          {licensed ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
              <div className="text-[11px] font-bold text-emerald-800">مفعّل حتى</div>
              <div className="text-xl font-black text-emerald-950 mt-1">{license?.expiry || "—"}</div>
              <div className="text-xs text-emerald-800/80 mt-2">متبقي {license?.daysRemaining ?? 0} يوماً</div>
            </div>
          ) : null}

          <label className="block mt-4">
            <span className="text-xs font-bold text-slate-600">{licensed ? "تجديد بمفتاح جديد" : "مفتاح الترخيص"}</span>
            <div className="relative mt-1.5">
              <KeyRound size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-rose-400 pointer-events-none" />
              <input
                dir="ltr"
                value={key}
                onChange={(e) => {
                  setKey(formatKey(e.target.value));
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void activate();
                }}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                spellCheck={false}
                autoComplete="off"
                className="w-full h-12 rounded-xl border border-slate-200 bg-slate-50 pr-10 pl-3 text-center font-mono text-base tracking-[0.22em] text-slate-800 placeholder:tracking-normal placeholder:text-slate-300 focus:bg-white focus:border-rose-400 focus:outline-none"
              />
            </div>
          </label>
          {error ? (
            <div className="mt-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-800 text-sm px-3 py-2.5">{error}</div>
          ) : null}
          <Button
            type="button"
            className="w-full h-11 mt-3"
            disabled={busy || key.replace(/-/g, "").length !== 16}
            onClick={() => void activate()}
          >
            {busy ? "جارٍ التحقق…" : licensed ? "تجديد الترخيص" : "تفعيل الترخيص"}
          </Button>
        </section>
      </div>

      <section className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
        <h3 className="font-bold text-sm text-slate-800 mb-4">خطوات التفعيل</h3>
        <div className="grid sm:grid-cols-4 gap-3">
          {[
            ["1", "انسخ معرّف الجهاز"],
            ["2", "أرسله للمطوّر عبر واتساب"],
            ["3", "الصق المفتاح الصادر لك"],
            ["4", "اضغط تفعيل"],
          ].map(([n, t]) => (
            <div key={n} className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">
              <div className="h-7 w-7 rounded-lg bg-rose-700 text-white text-xs font-black grid place-items-center">{n}</div>
              <div className="text-sm font-semibold text-slate-700 mt-2 leading-5">{t}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
        <h3 className="font-bold text-sm text-slate-800 mb-1">للحصول على مفتاح</h3>
        <p className="text-xs text-slate-500 mb-4">تواصل مع المطوّر وأرسل معرّف الجهاز الظاهر أعلاه.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <a
            href="https://wa.me/96550107672"
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-slate-100 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 p-4 flex items-center gap-3"
          >
            <div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center">
              <MessageCircle size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-500">واتساب الكويت</div>
              <div className="font-bold text-slate-800" dir="ltr">
                +96550107672
              </div>
            </div>
          </a>
          <a
            href="https://wa.me/201070037001"
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-slate-100 bg-slate-50 hover:bg-rose-50 hover:border-rose-200 p-4 flex items-center gap-3"
          >
            <div className="h-11 w-11 rounded-xl bg-rose-50 text-rose-700 grid place-items-center">
              <Phone size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-500">واتساب مصر</div>
              <div className="font-bold text-slate-800" dir="ltr">
                +201070037001
              </div>
            </div>
          </a>
        </div>
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm px-4 py-4">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon size={14} />
        <span className="text-[11px] font-bold">{label}</span>
      </div>
      <div className="text-lg font-black text-slate-800 mt-2 truncate">{value}</div>
      <div className="text-[11px] text-slate-400 mt-1 leading-4">{hint}</div>
    </div>
  );
}
