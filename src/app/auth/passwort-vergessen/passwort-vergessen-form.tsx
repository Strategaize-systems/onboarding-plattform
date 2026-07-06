"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { requestPasswordReset } from "./actions";
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

export function PasswortVergessenForm() {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      const result = await requestPasswordReset(formData);

      if ("error" in result) {
        setError(result.error);
      } else {
        setSubmitted(true);
      }
    } catch {
      setError(t("passwordReset.unexpectedError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="relative w-full max-w-md overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-primary-dark to-brand-primary" />
        <CardHeader className="pt-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-full.png" alt="StrategAIze" className="mx-auto mb-2 h-12 w-auto" />
          <CardTitle className="text-2xl text-slate-900">{t("passwordReset.title")}</CardTitle>
          <CardDescription>
            {t("passwordReset.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <p className="text-sm text-slate-700">{t("passwordReset.success")}</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("passwordReset.email")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder={t("passwordReset.emailPlaceholder")}
                  required
                  autoComplete="email"
                />
              </div>
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("passwordReset.buttonLoading") : t("passwordReset.button")}
              </Button>
            </form>
          )}
          <p className="mt-6 text-center text-sm">
            <Link href="/login" className="text-slate-500 hover:text-slate-700 hover:underline">
              {t("passwordReset.backToLogin")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
