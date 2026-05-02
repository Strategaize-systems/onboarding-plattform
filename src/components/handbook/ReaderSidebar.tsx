"use client";

// SLC-044 MT-4 — ReaderSidebar mit zwei Abschnitten:
//   1. Section-Liste — Klick scrollt zur Section im Hauptbereich (Anchor).
//   2. Snapshot-Liste — alle Tenant-Snapshots sortiert nach created_at desc.
//      Aktiver Snapshot markiert. Klick wechselt zu anderem Snapshot via Link.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  History,
  Loader2,
  AlertCircle,
} from "lucide-react";

import type { ReaderSnapshotMeta, SnapshotStatus } from "./types";
import type { SectionFile } from "@/lib/handbook/load-snapshot-content";

interface ReaderSidebarProps {
  sections: SectionFile[];
  snapshots: ReaderSnapshotMeta[];
  activeSnapshotId: string;
  onSectionSelect: (sectionKey: string) => void;
  /** SLC-051 MT-2 — DOM-ID der aktuell beim Lesen sichtbaren Section. */
  activeSectionDomId?: string | null;
  /** SLC-051 MT-2 — Mapper sectionKey → erwartete DOM-ID (= sectionDomId-Helper). */
  sectionDomIdFn?: (sectionKey: string) => string;
}

function StatusIcon({ status }: { status: SnapshotStatus }) {
  if (status === "ready") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  }
  if (status === "failed") {
    return <AlertCircle className="h-3.5 w-3.5 text-red-600" />;
  }
  return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />;
}

export function ReaderSidebar({
  sections,
  snapshots,
  activeSnapshotId,
  onSectionSelect,
  activeSectionDomId,
  sectionDomIdFn,
}: ReaderSidebarProps) {
  const router = useRouter();

  const handleSnapshotClick = useCallback(
    (id: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      router.push(`/dashboard/handbook/${id}`);
    },
    [router],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex-shrink-0 border-b border-slate-200 px-5 py-4">
        <Link
          href="/dashboard"
          className="text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
        >
          ← Dashboard
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-6">
          <div className="flex items-center gap-2 px-2 pb-2">
            <BookOpen className="h-3.5 w-3.5 text-slate-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Inhalt
            </h2>
          </div>
          {sections.length === 0 ? (
            <p className="px-2 text-xs text-slate-400">
              Keine Sektionen verfuegbar.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {sections.map((section) => {
                const sectionDomId = sectionDomIdFn
                  ? sectionDomIdFn(section.sectionKey)
                  : null;
                const isActive =
                  !!sectionDomId &&
                  !!activeSectionDomId &&
                  sectionDomId === activeSectionDomId;
                return (
                  <li key={section.filename}>
                    <button
                      type="button"
                      onClick={() => onSectionSelect(section.sectionKey)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                        isActive
                          ? "bg-brand-primary/10 text-brand-primary-dark font-semibold"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                      data-testid="reader-sidebar-section"
                      data-active={isActive ? "true" : undefined}
                      aria-current={isActive ? "location" : undefined}
                    >
                      <span className="truncate">
                        <span
                          className={`mr-1.5 text-xs font-mono ${
                            isActive ? "text-brand-primary-dark" : "text-slate-400"
                          }`}
                        >
                          {String(section.order).padStart(2, "0")}
                        </span>
                        {section.title}
                      </span>
                      <ChevronRight
                        className={`h-3.5 w-3.5 flex-shrink-0 ${
                          isActive ? "text-brand-primary" : "text-slate-300"
                        }`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-200 pt-4">
          <div className="flex items-center gap-2 px-2 pb-2">
            <History className="h-3.5 w-3.5 text-slate-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Versionen ({snapshots.length})
            </h2>
          </div>
          {snapshots.length === 0 ? (
            <p className="px-2 text-xs text-slate-400">
              Keine Snapshots vorhanden.
            </p>
          ) : (
            <ul className="space-y-1">
              {snapshots.map((snap) => {
                const isActive = snap.id === activeSnapshotId;
                return (
                  <li key={snap.id}>
                    <a
                      href={`/dashboard/handbook/${snap.id}`}
                      onClick={handleSnapshotClick(snap.id)}
                      className={`flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
                        isActive
                          ? "bg-brand-primary/10 text-brand-primary-dark"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                      data-testid="reader-sidebar-snapshot"
                      aria-current={isActive ? "page" : undefined}
                    >
                      <div className="flex items-center gap-1.5">
                        <StatusIcon status={snap.status} />
                        <span
                          className={`truncate ${
                            isActive ? "font-semibold" : "font-medium"
                          }`}
                        >
                          {snap.formattedCreatedAt}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {snap.section_count !== null
                          ? `${snap.section_count} Sektionen`
                          : null}
                        {snap.section_count !== null && snap.knowledge_unit_count !== null
                          ? " · "
                          : ""}
                        {snap.knowledge_unit_count !== null
                          ? `${snap.knowledge_unit_count} KU`
                          : null}
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
