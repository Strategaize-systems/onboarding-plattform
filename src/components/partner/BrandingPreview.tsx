"use client";

import Image from "next/image";

/**
 * V6 SLC-104 MT-8 — Live-Preview-Komponente fuer Branding-Editor.
 *
 * Reine Display-Komponente: rendert ein vereinfachtes Mockup einer
 * Mandanten-Dashboard-Oberflaeche mit aktueller Akzentfarbe + Logo +
 * Anzeigename. Reagiert auf Props — kein eigener State, keine
 * Server-Calls.
 *
 * Bewusst NICHT gerade die echte /dashboard-Route in einem iframe
 * eingebettet:
 *   - iframe braucht gueltige Mandanten-Auth-Session (kompliziert + verfaelscht)
 *   - Mockup ist deterministisch ladbar und zeigt Aenderungen sofort,
 *     ohne dass der DB-State bereits geschrieben wurde
 *   - Live-Preview-Anspruch (Section G) wird erfuellt, weil Aenderungen
 *     in der Form sofort hier sichtbar werden
 */

interface BrandingPreviewProps {
  logoSrc: string | null;
  primaryColor: string;
  displayName: string;
}

export function BrandingPreview({
  logoSrc,
  primaryColor,
  displayName,
}: BrandingPreviewProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Top-Bar — Akzentfarbe als Hintergrund */}
      <div
        className="flex items-center gap-3 px-4 py-3 text-white"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-sm bg-white/95">
          {logoSrc ? (
            // unoptimized=true, weil src ein data:- oder Object-URL sein
            // kann (Live-Preview vor Upload). next/image optimiert die nicht
            // und braucht den Width/Height-Prop.
            <Image
              src={logoSrc}
              alt="Logo Vorschau"
              width={32}
              height={32}
              unoptimized
              className="h-full w-full object-contain"
            />
          ) : (
            <span
              className="text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: primaryColor }}
            >
              Logo
            </span>
          )}
        </div>
        <span className="text-sm font-semibold truncate">{displayName}</span>
      </div>

      {/* Body — Mini-Dashboard */}
      <div className="space-y-4 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Mandanten-Begruessung
          </p>
          <p className="mt-1 text-sm text-slate-900">
            Willkommen bei{" "}
            <span className="font-semibold">{displayName}</span>. Dein
            Onboarding ist startklar.
          </p>
        </div>

        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Naechster Schritt
          </p>
          <p className="mt-1 text-sm text-slate-900">
            Fragebogen ausfuellen — Block 1 von 6.
          </p>
          <button
            type="button"
            disabled
            className="mt-3 rounded-md px-3 py-1.5 text-xs font-medium text-white shadow-sm"
            style={{ backgroundColor: primaryColor }}
          >
            Jetzt starten
          </button>
        </div>

        <div className="rounded-md border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Akzent-Farben in Aktion
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white"
              style={{ backgroundColor: primaryColor }}
            >
              Aktiv
            </span>
            <span
              className="rounded-full border bg-white px-2.5 py-0.5 text-[11px] font-medium"
              style={{ borderColor: primaryColor, color: primaryColor }}
            >
              In Pruefung
            </span>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="text-[11px] font-medium underline"
              style={{ color: primaryColor }}
            >
              Beispiel-Link
            </a>
          </div>
        </div>
      </div>

      {/* Footer — Powered by Strategaize (DEC-108) */}
      <div className="border-t border-slate-200 px-4 py-2 text-center text-[11px] text-slate-500">
        Aufgesetzt mit Strategaize
      </div>
    </div>
  );
}
