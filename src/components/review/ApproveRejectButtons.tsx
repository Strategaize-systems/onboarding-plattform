"use client";

// SLC-042 MT-2 — Approve/Reject Buttons mit Note-Modal.
// Ruft die in SLC-041 gebauten Server-Actions approveBlockReview und
// rejectBlockReview. revalidatePath in der Action triggert das Re-Fetch der
// Review-Page, damit Status-Badge + Audit-Anzeige sofort aktualisiert werden.

import { useState, useTransition } from "react";
import { Check, X, Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  approveBlockReview,
  rejectBlockReview,
} from "@/app/admin/blocks/[blockKey]/review/actions";

type Mode = "approve" | "reject";
type Status = "pending" | "approved" | "rejected";

interface Props {
  tenantId: string;
  sessionId: string;
  blockKey: string;
  currentStatus: Status;
}

const ERROR_LABEL: Record<string, string> = {
  unauthenticated: "Nicht angemeldet.",
  forbidden: "Nur strategaize_admin darf Bloecke approven oder ablehnen.",
  tenant_id_invalid: "Ungueltige Tenant-ID.",
  session_id_invalid: "Ungueltige Session-ID.",
  block_key_invalid: "Ungueltiger Block-Key.",
  note_too_long: "Notiz zu lang (max 2000 Zeichen).",
  upsert_failed: "Speichern fehlgeschlagen. Bitte erneut versuchen.",
};

export function ApproveRejectButtons({
  tenantId,
  sessionId,
  blockKey,
  currentStatus,
}: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    if (!mode) return;
    startTransition(async () => {
      const action = mode === "approve" ? approveBlockReview : rejectBlockReview;
      const result = await action({
        tenantId,
        sessionId,
        blockKey,
        note: note.trim() ? note.trim() : null,
      });

      if (!result.ok) {
        toast.error(ERROR_LABEL[result.error] ?? "Aktion fehlgeschlagen.");
        return;
      }

      toast.success(
        mode === "approve" ? "Block approved." : "Block rejected.",
      );
      setMode(null);
      setNote("");
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => setMode("approve")}
          disabled={pending || currentStatus === "approved"}
        >
          <Check className="mr-2 h-4 w-4" />
          Approve
        </Button>
        <Button
          variant="outline"
          onClick={() => setMode("reject")}
          disabled={pending || currentStatus === "rejected"}
        >
          <X className="mr-2 h-4 w-4" />
          Reject
        </Button>
      </div>

      <AlertDialog
        open={mode !== null}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setMode(null);
            setNote("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {mode === "approve" ? "Block approven?" : "Block ablehnen?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {mode === "approve"
                ? "Mitarbeiter-Beitraege dieses Blocks fliessen ins naechste Unternehmerhandbuch."
                : "Mitarbeiter-Beitraege dieses Blocks werden NICHT ins Unternehmerhandbuch uebernommen."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="block-review-note">Notiz (optional)</Label>
            <Textarea
              id="block-review-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                mode === "approve"
                  ? "z.B. Inhalt deckt das Thema sauber ab."
                  : "z.B. zu vage formuliert, nochmal nachfragen."
              }
              rows={3}
              maxLength={2000}
              disabled={pending}
            />
            <p className="text-xs text-slate-500">{note.length} / 2000</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Wird gespeichert…
                </>
              ) : mode === "approve" ? (
                "Approven"
              ) : (
                "Ablehnen"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
