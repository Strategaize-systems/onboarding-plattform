// SLC-139 MT-5 (FEAT-058) — Helper-Hits-Tabelle (Info-Klick-Rate pro Frage).

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { QuestionStats } from "@/lib/diagnose-analytics/aggregations";

interface HelperHitsTableProps {
  perQuestion: QuestionStats[];
}

export function HelperHitsTable({ perQuestion }: HelperHitsTableProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">
          Helper-Text-Klicks pro Frage
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Wie oft Mandanten das Info-Icon einer Frage geklickt haben, bezogen
          auf die Sessions, die die Frage erreicht haben.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">Q</TableHead>
            <TableHead>Frage-Key</TableHead>
            <TableHead className="text-right">Sessions gestartet</TableHead>
            <TableHead className="text-right">Helper geoeffnet</TableHead>
            <TableHead className="text-right">Open-Rate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {perQuestion.map((q, index) => (
            <TableRow key={q.questionKey}>
              <TableCell className="text-xs text-slate-500">
                Q{index + 1}
              </TableCell>
              <TableCell className="font-mono text-xs text-slate-700">
                {q.questionKey}
              </TableCell>
              <TableCell className="text-right text-sm text-slate-700">
                {q.startedCount}
              </TableCell>
              <TableCell className="text-right text-sm text-slate-700">
                {q.belowThreshold ? "—" : q.helperOpenedCount}
              </TableCell>
              <TableCell className="text-right text-sm font-medium text-slate-900">
                {q.helperOpenRate === null
                  ? "zu wenig Daten"
                  : `${(q.helperOpenRate * 100).toFixed(0)} %`}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
