import { AlertTriangle } from "lucide-react";
import { qty } from "@/services/api";

export function StockLimitPopup({
  open,
  name,
  available,
  onClose,
}: {
  open: boolean;
  name: string;
  available: number;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/40 p-4">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="إغلاق" />
      <div
        className="relative w-full max-w-sm rounded-3xl bg-white border border-slate-100 shadow-pop px-7 py-8 text-center"
        style={{ animation: "saved-pop 0.28s ease-out" }}
      >
        <div className="relative mx-auto h-16 w-16">
          <div className="absolute inset-0 rounded-full bg-amber-50 border border-amber-100" />
          <div className="absolute inset-0 grid place-items-center text-amber-600">
            <AlertTriangle size={32} strokeWidth={2.4} />
          </div>
        </div>
        <div className="mt-4 text-lg font-black text-slate-800">الكمية غير كافية</div>
        <p className="text-sm text-slate-600 mt-2 leading-7">
          {available <= 0 ? (
            <>
              لا توجد كمية متاحة من
              <br />
              <span className="font-bold text-slate-800">«{name}»</span>
              <br />
              في المتجر.
            </>
          ) : (
            <>
              المتاح من <span className="font-bold text-slate-800">«{name}»</span>
              <br />
              في المتجر: <span className="font-black text-rose-700">{qty(available)}</span> فقط.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full h-12 rounded-xl bg-rose-700 text-white text-sm font-bold hover:bg-rose-800"
        >
          حسناً
        </button>
      </div>
    </div>
  );
}
