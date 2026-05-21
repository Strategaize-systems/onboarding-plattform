"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { MouseEvent } from "react";

import { shouldUseRouterBack } from "./legal-page-header-logic";

interface LegalPageHeaderProps {
  pageTitle: string;
  defaultBackHref?: string;
}

export function LegalPageHeader({
  pageTitle,
  defaultBackHref = "/dashboard",
}: LegalPageHeaderProps) {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (typeof window === "undefined") return;
    if (shouldUseRouterBack(document.referrer, window.location.host)) {
      event.preventDefault();
      router.back();
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-6">
      <Link
        href={defaultBackHref}
        onClick={handleClick}
        aria-label={`Zurueck, weg von ${pageTitle}`}
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        <span>Zurueck</span>
      </Link>
    </div>
  );
}
