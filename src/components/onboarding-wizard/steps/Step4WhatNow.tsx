"use client";

// SLC-047 MT-4 — Step 4: Was-nun? Drei Quick-Action-Cards.
//
// Cards verlinken auf die Hauptpfade des Tools. Im Modal nicht hart gekoppelt
// an templateSlug — der User landet auf /capture/new und kann dort weiter
// waehlen (Capture-Mode + Template) wie ueblich. Der in Step 2 gewaehlte
// Slug wird als Hint mitgegeben falls noetig (V5+ kann hier eine Pre-Selektion
// machen — out of scope).

import Link from "next/link";
import { ClipboardList, ArrowRight, FileText, Workflow } from "lucide-react";

type Step4Props = {
  templateSlug: string | null;
};

type CardSpec = {
  href: string;
  title: string;
  description: string;
  Icon: typeof ClipboardList;
};

export function Step4WhatNow({ templateSlug: _templateSlug }: Step4Props) {
  // templateSlug wird (noch) nicht in die URL eingebaut — die /capture/new Seite
  // hat eine eigene Auswahl-Logik und wir wollen die UX nicht auseinanderreissen.
  void _templateSlug;

  const cards: CardSpec[] = [
    {
      href: "/capture/new",
      title: "Wissenserhebung starten",
      description: "Starten Sie strukturiert mit Fragen, Dokumenten oder einem Dialog.",
      Icon: ClipboardList,
    },
    {
      href: "/admin/bridge",
      title: "Bridge-Engine nutzen",
      description: "Bauen Sie automatisch Brücken aus Ihren Antworten zu Mitarbeiter-Sessions.",
      Icon: Workflow,
    },
    {
      href: "/admin/handbook",
      title: "Handbuch generieren",
      description: "Lassen Sie Ihr Unternehmerhandbuch aus den Erhebungen generieren.",
      Icon: FileText,
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Sie können jederzeit zurück ins Cockpit. Wählen Sie aus, womit Sie loslegen wollen:
      </p>
      <div className="grid gap-2">
        {cards.map(({ href, title, description, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 rounded-md border border-slate-200 bg-white p-4 hover:border-brand-primary/40 hover:bg-brand-primary/5"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 group-hover:bg-brand-primary/10 group-hover:text-brand-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 space-y-0.5">
              <div className="text-sm font-semibold text-slate-900">{title}</div>
              <div className="text-xs text-slate-500">{description}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-brand-primary" />
          </Link>
        ))}
      </div>
    </div>
  );
}
