import { cn } from "@/utils/cn";
import { Search } from "lucide-react";
import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from "react";

const box =
  "w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-rose-400 dark:bg-[#261c21] dark:text-rose-50 dark:border-white/15";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(props, ref) {
  return <input ref={ref} {...props} className={cn(box, props.className)} />;
});

type SearchFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  wrapClassName?: string;
  trailing?: ReactNode;
  tone?: "gold" | "soft";
};

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { className, wrapClassName, trailing, tone = "gold", ...props },
  ref,
) {
  const soft = tone === "soft";
  return (
    <div className={cn("relative w-full min-w-0", wrapClassName)}>
      <Search
        size={17}
        className={cn(
          "absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none",
          soft ? "text-rose-400" : "text-gold",
        )}
        strokeWidth={2.25}
      />
      <input
        ref={ref}
        type="search"
        autoComplete="off"
        {...props}
        className={cn(
          "search-field w-full h-11 rounded-xl text-sm text-ink placeholder:text-ink-muted px-4 pr-11",
          "focus:outline-none",
          soft
            ? "border border-slate-200 bg-slate-50 focus:border-rose-300 focus:bg-white focus:ring-4 focus:ring-rose-50"
            : "border-2 border-gold bg-[#FFFBF3] shadow-[0_0_0_3px_rgba(196,162,101,0.14)] focus:border-gold-dark",
          trailing ? "pl-10" : "",
          className,
        )}
      />
      {trailing ? (
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2">{trailing}</div>
      ) : null}
    </div>
  );
});

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(box, props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(box, "min-h-[88px]", props.className)} />;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-ink-muted">{label}</span>
      {children}
    </label>
  );
}
