// Hermetische Render-Tests fuer die StB-Workspace-Presentational-Komponenten
// (SLC-175 MT-2). Verifiziert fehlerfreies Rendering + Branch-Logik (Triple,
// KI-Hebel-Reifegrad-Badge, Empty-/Error-States, AC-175-4) via renderToString
// — vermeidet @testing-library/react als neue Dep (Pattern: V8OutroSection-Test).
//
// next-intl wird gemockt: t(key) gibt den Key zurueck, t(key, values) haengt die
// Werte an -> deterministisch und unabhaengig von den Message-Katalogen.

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}|${Object.values(values).join(",")}` : key,
  useLocale: () => "de",
}));

import { ModuleOutputCard } from "../ModuleOutputCard";
import { KiHebelList } from "../KiHebelList";
import { ModulWorkspaceView } from "../ModulWorkspaceView";
import { WorkspaceOverview } from "../WorkspaceOverview";
import type {
  ModulOutputRow,
  ModuleWorkspaceData,
  ModulSummary,
} from "@/lib/stb-vertikale/workspace-read";

function row(partial: Partial<ModulOutputRow>): ModulOutputRow {
  return {
    id: "id-1",
    modul_key: "m04",
    output_kind: "entscheidung",
    title: null,
    body: "Body text",
    reifegrad: null,
    evidence_refs: [],
    source: "synthesis",
    status: "proposed",
    capture_session_id: "cs-1",
    ai_job_id: null,
    created_at: "2026-06-22T10:00:00Z",
    updated_at: "2026-06-22T10:00:00Z",
    ...partial,
  };
}

describe("ModuleOutputCard", () => {
  it("rendert Kind-Label, Titel und Body bei vorhandenen Rows", () => {
    const html = renderToString(
      <ModuleOutputCard
        kind="entscheidung"
        rows={[row({ id: "a", title: "Entscheidung A", body: "Begruendung." })]}
      />,
    );
    expect(html).toContain("kind.entscheidung");
    expect(html).toContain("Entscheidung A");
    expect(html).toContain("Begruendung.");
    expect(html).not.toContain("noEntry");
  });

  it("zeigt den Leer-Hinweis bei keiner Row", () => {
    const html = renderToString(
      <ModuleOutputCard kind="standard" rows={[]} />,
    );
    expect(html).toContain("kind.standard");
    expect(html).toContain("noEntry");
  });
});

describe("KiHebelList", () => {
  it("rendert Reifegrad-Badge + Body je Eintrag", () => {
    const html = renderToString(
      <KiHebelList
        items={[
          row({
            id: "k1",
            output_kind: "ki_hebel",
            reifegrad: 2,
            title: "Hebel X",
            body: "KI macht Y.",
          }),
        ]}
      />,
    );
    expect(html).toContain("kiHebelHeading");
    expect(html).toContain("reifegrad|2");
    expect(html).toContain("Hebel X");
    expect(html).toContain("KI macht Y.");
  });

  it("nutzt das Ohne-Reifegrad-Label bei null", () => {
    const html = renderToString(
      <KiHebelList
        items={[row({ id: "k2", output_kind: "ki_hebel", reifegrad: null })]}
      />,
    );
    expect(html).toContain("reifegradNone");
    expect(html).not.toContain("reifegrad|");
  });

  it("zeigt den Leer-Hinweis ohne KI-Hebel", () => {
    const html = renderToString(<KiHebelList items={[]} />);
    expect(html).toContain("kiHebelEmpty");
  });
});

describe("ModulWorkspaceView (States, AC-175-4)", () => {
  const populated: ModuleWorkspaceData = {
    modulKey: "m04",
    triple: [
      {
        kind: "entscheidung",
        label: "Entscheidung",
        rows: [row({ id: "e", body: "E-Body" })],
      },
      { kind: "standard", label: "Standard", rows: [] },
      {
        kind: "implementierungsschritt",
        label: "Implementierungsschritt",
        rows: [],
      },
    ],
    kiHebel: [row({ id: "k", output_kind: "ki_hebel", reifegrad: 1 })],
    total: 2,
  };

  it("rendert Triple-Cards + KI-Hebel + Print-Button bei Inhalt", () => {
    const html = renderToString(
      <ModulWorkspaceView
        heading="Finanzsteuerung"
        modulLabel="M-04"
        data={populated}
        loadError={false}
      />,
    );
    expect(html).toContain("Finanzsteuerung");
    expect(html).toContain("E-Body");
    expect(html).toContain("kiHebelHeading");
    expect(html).toContain(">print</button>"); // Print-Button-Label-Text (nicht die print:-Klassen)
    expect(html).not.toContain("detailEmptyTitle");
  });

  it("zeigt den Error-State und keinen Print-Button", () => {
    const html = renderToString(
      <ModulWorkspaceView
        heading="M-05"
        modulLabel="M-05"
        data={null}
        loadError={true}
      />,
    );
    expect(html).toContain("detailLoadError");
    expect(html).not.toContain("kiHebelHeading");
  });

  it("zeigt den Empty-State bei total=0", () => {
    const html = renderToString(
      <ModulWorkspaceView
        heading="M-06"
        modulLabel="M-06"
        data={{ modulKey: "m06", triple: [], kiHebel: [], total: 0 }}
        loadError={false}
      />,
    );
    expect(html).toContain("detailEmptyTitle");
    expect(html).toContain("detailEmptyBody");
  });
});

describe("WorkspaceOverview (States, AC-175-4)", () => {
  it("rendert eine Karte je Modul-Summary", () => {
    const summaries: ModulSummary[] = [
      {
        modulKey: "m04",
        outputCount: 4,
        tripleCount: 3,
        kiHebelCount: 1,
        latestCreatedAt: "2026-06-22T10:00:00Z",
      },
    ];
    const html = renderToString(
      <WorkspaceOverview summaries={summaries} loadError={false} />,
    );
    expect(html).toContain("M-04");
    expect(html).toContain("outputCount|3");
    expect(html).toContain("kiHebelCount|1");
    expect(html).not.toContain("emptyTitle");
  });

  it("zeigt den Empty-State ohne Summaries", () => {
    const html = renderToString(
      <WorkspaceOverview summaries={[]} loadError={false} />,
    );
    expect(html).toContain("emptyTitle");
    expect(html).toContain("emptyBody");
  });

  it("zeigt den Error-State", () => {
    const html = renderToString(
      <WorkspaceOverview summaries={[]} loadError={true} />,
    );
    expect(html).toContain("loadError");
  });
});
