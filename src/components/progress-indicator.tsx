"use client";

export function ProgressIndicator({
  answered,
  total,
  className,
}: {
  answered: number;
  total: number;
  className?: string;
}) {
  const progress = total > 0 ? Math.round((answered / total) * 100) : 0;

  return (
    <div className={className}>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="text-slate-600">
          <span className="font-bold text-slate-900">{answered}</span> / {total} Fragen beantwortet
        </span>
        <span className="font-bold text-slate-900">{progress}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${progress}%`,
            background: progress === 100
              ? "linear-gradient(to right, #00a84f, #4dcb8b)"
              : progress >= 50
                ? "linear-gradient(to right, #120774, #4454b8)"
                : progress > 0
                  ? "linear-gradient(to right, #f2b705, #ffd54f)"
                  : "#cbd5e1",
            boxShadow: progress > 0
              ? progress === 100
                ? "0 0 8px rgba(0, 168, 79, 0.2)"
                : "0 0 8px rgba(68, 84, 184, 0.2)"
              : "none",
          }}
        />
      </div>
    </div>
  );
}
