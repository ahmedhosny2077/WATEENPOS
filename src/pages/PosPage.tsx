import { useEffect } from "react";
import { usePos } from "@/pos/usePos";
import { isTouchPos } from "@/pos/helpers";
import { StandardPosView } from "@/pos/StandardPosView";
import { TouchPosView } from "@/pos/touch/TouchPosView";
import { usePrefs } from "@/stores/prefs";

export function PosPage() {
  const pos = usePos();
  const touch = isTouchPos(usePrefs((p) => p.values));

  useEffect(() => {
    const t = window.setTimeout(() => pos.focusSearch(), 0);
    return () => window.clearTimeout(t);
  }, [touch]);

  return touch ? <TouchPosView pos={pos} /> : <StandardPosView pos={pos} />;
}
