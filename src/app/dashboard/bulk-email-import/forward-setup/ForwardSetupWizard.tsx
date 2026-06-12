"use client";

// V9.1 SLC-V9.1-D — Orchestrator des Forward-Bucket-Setup-Flows.
//
// Haelt den uebergreifenden Zustand (angelegter/bestehender Endpoint + frischer
// Token) und komponiert die fuenf Setup-Komponenten:
//   ConversationalSetupAssistant -> Create-Form -> SetupTokenDisplay
//   -> MailClientInstructions -> Allowlist -> TestSendButton -> DsgvoDisclaimerModal
//
// Zwei Phasen:
//   (A) Noch kein Endpoint  -> Assistent + Anlage-Formular
//   (B) Endpoint vorhanden  -> Adresse/Token, Anleitung, Allowlist, Test, Aktivierung
//
// Reine Client-Orchestrierung; alle Mutationen laufen ueber die auth-gated
// Server-Actions in ./actions.ts.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { ConversationalSetupAssistant } from "./ConversationalSetupAssistant";
import { SetupTokenDisplay } from "./SetupTokenDisplay";
import { MailClientInstructions } from "./MailClientInstructions";
import { TestSendButton } from "./TestSendButton";
import { DsgvoDisclaimerModal } from "./DsgvoDisclaimerModal";
import {
  createInboundEndpoint,
  regenerateSetupToken,
  updateAllowlist,
} from "./actions";
import type { SetupSuggestion } from "@/lib/bulk-email/ai-assisted-setup";

export interface AllowlistEntry {
  id: string;
  pattern: string;
  patternType: "domain" | "email_exact";
  enabled: boolean;
}

export interface ExistingEndpoint {
  id: string;
  slug: string;
  status: "pending_setup" | "active" | "paused" | "revoked";
  displayName: string | null;
  address: string;
  allowlist: AllowlistEntry[];
}

interface ForwardSetupWizardProps {
  inboundDomain: string;
  endpoint: ExistingEndpoint | null;
}

/** "@" -> exakte Adresse, sonst Domain. Konsistent mit updateAllowlist-Typen. */
function inferPatternType(pattern: string): "domain" | "email_exact" {
  return pattern.includes("@") ? "email_exact" : "domain";
}

const STATUS_BADGE: Record<
  ExistingEndpoint["status"],
  { label: string; className: string }
> = {
  pending_setup: { label: "Einrichtung offen", className: "bg-amber-100 text-amber-700" },
  active: { label: "Aktiv", className: "bg-green-100 text-green-700" },
  paused: { label: "Pausiert", className: "bg-slate-100 text-slate-700" },
  revoked: { label: "Deaktiviert", className: "bg-red-100 text-red-700" },
};

export function ForwardSetupWizard({ inboundDomain, endpoint }: ForwardSetupWizardProps) {
  const router = useRouter();

  // Endpoint-State: aus Prop initialisiert, nach Anlage lokal gesetzt.
  const [current, setCurrent] = useState<ExistingEndpoint | null>(endpoint);
  const [freshToken, setFreshToken] = useState<string | null>(null);

  if (!current) {
    return (
      <CreatePhase
        inboundDomain={inboundDomain}
        onCreated={(ep, token) => {
          setCurrent(ep);
          setFreshToken(token);
          router.refresh();
        }}
      />
    );
  }

  return (
    <ConfigurePhase
      current={current}
      freshToken={freshToken}
      onAllowlistAdded={(entry) =>
        setCurrent((prev) =>
          prev ? { ...prev, allowlist: [...prev.allowlist, entry] } : prev,
        )
      }
      onStatusActive={() =>
        setCurrent((prev) => (prev ? { ...prev, status: "active" } : prev))
      }
      onTokenRegenerated={(token) => {
        setFreshToken(token);
        router.refresh();
      }}
    />
  );
}

// ─── Phase A: Anlage ─────────────────────────────────────────────────────────

function CreatePhase({
  inboundDomain,
  onCreated,
}: {
  inboundDomain: string;
  onCreated: (endpoint: ExistingEndpoint, token: string) => void;
}) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pendingAllowlist, setPendingAllowlist] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function applySuggestion(s: SetupSuggestion) {
    // Local-Part kommt als bulk-<name>; das Feld zeigt nur den <name>-Teil.
    setName(s.suggestedLocalPart.replace(/^bulk-/, ""));
    setPendingAllowlist(s.suggestedAllowlistPatterns);
    setError(null);
  }

  function create() {
    const slug = name.trim().toLowerCase();
    if (slug.length === 0) {
      setError("Bitte vergib einen Namen fuer den Posteingang.");
      return;
    }
    setError(null);
    startTransition(async () => {
      let result;
      try {
        result = await createInboundEndpoint({
          localPart: `bulk-${slug}`,
          displayName: displayName.trim() || undefined,
        });
      } catch (err) {
        setError((err as Error).message);
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Vorgeschlagene Allowlist best-effort gleich mit anlegen (Fehler nicht fatal).
      const created: ExistingEndpoint["allowlist"] = [];
      for (const pattern of pendingAllowlist) {
        const type = inferPatternType(pattern);
        try {
          const r = await updateAllowlist(result.endpointId, pattern, type, true);
          if (r.ok) {
            created.push({ id: r.allowlistId, pattern, patternType: type, enabled: true });
          }
        } catch {
          /* einzelner Allowlist-Eintrag fehlgeschlagen — nicht blockierend */
        }
      }

      onCreated(
        {
          id: result.endpointId,
          slug,
          status: "pending_setup",
          displayName: displayName.trim() || null,
          address: result.address,
          allowlist: created,
        },
        result.setupToken,
      );
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Posteingang per Assistent einrichten</CardTitle>
          <CardDescription>
            Beschreibe in eigenen Worten, was weitergeleitet werden soll — der
            Assistent macht dir einen Vorschlag.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConversationalSetupAssistant onApply={applySuggestion} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Posteingang anlegen</CardTitle>
          <CardDescription>
            Aus dem Namen entsteht deine Weiterleitungs-Adresse.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="local-part">Name des Posteingangs</Label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-slate-500">bulk-</span>
              <Input
                id="local-part"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="steuerberater"
                disabled={isPending}
                className="max-w-xs"
              />
              <span className="text-sm text-slate-500">@{inboundDomain}</span>
            </div>
            <p className="text-xs text-slate-400">
              Erlaubt: 3&ndash;40 Zeichen, Kleinbuchstaben, Ziffern, Bindestrich.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="display-name">Bezeichnung (optional)</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="z.B. Steuerberater-Postfach"
              disabled={isPending}
              className="max-w-md"
            />
          </div>

          {pendingAllowlist.length > 0 && (
            <div className="space-y-1.5">
              <Label>Aus dem Vorschlag uebernommene Absender</Label>
              <div className="flex flex-wrap gap-1.5">
                {pendingAllowlist.map((p) => (
                  <Badge key={p} variant="secondary" className="gap-1 font-mono">
                    {p}
                    <button
                      type="button"
                      onClick={() =>
                        setPendingAllowlist((prev) => prev.filter((x) => x !== p))
                      }
                      aria-label={`${p} entfernen`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="flex items-start gap-1.5 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {error}
            </p>
          )}

          <Button type="button" onClick={create} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Wird angelegt &hellip;
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Posteingang anlegen
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Phase B: Konfiguration ────────────────────────────────────────────────

function ConfigurePhase({
  current,
  freshToken,
  onAllowlistAdded,
  onStatusActive,
  onTokenRegenerated,
}: {
  current: ExistingEndpoint;
  freshToken: string | null;
  onAllowlistAdded: (entry: AllowlistEntry) => void;
  onStatusActive: () => void;
  onTokenRegenerated: (token: string) => void;
}) {
  const [dsgvoOpen, setDsgvoOpen] = useState(false);
  const status = STATUS_BADGE[current.status];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>{current.displayName || current.slug}</CardTitle>
              <CardDescription>Deine Weiterleitungs-Adresse &amp; Setup-Token</CardDescription>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
            >
              {status.label}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <SetupTokenDisplay address={current.address} setupToken={freshToken} />
          <RegenerateToken endpointId={current.id} onRegenerated={onTokenRegenerated} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weiterleitung im Mail-Programm einrichten</CardTitle>
          <CardDescription>
            Leite passende Emails an die obige Adresse weiter.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MailClientInstructions address={current.address} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Absender-Allowlist (optional)</CardTitle>
          <CardDescription>
            Nur Emails von diesen Absendern/Domains werden uebernommen. Ohne
            Eintraege werden alle weitergeleiteten Emails akzeptiert.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AllowlistManager
            endpointId={current.id}
            entries={current.allowlist}
            onAdded={onAllowlistAdded}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Einrichtung testen &amp; aktivieren</CardTitle>
          <CardDescription>
            Sende eine Test-Mail und aktiviere den Posteingang nach der
            DSGVO-Bestaetigung.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <TestSendButton endpointId={current.id} />

          {current.status === "active" ? (
            <p className="flex items-center gap-1.5 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              Posteingang ist aktiv — eingehende Emails werden uebernommen.
            </p>
          ) : (
            <Button type="button" onClick={() => setDsgvoOpen(true)}>
              Posteingang aktivieren
            </Button>
          )}
        </CardContent>
      </Card>

      <DsgvoDisclaimerModal
        endpointId={current.id}
        open={dsgvoOpen}
        onOpenChange={setDsgvoOpen}
        onConfirmed={onStatusActive}
      />
    </div>
  );
}

function RegenerateToken({
  endpointId,
  onRegenerated,
}: {
  endpointId: string;
  onRegenerated: (token: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function regenerate() {
    setError(null);
    startTransition(async () => {
      let result;
      try {
        result = await regenerateSetupToken(endpointId);
      } catch (err) {
        setError((err as Error).message);
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onRegenerated(result.setupToken);
    });
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant="ghost" size="sm" onClick={regenerate} disabled={isPending}>
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Neuen Setup-Token erzeugen
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function AllowlistManager({
  endpointId,
  entries,
  onAdded,
}: {
  endpointId: string;
  entries: AllowlistEntry[];
  onAdded: (entry: AllowlistEntry) => void;
}) {
  const [pattern, setPattern] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add() {
    const trimmed = pattern.trim().toLowerCase();
    if (trimmed.length === 0) {
      setError("Bitte gib eine Domain oder Email-Adresse ein.");
      return;
    }
    const type = inferPatternType(trimmed);
    setError(null);
    startTransition(async () => {
      let result;
      try {
        result = await updateAllowlist(endpointId, trimmed, type, true);
      } catch (err) {
        setError((err as Error).message);
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onAdded({ id: result.allowlistId, pattern: trimmed, patternType: type, enabled: true });
      setPattern("");
    });
  }

  return (
    <div className="space-y-3">
      {entries.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {entries.map((e) => (
            <Badge key={e.id} variant="secondary" className="font-mono">
              {e.pattern}
              <span className="ml-1 text-[10px] uppercase text-slate-400">
                {e.patternType === "domain" ? "Domain" : "Adresse"}
              </span>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Noch keine Allowlist-Eintraege.</p>
      )}

      <div className="flex items-start gap-2">
        <div className="flex-1 max-w-md">
          <Input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="kanzlei-mueller.de oder name@firma.de"
            disabled={isPending}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        </div>
        <Button type="button" variant="outline" onClick={add} disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Hinzufuegen
        </Button>
      </div>
    </div>
  );
}
