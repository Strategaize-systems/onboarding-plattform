"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Loader2, MessageCircle, Play } from "lucide-react";

export default function MirrorPolicyPage() {
  const t = useTranslations("mirror");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    setConfirming(true);
    try {
      const res = await fetch("/api/tenant/mirror/confirm-policy", {
        method: "POST",
      });
      if (res.ok) {
        router.push("/dashboard");
      }
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-xl w-full">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 w-fit rounded-2xl bg-white p-4 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-full.png" alt="StrategAIze" className="h-10 w-auto" />
          </div>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <ShieldCheck className="h-6 w-6 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t("policyTitle")}</h1>
          <p className="mt-2 text-sm text-slate-500">{t("policySubtitle")}</p>
        </div>

        {/* Explanation Block */}
        <div className="rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-5 mb-4 space-y-3">
          <h3 className="text-sm font-bold text-brand-primary-dark">{t("policyExplainTitle")}</h3>
          <p className="text-sm text-slate-600 leading-relaxed">{t("policyExplainWhat")}</p>
          <p className="text-sm text-slate-600 leading-relaxed">{t("policyExplainHow")}</p>
          <p className="text-sm text-slate-600 leading-relaxed">{t("policyExplainResult")}</p>
          <div className="flex items-center gap-2 text-xs text-brand-primary">
            <MessageCircle className="h-3.5 w-3.5" />
            <span>{t("policyExplainAI")}</span>
          </div>
        </div>

        {/* Video Placeholder */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 mb-4 flex flex-col items-center justify-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Play className="h-5 w-5 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-500">{t("policyVideoPlaceholder")}</p>
        </div>

        {/* Policy Content */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">{t("policyConfidentialityTitle")}</h3>
          <div className="space-y-3 text-sm text-slate-600 leading-relaxed">
            <p>{t("policyIntro")}</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>{t("policyPoint1")}</li>
              <li>{t("policyPoint2")}</li>
              <li>{t("policyPoint3")}</li>
              <li>{t("policyPoint4")}</li>
            </ul>
            <p className="font-medium text-slate-900">{t("policyClosing")}</p>
          </div>
        </div>

        {/* Confirm Button */}
        <div className="mt-6 flex justify-center">
          <Button
            onClick={handleConfirm}
            disabled={confirming}
            size="lg"
            className="min-w-[250px]"
          >
            {confirming ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ShieldCheck className="h-4 w-4 mr-2" />
            )}
            {t("policyConfirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}
