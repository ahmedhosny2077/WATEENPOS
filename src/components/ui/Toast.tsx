import { useEffect } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { create } from "zustand";
import { Button } from "@/components/ui/Button";

type Toast = { id: number; kind: "ok" | "err"; text: string };
type S = {
  items: Toast[];
  push: (kind: Toast["kind"], text: string) => void;
  remove: (id: number) => void;
};

export const useToasts = create<S>((set, get) => ({
  items: [],
  push: (kind, text) => {
    const id = Date.now() + Math.random();
    const textClean = text.trim();
    if (!textClean) return;
    const last = get().items[get().items.length - 1];
    if (last && last.kind === kind && last.text === textClean) return;
    set({ items: [...get().items.slice(-2), { id, kind, text: textClean }] });
  },
  remove: (id) => set({ items: get().items.filter((t) => t.id !== id) }),
}));

export function ToastHost() {
  const items = useToasts((s) => s.items);
  const remove = useToasts((s) => s.remove);
  const current = items[0];
  const failed = current?.kind === "err";
  const duration = failed ? 4200 : 2400;

  useEffect(() => {
    if (!current) return;
    const t = window.setTimeout(() => remove(current.id), duration);
    return () => window.clearTimeout(t);
  }, [current, duration, remove]);

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-slate-900/35 p-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="إغلاق"
        onClick={() => remove(current.id)}
      />
      <div
        key={current.id}
        className="relative w-full max-w-xs rounded-3xl bg-white border border-slate-100 shadow-pop px-8 py-8 text-center"
        style={{ animation: "saved-pop 0.28s ease-out" }}
        role="status"
        aria-live="polite"
      >
        {failed ? (
          <div className="mx-auto h-16 w-16 rounded-full bg-rose-50 border border-rose-100 text-rose-700 grid place-items-center">
            <AlertTriangle size={30} />
          </div>
        ) : (
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
        )}
        {failed ? (
          <>
            <div className="mt-4 text-lg font-black text-slate-800 leading-7">تنبيه</div>
            <p className="text-sm text-slate-500 mt-2 leading-6">{current.text}</p>
            <Button className="mt-5 w-full justify-center" onClick={() => remove(current.id)}>
              حسناً
            </Button>
          </>
        ) : current.text.length > 56 ? (
          <>
            <div className="mt-4 text-lg font-black text-slate-800 leading-7">تم بنجاح</div>
            <p className="text-sm text-slate-500 mt-2 leading-6">{current.text}</p>
          </>
        ) : (
          <div className="mt-4 text-lg font-black text-slate-800 leading-7">{current.text}</div>
        )}
      </div>
    </div>
  );
}
