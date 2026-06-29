// StB-Vertikale Landing (SLC-171 MT-2, erweitert in SLC-175 MT-1).
// Env-gated via StbLayout. Verlinkt auf den Modul-Workspace-Reader (SLC-175).
import Link from "next/link";

export default function StbLandingPage() {
  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-slate-900">StB-Vertikale</h1>
      <p className="mt-2 text-sm text-slate-600">
        Die operative Wirk-Schicht der eigenen Kanzlei: Modul-Ergebnisse aus den
        ausgefüllten Fragebögen.
      </p>
      <Link
        href="/dashboard/stb/workspace"
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary to-brand-primary-dark px-5 py-3 text-sm font-semibold text-white transition-all hover:opacity-90"
      >
        Modul-Workspace öffnen →
      </Link>
    </div>
  );
}
