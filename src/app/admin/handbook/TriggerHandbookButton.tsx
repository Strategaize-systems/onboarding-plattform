"use client";

// SLC-042 MT-3 — TriggerHandbookButton mit Quality-Gate-Confirm-Dialog.
//
// Wenn pending > 0 (Mitarbeiter-Bloecke noch nicht reviewed): AlertDialog mit
// X/Y-Anzeige, Berater muss bestaetigen. Dabei wird ein Audit-Log-Eintrag mit
// {pending_at_trigger, approved_count, rejected_count} geschrieben.
//
// Wenn pending = 0: direkter Trigger ohne Dialog (V4-Verhalten unveraendert).
//
// reviewSummary kommt von der Server-Component (page.tsx) via getReviewSummary —
// dadurch braucht der Client keine eigene RPC und der Dialog rendert sofort
// mit aktuellen Zahlen.

import { useState, useTransition } from "react";
import { Loader2, BookOpen, RotateCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { triggerHandbookSnapshot } from "./actions";

export interface ReviewSummaryProp {
  approved: number;
  pending: number;
  rejected: number;
  totalEmployeeBlocks: number;
}

interface Props {
  captureSessionId: string;
  hasPreviousSnapshot: boolean;
  disabled?: boolean;
  /** SLC-042: Quality-Gate-Daten. Wenn omitted, kein Confirm-Dialog. */
  reviewSummary?: ReviewSummaryProp;
}

export function TriggerHandbookButton({
  captureSessionId,
  hasPreviousSnapshot,
  disabled,
  reviewSummary,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const pendingBlocks = reviewSummary?.pending ?? 0;
  const requiresConfirm = pendingBlocks > 0;

  function runTrigger() {
    startTransition(async () => {
      const result = await triggerHandbookSnapshot(
        captureSessionId,
        reviewSummary
          ? {
              reviewAudit: {
                pendingAtTrigger: reviewSummary.pending,
                approvedCount: reviewSummary.approved,
                rejectedCount: reviewSummary.rejected,
                totalEmployeeBlocks: reviewSummary.totalEmployeeBlocks,
              },
            }
          : undefined,
      );
      if (!result.ok) {
        toast.error(
          result.error === "capture_session_not_found"
            ? "Erhebung nicht gefunden."
            : result.error === "capture_session_id_invalid"
              ? "Ungueltige Erhebungs-ID."
              : "Handbuch-Generierung konnte nicht gestartet werden.",
        );
        return;
      }
      toast.success(
        "Handbuch wird im Hintergrund erzeugt. Status aktualisiert sich automatisch.",
      );
      setConfirmOpen(false);
    });
  }

  function handleClick() {
    if (requiresConfirm) {
      setConfirmOpen(true);
      return;
    }
    runTrigger();
  }

  return (
    <>
      <Button onClick={handleClick} disabled={pending || disabled}>
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Wird gestartet…
          </>
        ) : hasPreviousSnapshot ? (
          <>
            <RotateCw className="h-4 w-4 mr-2" />
            Neu generieren
          </>
        ) : (
          <>
            <BookOpen className="h-4 w-4 mr-2" />
            Unternehmerhandbuch generieren
          </>
        )}
      </Button>

      {requiresConfirm && reviewSummary && (
        <AlertDialog
          open={confirmOpen}
          onOpenChange={(open) => {
            if (!pending) setConfirmOpen(open);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Handbuch trotz offener Reviews generieren?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-slate-700">
                  <p>
                    {reviewSummary.approved + reviewSummary.rejected} von{" "}
                    {reviewSummary.totalEmployeeBlocks} Mitarbeiter-Bloecken
                    sind reviewed.
                  </p>
                  <p>
                    {reviewSummary.pending}{" "}
                    {reviewSummary.pending === 1 ? "Block" : "Bloecke"} ohne
                    Berater-Approval{" "}
                    {reviewSummary.pending === 1 ? "wird" : "werden"} NICHT ins
                    Handbuch fliessen.
                  </p>
                  <p>Trotzdem jetzt generieren?</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  runTrigger();
                }}
                disabled={pending}
              >
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird gestartet…
                  </>
                ) : (
                  "Trotzdem generieren"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
