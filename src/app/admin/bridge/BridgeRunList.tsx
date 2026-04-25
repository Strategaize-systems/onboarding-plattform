"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BridgeRunRow } from "./types";

interface Props {
  runs: BridgeRunRow[];
}

function statusVariant(status: BridgeRunRow["status"]) {
  if (status === "completed") return "default" as const;
  if (status === "failed") return "destructive" as const;
  if (status === "stale") return "outline" as const;
  return "secondary" as const;
}

function statusLabel(status: BridgeRunRow["status"]): string {
  switch (status) {
    case "running":
      return "Laeuft";
    case "completed":
      return "Fertig";
    case "failed":
      return "Fehlgeschlagen";
    case "stale":
      return "Veraltet";
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatCost(usd: number | null): string {
  if (usd === null || usd === undefined) return "–";
  return `$${usd.toFixed(4)}`;
}

export function BridgeRunList({ runs }: Props) {
  const [showAll, setShowAll] = useState(false);

  if (runs.length === 0) {
    return null;
  }

  const visibleRuns = showAll ? runs : runs.slice(0, 1);
  const hasMore = runs.length > 1;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Bridge-Laeufe</CardTitle>
          <CardDescription>
            {runs.length} {runs.length === 1 ? "Lauf" : "Laeufe"}
          </CardDescription>
        </div>
        {hasMore && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Nur juengsten zeigen" : "Vorgaenger-Laeufe zeigen"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Gestartet</TableHead>
              <TableHead className="text-right">Vorschlaege</TableHead>
              <TableHead className="text-right">Kosten</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRuns.map((run) => (
              <TableRow key={run.id}>
                <TableCell>
                  <Badge variant={statusVariant(run.status)}>
                    {statusLabel(run.status)}
                  </Badge>
                  {run.error_message && (
                    <p className="mt-1 text-xs text-red-600">{run.error_message}</p>
                  )}
                </TableCell>
                <TableCell className="text-slate-600">
                  {formatDate(run.created_at)}
                </TableCell>
                <TableCell className="text-right">{run.proposal_count}</TableCell>
                <TableCell className="text-right text-slate-500">
                  {formatCost(run.cost_usd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
