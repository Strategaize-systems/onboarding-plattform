// SLC-047 MT-6 — Persistenz-Test: Browser-Reload landet auf letztem Step.
//
// Pure-Logic-Test der deriveInitialUiState-Branching. Damit wird der
// kritische Reload-Pfad (state='started' + step=3 → Wizard rendert step 3)
// verifiziert, ohne Layout-Server-Komponente oder DB zu mocken.
//
// Hintergrund: deriveInitialUiState ist die testbare Linse der layout.tsx-
// Branching-Logik. Wenn diese Funktion korrekt ist und layout.tsx sie eins-
// zu-eins anwendet, ist Step-Persistenz gewaehrleistet.

import { describe, it, expect } from "vitest";
import { deriveInitialUiState } from "../wizard-helpers";

describe("deriveInitialUiState — Skip/Completed Final-States", () => {
  it("rendert nicht wenn skipped", () => {
    const result = deriveInitialUiState({ state: "skipped", step: 1 }, false);
    expect(result).toEqual({ render: false });
  });

  it("rendert nicht wenn completed", () => {
    const result = deriveInitialUiState({ state: "completed", step: 4 }, true);
    expect(result).toEqual({ render: false });
  });
});

describe("deriveInitialUiState — pending + Soft-Bedingung", () => {
  it("rendert wenn pending UND 0 capture_sessions, mit needsStartCall=true", () => {
    const result = deriveInitialUiState({ state: "pending", step: 1 }, false);
    expect(result).toEqual({
      render: true,
      initialStep: 1,
      needsStartCall: true,
    });
  });

  it("rendert NICHT wenn pending aber Tenant hat schon capture_sessions", () => {
    const result = deriveInitialUiState({ state: "pending", step: 1 }, true);
    expect(result).toEqual({ render: false });
  });
});

describe("deriveInitialUiState — Resume nach Browser-Reload (Pflicht-Persistenz)", () => {
  it("Reload auf Schritt 2 → Wizard rendert Schritt 2 ohne neuen setWizardStarted", () => {
    const result = deriveInitialUiState({ state: "started", step: 2 }, false);
    expect(result).toEqual({
      render: true,
      initialStep: 2,
      needsStartCall: false,
    });
  });

  it("Reload auf Schritt 3 → Wizard rendert Schritt 3 ohne neuen setWizardStarted", () => {
    const result = deriveInitialUiState({ state: "started", step: 3 }, false);
    expect(result).toEqual({
      render: true,
      initialStep: 3,
      needsStartCall: false,
    });
  });

  it("Reload auf Schritt 4 → Wizard rendert Schritt 4 ohne neuen setWizardStarted", () => {
    const result = deriveInitialUiState({ state: "started", step: 4 }, true);
    expect(result).toEqual({
      render: true,
      initialStep: 4,
      needsStartCall: false,
    });
  });

  it("clamped korrupte DB-Step-Werte (z.B. 99) auf 4", () => {
    const result = deriveInitialUiState({ state: "started", step: 99 }, false);
    expect(result.render).toBe(true);
    if (result.render) {
      expect(result.initialStep).toBe(4);
    }
  });

  it("clamped negative DB-Step-Werte auf 1", () => {
    const result = deriveInitialUiState({ state: "started", step: -2 }, false);
    expect(result.render).toBe(true);
    if (result.render) {
      expect(result.initialStep).toBe(1);
    }
  });
});
