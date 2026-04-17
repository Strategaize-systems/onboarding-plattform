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
import { startCaptureSession } from "../actions";
import type { TemplateRow } from "@/lib/db/template-queries";

interface Props {
  templates: TemplateRow[];
}

export function StartSessionClient({ templates }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleStart(slug: string) {
    setError(null);
    startTransition(async () => {
      const result = await startCaptureSession(slug);
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
            <CardTitle>Kein Template verfügbar</CardTitle>
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
                  Version {template.version} · {template.blocks.length} Blöcke
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
