// SLC-047 MT-1 — Pure logic helpers fuer Wizard-Frontend.
//
// Diese Funktionen kapseln die testbare Logik des Wizards (Step-Transitions,
// Email-Validation, Form-Row-Bereinigung). Sie haben keinen React- oder DB-
// Bezug und sind dadurch ohne jsdom/testing-library testbar.
//
// Hintergrund: Das Projekt hat (Stand SLC-047) keine React-Component-Test-
// Infrastruktur. Render-Verifikation geschieht ueber MT-7 Browser-Smoke
// (Pflicht-Gate SC-V4.2-9).

export type WizardStep = 1 | 2 | 3 | 4;

export type EmployeeInviteRow = {
  email: string;
  displayName: string;
  roleHint: string;
};

export type EmployeeInviteRowResult =
  | { ok: true; email: string; displayName: string | null; roleHint: string | null }
  | { ok: false; index: number; reason: "invalid_email" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim().toLowerCase());
}

/**
 * Filtert leere Rows raus (User hat Add-Row geklickt aber nichts eingetragen)
 * und validiert pro nicht-leerer Row die E-Mail Submit-Time.
 *
 * Returnt:
 *  - validRows: Rows die eingeladen werden sollen (E-Mail valid, normalisiert)
 *  - errors: Liste der invaliden Indizes (fuer Inline-Error-Display in der UI)
 *  - isEmpty: true, wenn nach Filter 0 Rows uebrig sind (Solo-GF-Pfad)
 */
export function prepareEmployeeRows(
  rows: EmployeeInviteRow[]
): {
  validRows: Array<{ email: string; displayName: string | null; roleHint: string | null }>;
  errors: Array<{ index: number; reason: "invalid_email" }>;
  isEmpty: boolean;
} {
  const errors: Array<{ index: number; reason: "invalid_email" }> = [];
  const validRows: Array<{ email: string; displayName: string | null; roleHint: string | null }> = [];

  // Pre-Filter: rows mit komplett leerer E-Mail werden ignoriert (User-Komfort,
  // Add-Row ohne Eingabe).
  const nonEmpty = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.email.trim().length > 0);

  if (nonEmpty.length === 0) {
    return { validRows, errors, isEmpty: true };
  }

  for (const { row, index } of nonEmpty) {
    const email = row.email.trim().toLowerCase();
    if (!isValidEmail(email)) {
      errors.push({ index, reason: "invalid_email" });
      continue;
    }
    const displayName = row.displayName.trim();
    const roleHint = row.roleHint.trim();
    validRows.push({
      email,
      displayName: displayName.length > 0 ? displayName : null,
      roleHint: roleHint.length > 0 ? roleHint : null,
    });
  }

  return { validRows, errors, isEmpty: false };
}

/**
 * Liefert den naechsten Step (clamped auf 4). Wird vom Wizard-Container
 * genutzt um nach erfolgreichem "Weiter" zu navigieren.
 */
export function nextStep(current: WizardStep): WizardStep {
  if (current >= 4) return 4;
  return (current + 1) as WizardStep;
}

/**
 * Liefert den vorherigen Step (clamped auf 1). Aktuell ungenutzt — der
 * Wizard erlaubt kein Zurueck (waere Architektur-Aenderung). Bewusst hier
 * reserviert fuer V5+.
 */
export function prevStep(current: WizardStep): WizardStep {
  if (current <= 1) return 1;
  return (current - 1) as WizardStep;
}

/**
 * Erzwingt einen Step-Wert ins erlaubte Set 1..4. Wird vom Layout-Helper
 * benutzt um initialStep aus tenants.onboarding_wizard_step zu sanitisieren.
 */
export function clampStep(value: number): WizardStep {
  if (value <= 1) return 1;
  if (value >= 4) return 4;
  if (value === 2) return 2;
  if (value === 3) return 3;
  return 1;
}

/**
 * Gibt eine leere EmployeeInviteRow zurueck. Wird vom Add-Row-Button in
 * Step3EmployeeInvite genutzt.
 */
export function emptyEmployeeRow(): EmployeeInviteRow {
  return { email: "", displayName: "", roleHint: "" };
}

export type WizardServerState = {
  state: "pending" | "started" | "skipped" | "completed";
  step: number;
};

export type WizardInitialUiState =
  | { render: false }
  | { render: true; initialStep: WizardStep; needsStartCall: boolean };

/**
 * Reine Funktion fuer den Browser-Reload-Pfad (MT-6):
 *
 *  - state='pending'   → Wizard rendern, Initial-Mount loest setWizardStarted aus.
 *                        initialStep=1 (Server hat noch keinen Step gesetzt).
 *  - state='started'   → Wizard rendern, KEIN setWizardStarted-Call,
 *                        initialStep aus state.step (clamped).
 *  - state='skipped'/'completed' → kein Wizard mehr.
 *
 * Diese Funktion ist die testbare Linse der layout.tsx-Branching-Logik —
 * sie macht den Persistenz-Pfad explizit pruefbar ohne Server-Komponenten zu
 * mocken.
 */
export function deriveInitialUiState(
  serverState: WizardServerState,
  hasCaptureSessions: boolean
): WizardInitialUiState {
  if (serverState.state === "skipped" || serverState.state === "completed") {
    return { render: false };
  }
  if (serverState.state === "pending" && hasCaptureSessions) {
    // Soft-Bedingung aus get-wizard-state.ts: pending nur wenn 0 Sessions.
    return { render: false };
  }
  if (serverState.state === "pending") {
    return { render: true, initialStep: 1, needsStartCall: true };
  }
  // state === 'started' — Resume nach Reload.
  return {
    render: true,
    initialStep: clampStep(serverState.step),
    needsStartCall: false,
  };
}
