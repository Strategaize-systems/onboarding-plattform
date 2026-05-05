"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// JitsiMeetExternalAPI loaded via script tag
declare global {
  interface Window {
    JitsiMeetExternalAPI: new (domain: string, options: Record<string, unknown>) => JitsiAPI;
  }
}

interface JitsiAPI {
  addEventListener: (event: string, fn: (...args: unknown[]) => void) => void;
  executeCommand: (command: string, ...args: unknown[]) => void;
  dispose: () => void;
  isVideoMuted: () => Promise<boolean>;
}

interface Props {
  domain: string;
  roomName: string;
  jwt: string;
  displayName: string;
  onMeetingEnd: () => void;
  onRecordingStatusChange?: (active: boolean) => void;
  children?: React.ReactNode; // Meeting guide sidebar
}

export function JitsiMeeting({
  domain,
  roomName,
  jwt,
  displayName,
  onMeetingEnd,
  onRecordingStatusChange,
  children,
}: Props) {
  const t = useTranslations("dialogue");
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiAPI | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);

  useEffect(() => {
    // Load Jitsi IFrame API script
    const script = document.createElement("script");
    script.src = `https://${domain}/external_api.js`;
    script.async = true;
    script.onload = () => setLoaded(true);
    script.onerror = () => setIframeError(true);
    document.head.appendChild(script);

    return () => {
      script.remove();
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [domain]);

  useEffect(() => {
    if (!loaded || !containerRef.current || !window.JitsiMeetExternalAPI) return;

    try {
      const api = new window.JitsiMeetExternalAPI(domain, {
        roomName,
        jwt,
        parentNode: containerRef.current,
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          disableDeepLinking: true,
          prejoinPageEnabled: false,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false,
        },
        userInfo: { displayName },
      });

      api.addEventListener("videoConferenceLeft", () => {
        onMeetingEnd();
      });

      api.addEventListener("recordingStatusChanged", (status: unknown) => {
        const s = status as { on?: boolean };
        onRecordingStatusChange?.(s.on === true);
      });

      // Ensure iframe has camera/microphone permissions
      const iframe = containerRef.current?.querySelector("iframe");
      if (iframe) {
        iframe.setAttribute("allow", "camera *; microphone *; display-capture *; autoplay *");
      }

      apiRef.current = api;
    } catch {
      // setTimeout-Entkopplung verhindert react-hooks/set-state-in-effect Warning ohne Verhaltens-Aenderung.
      setTimeout(() => setIframeError(true), 0);
    }
  }, [loaded, domain, roomName, jwt, displayName, onMeetingEnd, onRecordingStatusChange]);

  // Fallback: direct link if IFrame fails
  if (iframeError) {
    const directUrl = `https://${domain}/${roomName}?jwt=${jwt}`;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <p className="text-slate-600 text-center">{t("iframeBlocked")}</p>
        <Button asChild>
          <a href={directUrl} target="_blank" rel="noopener noreferrer">
            {t("openDirectLink")}
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div ref={containerRef} className="flex-1 min-h-[500px]" />
      {children}
    </div>
  );
}
