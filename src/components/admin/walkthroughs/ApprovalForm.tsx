"use client";

// SLC-079 MT-5 — Approval-Form mit Pflicht-Privacy-Checkbox (DEC-091, Re-Validation DEC-077).
// Native HTML Form + useTransition + Server Action (Memory feedback_native_html_form_pattern).
// Approve-Button disabled bis Checkbox aktiv.

import { useState, useTransition } from "react";
import { Check, X, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { approveOrRejectWalkthroughMethodology } from "@/app/actions/walkthrough-methodology";

interface Props {
  walkthroughSessionId: string;
  alreadyDecided: boolean;
}

const ERROR_LABEL: Record<string, string> = {
  unauthenticated: "Nicht angemeldet.",
  forbidden: "Keine Berechtigung.",
  forbidden_tenant: "Kein Zugriff auf diesen Tenant.",
  session_not_found: "Walkthrough-Session nicht gefunden.",
  session_id_invalid: "Ungueltige Session-ID.",
  decision_invalid: "Ungueltige Entscheidung.",
  privacy_checkbox_required:
    "Bitte bestaetige die Privacy-Pruefung vor dem Approve.",
  wrong_status:
    "Diese Walkthrough-Session ist nicht im Status 'pending_review'.",
  update_failed: "Speichern fehlgeschlagen.",
};

export function ApprovalForm({ walkthroughSessionId, alreadyDecided }: Props) {
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [reviewerNote, setReviewerNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [pending, startTransition] = useTransition();

  if (alreadyDecided) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <Lock className="mr-2 inline-block h-4 w-4" />
        Diese Walkthrough-Session wurde bereits entschieden — kein erneuter
        Approve/Reject moeglich.
      </div>
    );
  }

  function submit(decision: "approved" | "rejected") {
    if (decision === "approved" && !privacyChecked) {
      toast.error(ERROR_LABEL.privacy_checkbox_required);
      return;
    }
    startTransition(async () => {
      const result = await approveOrRejectWalkthroughMethodology({
        walkthroughSessionId,
        decision,
        privacyCheckboxConfirmed: privacyChecked,
        reviewerNote: reviewerNote.trim() || null,
        rejectionReason: rejectionReason.trim() || null,
      });
      if (!result.ok) {
        toast.error(ERROR_LABEL[result.error] ?? "Aktion fehlgeschlagen.");
        return;
      }
      toast.success(
        decision === "approved"
          ? "Walkthrough approved."
          : "Walkthrough rejected.",
      );
    });
  }

  return (
    <section
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="approval-form"
    >
      <div>
        <h3 className="text-base font-semibold text-slate-900">
          Methodik-Output entscheiden
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Approve uebernimmt die extrahierten Schritte als Methodik-Spur. Reject
          schliesst die Session ohne Folge-Effekte.
        </p>
      </div>

      <label className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
        <input
          type="checkbox"
          checked={privacyChecked}
          onChange={(e) => setPrivacyChecked(e.target.checked)}
          disabled={pending}
          className="mt-0.5 h-4 w-4 rounded border-amber-300 text-brand-primary focus:ring-2 focus:ring-brand-primary"
          data-testid="privacy-checkbox"
        />
        <span className="text-amber-900">
          Ich habe geprueft: keine kundenspezifischen oder sensitiven Inhalte in
          den extrahierten SOPs sichtbar.{" "}
          <span className="font-medium">Pflicht fuer Approve.</span>
        </span>
      </label>

      <div className="space-y-2">
        <label
          htmlFor="reviewer-note"
          className="block text-xs font-medium text-slate-600"
        >
          Reviewer-Notiz (optional)
        </label>
        <textarea
          id="reviewer-note"
          value={reviewerNote}
          onChange={(e) => setReviewerNote(e.target.value)}
          disabled={pending}
          rows={2}
          maxLength={2000}
          placeholder="Audit-Notiz zur Review-Entscheidung"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:opacity-50"
        />
        <p className="text-xs text-slate-400">{reviewerNote.length} / 2000</p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="rejection-reason"
          className="block text-xs font-medium text-slate-600"
        >
          Reject-Grund (optional, wenn Reject)
        </label>
        <textarea
          id="rejection-reason"
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          disabled={pending}
          rows={2}
          maxLength={2000}
          placeholder="z.B. Walkthrough zu unstrukturiert fuer Methodik-Review"
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:opacity-50"
        />
        <p className="text-xs text-slate-400">{rejectionReason.length} / 2000</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => submit("approved")}
          disabled={pending || !privacyChecked}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="approve-button"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Approve
        </button>
        <button
          type="button"
          onClick={() => submit("rejected")}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          data-testid="reject-button"
        >
          <X className="h-4 w-4" />
          Reject
        </button>
      </div>
    </section>
  );
}
