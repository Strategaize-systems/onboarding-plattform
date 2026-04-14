"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ShieldCheck } from "lucide-react";

interface Profile {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  respondent_layer?: string;
}

interface MirrorProfile {
  display_name: string | null;
  address_formal: boolean;
  department: string | null;
  position_title: string | null;
  leadership_style: string | null;
  disc_style: string | null;
  introduction: string | null;
}

const DISC_OPTIONS = [
  { value: "dominant", i18nKey: "discDominant", descKey: "discDominantDesc" },
  { value: "influential", i18nKey: "discInfluential", descKey: "discInfluentialDesc" },
  { value: "steady", i18nKey: "discSteady", descKey: "discSteadyDesc" },
  { value: "conscientious", i18nKey: "discConscientious", descKey: "discConscientiousDesc" },
];

const LEADERSHIP_OPTIONS = [
  { value: "patriarchal", i18nKey: "leadershipPatriarchal" },
  { value: "cooperative", i18nKey: "leadershipCooperative" },
  { value: "delegative", i18nKey: "leadershipDelegative" },
  { value: "coaching", i18nKey: "leadershipCoaching" },
  { value: "visionary", i18nKey: "leadershipVisionary" },
];

export function MirrorProfileClient({
  profile,
  mirrorProfile,
  respondentLayer,
}: {
  profile: Profile;
  mirrorProfile: MirrorProfile | null;
  respondentLayer: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const isLeadership = respondentLayer === "leadership_1" || respondentLayer === "leadership_2";

  const [displayName, setDisplayName] = useState(mirrorProfile?.display_name ?? "");
  const [addressFormal, setAddressFormal] = useState(mirrorProfile?.address_formal ?? true);
  const [department, setDepartment] = useState(mirrorProfile?.department ?? "");
  const [positionTitle, setPositionTitle] = useState(mirrorProfile?.position_title ?? "");
  const [leadershipStyle, setLeadershipStyle] = useState(mirrorProfile?.leadership_style ?? "");
  const [discStyle, setDiscStyle] = useState(mirrorProfile?.disc_style ?? "");
  const [introduction, setIntroduction] = useState(mirrorProfile?.introduction ?? "");

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/tenant/mirror/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim() || null,
          address_formal: addressFormal,
          department: department.trim() || null,
          position_title: positionTitle.trim() || null,
          leadership_style: isLeadership ? leadershipStyle || null : null,
          disc_style: discStyle || null,
          introduction: introduction.trim() || null,
        }),
      });

      if (res.ok) {
        router.push("/dashboard");
      }
    } finally {
      setSaving(false);
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
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary/10">
            <ShieldCheck className="h-6 w-6 text-brand-primary" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t("mirror.profileTitle")}</h1>
          <p className="mt-2 text-sm text-slate-500">{t("mirror.profileSubtitle")}</p>
        </div>

        {/* Form */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="display-name">{t("mirror.profileName")}</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("mirror.profileNamePlaceholder")}
            />
          </div>

          {/* Anrede */}
          <div className="space-y-2">
            <Label>{t("mirror.profileAddress")}</Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setAddressFormal(true)}
                className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all ${
                  addressFormal
                    ? "border-brand-primary bg-brand-primary/5 text-brand-primary-dark"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                {t("mirror.profileFormal")}
              </button>
              <button
                type="button"
                onClick={() => setAddressFormal(false)}
                className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all ${
                  !addressFormal
                    ? "border-brand-primary bg-brand-primary/5 text-brand-primary-dark"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                {t("mirror.profileInformal")}
              </button>
            </div>
          </div>

          {/* Abteilung */}
          <div className="space-y-2">
            <Label htmlFor="department">{t("mirror.profileDepartment")}</Label>
            <Input
              id="department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder={t("mirror.profileDepartmentPlaceholder")}
            />
          </div>

          {/* Position */}
          <div className="space-y-2">
            <Label htmlFor="position">{t("mirror.profilePosition")}</Label>
            <Input
              id="position"
              value={positionTitle}
              onChange={(e) => setPositionTitle(e.target.value)}
              placeholder={t("mirror.profilePositionPlaceholder")}
            />
          </div>

          {/* Führungsstil — nur für L1/L2 */}
          {isLeadership && (
            <div className="space-y-2">
              <Label>{t("mirror.profileLeadershipStyle")}</Label>
              <Select value={leadershipStyle} onValueChange={setLeadershipStyle}>
                <SelectTrigger>
                  <SelectValue placeholder={t("mirror.profileSelectStyle")} />
                </SelectTrigger>
                <SelectContent>
                  {LEADERSHIP_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {t(`profile.${opt.i18nKey}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Kommunikationsstil */}
          <div className="space-y-2">
            <Label>{t("mirror.profileCommunicationStyle")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {DISC_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDiscStyle(opt.value)}
                  className={`rounded-lg border-2 px-3 py-2.5 text-left text-xs font-medium transition-all ${
                    discStyle === opt.value
                      ? "border-brand-primary bg-brand-primary/5 text-brand-primary-dark"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  <div>{t(`profile.${opt.i18nKey}`)}</div>
                  <div className="text-[10px] font-normal text-slate-400 mt-0.5">{t(`profile.${opt.descKey}`)}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Vorstellung */}
          <div className="space-y-2">
            <Label htmlFor="introduction">{t("mirror.profileIntroduction")}</Label>
            <Textarea
              id="introduction"
              value={introduction}
              onChange={(e) => setIntroduction(e.target.value)}
              placeholder={t("mirror.profileIntroductionPlaceholder")}
              rows={3}
            />
          </div>
        </div>

        {/* Save */}
        <div className="mt-6 flex justify-center">
          <Button
            onClick={handleSave}
            disabled={saving || !displayName.trim()}
            size="lg"
            className="min-w-[250px]"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ShieldCheck className="h-4 w-4 mr-2" />
            )}
            {t("mirror.profileSave")}
          </Button>
        </div>
      </div>
    </div>
  );
}
