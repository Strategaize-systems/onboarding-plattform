"use client";

// SLC-047 MT-1 — Wizard Modal-Container.
//
// 4-Schritte Tenant-Onboarding-Wizard. Verbindet die Step-Komponenten mit den
// Server-Actions aus SLC-046 und kapselt das Lock-/Skip-/Complete-Verhalten.
//
// Wichtige Eigenschaften:
//  - Modal blockiert nicht (DEC-053): kein modal=true, ESC + Outside-Click sind
//    erlaubt und werden als Skip behandelt (Step 1+2) bzw. Schliessen (Step 4).
//  - Multi-Admin-Lock: Initial-Mount triggert setWizardStarted nur wenn der
//    Server-State 'pending' war. Wenn alreadyStarted=true zurueckkommt, schliesst
//    das Modal sofort.
//  - Error-Boundary umrahmt den ganzen Inhalt: bei Crash → setWizardSkipped +
//    User-freundliche Fallback-UI mit Cockpit-Link (Constraint: Wizard darf
//    User nicht aussperren).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Component,
  type ReactNode,
} from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Step1Welcome } from "./steps/Step1Welcome";
import { Step2TemplatePick } from "./steps/Step2TemplatePick";
import { Step3EmployeeInvite } from "./steps/Step3EmployeeInvite";
import { Step4WhatNow } from "./steps/Step4WhatNow";
import {
  setWizardCompleted,
  setWizardSkipped,
  setWizardStarted,
  setWizardStep,
} from "@/app/dashboard/wizard-actions";
import {
  clampStep,
  emptyEmployeeRow,
  type EmployeeInviteRow,
  type WizardStep,
} from "./wizard-helpers";

export type WizardTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

export type WizardProps = {
  initialStep: WizardStep;
  initialState: "pending" | "started";
  tenantName: string;
  templates: WizardTemplate[];
};

export function Wizard({ initialStep, initialState, tenantName, templates }: WizardProps) {
  const [open, setOpen] = useState<boolean>(true);
  const [currentStep, setCurrentStep] = useState<WizardStep>(clampStep(initialStep));
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    () => templates[0]?.id ?? ""
  );
  const [employeeRows, setEmployeeRows] = useState<EmployeeInviteRow[]>(() => [
    emptyEmployeeRow(),
  ]);
  const [pending, setPending] = useState<boolean>(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const startCalledRef = useRef<boolean>(false);

  // Multi-Admin-Lock: pending → setWizardStarted; alreadyStarted=true ⇒ Modal sofort schliessen.
  useEffect(() => {
    if (startCalledRef.current) return;
    if (initialState !== "pending") return;
    startCalledRef.current = true;
    void (async () => {
      const result = await setWizardStarted();
      if (!result.ok) {
        setGlobalError(translateError(result.error));
        return;
      }
      if (result.alreadyStarted) {
        setOpen(false);
      }
    })();
  }, [initialState]);

  const handleSetStep = useCallback(async (next: WizardStep) => {
    setPending(true);
    setGlobalError(null);
    const result = await setWizardStep(next);
    setPending(false);
    if (!result.ok) {
      setGlobalError(translateError(result.error));
      return false;
    }
    setCurrentStep(next);
    return true;
  }, []);

  const handleSkip = useCallback(async () => {
    setPending(true);
    setGlobalError(null);
    const result = await setWizardSkipped();
    setPending(false);
    if (!result.ok) {
      setGlobalError(translateError(result.error));
      return;
    }
    setOpen(false);
  }, []);

  const handleComplete = useCallback(async () => {
    setPending(true);
    setGlobalError(null);
    const result = await setWizardCompleted();
    setPending(false);
    if (!result.ok) {
      setGlobalError(translateError(result.error));
      return;
    }
    setOpen(false);
  }, []);

  const stepContent = useMemo(() => {
    switch (currentStep) {
      case 1:
        return <Step1Welcome tenantName={tenantName} />;
      case 2:
        return (
          <Step2TemplatePick
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            onSelect={setSelectedTemplateId}
          />
        );
      case 3:
        return (
          <Step3EmployeeInvite
            rows={employeeRows}
            onRowsChange={setEmployeeRows}
            onSubmittedAndAdvance={() => void handleSetStep(4)}
            onSkipStep={() => void handleSetStep(4)}
            disabled={pending}
          />
        );
      case 4:
        return (
          <Step4WhatNow
            templateSlug={
              templates.find((t) => t.id === selectedTemplateId)?.slug ?? null
            }
          />
        );
    }
  }, [
    currentStep,
    tenantName,
    templates,
    selectedTemplateId,
    employeeRows,
    pending,
    handleSetStep,
  ]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      // Modal kann durch ESC oder Outside-Click geschlossen werden. Wenn der
      // User es selbst schliesst, behandeln wir das als Skip (Step 1..3) bzw.
      // als "Schliessen + nicht mehr zeigen" (Step 4).
      if (!next) {
        void handleSkip();
      }
    },
    [handleSkip]
  );

  return (
    <WizardErrorBoundary onCrash={() => void handleSkip()}>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="sm:max-w-[640px]"
          onInteractOutside={(e) => {
            // Ausser auf Schritt 4 (wo Schliessen explizit erwartet wird) lassen
            // wir Outside-Click den Skip aufrufen, aber nicht die Default-
            // Animation abbrechen.
            if (currentStep !== 4) {
              e.preventDefault();
              void handleSkip();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {currentStep === 1 && "Willkommen bei Strategaize"}
              {currentStep === 2 && "Welche Wissenserhebung möchten Sie starten?"}
              {currentStep === 3 && "Wen aus Ihrem Team möchten Sie einladen?"}
              {currentStep === 4 && "Was möchten Sie als nächstes tun?"}
            </DialogTitle>
            <DialogDescription>
              Schritt {currentStep} von 4
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">{stepContent}</div>

          {globalError && (
            <p className="text-sm text-red-600">{globalError}</p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            {/* Schritt 1+2: links Skip, rechts Weiter */}
            {(currentStep === 1 || currentStep === 2) && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => void handleSkip()}
                  disabled={pending}
                  type="button"
                >
                  Später
                </Button>
                <Button
                  onClick={() => void handleSetStep((currentStep + 1) as WizardStep)}
                  disabled={pending || (currentStep === 2 && !selectedTemplateId)}
                  type="button"
                >
                  {pending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Wird gespeichert
                    </>
                  ) : (
                    "Weiter"
                  )}
                </Button>
              </>
            )}

            {/* Schritt 3: Footer-Buttons sind in Step3EmployeeInvite selbst */}
            {currentStep === 3 && null}

            {/* Schritt 4: Schliessen + Erledigt */}
            {currentStep === 4 && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => void handleSkip()}
                  disabled={pending}
                  type="button"
                >
                  Schließen + nicht mehr zeigen
                </Button>
                <Button
                  onClick={() => void handleComplete()}
                  disabled={pending}
                  type="button"
                >
                  {pending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Wird gespeichert
                    </>
                  ) : (
                    "Erledigt"
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WizardErrorBoundary>
  );
}

function translateError(code: string): string {
  switch (code) {
    case "unauthenticated":
      return "Sitzung abgelaufen. Bitte neu einloggen.";
    case "forbidden":
      return "Sie haben keine Berechtigung für den Wizard.";
    case "wrong_state":
      return "Wizard-Status passt nicht. Bitte Seite neu laden.";
    case "step_invalid":
      return "Ungültiger Schritt.";
    case "tenant_not_found":
      return "Tenant nicht gefunden.";
    case "profile_not_found":
      return "Profil nicht gefunden.";
    case "update_failed":
    default:
      return "Speichern fehlgeschlagen. Bitte erneut versuchen.";
  }
}

// React Class-Error-Boundary — funktional gleichwertig zu existierenden
// Boundary-Patterns im Projekt (siehe handbook-Reader). Bei Crash:
//  1. setWizardSkipped (best effort, nicht blockierend)
//  2. Fallback-UI mit Cockpit-Link, damit der User nicht ausgesperrt ist.
type ErrorBoundaryProps = {
  children: ReactNode;
  onCrash: () => void;
};
type ErrorBoundaryState = { hasError: boolean };

class WizardErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    try {
      this.props.onCrash();
    } catch {
      // Best effort — Server-Action-Fehler darf Fallback-UI nicht erneut crashen.
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Dialog open={true}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Etwas ist schiefgelaufen</DialogTitle>
              <DialogDescription>
                Der Onboarding-Wizard konnte nicht angezeigt werden. Sie können das Cockpit jetzt direkt nutzen.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button asChild>
                <a href="/dashboard">Zum Cockpit</a>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    }
    return this.props.children;
  }
}
