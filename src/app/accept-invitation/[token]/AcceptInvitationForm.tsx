"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { acceptEmployeeInvitation } from "./actions";

interface Props {
  token: string;
}

export function AcceptInvitationForm({ token }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const password = formData.get("password") as string;
      const confirmPassword = formData.get("confirmPassword") as string;

      if (!password || password.length < 8) {
        setError("Passwort muss mindestens 8 Zeichen lang sein.");
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwörter stimmen nicht überein.");
        setLoading(false);
        return;
      }

      const result = await acceptEmployeeInvitation(token, formData);
      if (result && "error" in result) {
        setError(result.error);
        setLoading(false);
      }
      // Bei Erfolg: redirect via Server-Action → kein weiteres Client-Handling
    } catch {
      setError("Unerwarteter Fehler. Bitte versuche es erneut.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">Passwort wählen</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="Mindestens 8 Zeichen"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Wird angelegt..." : "Einladung annehmen"}
      </Button>
    </form>
  );
}
