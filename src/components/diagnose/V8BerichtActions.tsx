"use client";

// V8 SLC-152 MT-3 — Client-Component fuer V8-Bericht-Page Actions.
//
// Liefert zwei Buttons:
//   - "Als PDF herunterladen" → ruft downloadMandantenReportV2Pdf Server-Action,
//     erzeugt Blob-Download im Browser.
//   - "Per E-Mail senden" → oeffnet SendReportByEmailModal (V7.2-Reuse). Das
//     Modal selbst nutzt sendDiagnoseReportByEmail, die per
//     template.metadata.usage_kind auf V8-Branch faellt.

import { useState, useTransition } from "react";
import { Download, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SendReportByEmailModal } from "./SendReportByEmailModal";
import { downloadMandantenReportV2Pdf } from "@/app/dashboard/diagnose/[capture_session_id]/bericht/actions";

interface V8BerichtActionsProps {
  captureSessionId: string;
}

function base64ToBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType });
}

export function V8BerichtActions({ captureSessionId }: V8BerichtActionsProps) {
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const onDownload = () => {
    startTransition(async () => {
      const result = await downloadMandantenReportV2Pdf(captureSessionId);
      if (!result.ok) {
        toast.error("PDF-Download fehlgeschlagen", {
          description: result.error,
        });
        return;
      }
      const blob = base64ToBlob(result.pdfBase64, "application/pdf");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Kleiner Delay, damit der Browser den Download abgeschlossen hat,
      // bevor die URL revoked wird. (sonst bricht Chrome den Download ab.)
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("PDF wird heruntergeladen");
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-indigo-50 ring-1 ring-indigo-200 p-4">
        <div className="flex-1">
          <p className="font-serif text-base font-semibold text-indigo-900">
            Bericht teilen oder archivieren
          </p>
          <p className="mt-1 text-sm text-indigo-700">
            Der vollstaendige 17-Seiten-Bericht als PDF — fuer Sie und Ihren
            Steuerberater.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={onDownload}
            disabled={pending}
            variant="outline"
            className="gap-2"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Als PDF herunterladen
          </Button>
          <Button
            onClick={() => setEmailModalOpen(true)}
            className="gap-2"
          >
            <Mail className="h-4 w-4" />
            Per E-Mail senden
          </Button>
        </div>
      </div>

      <SendReportByEmailModal
        captureSessionId={captureSessionId}
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
      />
    </>
  );
}
