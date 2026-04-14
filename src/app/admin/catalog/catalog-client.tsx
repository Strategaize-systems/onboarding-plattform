"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface CatalogQuestion {
  id: string;
  frage_id: string;
  block: string;
  ebene: string;
  fragetext: string;
  position: number;
}

interface Snapshot {
  id: string;
  version: string;
  blueprint_version: string;
  language: string;
  question_count: number;
  hash: string;
  created_at: string;
}

const LANGUAGE_LABELS: Record<string, string> = { de: "Deutsch", en: "English", nl: "Nederlands" };
const LANGUAGE_COLORS: Record<string, string> = { de: "default", en: "secondary", nl: "outline" };

export function CatalogClient({ email }: { email: string }) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Import state
  const [importOpen, setImportOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [importLanguage, setImportLanguage] = useState("de");
  const [importing, setImporting] = useState(false);

  // Questions preview state
  const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null);
  const [snapshotQuestions, setSnapshotQuestions] = useState<CatalogQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);

  const loadSnapshots = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/catalog/snapshots");
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data.snapshots ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  async function toggleQuestions(snapshotId: string) {
    if (expandedSnapshotId === snapshotId) {
      setExpandedSnapshotId(null);
      return;
    }
    setExpandedSnapshotId(snapshotId);
    setQuestionsLoading(true);
    try {
      const res = await fetch(`/api/admin/catalog/snapshots/${snapshotId}/questions`);
      if (res.ok) {
        const data = await res.json();
        setSnapshotQuestions(data.questions ?? []);
      }
    } finally {
      setQuestionsLoading(false);
    }
  }

  async function handleImport() {
    if (!jsonText.trim()) return;
    setImporting(true);
    setMessage(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setMessage({ text: "Ungültiges JSON-Format", type: "error" });
      setImporting(false);
      return;
    }

    try {
      // Inject selected language into the catalog data
      const payload = typeof parsed === "object" && parsed !== null
        ? { ...parsed, language: importLanguage }
        : parsed;
      const res = await fetch("/api/admin/catalog/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setMessage({
          text: `Katalog v${data.snapshot.version} importiert (${data.snapshot.question_count} Fragen)`,
          type: "success",
        });
        setJsonText("");
        setImportOpen(false);
        await loadSnapshots();
      } else {
        const data = await res.json();
        setMessage({ text: data.error?.message ?? "Import fehlgeschlagen", type: "error" });
      }
    } catch {
      setMessage({ text: "Netzwerkfehler", type: "error" });
    } finally {
      setImporting(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setJsonText(text);
    } catch {
      setMessage({ text: "Datei konnte nicht gelesen werden", type: "error" });
    }
  }

  return (
    <div>
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">Fragenkatalog</h2>
            <p className="mt-1 text-sm text-slate-500">Versionierte Fragenkataloge verwalten</p>
          </div>
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button>Katalog importieren</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Fragenkatalog importieren</DialogTitle>
                <DialogDescription>
                  Importieren Sie einen Fragenkatalog als JSON. Das Format muss
                  version, blueprint_version und questions enthalten.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Sprache des Katalogs</Label>
                  <Select value={importLanguage} onValueChange={setImportLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="nl">Nederlands</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="json-file">JSON-Datei laden</Label>
                  <Input
                    id="json-file"
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="json-text">oder JSON direkt einfügen</Label>
                  <Textarea
                    id="json-text"
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    placeholder='{"version": "1.0", "blueprint_version": "1.0", "questions": [...]}'
                    rows={12}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setImportOpen(false)}
                >
                  Abbrechen
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={importing || !jsonText.trim()}
                >
                  {importing ? "Wird importiert..." : "Importieren"}
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
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : snapshots.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Noch keine Kataloge importiert. Klicken Sie auf &quot;Katalog importieren&quot; um zu beginnen.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {snapshots.map((snap) => (
              <Collapsible
                key={snap.id}
                open={expandedSnapshotId === snap.id}
                onOpenChange={() => toggleQuestions(snap.id)}
              >
                <div className="relative overflow-hidden bg-white rounded-2xl border-2 border-slate-200 shadow-lg hover:shadow-xl transition-all duration-300">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-primary-dark via-brand-primary to-brand-success-dark" />
                  <div className="px-6 pt-6 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-slate-900">v{snap.version}</span>
                        <Badge variant={(LANGUAGE_COLORS[snap.language] ?? "outline") as "default" | "secondary" | "outline"} className="text-xs">
                          {LANGUAGE_LABELS[snap.language] ?? snap.language.toUpperCase()}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {snap.blueprint_version}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-brand-primary">{snap.question_count} Fragen</span>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm">
                            {expandedSnapshotId === snap.id ? "Zuklappen" : "Aufklappen"}
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </div>
                    <p className="font-mono text-xs text-slate-400 mt-1">
                      Hash: {snap.hash.slice(0, 16)}...
                    </p>
                  </div>
                  <div className="px-6 pb-4">
                    <p className="text-sm text-slate-400">
                      Importiert: {new Date(snap.created_at).toLocaleString("de-DE")}
                    </p>
                  </div>
                  <CollapsibleContent>
                    <div className="px-6 pb-5">
                      {questionsLoading ? (
                        <Skeleton className="h-32 w-full" />
                      ) : (
                        <div className="max-h-96 overflow-y-auto rounded-md border">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50 sticky top-0">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium">ID</th>
                                <th className="px-3 py-2 text-left font-medium">Block</th>
                                <th className="px-3 py-2 text-left font-medium">Ebene</th>
                                <th className="px-3 py-2 text-left font-medium">Fragetext</th>
                              </tr>
                            </thead>
                            <tbody>
                              {snapshotQuestions.map((q) => (
                                <tr key={q.id} className="border-t">
                                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                                    {q.frage_id}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap">{q.block}</td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    <Badge variant="outline" className="text-xs">
                                      {q.ebene}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-2">{q.fragetext}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
