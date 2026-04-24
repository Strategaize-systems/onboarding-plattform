"use client";

import { useState, useTransition } from "react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { revokeEmployeeInvitation, resendEmployeeInvitation } from "./actions";
import { toast } from "sonner";

/**
 * SLC-034 MT-5 — Revoke + Resend Buttons pro pending Invitation.
 */

interface Props {
  invitationId: string;
}

export function InvitationActions({ invitationId }: Props) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleResend() {
    startTransition(async () => {
      const result = await resendEmployeeInvitation(invitationId);
      if (!result.ok) {
        toast.error(
          result.error === "smtp_failed"
            ? "E-Mail konnte nicht gesendet werden. Bitte spaeter erneut versuchen."
            : "Erneutes Senden fehlgeschlagen."
        );
      } else {
        toast.success("Einladung erneut gesendet.");
      }
    });
  }

  function handleRevoke() {
    startTransition(async () => {
      const result = await revokeEmployeeInvitation(invitationId);
      if (!result.ok) {
        toast.error("Widerrufen fehlgeschlagen.");
      } else {
        toast.success("Einladung widerrufen.");
      }
      setConfirmOpen(false);
    });
  }

  return (
    <div className="flex justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleResend}
        disabled={pending}
      >
        Erneut senden
      </Button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" disabled={pending}>
            Widerrufen
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Einladung widerrufen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Link in der Einladungs-E-Mail funktioniert danach nicht mehr.
              Du kannst jederzeit eine neue Einladung erstellen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleRevoke();
              }}
              disabled={pending}
            >
              Widerrufen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
