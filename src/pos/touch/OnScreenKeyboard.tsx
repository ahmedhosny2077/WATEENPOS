import type { MouseEvent, PointerEvent, ReactNode } from "react";
import { Globe, KeyboardOff } from "lucide-react";
import { cn } from "@/utils/cn";

export type OskKind = "text" | "numeric";
export type OskLang = "ar" | "en";

const AR_ROWS = [
  ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج", "د"],
  ["ش", "س", "ي", "ب", "ل", "ا", "ت", "ن", "م", "ك", "ط"],
  ["ئ", "ء", "ؤ", "ر", "لا", "ى", "ة", "و", "ز", "ظ", "أ"],
];

const EN_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

type Props = {
  kind: OskKind;
  lang: OskLang;
  enterLabel?: string;
  allowText?: boolean;
  onInsert: (ch: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onEnter: () => void;
  onClose: () => void;
  onLang: (lang: OskLang) => void;
  onKind: (kind: OskKind) => void;
};

function holdFocus(e: PointerEvent | MouseEvent) {
  e.preventDefault();
}

export function OnScreenKeyboard({
  kind,
  lang,
  enterLabel = "تم",
  allowText = true,
  onInsert,
  onBackspace,
  onClear,
  onEnter,
  onClose,
  onLang,
  onKind,
}: Props) {
  return (
    <div
      dir={kind === "numeric" || lang === "en" ? "ltr" : "rtl"}
      className="shrink-0 border-t border-slate-200 bg-[#1e293b] text-white px-1.5 pt-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))] select-none"
      onPointerDown={holdFocus}
      onMouseDown={holdFocus}
    >
      {kind === "numeric" ? (
        <div className="max-w-sm mx-auto">
          <div className="grid grid-cols-4 gap-1.5">
            {["7", "8", "9"].map((k) => (
              <KeyBtn key={k} label={k} onPress={() => onInsert(k)} />
            ))}
            <KeyBtn label="⌫" onPress={onBackspace} tone="mute" />
            {["4", "5", "6"].map((k) => (
              <KeyBtn key={k} label={k} onPress={() => onInsert(k)} />
            ))}
            <KeyBtn label="C" onPress={onClear} tone="warn" />
            {["1", "2", "3"].map((k) => (
              <KeyBtn key={k} label={k} onPress={() => onInsert(k)} />
            ))}
            <KeyBtn label="00" onPress={() => onInsert("00")} />
            <KeyBtn label="0" onPress={() => onInsert("0")} />
            <KeyBtn label="." onPress={() => onInsert(".")} />
            <KeyBtn label={enterLabel} span={2} onPress={onEnter} tone="go" />
          </div>
          <div className="flex items-center justify-between mt-1.5 gap-1.5">
            {allowText ? (
              <KeyBtn label="أبجد" onPress={() => onKind("text")} tone="mute" compact />
            ) : (
              <span />
            )}
            <HideBtn onPress={onClose} />
          </div>
        </div>
      ) : (
        <div className="max-w-5xl mx-auto space-y-1">
          <div className="grid grid-cols-10 gap-1">
            {"1234567890".split("").map((k) => (
              <KeyBtn key={k} label={k} onPress={() => onInsert(k)} compact />
            ))}
          </div>
          {(lang === "ar" ? AR_ROWS : EN_ROWS).map((row, i) => (
            <div
              key={i}
              className="flex gap-1 justify-center"
              style={{ paddingInline: i === 1 ? "0.75rem" : i === 2 ? "1.25rem" : 0 }}
            >
              {row.map((k) => (
                <KeyBtn key={k} label={lang === "en" ? k.toUpperCase() : k} onPress={() => onInsert(k)} />
              ))}
              {i === 2 ? <KeyBtn label="⌫" onPress={onBackspace} tone="mute" /> : null}
            </div>
          ))}
          <div className="flex gap-1">
            <KeyBtn
              label="123"
              onPress={() => onKind("numeric")}
              tone="mute"
              compact
            />
            <KeyBtn
              label={lang === "ar" ? "EN" : "ع"}
              icon={<Globe size={16} />}
              onPress={() => onLang(lang === "ar" ? "en" : "ar")}
              tone="mute"
              compact
            />
            <button
              type="button"
              className="flex-1 min-h-12 rounded-xl bg-slate-600 text-base font-bold active:bg-slate-500"
              onPointerDown={holdFocus}
              onClick={() => onInsert(" ")}
            >
              مسافة
            </button>
            <KeyBtn label="C" onPress={onClear} tone="warn" compact />
            <KeyBtn label={enterLabel} onPress={onEnter} tone="go" />
            <HideBtn onPress={onClose} />
          </div>
        </div>
      )}
    </div>
  );
}

function KeyBtn({
  label,
  icon,
  onPress,
  tone = "key",
  span,
  compact,
}: {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  tone?: "key" | "mute" | "warn" | "go";
  span?: number;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onPointerDown={holdFocus}
      onClick={onPress}
      style={span ? { gridColumn: `span ${span}` } : undefined}
      className={cn(
        "min-h-11 rounded-xl text-base font-bold active:brightness-125 touch-manipulation",
        compact ? "min-w-10 px-2" : "min-w-12 px-2.5 flex-1",
        tone === "key" && "bg-slate-500 text-white",
        tone === "mute" && "bg-slate-700 text-slate-100",
        tone === "warn" && "bg-rose-800 text-white",
        tone === "go" && "bg-emerald-600 text-white",
      )}
    >
      <span className="inline-flex items-center justify-center gap-1">
        {icon}
        {label}
      </span>
    </button>
  );
}

function HideBtn({ onPress }: { onPress: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={holdFocus}
      onClick={onPress}
      className="h-12 px-4 rounded-xl bg-slate-700 text-slate-200 inline-flex items-center gap-1.5 text-xs font-bold"
      aria-label="إخفاء لوحة المفاتيح"
    >
      <KeyboardOff size={16} />
      إخفاء
    </button>
  );
}
