"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { updateDialogueConsent } from "@/app/actions/dialogue-session-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";

interface Props {
  dialogueSessionId: string;
  onConsentGiven: () => void;
}

export function ConsentScreen({ dialogueSessionId, onConsentGiven }: Props) {
  const t = useTranslations("dialogue");
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConsent = async () => {
    setLoading(true);
    setError(null);

    const { error: consentError } = await updateDialogueConsent(
      dialogueSessionId,
      true
    );

    setLoading(false);

    if (consentError) {
      setError(consentError);
      return;
    }

    onConsentGiven();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <Card className="max-w-md w-full mx-4 p-8 space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            {t("consentTitle")}
          </h2>
        </div>

        <div className="space-y-3 text-sm text-slate-600">
          <p>{t("consentText1")}</p>
          <p>{t("consentText2")}</p>
        </div>

        <div className="flex items-start gap-3 rounded-md border p-3">
          <Checkbox
            id="consent"
            checked={checked}
            onCheckedChange={(v) => setChecked(v === true)}
          />
          <label htmlFor="consent" className="text-sm text-slate-700 cursor-pointer leading-snug">
            {t("consentCheckbox")}
          </label>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <Button
          onClick={handleConsent}
          disabled={!checked || loading}
          className="w-full"
        >
          {loading ? t("submitting") : t("consentAgree")}
        </Button>
      </Card>
    </div>
  );
}
