"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { ProgressIndicator } from "@/components/progress-indicator";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Run {
  id: string;
  tenant_id: string;
  tenant_name: string | null;
  title: string;
  status: string;
  survey_type: string;
  catalog_version: string | null;
  question_count: number;
  answered_count: number;
  evidence_count: number;
  created_at: string;
  submitted_at: string | null;
}

interface Tenant {
  id: string;
  name: string;
  language: string;
}

interface Snapshot {
  id: string;
  version: string;
  language: string;
  question_count: number;
}

const LANG_FLAG: Record<string, string> = { de: "DE", en: "EN", nl: "NL" };

export function RunsClient({ email }: { email: string }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Create run state
  const [createOpen, setCreateOpen] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [newTenantId, setNewTenantId] = useState("");
  const [newSnapshotId, setNewSnapshotId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newSurveyType, setNewSurveyType] = useState<"management" | "mirror">("management");
  const [newDueDate, setNewDueDate] = useState("");
  const [creating, setCreating] = useState(false);

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/runs");
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  async function openCreateDialog() {
    setCreateOpen(true);
    // Load tenants + snapshots for the form
    const [tRes, sRes] = await Promise.all([
      fetch("/api/admin/tenants"),
      fetch("/api/admin/catalog/snapshots"),
    ]);
    if (tRes.ok) {
      const data = await tRes.json();
      setTenants(data.tenants ?? []);
    }
    if (sRes.ok) {
      const data = await sRes.json();
      setSnapshots(data.snapshots ?? []);
    }
  }

  async function handleCreateRun() {
    if (!newTenantId || !newSnapshotId || !newTitle.trim()) return;
    setCreating(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: newTenantId,
          catalog_snapshot_id: newSnapshotId,
          survey_type: newSurveyType,
          title: newTitle.trim(),
          ...(newDueDate ? { due_date: newDueDate } : {}),
        }),
      });

      if (res.ok) {
        setMessage({ text: `Run "${newTitle.trim()}" erstellt`, type: "success" });
        setNewTenantId("");
        setNewSnapshotId("");
        setNewTitle("");
        setNewSurveyType("management");
        setNewDueDate("");
        setCreateOpen(false);
        await loadRuns();
      } else {
        const data = await res.json();
        setMessage({ text: data.error?.message ?? "Fehler beim Erstellen", type: "error" });
      }
    } catch {
      setMessage({ text: "Netzwerkfehler", type: "error" });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">Alle Runs</h2>
            <p className="mt-1 text-sm text-slate-500">Assessment-Runs aller Tenants</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>Neuer Run</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Neuen Run erstellen</DialogTitle>
                <DialogDescription>
                  Erstellen Sie einen neuen Assessment-Run für einen Tenant.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Survey-Typ</Label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setNewSurveyType("management")}
                      className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                        newSurveyType === "management"
                          ? "border-brand-primary bg-brand-primary/5 text-brand-primary ring-1 ring-brand-primary"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      Management
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewSurveyType("mirror")}
                      className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                        newSurveyType === "mirror"
                          ? "border-amber-500 bg-amber-50 text-amber-700 ring-1 ring-amber-500"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      Mirror
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Tenant</Label>
                  <Select value={newTenantId} onValueChange={setNewTenantId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tenant wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenants.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fragenkatalog</Label>
                  <Select value={newSnapshotId} onValueChange={setNewSnapshotId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Katalog wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const selectedTenant = tenants.find((t) => t.id === newTenantId);
                        const tenantLang = selectedTenant?.language ?? "de";
                        // Sort: matching language first, then rest
                        const sorted = [...snapshots].sort((a, b) => {
                          if (a.language === tenantLang && b.language !== tenantLang) return -1;
                          if (a.language !== tenantLang && b.language === tenantLang) return 1;
                          return 0;
                        });
                        return sorted.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            v{s.version} [{LANG_FLAG[s.language] ?? s.language.toUpperCase()}] ({s.question_count} Fragen)
                            {s.language === tenantLang ? " ✓" : ""}
                          </SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                  {newTenantId && (() => {
                    const selectedTenant = tenants.find((t) => t.id === newTenantId);
                    return selectedTenant ? (
                      <p className="text-xs text-slate-500">Tenant-Sprache: {LANG_FLAG[selectedTenant.language] ?? selectedTenant.language}</p>
                    ) : null;
                  })()}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="run-title">Titel</Label>
                  <Input
                    id="run-title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="z.B. Assessment Q1 2026"
                    onKeyDown={(e) => e.key === "Enter" && handleCreateRun()}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="run-due-date">Fällig bis (optional)</Label>
                  <Input
                    id="run-due-date"
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Abbrechen
                </Button>
                <Button
                  onClick={handleCreateRun}
                  disabled={creating || !newTenantId || !newSnapshotId || !newTitle.trim()}
                >
                  {creating ? "Wird erstellt..." : "Run erstellen"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {message && (
          <Alert
            variant={message.type === "error" ? "destructive" : "default"}
            className="mb-4"
          >
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Noch keine Runs erstellt. Erstellen Sie zuerst einen Tenant und importieren Sie einen Katalog.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {runs.map((run) => (
              <Link key={run.id} href={`/admin/runs/${run.id}`}>
                <div className="relative overflow-hidden bg-white rounded-2xl border-2 border-slate-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 cursor-pointer">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-primary-dark via-brand-primary to-brand-success-dark" />
                  <div className="px-6 pt-6 pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">{run.title}</h3>
                        <p className="text-sm text-slate-500 mt-1">
                          {run.tenant_name ?? "Unbekannt"} &middot; Katalog v{run.catalog_version}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {run.survey_type === "mirror" && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                            Mirror
                          </span>
                        )}
                        <StatusBadge status={run.status} />
                      </div>
                    </div>
                  </div>
                  <div className="px-6 pb-5">
                    <ProgressIndicator
                      answered={run.answered_count}
                      total={run.question_count}
                    />
                    <div className="flex gap-4 text-xs text-slate-500 mt-3">
                      <span><span className="font-bold text-brand-primary">{run.evidence_count}</span> Evidence</span>
                      <span>Erstellt: {new Date(run.created_at).toLocaleDateString("de-DE")}</span>
                      {run.submitted_at && (
                        <span>Eingereicht: {new Date(run.submitted_at).toLocaleDateString("de-DE")}</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
