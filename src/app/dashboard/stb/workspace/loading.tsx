// Loading-Skeleton fuer den Modul-Workspace (SLC-175 MT-1, AC-175-4).
// Greift, waehrend die Server-Component die modul_output-Rows laedt.
export default function StbWorkspaceLoading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8" aria-busy="true">
      <div className="h-7 w-48 animate-pulse rounded bg-slate-200" />
      <div className="mt-2 h-4 w-80 animate-pulse rounded bg-slate-100" />
      <div className="mt-8 space-y-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-50"
          />
        ))}
      </div>
    </div>
  );
}
