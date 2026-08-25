import { useState } from "react";
import { cmd, type ShiftDto } from "@/services/api";
import { Field, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToasts } from "@/components/ui/Toast";
import { usePrefs } from "@/stores/prefs";

export function OpenShiftForm({ onOpened }: { onOpened: (s: ShiftDto) => void }) {
  const push = useToasts((s) => s.push);
  const requireCash = usePrefs((p) => p.values["shift.require_opening_cash"] !== "0");
  const [name, setName] = useState("");
  const [cash, setCash] = useState(requireCash ? "" : "0");
  const [busy, setBusy] = useState(false);

  async function enter() {
    if (requireCash && cash.trim() === "") {
      push("err", "اكتب الرصيد الافتتاحي للصندوق.");
      return;
    }
    const opening = Number(cash || "0");
    if (!Number.isFinite(opening) || opening < 0) {
      push("err", "الرصيد الافتتاحي غير صالح.");
      return;
    }
    setBusy(true);
    try {
      const s = await cmd<ShiftDto>("open_shift", {
        name,
        openingCash: Math.round(opening * 100),
      });
      onOpened(s);
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        enter();
      }}
    >
      <Field label="الاسم">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: أحمد" />
      </Field>
      <Field label={requireCash ? "الرصيد الافتتاحي (ج.م) *" : "الرصيد الافتتاحي (ج.م)"}>
        <Input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder={requireCash ? "مطلوب" : "0"} />
      </Field>
      <Button type="submit" className="w-full h-10" disabled={busy}>
        فتح الوردية
      </Button>
    </form>
  );
}

export function OpenShiftModal({
  open,
  onClose,
  onOpened,
}: {
  open: boolean;
  onClose: () => void;
  onOpened: (s: ShiftDto) => void;
}) {
  return (
    <Modal open={open} title="فتح وردية جديدة" onClose={onClose}>
      <p className="text-slate-500 text-sm mb-3 leading-7">
        اكتب اسمك والرصيد الافتتاحي للصندوق. بدون وردية يمكنك تصفح نقطة البيع، لكن لا يمكن إضافة أصناف أو إتمام بيع.
      </p>
      <OpenShiftForm
        onOpened={(s) => {
          onOpened(s);
          onClose();
        }}
      />
    </Modal>
  );
}
