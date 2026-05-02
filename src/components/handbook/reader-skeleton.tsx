// SLC-051 MT-5 — Loading-Skeleton fuer den Reader.
//
// Wird von app/dashboard/handbook/[snapshotId]/loading.tsx als
// Suspense-Fallback gerendert, sobald der User auf einen anderen Snapshot
// klickt. Das Layout spiegelt ReaderShell (Sidebar links + Content-Bereich
// rechts), damit kein Layout-Sprung beim Uebergang zum echten Content entsteht.
//
// Server-Component — keine "use client"-Direktive noetig.

const SIDEBAR_LINES = [
  { width: "w-3/4" },
  { width: "w-2/3" },
  { width: "w-4/5" },
  { width: "w-3/5" },
  { width: "w-3/4" },
];

const SIDEBAR_INDENTED = [{ width: "w-2/5" }, { width: "w-1/2" }, { width: "w-2/5" }];

const PARAGRAPH_LINES = [
  { width: "w-full" },
  { width: "w-11/12" },
  { width: "w-full" },
  { width: "w-10/12" },
  { width: "w-11/12" },
  { width: "w-full" },
  { width: "w-9/12" },
  { width: "w-10/12" },
];

export function ReaderSkeleton() {
  return (
    <div
      className="flex h-screen bg-slate-50 overflow-hidden"
      data-testid="reader-skeleton"
      aria-busy="true"
      aria-live="polite"
    >
      {/* Sidebar-Skeleton */}
      <aside className="hidden w-[320px] flex-shrink-0 overflow-y-auto border-r border-slate-200 bg-white lg:block">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="px-3 py-4">
          <div className="mb-2 px-2">
            <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
          </div>
          <ul className="space-y-2 px-2">
            {SIDEBAR_LINES.map((line, idx) => (
              <li key={`sb-line-${idx}`}>
                <div
                  className={`h-3 ${line.width} animate-pulse rounded bg-slate-200`}
                />
              </li>
            ))}
            {SIDEBAR_INDENTED.map((line, idx) => (
              <li key={`sb-indented-${idx}`} className="pl-4">
                <div
                  className={`h-2.5 ${line.width} animate-pulse rounded bg-slate-200`}
                />
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-slate-200 pt-4">
            <div className="mb-2 px-2">
              <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
            </div>
            <div className="space-y-2 px-2">
              <div className="h-8 animate-pulse rounded bg-slate-100" />
              <div className="h-8 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        </div>
      </aside>

      {/* Content-Skeleton */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex-shrink-0 border-b border-slate-200/60 bg-white/95 px-6 py-4 pl-14 lg:pl-6">
          <div className="space-y-2">
            <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
            <div className="h-6 w-64 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-48 animate-pulse rounded bg-slate-200" />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              {/* h1-Bar */}
              <div className="mb-6 h-8 w-2/3 animate-pulse rounded bg-slate-200" />
              {/* Paragraph-Lines */}
              <div className="space-y-3">
                {PARAGRAPH_LINES.map((line, idx) => (
                  <div
                    key={`p-${idx}`}
                    className={`h-3 ${line.width} animate-pulse rounded bg-slate-100`}
                  />
                ))}
              </div>
              {/* Sub-h2 + Lines x3 */}
              {[0, 1, 2].map((blockIdx) => (
                <div key={`block-${blockIdx}`} className="mt-8">
                  <div className="mb-3 h-5 w-1/2 animate-pulse rounded bg-slate-200" />
                  <div className="space-y-3">
                    <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-11/12 animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-9/12 animate-pulse rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
