import { cn } from "@/utils/cn";

export function Modal({
  open,
  title,
  children,
  onClose,
  wide,
  elevated,
  className,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  elevated?: boolean;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div className={cn("fixed inset-0 flex items-center justify-center p-4", elevated ? "z-[70]" : "z-50")}>
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-label="إغلاق" />
      <div
        className={cn(
          "relative bg-white dark:bg-[#1e161a] rounded-[1.75rem] shadow-pop w-full p-6 border border-slate-100/80 dark:border-white/10 flex flex-col max-h-[90vh]",
          wide ? "max-w-3xl" : "max-w-lg",
          className,
        )}
      >
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto overflow-x-hidden min-h-0 -mx-1 px-1">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({
  open,
  title,
  body,
  onClose,
  onConfirm,
  danger,
}: {
  open: boolean;
  title: string;
  body: string;
  onClose: () => void;
  onConfirm: () => void;
  danger?: boolean;
}) {
  return (
    <Modal open={open} title={title} onClose={onClose} elevated>
      <p className="text-ink-muted mb-5 leading-7">{body}</p>
      <div className="flex gap-2 justify-end">
        <button className="h-11 px-4 rounded-xl border border-line bg-white" onClick={onClose}>
          إلغاء
        </button>
        <button
          className={cn("h-11 px-4 rounded-xl text-white", danger ? "bg-danger" : "bg-rose-500")}
          onClick={onConfirm}
        >
          تأكيد
        </button>
      </div>
    </Modal>
  );
}
