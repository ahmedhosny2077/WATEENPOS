import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/utils/cn";

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
  leading,
  className,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  actions?: ReactNode;
  leading?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3",
        className,
      )}
    >
      <div className="absolute inset-y-0 start-0 w-1 bg-rose-700" />
      <div className="flex items-center gap-3 min-w-0">
        {leading}
        <div className="h-11 w-11 shrink-0 rounded-xl bg-rose-50 text-rose-700 border border-rose-100 grid place-items-center">
          <Icon size={20} strokeWidth={2.15} />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-800 leading-6">{title}</h1>
          {subtitle ? <p className="text-slate-500 text-sm mt-0.5 leading-5">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Page({
  title,
  subtitle,
  icon,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="h-full bg-app overflow-auto">
      <div className="p-4 lg:p-5">
        <PageHeader title={title} subtitle={subtitle} icon={icon} actions={actions} className="mb-4" />
        {children}
      </div>
    </div>
  );
}

export function Panel({
  title,
  hint,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cn("rounded-3xl bg-white border border-slate-100 shadow-sm overflow-hidden", className)}>
      {(title || hint || actions) && (
        <div className="px-4 pt-3.5 pb-3 flex items-start justify-between gap-3 border-b border-slate-100">
          <div>
            {title ? <h2 className="font-bold text-sm text-slate-800">{title}</h2> : null}
            {hint ? <p className="text-xs text-slate-500 mt-0.5">{hint}</p> : null}
          </div>
          {actions}
        </div>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={cn("text-right font-semibold p-3 text-xs text-slate-500", className)}>{children}</th>;
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("p-3 text-sm", className)}>{children}</td>;
}

export function Tr({ i, children }: { i: number; children: ReactNode }) {
  return <tr className={i % 2 ? "bg-slate-50/70" : "bg-white"}>{children}</tr>;
}

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string; hint?: string; icon?: LucideIcon; count?: number }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "mb-5 grid gap-2",
        items.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 md:grid-cols-4",
      )}
    >
      {items.map((t) => {
        const active = value === t.id;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-right transition",
              active
                ? "bg-rose-700 text-white border-rose-700 shadow-md"
                : "bg-white text-slate-800 border-slate-200 hover:border-rose-300 hover:bg-rose-50",
            )}
          >
            {Icon ? (
              <span
                className={cn(
                  "h-12 w-12 rounded-xl grid place-items-center shrink-0",
                  active ? "bg-white/15 text-white" : "bg-rose-50 text-rose-700 border border-rose-100",
                )}
              >
                <Icon size={22} strokeWidth={2.2} />
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold leading-5">{t.label}</span>
              {t.hint ? (
                <span className={cn("block text-xs mt-1 truncate", active ? "text-white/80" : "text-slate-500")}>
                  {t.hint}
                </span>
              ) : null}
            </span>
            {t.count != null ? (
              <span
                className={cn(
                  "h-8 min-w-8 px-2 rounded-full grid place-items-center text-sm font-bold shrink-0",
                  active ? "bg-white text-rose-800" : "bg-slate-100 text-slate-600",
                )}
              >
                {new Intl.NumberFormat("ar-EG").format(t.count)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
