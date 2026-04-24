"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { inviteEmployee } from "./actions";
import { toast } from "sonner";

/**
 * SLC-034 MT-5 — Dialog fuer neue Mitarbeiter-Einladung.
 * Bei emailFailed=true (SMTP-Failure) wird der User auf Resend hingewiesen.
 */

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: "Bitte gib eine gueltige E-Mail-Adresse ein.",
  unauthenticated: "Session abgelaufen. Bitte neu einloggen.",
  forbidden: "Du hast keine Berechtigung, Mitarbeiter einzuladen.",
  duplicate_pending_invitation:
    "Es gibt bereits eine offene Einladung fuer diese E-Mail.",
  email_required: "E-Mail ist erforderlich.",
  rpc_failed: "Datenbankfehler. Bitte erneut versuchen.",
  unknown_error: "Unbekannter Fehler. Bitte erneut versuchen.",
};

export function InviteEmployeeDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const result = await inviteEmployee(formData);

      if (!result.ok) {
        setError(ERROR_MESSAGES[result.error] ?? ERROR_MESSAGES.unknown_error);
        setLoading(false);
        return;
      }

      if (result.emailFailed) {
        toast.warning(
          "Einladung angelegt, aber E-Mail konnte nicht zugestellt werden. Bitte 'Erneut senden' nutzen."
        );
      } else {
        toast.success("Einladung verschickt.");
      }

      setOpen(false);
      (e.currentTarget as HTMLFormElement).reset();
    } catch {
      setError("Unerwarteter Fehler. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Mitarbeiter einladen</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Neue Mitarbeiter-Einladung</DialogTitle>
            <DialogDescription>
              Der Mitarbeiter erhaelt eine E-Mail mit einem Link, ueber den er
              sein Passwort setzen und sich einloggen kann. Der Link ist 14 Tage
              gueltig.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="max@beispiel.de"
                required
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">
                Name <span className="text-slate-400">(optional)</span>
              </Label>
              <Input
                id="displayName"
                name="displayName"
                type="text"
                placeholder="Max Mustermann"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="roleHint">
                Rolle/Position <span className="text-slate-400">(optional)</span>
              </Label>
              <Input
                id="roleHint"
                name="roleHint"
                type="text"
                placeholder="z.B. Operations Manager"
                autoComplete="off"
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Wird gesendet..." : "Einladung senden"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
