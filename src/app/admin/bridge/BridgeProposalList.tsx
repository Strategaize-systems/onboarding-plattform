"use client";

import { BridgeProposalCard } from "./BridgeProposalCard";
import type { BridgeProposalRow, EmployeeRow } from "./types";

interface Props {
  proposals: BridgeProposalRow[];
  employees: EmployeeRow[];
}

export function BridgeProposalList({ proposals, employees }: Props) {
  if (proposals.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Noch keine Vorschlaege. Loese einen Bridge-Lauf aus, sobald Bloecke abgeschlossen sind.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {proposals.map((p) => (
        <BridgeProposalCard key={p.id} proposal={p} employees={employees} />
      ))}
    </div>
  );
}
