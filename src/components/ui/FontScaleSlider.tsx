import { useEffect, useState } from "react";
import { cn } from "@/utils/cn";
import {
  computeUiZoom,
  parseUiFontSize,
  uiFontLabel,
  UI_FONT_DEFAULT,
  UI_FONT_MAX,
  UI_FONT_MIN,
} from "@/theme";

export function FontScaleSlider({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (next: string) => void;
  compact?: boolean;
}) {
  const size = parseUiFontSize(value);
  const [, setFitTick] = useState(0);
  useEffect(() => {
    const onResize = () => setFitTick((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const fit = computeUiZoom(size);
  const pct = ((size - UI_FONT_MIN) / (UI_FONT_MAX - UI_FONT_MIN)) * 100;

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      <div className="flex items-end justify-between gap-3">
        <div className={cn("font-bold text-slate-800", compact ? "text-[13px]" : "text-sm")}>
          {uiFontLabel(size)}
        </div>
        <div className="text-end shrink-0">
          <div className="text-lg font-black text-rose-800 tabular-nums leading-none">{fit.percent}٪</div>
          <div className="text-[10px] font-semibold text-slate-400 mt-1">{size}px</div>
        </div>
      </div>

      <div dir="ltr" className="flex items-center gap-3">
        <span className="text-[11px] font-bold text-slate-400 shrink-0" style={{ fontSize: 11 }}>
          أ
        </span>
        <input
          type="range"
          min={UI_FONT_MIN}
          max={UI_FONT_MAX}
          step={1}
          value={size}
          aria-label="حجم خط البرنامج"
          onChange={(e) => onChange(e.target.value)}
          className="font-scale-range flex-1"
          style={{ ["--p" as string]: `${pct}%` }}
        />
        <span className="text-[18px] font-black text-slate-700 shrink-0 leading-none">أ</span>
      </div>

      <div dir="ltr" className="flex justify-between text-[10px] font-semibold text-slate-400 px-0.5">
        <span>تصغير</span>
        <button
          type="button"
          className={cn(
            "text-[10px] font-bold",
            size === UI_FONT_DEFAULT ? "text-slate-300 pointer-events-none" : "text-rose-700 hover:text-rose-800",
          )}
          onClick={() => onChange(String(UI_FONT_DEFAULT))}
        >
          عادي
        </button>
        <span>تكبير</span>
      </div>

      {fit.capped ? (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 leading-5">
          حجم الشاشة الحالية يحدّ التكبير تلقائياً حتى يبقى العرض متناسقاً دون قصّ أو تمرير زائد.
        </p>
      ) : null}
    </div>
  );
}
