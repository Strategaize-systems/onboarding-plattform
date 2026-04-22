"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { startCaptureSession, type CaptureMode } from "../actions";
import type { TemplateRow } from "@/lib/db/template-queries";
import { ClipboardList, FileUp, Mic } from "lucide-react";

interface Props {
  templates: TemplateRow[];
}

const CAPTURE_MODES: {
  key: CaptureMode;
  icon: typeof ClipboardList;
  label: string;
  description: string;
}[] = [
  {
    key: "questionnaire",
    icon: ClipboardList,
    label: "Fragebogen",
    description: "Strukturierte Fragen Block fuer Block beantworten",
  },
  {
    key: "evidence",
    icon: FileUp,
    label: "Dokumente",
    description: "Dokumente hochladen und KI-gestuetzt auswerten",
  },
  {
    key: "dialogue",
    icon: Mic,
    label: "Gespraech",
    description: "Meeting mit Aufzeichnung, Transkription und KI-Analyse",
  },
];

export function StartSessionClient({ templates }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<CaptureMode>("questionnaire");

  function handleStart(slug: string) {
    setError(null);
    startTransition(async () => {
      const result = await startCaptureSession(slug, selectedMode);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  if (templates.length === 0) {
    return (
      <div className="container mx-auto max-w-2xl py-12 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Kein Template verfuegbar</CardTitle>
            <CardDescription>
              Es ist noch kein Assessment-Template konfiguriert.
              Kontaktieren Sie Ihren Administrator.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl py-12 px-4">
      <h1 className="text-2xl font-bold mb-6">Neues Assessment starten</h1>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md mb-4">
          {error}
        </div>
      )}

      {/* Mode Selection */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">
          Erfassungsmodus
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {CAPTURE_MODES.map((mode) => {
            const Icon = mode.icon;
            const isSelected = selectedMode === mode.key;
            return (
              <button
                key={mode.key}
                onClick={() => setSelectedMode(mode.key)}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all ${
                  isSelected
                    ? "border-brand-primary bg-brand-primary/5 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    isSelected
                      ? "bg-brand-primary text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span
                  className={`text-sm font-semibold ${
                    isSelected ? "text-brand-primary-dark" : "text-slate-700"
                  }`}
                >
                  {mode.label}
                </span>
                <span className="text-xs text-slate-500 leading-tight">
                  {mode.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Template Selection */}
      <div className="space-y-4">
        {templates.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <CardTitle>{template.name}</CardTitle>
              {template.description && (
                <CardDescription>{template.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Version {template.version} · {template.blocks.length} Bloecke
                </span>
                <Button
                  onClick={() => handleStart(template.slug)}
                  disabled={isPending}
                >
                  {isPending ? "Wird gestartet…" : "Session starten"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
