"use client";

// SLC-051 MT-1 — Reader-Sidebar-Scroll-Spy.
//
// IntersectionObserver-basierter Hook der die ID der aktuell sichtbaren Section
// liefert. ReaderSidebar markiert den entsprechenden Section-Link aktiv.
//
// rootMargin "-20% 0px -60% 0px" macht die obere 20% bis 40% des Viewports zur
// "Active-Zone". Damit wird die Section als aktiv markiert sobald ihr Heading
// in den oberen Bildschirmbereich scrollt — analog zu MDN/docs.rs/Mintlify.

import { useEffect, useState } from "react";

const OBSERVER_OPTIONS: IntersectionObserverInit = {
  rootMargin: "-20% 0px -60% 0px",
  threshold: [0, 0.25, 0.5, 0.75, 1],
};

export interface ScrollSpyEntry {
  id: string;
  isIntersecting: boolean;
  intersectionRatio: number;
  // DOM-Reihenfolge der Section im Document (kleiner = weiter oben).
  documentOrder: number;
}

// Reine Auswahl-Funktion — exportiert fuer Unit-Tests ohne DOM. Picks the entry
// closest to the top among intersecting entries; if none intersect, returns null.
export function pickActiveId(entries: ScrollSpyEntry[]): string | null {
  const intersecting = entries.filter((e) => e.isIntersecting);
  if (intersecting.length === 0) return null;
  // Bei mehreren sichtbaren Sections gewinnt die mit kleinster documentOrder
  // (= obere Section). Konsistent mit "Reading-Position-Akzent".
  intersecting.sort((a, b) => a.documentOrder - b.documentOrder);
  return intersecting[0].id;
}

export function useScrollSpy(headingIds: string[]): string | null {
  const [observedId, setObservedId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof IntersectionObserver === "undefined") return;
    if (headingIds.length === 0) return;

    // documentOrder-Lookup einmal berechnen — Map<id, index>.
    const documentOrder = new Map<string, number>();
    headingIds.forEach((id, idx) => documentOrder.set(id, idx));

    // Letzter Status pro Heading — wird im Observer-Callback aktualisiert.
    const lastStatus = new Map<string, ScrollSpyEntry>();
    headingIds.forEach((id, idx) =>
      lastStatus.set(id, {
        id,
        isIntersecting: false,
        intersectionRatio: 0,
        documentOrder: idx,
      }),
    );

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).id;
        if (!id) continue;
        lastStatus.set(id, {
          id,
          isIntersecting: entry.isIntersecting,
          intersectionRatio: entry.intersectionRatio,
          documentOrder: documentOrder.get(id) ?? 0,
        });
      }
      const next = pickActiveId(Array.from(lastStatus.values()));
      setObservedId((prev) => (prev === next ? prev : next));
    }, OBSERVER_OPTIONS);

    const observed: Element[] = [];
    for (const id of headingIds) {
      const el = document.getElementById(id);
      if (el) {
        observer.observe(el);
        observed.push(el);
      }
    }

    return () => {
      for (const el of observed) observer.unobserve(el);
      observer.disconnect();
    };
  }, [headingIds]);

  // Derive-during-render: wenn keine Headings beobachtbar sind (z.B. waehrend
  // SSR oder bei leerem Snapshot), liefere null statt einen veralteten
  // observedId — vermeidet `setState` im Effect (react-hooks/set-state-in-effect).
  // Wenn der observedId nicht mehr in der aktuellen headingIds-Liste enthalten
  // ist (Snapshot-Wechsel), liefere ebenfalls null bis der Observer den naechsten
  // sichtbaren Heading meldet.
  if (headingIds.length === 0) return null;
  if (observedId !== null && !headingIds.includes(observedId)) return null;
  return observedId;
}
