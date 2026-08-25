import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, CheckCheck, Clock3, Package, RefreshCw, Truck } from "lucide-react";
import { cmd, qty } from "@/services/api";
import { Button } from "@/components/ui/Button";
import { Empty } from "@/components/ui/Empty";
import { Page, Panel } from "@/components/ui/Page";
import { useToasts } from "@/components/ui/Toast";
import { kindMeta, type AppNotification, type NotificationsDto, type NotifyKind } from "@/layouts/NotificationsBell";
import { useNotifySeen } from "@/stores/notifications";

type Filter = "all" | NotifyKind;

export function NotificationsPage() {
  const nav = useNavigate();
  const push = useToasts((s) => s.push);
  const [data, setData] = useState<NotificationsDto | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const seen = useNotifySeen((s) => s.seen);
  const markRead = useNotifySeen((s) => s.markRead);

  async function load() {
    setBusy(true);
    try {
      setData(await cmd<NotificationsDto>("list_notifications"));
    } catch (e) {
      push("err", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const items = data?.items || [];
  const seenSet = useMemo(() => new Set(seen), [seen]);
  const unreadCount = items.filter((n) => !seenSet.has(n.id)).length;
  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((n) => n.kind === filter)),
    [items, filter],
  );

  const grouped = useMemo(() => {
    const order: NotifyKind[] = ["expired", "expiring", "low_stock", "transfer"];
    return order
      .map((kind) => ({ kind, rows: filtered.filter((n) => n.kind === kind) }))
      .filter((g) => g.rows.length);
  }, [filtered]);

  const stats = [
    { id: "expired" as const, label: "منتهية الصلاحية", value: data?.expired || 0, icon: AlertTriangle, tone: "text-rose-700 bg-rose-50" },
    { id: "expiring" as const, label: "قارب على الانتهاء", value: data?.expiring || 0, icon: Clock3, tone: "text-orange-700 bg-orange-50" },
    { id: "low_stock" as const, label: "مخزون منخفض", value: data?.lowStock || 0, icon: Package, tone: "text-amber-700 bg-amber-50" },
    { id: "transfer" as const, label: "تحويلات معلّقة", value: data?.pendingTransfers || 0, icon: Truck, tone: "text-sky-700 bg-sky-50" },
  ];

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "الكل" },
    { id: "expired", label: "منتهٍ" },
    { id: "expiring", label: "قارب الانتهاء" },
    { id: "low_stock", label: "نواقص" },
    { id: "transfer", label: "تحويلات" },
  ];

  return (
    <Page
      title="التنبيهات"
      subtitle="نواقص المخزون، الدفعات المنتهية أو القريبة من الانتهاء، والتحويلات المعلّقة"
      icon={Bell}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {unreadCount ? (
            <Button variant="secondary" onClick={() => markRead(items.map((n) => n.id))}>
              <CheckCheck size={15} /> تعليم الكل كمقروء
            </Button>
          ) : null}
          <Button variant="secondary" disabled={busy} onClick={() => void load()}>
            <RefreshCw size={15} className={busy ? "animate-spin" : ""} /> تحديث
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setFilter(filter === s.id ? "all" : s.id)}
              className="rounded-3xl bg-white border border-slate-100 shadow-sm p-5 min-h-[110px] text-right hover:border-rose-200 transition"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="text-sm text-slate-500">{s.label}</div>
                <div className={`h-9 w-9 rounded-xl grid place-items-center ${s.tone}`}>
                  <Icon size={16} />
                </div>
              </div>
              <div className="text-lg font-bold text-slate-800 leading-6">{qty(s.value)}</div>
            </button>
          );
        })}
      </div>

      <div className="rounded-3xl bg-white border border-slate-100 shadow-sm p-4 mb-4">
        <div className="flex gap-2 overflow-x-auto">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`h-7 px-3 rounded-full text-xs whitespace-nowrap border ${
                filter === f.id ? "bg-rose-700 text-white border-rose-700" : "bg-slate-50 text-slate-600 border-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Panel>
          <Empty title={items.length === 0 ? "لا توجد تنبيهات حالياً" : "لا توجد نتائج في هذا التصنيف"} />
        </Panel>
      ) : (
        <div className="space-y-5">
          {grouped.map((g) => {
            const meta = kindMeta(g.kind);
            const Icon = meta.icon;
            return (
              <section key={g.kind} className="rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-bold text-slate-800">
                    <span className={`h-8 w-8 rounded-lg grid place-items-center border ${meta.tone}`}>
                      <Icon size={15} />
                    </span>
                    {meta.label}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">{qty(g.rows.length)}</div>
                </div>
                <div className="divide-y divide-slate-50">
                  {g.rows.map((n: AppNotification) => {
                    const isNew = !seenSet.has(n.id);
                    return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        markRead([n.id]);
                        nav(n.href);
                      }}
                      className={`w-full text-right px-5 py-3.5 hover:bg-rose-50/40 flex items-start gap-3 ${
                        isNew ? "bg-rose-50/30" : ""
                      }`}
                    >
                      <span className={`mt-0.5 h-9 w-9 rounded-xl grid place-items-center shrink-0 border ${meta.tone}`}>
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="block font-bold text-slate-800">{n.title}</span>
                          {isNew ? (
                            <span className="h-5 px-1.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">جديد</span>
                          ) : null}
                        </span>
                        <span className="block text-sm text-slate-500 mt-0.5 leading-6">{n.detail}</span>
                      </span>
                    </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </Page>
  );
}
