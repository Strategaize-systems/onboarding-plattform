// Platzhalter-Seite fuer die V10 StB-Vertikale (SLC-171 MT-2).
// Existiert, damit das Env-Gate (StbLayout) end-to-end pruefbar ist
// (OFF -> Redirect, ON -> sichtbar; AC-171-4). Der echte Reader kommt in
// SLC-175 und ersetzt diese Seite.
export default function StbPlaceholderPage() {
  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <h1 className="text-xl font-semibold text-slate-900">StB-Vertikale</h1>
      <p className="mt-2 text-sm text-slate-600">
        Dieser Bereich ist aktiviert. Die Inhalte folgen in einem spaeteren
        Schritt (SLC-175).
      </p>
    </div>
  );
}
