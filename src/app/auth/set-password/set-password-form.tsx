"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { setPassword } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SetPasswordForm() {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const result = await setPassword(formData);

      if (result?.error) {
        setError(result.error);
      }
    } catch {
      setError(t("login.unexpectedError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="relative w-full max-w-md overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-success-dark to-brand-success" />
        <CardHeader className="pt-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-full.png" alt="StrategAIze" className="mx-auto mb-2 h-12 w-auto" />
          <CardTitle className="text-2xl text-slate-900">{t("setPassword.title")}</CardTitle>
          <CardDescription>
            {t("setPassword.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">{t("setPassword.newPassword")}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder={t("setPassword.newPasswordPlaceholder")}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("setPassword.confirmPassword")}</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder={t("setPassword.confirmPlaceholder")}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("setPassword.buttonLoading") : t("setPassword.button")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
