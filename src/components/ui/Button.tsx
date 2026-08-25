import { cn } from "@/utils/cn";
import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold";
  size?: "sm" | "md" | "lg";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" && "h-8 px-2.5 text-xs",
        size === "md" && "h-9 px-3 text-sm",
        size === "lg" && "h-10 px-4 text-sm min-h-[40px]",
        variant === "primary" && "bg-rose-500 text-white hover:bg-rose-600 shadow-card",
        variant === "gold" && "bg-gold text-ink hover:bg-gold-dark",
        variant === "secondary" && "bg-white text-ink border border-line hover:bg-cream-100 dark:hover:bg-white/10",
        variant === "ghost" && "bg-transparent text-ink-muted hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-900/40",
        variant === "danger" && "bg-danger text-white hover:brightness-110",
        className,
      )}
      {...props}
    />
  );
}
