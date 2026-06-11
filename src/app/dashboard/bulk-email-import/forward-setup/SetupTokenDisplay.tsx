"use client";

// V9.1 SLC-V9.1-D MT-1 — Anzeige von Forward-Adresse + Setup-Token.
//
// Der Setup-Token wird nur einmal (direkt nach createInboundEndpoint /
// regenerateSetupToken) im Klartext zurueckgegeben und ist danach nicht mehr
// abrufbar (Hash-/Secret-Charakter). Diese Komponente zeigt ihn deshalb mit
// deutlichem "nur jetzt sichtbar"-Hinweis + Copy-Button. Die Forward-Adresse
// bleibt dauerhaft sichtbar; der Token ist optional (nur wenn frisch erzeugt).

import { useState } from "react";
import { Check, Copy, KeyRound, Mail, AlertTriangle } from "lucide-react";

interface SetupTokenDisplayProps {
  /** Vollstaendige Forward-Adresse, z.B. bulk-steuerberater@bulk.strategaizetransition.com */
  address: string;
  /** Setup-Token im Klartext — nur direkt nach Erzeugung/Regenerierung gesetzt. */
  setupToken?: string | null;
}

function CopyField({
  label,
  value,
  icon,
  mono = true,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard nicht verfuegbar — Wert ist sichtbar und manuell kopierbar */
    }
  }

  return (
    <div className="space-y-1">
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </span>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <code
          className={`flex-1 break-all text-sm text-slate-800 ${mono ? "font-mono" : ""}`}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="flex-shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
          aria-label={`${label} kopieren`}
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

export function SetupTokenDisplay({ address, setupToken }: SetupTokenDisplayProps) {
  return (
    <div className="space-y-4">
      <CopyField
        label="Weiterleitungs-Adresse"
        value={address}
        icon={<Mail className="h-3.5 w-3.5" />}
      />

      {setupToken ? (
        <div className="space-y-2">
          <CopyField
            label="Setup-Token"
            value={setupToken}
            icon={<KeyRound className="h-3.5 w-3.5" />}
          />
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              Dieser Token wird <strong>nur jetzt</strong> angezeigt. Kopiere ihn
              und bewahre ihn sicher auf. Falls du ihn verlierst, kannst du jederzeit
              einen neuen erzeugen.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
