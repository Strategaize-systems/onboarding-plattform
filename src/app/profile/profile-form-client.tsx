"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LeadershipSelect } from "@/components/profile/leadership-select";
import { DiscSelect } from "@/components/profile/disc-select";
import { Mic, Square, Loader2, Save, Check } from "lucide-react";

interface Profile {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
}

interface OwnerProfile {
  display_name: string | null;
  age_range: string | null;
  education: string | null;
  career_summary: string | null;
  years_as_owner: string | null;
  address_formal: boolean;
  address_by_lastname: boolean;
  leadership_style: string | null;
  disc_style: string | null;
  introduction: string | null;
}

const AGE_RANGES = ["30-39", "40-49", "50-59", "60+"];
const YEARS_OPTIONS = ["<5", "5-10", "10-20", "20+"];

export function ProfileFormClient({
  profile,
  ownerProfile,
}: {
  profile: Profile;
  ownerProfile: OwnerProfile | null;
}) {
  const t = useTranslations("profile");
  const tCommon = useTranslations("common");
  const router = useRouter();

  // Form state
  const [displayName, setDisplayName] = useState(ownerProfile?.display_name ?? "");
  const [ageRange, setAgeRange] = useState(ownerProfile?.age_range ?? "");
  const [education, setEducation] = useState(ownerProfile?.education ?? "");
  const [careerSummary, setCareerSummary] = useState(ownerProfile?.career_summary ?? "");
  const [yearsAsOwner, setYearsAsOwner] = useState(ownerProfile?.years_as_owner ?? "");
  const [addressFormal, setAddressFormal] = useState(ownerProfile?.address_formal ?? true);
  const [addressByLastname, setAddressByLastname] = useState(ownerProfile?.address_by_lastname ?? true);
  const [leadershipStyle, setLeadershipStyle] = useState<string | null>(ownerProfile?.leadership_style ?? null);
  const [discStyle, setDiscStyle] = useState<string | null>(ownerProfile?.disc_style ?? null);
  const [introduction, setIntroduction] = useState(ownerProfile?.introduction ?? "");

  // UI state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch("/api/tenant/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName || null,
          age_range: ageRange || null,
          education: education || null,
          career_summary: careerSummary || null,
          years_as_owner: yearsAsOwner || null,
          address_formal: addressFormal,
          address_by_lastname: addressByLastname,
          leadership_style: leadershipStyle,
          disc_style: discStyle,
          introduction: introduction || null,
        }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => {
          router.push("/dashboard");
        }, 1000);
      }
    } finally {
      setSaving(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        await transcribe(blob);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch {
      // Microphone not available — ignore silently
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  }

  async function transcribe(blob: Blob) {
    setIsTranscribing(true);
    try {
      // Use a generic transcribe endpoint (reuse existing Whisper infrastructure)
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");

      const res = await fetch("/api/tenant/transcribe", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.transcript) {
          setIntroduction((prev) => (prev ? prev + " " + data.transcript : data.transcript));
        }
      }
    } finally {
      setIsTranscribing(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 w-fit rounded-2xl bg-white p-4 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-full.png" alt="StrategAIze" className="h-10 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t("pageTitle")}</h1>
          <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">{t("pageSubtitle")}</p>
        </div>

        {/* Form */}
        <div className="space-y-8">
          {/* Section 1: Personal Info */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">{t("sectionPersonal")}</h2>
            <div className="space-y-4">
              <div>
                <Label className="text-sm text-slate-700">{t("displayName")}</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t("displayNamePlaceholder")}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-slate-700">{t("ageRange")}</Label>
                  <Select value={ageRange} onValueChange={setAgeRange}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={t("ageSelect")} />
                    </SelectTrigger>
                    <SelectContent>
                      {AGE_RANGES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm text-slate-700">{t("yearsAsOwner")}</Label>
                  <Select value={yearsAsOwner} onValueChange={setYearsAsOwner}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={t("yearsSelect")} />
                    </SelectTrigger>
                    <SelectContent>
                      {YEARS_OPTIONS.map((y) => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-sm text-slate-700">{t("education")}</Label>
                <Input
                  value={education}
                  onChange={(e) => setEducation(e.target.value)}
                  placeholder={t("educationPlaceholder")}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm text-slate-700">{t("careerSummary")}</Label>
                <Textarea
                  value={careerSummary}
                  onChange={(e) => setCareerSummary(e.target.value)}
                  placeholder={t("careerPlaceholder")}
                  className="mt-1"
                  rows={3}
                  maxLength={500}
                />
              </div>
            </div>
          </section>

          {/* Section 2: Address Preference */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">{t("sectionAddress")}</h2>
            <div className="space-y-4">
              <div>
                <Label className="text-sm text-slate-700 mb-2 block">{t("addressFormal")}</Label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setAddressFormal(false)}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                      !addressFormal
                        ? "border-brand-primary bg-brand-primary/5 text-brand-primary ring-1 ring-brand-primary"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {t("addressDu")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddressFormal(true)}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                      addressFormal
                        ? "border-brand-primary bg-brand-primary/5 text-brand-primary ring-1 ring-brand-primary"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {t("addressSie")}
                  </button>
                </div>
              </div>
              <div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setAddressByLastname(false)}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                      !addressByLastname
                        ? "border-brand-primary bg-brand-primary/5 text-brand-primary ring-1 ring-brand-primary"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {t("addressByFirstname")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddressByLastname(true)}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                      addressByLastname
                        ? "border-brand-primary bg-brand-primary/5 text-brand-primary ring-1 ring-brand-primary"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {t("addressByLastname")}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <Separator />

          {/* Section 3: Leadership Style */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-1">{t("sectionLeadership")}</h2>
            <p className="text-xs text-slate-500 mb-4">{t("leadershipLabel")}</p>
            <LeadershipSelect value={leadershipStyle} onChange={setLeadershipStyle} />
          </section>

          {/* Section 4: DISC */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-1">{t("sectionDisc")}</h2>
            <p className="text-xs text-slate-500 mb-4">{t("discLabel")}</p>
            <DiscSelect value={discStyle} onChange={setDiscStyle} />
          </section>

          <Separator />

          {/* Section 5: Free Introduction */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-1">{t("sectionIntro")}</h2>
            <p className="text-xs text-slate-500 mb-4">{t("introLabel")}</p>
            <div className="relative">
              <Textarea
                value={introduction}
                onChange={(e) => setIntroduction(e.target.value)}
                placeholder={t("introPlaceholder")}
                rows={5}
                maxLength={2000}
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-slate-400">{t("introHint")}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{introduction.length}/2000</span>
                  {isTranscribing ? (
                    <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
                  ) : isRecording ? (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white animate-pulse"
                    >
                      <Square className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-500 hover:border-brand-primary hover:text-brand-primary transition-colors"
                    >
                      <Mic className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Save + Cancel Buttons */}
          <div className="flex justify-center gap-4 pb-8">
            {ownerProfile && (
              <Button
                variant="outline"
                size="lg"
                className="min-w-[150px]"
                onClick={() => router.push("/dashboard")}
              >
                {tCommon("cancel")}
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={saving || !displayName.trim()}
              size="lg"
              className="min-w-[200px]"
            >
              {saved ? (
                <>
                  <Check className="h-4 w-4" />
                  {t("saved")}
                </>
              ) : saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("saving")}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {t("save")}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
