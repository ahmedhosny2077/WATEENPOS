export function Empty({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-full bg-rose-50 text-rose-400 flex items-center justify-center text-2xl mb-4">
        ◇
      </div>
      <p className="text-slate-500 mb-4">{title}</p>
      {action && (
        <button onClick={onAction} className="h-11 px-4 rounded-xl bg-rose-500 text-white font-semibold">
          {action}
        </button>
      )}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl border border-line shadow-card ${className}`}>{children}</div>;
}
