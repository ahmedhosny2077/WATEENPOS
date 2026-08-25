import { useState } from "react";
import { Check, Copy, KeyRound, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BrandLogo } from "@/components/BrandLogo";
import { cmd, type LicenseStatus } from "@/services/api";
import { useToasts } from "@/components/ui/Toast";

function formatKey(raw: string) {
  const clean = raw
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 16);
  return (clean.match(/.{1,4}/g) ?? []).join("-");
}

export function LicensePage({
  info,
  onActivated,
}: {
  info: LicenseStatus;
  onActivated: (next: LicenseStatus) => void;
}) {
  const push = useToasts((s) => s.push);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(info.machineId);
      setCopied(true);
      push("ok", "تم نسخ معرّف الجهاز");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      push("err", "تعذر النسخ. انسخ المعرّف يدوياً.");
    }
  }

  async function activate() {
    const clean = key.replace(/-/g, "").trim();
    if (clean.length !== 16) {
      setError("صيغة المفتاح غير صحيحة");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await cmd<LicenseStatus>("activate_license", { key: key.trim() });
      if (next.status === "licensed") {
        push("ok", next.message);
        onActivated(next);
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
    <div className="h-full overflow-auto bg-[#f5f7fb]">
      <div className="min-h-full grid place-items-center p-4">
        <div className="w-full max-w-lg rounded-3xl bg-white border border-slate-100 shadow-pop overflow-hidden">
          <div className="bg-gradient-to-l from-rose-800 to-rose-950 text-white p-6">
            <div className="text-[11px] font-bold tracking-widest text-rose-100/80">WATEEN POS</div>
            <div className="flex items-center gap-3 mt-2">
              <BrandLogo className="h-12 w-12 rounded-2xl ring-1 ring-white/20" />
              <div>
                <h1 className="text-xl font-black">تفعيل الترخيص</h1>
                <p className="text-sm text-rose-100/85 mt-0.5">{info.message}</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1.5">معرّف الجهاز</div>
              <div className="flex gap-2">
                <div
                  dir="ltr"
                  className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-sm font-bold tracking-wider text-slate-800"
                >
                  {info.machineId}
                </div>
                <Button type="button" variant="secondary" className="shrink-0 px-3" onClick={() => void copyId()}>
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "تم" : "نسخ"}
                </Button>
              </div>
              <p className="text-xs text-slate-400 mt-2">أرسل هذا المعرّف للمطوّر ليصدر لك مفتاح التفعيل.</p>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">مفتاح الترخيص</span>
              <div className="relative">
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
                  className="w-full h-12 rounded-xl border border-slate-200 bg-white pr-10 pl-3 text-center font-mono text-base tracking-[0.2em] text-slate-800 placeholder:tracking-normal placeholder:text-slate-300 focus:border-rose-400 focus:outline-none"
                />
              </div>
            </label>

            {error ? (
              <div className="rounded-xl bg-rose-50 border border-rose-100 text-rose-800 text-sm px-3 py-2.5">
                {error}
              </div>
            ) : null}

            <Button
              type="button"
              className="w-full h-11 rounded-xl"
              disabled={busy || key.replace(/-/g, "").length !== 16}
              onClick={() => void activate()}
            >
              {busy ? "جارٍ التحقق…" : "تفعيل"}
            </Button>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <a
                href="https://wa.me/96550107672"
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-slate-100 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 p-3 flex items-center gap-2"
              >
                <MessageCircle size={16} className="text-emerald-700" />
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-slate-500">واتساب</div>
                  <div className="text-xs font-bold text-slate-800" dir="ltr">
                    +96550107672
                  </div>
                </div>
              </a>
              <a
                href="https://wa.me/201070037001"
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-slate-100 bg-slate-50 hover:bg-rose-50 hover:border-rose-200 p-3 flex items-center gap-2"
              >
                <Phone size={16} className="text-rose-700" />
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-slate-500">واتساب</div>
                  <div className="text-xs font-bold text-slate-800" dir="ltr">
                    +201070037001
                  </div>
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
