"use client";

// V7.1 SLC-136 MT-4 — Override-Row mit Reset-Button + History-Link.
// Client-Component damit useTransition + onClick-Handler funktionieren.
// Native HTML pattern statt react-hook-form (siehe feedback_native_html_form_pattern.md).

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { resetTextOverride } from "@/lib/text-override/actions";
import type { TextOverrideScope } from "@/lib/text-override/resolver";

type Props = {
  id: string;
  scope: TextOverrideScope;
  scopeId: string | null;
  textKey: string;
  textValue: string;
  locale: string;
  updatedAt: string;
  updatedBy: string;
  canReset: boolean;
};

const SCOPE_VARIANTS: Record<TextOverrideScope, "default" | "secondary" | "outline"> = {
  global: "default",
  template: "secondary",
  partner: "outline",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

export function OverrideRow({
  id,
  scope,
  scopeId,
  textKey,
  textValue,
  locale,
  updatedAt,
  updatedBy,
  canReset,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onReset = () => {
    if (!confirm(`Override "${textKey}" wirklich auf Standard zuruecksetzen?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await resetTextOverride({ scope, scopeId, textKey, locale });
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  return (
    <TableRow>
      <TableCell>
        <Badge variant={SCOPE_VARIANTS[scope]}>{scope}</Badge>
        {scopeId && (
          <div className="mt-1 text-xs text-slate-500">{scopeId.slice(0, 8)}…</div>
        )}
      </TableCell>
      <TableCell>
        <div className="font-mono text-xs text-slate-900">{textKey}</div>
      </TableCell>
      <TableCell className="text-slate-700">
        <div title={textValue}>{truncate(textValue, 80)}</div>
      </TableCell>
      <TableCell className="text-xs text-slate-500">{locale}</TableCell>
      <TableCell className="text-xs text-slate-500">
        <div>{formatDate(updatedAt)}</div>
        <div title={updatedBy}>{updatedBy.slice(0, 8)}…</div>
      </TableCell>
      <TableCell className="space-y-1 text-right">
        <Link
          href={`/admin/text-overrides/${id}/history`}
          className="block text-sm font-medium text-brand-primary hover:underline"
        >
          Verlauf
        </Link>
        {canReset && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={pending}
            >
              {pending ? "…" : "Zuruecksetzen"}
            </Button>
            {error && (
              <div className="text-xs text-red-600" role="alert">
                {error}
              </div>
            )}
          </>
        )}
      </TableCell>
    </TableRow>
  );
}
