"use client";

import { useTransition } from "react";
import { Loader2, Play, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { triggerBridgeRun } from "./actions";

interface Props {
  captureSessionId: string;
  hasPreviousRun: boolean;
  disabled?: boolean;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline";
}

export function TriggerBridgeButton({
  captureSessionId,
  hasPreviousRun,
  disabled,
  size = "default",
  variant = "default",
}: Props) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await triggerBridgeRun(captureSessionId);
      if (!result.ok) {
        toast.error(
          result.error === "capture_session_not_found"
            ? "Erhebung nicht gefunden."
            : "Bridge-Lauf konnte nicht gestartet werden."
        );
        return;
      }
      toast.success("Bridge-Lauf gestartet. Vorschlaege erscheinen in 30-60s.");
    });
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={handleClick}
            disabled={pending || disabled}
            size={size}
            variant={variant}
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Wird gestartet…
              </>
            ) : hasPreviousRun ? (
              <>
                <RotateCw className="h-4 w-4 mr-2" />
                Bridge erneut ausfuehren
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Bridge ausfuehren
              </>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs leading-snug">
          Erzeugt Mitarbeiter-Capture-Vorschlaege aus GF-Blueprint
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
