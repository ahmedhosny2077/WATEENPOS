import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function PinPad({
  onSubmit,
  loading,
}: {
  onSubmit: (pin: string) => void;
  loading?: boolean;
}) {
  const [pin, setPin] = useState("");
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "دخول"];

  function press(k: string) {
    if (k === "⌫") setPin((p) => p.slice(0, -1));
    else if (k === "دخول") onSubmit(pin);
    else if (pin.length < 8) setPin((p) => p + k);
  }

  return (
    <div className="space-y-3">
      <div className="h-14 rounded-xl bg-cream-100 border border-line flex items-center justify-center text-2xl tracking-[0.4em] text-rose-700">
        {pin ? "•".repeat(pin.length) : "••••"}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k) => (
          <Button
            key={k}
            variant={k === "دخول" ? "primary" : "secondary"}
            className="h-14 text-lg"
            disabled={loading}
            onClick={() => press(k)}
          >
            {k}
          </Button>
        ))}
      </div>
    </div>
  );
}
