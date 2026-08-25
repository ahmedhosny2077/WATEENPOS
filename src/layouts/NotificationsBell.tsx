import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, CheckCheck, Clock3, Package, Truck } from "lucide-react";
import { cmd, qty } from "@/services/api";
import { useSession } from "@/stores/session";
import { useNotifySeen } from "@/stores/notifications";

export type NotifyKind = "low_stock" | "expiring" | "expired" | "transfer";

export type AppNotification = {
  id: string;
  kind: NotifyKind | string;
  severity: "danger" | "warn" | "info" | string;
  title: string;
  detail: string;
  href: string;
};

export type NotificationsDto = {
  lowStock: number;
  expiring: number;
  expired: number;
  pendingTransfers: number;
  total: number;
  items: AppNotification[];
};

const KIND: Record<string, { label: string; icon: typeof Bell; tone: string }> = {
  expired: { label: "منتهية الصلاحية", icon: AlertTriangle, tone: "bg-rose-50 text-rose-700 border-rose-100" },
  expiring: { label: "قارب على الانتهاء", icon: Clock3, tone: "bg-orange-50 text-orange-800 border-orange-100" },
  low_stock: { label: "مخزون منخفض", icon: Package, tone: "bg-amber-50 text-amber-800 border-amber-100" },
  transfer: { label: "تحويل معلّق", icon: Truck, tone: "bg-sky-50 text-sky-800 border-sky-100" },
};

export function kindMeta(kind: string) {
  return KIND[kind] || { label: "تنبيه", icon: Bell, tone: "bg-slate-50 text-slate-600 border-slate-100" };
}

export function NotificationsBell() {
  const nav = useNavigate();
  const loc = useLocation();
  const shiftId = useSession((s) => s.shift?.id);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationsDto | null>(null);
  const seen = useNotifySeen((s) => s.seen);
  const markRead = useNotifySeen((s) => s.markRead);

  async function load() {
    try {
      setData(await cmd<NotificationsDto>("list_notifications"));
    } catch {
      /* ignore while locked or no permission */
    }
  }

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 45000);
    return () => window.clearInterval(t);
  }, [shiftId]);

  useEffect(() => {
    if (!open) return;
    void load();
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = data?.items || [];
  const seenSet = useMemo(() => new Set(seen), [seen]);
  const unreadIds = useMemo(() => items.filter((n) => !seenSet.has(n.id)).map((n) => n.id), [items, seenSet]);
  const unread = unreadIds.length;
  const preview = items.slice(0, 8);
  const pageActive = loc.pathname === "/notifications";

  function go(to: string, id?: string) {
    if (id) markRead([id]);
    setOpen(false);
    nav(to);
  }

  function markAllRead() {
    markRead(items.map((n) => n.id));
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        title="التنبيهات"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`relative h-9 w-9 rounded-lg border grid place-items-center transition ${
          open || pageActive
            ? "bg-rose-700 text-white border-rose-700"
            : unread
              ? "bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
              : "bg-white text-slate-500 border-slate-200 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800"
        }`}
      >
        <Bell size={16} />
        {unread > 0 ? (
          <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-700 text-white text-[10px] font-bold grid place-items-center">
            {unread > 99 ? "99+" : qty(unread)}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute top-[calc(100%+6px)] end-0 z-50 w-[380px] max-h-[min(80vh,560px)] overflow-auto rounded-2xl bg-white border border-slate-200 shadow-[0_16px_50px_rgba(15,23,42,0.18)] text-right"
        >
          <div className="px-3.5 py-2.5 border-b border-slate-100 sticky top-0 bg-white z-10 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-slate-800">التنبيهات</div>
                <div className="text-[11px] text-slate-400">مخزون منخفض، صلاحية، وتحويلات معلّقة</div>
              </div>
              {unread ? (
                <span className="h-6 px-2 rounded-full bg-rose-50 text-rose-700 text-[11px] font-bold">{qty(unread)}</span>
              ) : items.length ? (
                <span className="h-6 px-2 rounded-full bg-slate-50 text-slate-500 text-[11px] font-bold">الكل مقروء</span>
              ) : null}
            </div>
            {unread ? (
              <button
                type="button"
                onClick={markAllRead}
                className="w-full h-8 rounded-xl border border-rose-100 bg-rose-50 text-rose-800 text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-rose-100"
              >
                <CheckCheck size={14} />
                تعليم الكل كمقروء
              </button>
            ) : null}
          </div>
          {preview.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">لا توجد تنبيهات حالياً</div>
          ) : (
            <div className="p-2 space-y-1">
              {preview.map((n) => {
                const meta = kindMeta(n.kind);
                const Icon = meta.icon;
                const isNew = !seenSet.has(n.id);
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => go(n.href, n.id)}
                    className={`w-full text-right rounded-xl border px-2.5 py-2 flex items-start gap-2.5 ${
                      isNew
                        ? "border-rose-100 bg-rose-50/40 hover:bg-rose-50"
                        : "border-transparent hover:border-rose-100 hover:bg-rose-50/50"
                    }`}
                  >
                    <span className={`h-8 w-8 rounded-lg grid place-items-center shrink-0 border ${meta.tone}`}>
                      <Icon size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-slate-400">{meta.label}</span>
                        {isNew ? <span className="h-1.5 w-1.5 rounded-full bg-rose-600 shrink-0" /> : null}
                      </span>
                      <span className="block text-sm font-bold text-slate-800 truncate">{n.title}</span>
                      <span className="block text-[11px] text-slate-500 mt-0.5 leading-4">{n.detail}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => go("/notifications")}
            className="sticky bottom-0 w-full px-3.5 py-2.5 border-t border-slate-100 bg-rose-50 text-rose-800 text-sm font-bold hover:bg-rose-100"
          >
            عرض كل التنبيهات
          </button>
        </div>
      ) : null}
    </div>
  );
}
