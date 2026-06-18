"use client";

// V9.75 SLC-V9.75-C MT-4 — Stufe-1 Mitarbeiter-Register im Debrief-View.
//
// Leichtes Name+Funktion-Register (ohne E-Mail) — verkaufspsychologisches
// Organigramm. Additive Komponente: stoert die bestehende Block-Debrief-Logik
// nicht (R-C-2). E-Mail-Nachtrag pro Eintrag -> Promote zur bestehenden
// Einladungs-RPC (Bruecke, MT-3). Sichtbar nur ab blueprint+ (Gate sitzt in der
// Server-Action + der Einbindung in page.tsx).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Pencil, UserPlus, Check, X } from "lucide-react";
import {
  addRosterEntry,
  updateRosterEntry,
  deleteRosterEntry,
  promoteRosterEntryToInvitation,
  type RosterEntry,
} from "../roster-actions";

interface RosterPanelProps {
  sessionId: string;
  blockKey: string;
  initialEntries: RosterEntry[];
}

export function RosterPanel({ sessionId, blockKey, initialEntries }: RosterPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [roleHint, setRoleHint] = useState("");

  function handleAdd() {
    setError(null);
    if (!name.trim()) {
      setError("Name ist erforderlich.");
      return;
    }
    startTransition(async () => {
      const r = await addRosterEntry({
        sessionId,
        name,
        roleHint: roleHint || null,
        blockKey, // aktueller Block vorbelegt
      });
      if (!r.ok) {
        setError(mapError(r.error));
        return;
      }
      setName("");
      setRoleHint("");
      router.refresh();
    });
  }

  return (
    <section className="mt-10 rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-900">Mitarbeiter-Register</h2>
      <p className="mt-1 text-sm text-slate-500">
        Name + Funktion der Schlüsselpersonen (ohne E-Mail). Die E-Mail kann später
        pro Eintrag nachgetragen und in eine Einladung überführt werden.
      </p>

      {/* Erfassungs-Zeile */}
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[12rem]">
          <label className="block text-xs font-medium text-slate-600">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. Anna Beispiel"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex-1 min-w-[12rem]">
          <label className="block text-xs font-medium text-slate-600">Funktion</label>
          <input
            value={roleHint}
            onChange={(e) => setRoleHint(e.target.value)}
            placeholder="z. B. Buchhaltung"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Hinzufügen
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Liste */}
      <ul className="mt-5 divide-y divide-slate-100">
        {initialEntries.length === 0 && (
          <li className="py-4 text-sm text-slate-400">Noch keine Einträge erfasst.</li>
        )}
        {initialEntries.map((entry) => (
          <RosterRow key={entry.id} entry={entry} onChanged={() => router.refresh()} />
        ))}
      </ul>
    </section>
  );
}

function RosterRow({ entry, onChanged }: { entry: RosterEntry; onChanged: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(entry.name);
  const [roleHint, setRoleHint] = useState(entry.role_hint ?? "");
  const [email, setEmail] = useState("");
  const [rowError, setRowError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const promoted = Boolean(entry.promoted_invitation_id);

  function handleSave() {
    setRowError(null);
    startTransition(async () => {
      const r = await updateRosterEntry({ id: entry.id, name, roleHint: roleHint || null });
      if (!r.ok) {
        setRowError(mapError(r.error));
        return;
      }
      setEditing(false);
      onChanged();
    });
  }

  function handleDelete() {
    setRowError(null);
    startTransition(async () => {
      const r = await deleteRosterEntry(entry.id);
      if (!r.ok) {
        setRowError(mapError(r.error));
        return;
      }
      onChanged();
    });
  }

  function handlePromote() {
    setRowError(null);
    setInfo(null);
    startTransition(async () => {
      const r = await promoteRosterEntryToInvitation(entry.id, email);
      if (!r.ok) {
        setRowError(mapError(r.error));
        return;
      }
      if (r.alreadyInvited || r.alreadyPromoted) {
        setInfo("Bereits eingeladen.");
      } else {
        setInfo("Einladung erstellt.");
      }
      onChanged();
    });
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-3">
        {editing ? (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <input
              value={roleHint}
              onChange={(e) => setRoleHint(e.target.value)}
              placeholder="Funktion"
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <button
              onClick={handleSave}
              disabled={isPending}
              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
            >
              <Check className="h-3 w-3" /> Speichern
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setName(entry.name);
                setRoleHint(entry.role_hint ?? "");
              }}
              className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              <X className="h-3 w-3" /> Abbrechen
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-slate-900">{entry.name}</span>
            {entry.role_hint && (
              <span className="text-sm text-slate-500">· {entry.role_hint}</span>
            )}
            {promoted && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                eingeladen
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                <Pencil className="h-3 w-3" /> Bearbeiten
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" /> Löschen
              </button>
            </div>
          </>
        )}
      </div>

      {/* E-Mail-Nachtrag + Promote */}
      {!editing && !promoted && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-Mail nachtragen…"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
          <button
            onClick={handlePromote}
            disabled={isPending || !email.trim()}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
            Einladen
          </button>
        </div>
      )}

      {rowError && <div className="mt-2 text-xs text-red-600">{rowError}</div>}
      {info && <div className="mt-2 text-xs text-emerald-600">{info}</div>}
    </li>
  );
}

function mapError(code: string): string {
  switch (code) {
    case "name_required":
      return "Name ist erforderlich.";
    case "invalid_email":
      return "Bitte eine gültige E-Mail eingeben.";
    case "tier_gate_denied":
      return "Das Register ist ab Stufe Blueprint verfügbar.";
    case "duplicate":
      return "Ein Eintrag mit Name und Funktion existiert bereits.";
    case "forbidden":
      return "Keine Berechtigung.";
    case "rpc_failed":
      return "Einladung konnte nicht erstellt werden.";
    default:
      return "Aktion fehlgeschlagen.";
  }
}
