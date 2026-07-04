# OP — Standortbestimmung & Roadmap (Stand 2026-07-04)

Re-Orientierung nach V10.1-Deploy. Ziel dieses Dokuments: dich abholen, wo die Plattform **wirklich** steht (am Code verifiziert, nicht aus dem Gedächtnis), den kompletten StB-Ablauf sichtbar machen, den **KI-Workspace / „Mein Tag"** als eigene Spur einordnen und daraus eine **priorisierte Roadmap mit konkreten nächsten Schritten** ableiten.

**Kernaussage in einem Satz:** Die Maschine + der Inhalt der StB-Vertikale stehen (~85 %) — es fehlen die **Bedien-Oberfläche (dein Cockpit)**, das **gebündelte End-Dokument (Kanzlei-Handbuch)** und das **Exit-Framing** — plus ein einziger echter Test.

**Founder-Entscheidung 2026-07-04 (in diese Roadmap eingearbeitet):** Der **KI-Workspace / „Mein Tag" kommt ZUERST** (vor dem externen StB-Test), weil er deine operative Grundlage ist. Der Trade-off (Risiko, den ersten echten Test zu verzögern) ist bewusst akzeptiert.

---

## Überblick

### Was schon steht (verifiziert)

Die OP ist **kein Prototyp** — V1 bis V9.8 sind released, die Kern-Engine läuft produktiv:

- **Wissens-Engine:** Mehrstufige Extraktion → Multi-Agent-Verdichtung (Analyst ↔ Challenger + Critic-Gate) → Diagnose-Reports → SOPs → Handbuch → OKF-Export. Evidenz-Verankerung, Halluzinations-Schranke, Kosten-Caps. Echte Struktur-Engine, kein Summarize-Wrapper.
- **StB-Vertikale (V10 + V10.1):** komplett geseedet und deployed — **nur hinter Feature-Flag `NEXT_PUBLIC_ENABLE_STB_VERTIKALE`, das aktuell AUS ist** (Internal-Test-Mode, module-lifecycle-discipline).
  - **18 Templates live in der Produktions-DB** — Kanzlei-Blueprint + 17 Fachmodule, je 16–26 echte Fragen. Content-Authoring (BL-519 Blueprint, BL-520 restlicher 18-Cut) ist **abgeschlossen**.
  - V10.1-Engine (Reife-Ampel, Live-Haiku-Scoring, Inline-Rückfrage, SOP-Brücke) heute deployed.
- **Partner-/Multiplikator-Infrastruktur (V6):** Partner-Tenant, StB-Onboarding, Mandanten-Einladung, Client-Mapping, Branding — alles deployed. Das Fundament für „StB als Partner" + „StB berät Mandanten" steht.

### Reifegrad

Gegen den scharfen Anspruch (Snapshot + entrisken + Anstoß, nicht „ganze Firma reparieren") liegt der Code bei **~85 %**. Das ehrliche Risiko sitzt **nicht mehr in der Technik**, sondern in **Adoption** (Input-Reibung + Output-Vertrauen) — und das löst der **Berater-Kanal**, nicht mehr Code. Deshalb ist der eigentliche nächste Business-Schritt **ein echter Durchlauf**, kein weiterer Feature-Bau.

### Was dieses Dokument NICHT verschweigt

Die drei offenen Kanten zum „fertigen Produkt" — konsolidiertes Handbuch, Bedien-Cockpit, Exit-Framing — sind real. Sie sind unten je als konkrete Slices/Backlog-Items mit Aufwand und Abhängigkeiten aufgeführt.

---

## Geschäftsmodell — die drei Wege

Dein Modell, wie du es vorgegeben hast, plus der Ist-Stand je Weg.

### Einstieg (für alle Wege gleich)

**StB ansprechen → kostenloser Test → „die können was" → als Partner onboarden.**

- **Infrastruktur (Partner-Onboarding, V6): ✅ vorhanden.** Was für einen echten Test fehlt, ist **nicht Infrastruktur**, sondern: Feature-Flag an → End-to-End verifizieren → ein realer Durchlauf.

### Weg 1a — StB arbeitet für die *eigene* Kanzlei (Selbst-Durchlauf)

Das „Blueprint-Paket", in das viel Zeit geflossen ist. Ablauf:

1. **Kanzlei-Blueprint** (Standortbestimmung, Diagnose / Ampel / Reifegrad / Routing) — ✅ gebaut + geseedet.
2. **Modul-Capture-Wizard** (18 Module, je 16–26 Fragen, Save/Resume, Voice) — ✅ gebaut + live geseedet.
3. **Live-Scoring + Reife-Ampel + Inline-Rückfrage** (V10.1) — ✅ gebaut (Flag OFF).
4. **Modul-Synthese → `modul_output`** (Output-Triple: Entscheidung / Standard / Umsetzungsschritt + KI-Hebel mit Reifegrad) — ✅ gebaut.
5. **Workspace-Reader** (Output-Karten + KI-Hebel-Liste, **druckbar**) — ✅ gebaut.
6. **SOP-Erzeugung (Brücke)** — 🟡 Backend gebaut (SLC-181), **aber kein UI-Trigger**.
7. **Konsolidiertes Kanzlei-Handbuch (alle Module + SOPs in EINEM Dokument)** — ❌ **fehlt**.

**Ehrliche Antwort auf „Handbuch am Ende mit SOP — wie weit?":** Der **per-Modul-Output** ist da (druckbar), die **SOP-Zeilen** entstehen (Backend). Was fehlt, ist die **Zusammenführung zu einem Kanzlei-Handbuch-/SOP-Gesamtdokument**. Das ist die konkrete Lücke am „Ende" des Selbst-Durchlaufs.

### Weg 1b — Exit-Ready-Kandidaten (2 Stufen: Blueprint + SOP-Bereich)

Nachdem der StB Vertrauen gefasst hat, gibt er Exit-Ready-Kandidaten rein.

- **Engine ist dieselbe** (Diagnose + Owner-Dependence-Tagging + polierte Reports V8/V9.75). ✅
- **Was fehlt: die Exit-Übersetzungs-Schicht** (BL-515) — Engine-Output in **Käufer-/Übergabe-Sprache** framen (Übertragbarkeit, Owner-Dependence, „was zieht der Käufer ab"). Kein Neubau der Engine, nur die **Ausgabe-Schicht**. ❌ offen.

### Weg 2 — StB berät *seine Mandanten* modultechnisch

Der StB nutzt die Plattform, um mit Mandanten gezielt Themen modulweise durchzuarbeiten.

- Läuft auf **derselben Modul-Engine** + der **Partner-Infrastruktur (V6)** — jeder Mandant = Capture-Session unter dem StB-Tenant. **Strukturell aufgesetzt.** ✅
- Dieselbe offene Kante wie Weg 1a: **konsolidiertes Handbuch/SOP + Exit-Framing**.

---

## Ist-Stand pro Bereich

Legende: ✅ fertig/deployed · 🟡 teilweise/Backend-only · ❌ offen/nicht gebaut

| Bereich | Stand | Anmerkung |
|---|---|---|
| Wissens-/Verdichtungs-Engine (3-Agenten) | ✅ | released, produktiv (Fragebogen-Pfad) |
| Diagnose-Reports (V8 Premium, V9.75 Fahrplan) | ✅ | der verkaufbare Keil |
| Handbuch-Reader (allgemein, FEAT-028) | ✅ | read-only, schlicht |
| OKF-Export | ✅ | Wissens-Austauschformat |
| Partner-/Multiplikator-Infra (V6) | ✅ | StB-Onboarding + Mandanten-Mapping + Branding |
| **StB Kanzlei-Blueprint** | ✅ | Diagnose/Ampel/Reifegrad/Routing, geseedet |
| **StB 18 Fachmodule (Content)** | ✅ | live geseedet, je 16–26 Fragen |
| **StB Modul-Capture-Wizard** | ✅ | Save/Resume, Voice |
| **V10.1 Scoring/Ampel/Live-Rückfrage** | ✅ | gebaut, **Flag OFF** |
| **StB Modul-Synthese (`modul_output`)** | ✅ | Output-Triple + KI-Hebel |
| **StB Workspace-Reader (per Modul)** | ✅ | druckbar |
| **SOP-Brücke (Modul → sop)** | 🟡 | Backend (SLC-181), **kein UI-Trigger** |
| **Konsolidiertes Kanzlei-Handbuch** | ❌ | Zusammenführung fehlt |
| **KI-Workspace / „Mein Tag" (dein Cockpit)** | ❌ | in OP nicht gebaut (BS hat es) |
| **Exit-Übersetzungs-Schicht (Weg 1b)** | ❌ | BL-515, nur Framing fehlt |
| **StB-Vertikale live geschaltet** | ❌ | Feature-Flag OFF (Internal-Test) |
| **Billing / GTM** | ❌ | 0 (Internal-Test-Mode) |
| **Legal/Disclaimer/Scope (vor 1. zahlendem Kunden)** | ❌ | BL-517, Anwalt-Gate |

**Fazit:** Die grüne Spalte ist lang. Die roten Punkte sind: **Bedien-Cockpit, konsolidiertes Handbuch, Exit-Framing, Live-Schaltung, Legal/Billing** — kein Engine-Neubau darunter.

---

## KI-Workspace / „Mein Tag" — die eigene Spur

Du willst diese Fläche als **deine operative Grundlage in allen Bereichen** — wie „Mein Tag" im Business System. Das ist berechtigt und **nicht** nur nice-to-have. Sauber getrennt sind es drei Dinge:

| | Was | Für wen | Aufwand | Gate |
|---|---|---|---|---|
| **(A) Operatives Cockpit / „Mein Tag"** | deine Arbeitsfläche: Übersicht Abläufe, wo stehe ich, nächster Schritt, Mandanten-/Modul-Status | **du** (Betreiber) | mittel (neu zu definieren) | keins |
| **(B) KI-Workspace (RAG-Assistent)** | frag-das-System über deine Daten („Was fehlt für Exit-Reife?"), Voice, Streaming | du + später Mandant | ~2–3 Tage (Port aus BS) | **kein Anwalt** |
| **(C) Mandanten-Arbeitsfläche** | dieselbe Fläche für StB/Mandant | StB/Mandant | folgt aus A+B | ggf. Consent |

### Das BS-Muster (P-010 KI-Workspace-Hybrid)

In BS ist das der Standard für alle Hauptarbeitsplätze: **Berichts-Buttons (Standard-Reports) + freie Frage-Eingabe (Text/Sprache) + Antwort-Fenster** — weg von klassischen Widget-Karten. „Mein Tag" in BS aggregiert dort: Tagesanalyse, Gestern, Seit-Login, Wochen-Performance, Pipeline-Risiko.

### Wichtige Nuance für OP (nicht 1:1 portierbar)

BS' „Mein Tag" aggregiert **CRM-Substrate** (Pipeline, Tasks, Aktivitäten) — **die hat OP so nicht**. OP ist eine Wissens-/Capture-Plattform. Das **Muster** (Berichts-Buttons + Frage-Box + Antwort) portiert sauber, aber die **OP-Berichte müssen neu definiert werden**, z. B.:

- „Welche Module habe ich schon ausgefüllt / was fehlt noch?"
- „Wie ist die Reife-Ampel über alle Module?"
- „Welche Mandanten sind in welchem Modul-Status?"
- „Was fehlt mir/dem Mandanten für Exit-Reife?"
- „Welche SOPs habe ich schon, welche fehlen?"

→ **Konsequenz:** (B) der RAG-Assistent ist ein günstiger Port. (A) das volle „Mein Tag"-Cockpit für OP braucht ein **kurzes `/discovery` + `/requirements`**, um zu definieren, WAS es aggregiert. Beides zusammen = „dein Cockpit im OP".

---

## Technische Backlog-Landkarte

Konkrete Bausteine je offener Kante. Aufwände grob, Reihenfolge in der Roadmap unten.

### Spur 1 — KI-Workspace / „Mein Tag" (Founder-Prio: ZUERST)

| Baustein | Backlog | Aufwand | Gate | Anmerkung |
|---|---|---|---|---|
| KI-Workspace RAG-Assistent (Berichts-Buttons + Frage-Box + Voice + Streaming) | BL-123 / SLC-353 | ~2–3 Tage | keins | Port P-010 aus BS |
| „Mein Tag"-Cockpit für OP definieren (welche Reports?) | **neu** (kurzes /discovery + /requirements) | ~0,5–1 Tag Definition | keins | OP-Substrat ≠ BS-CRM |
| „Mein Tag"-Cockpit bauen | **neu** (Folge-Slices) | mittel | keins | nutzt (B) als Antwort-Engine |
| (später) OP→IS Verdichtungs-Cron | BL-124 / SLC-354 | ~1–2 Tage | **Anwalt + Consent** | Moat-Teil, NICHT jetzt |

### Spur 2 — StB testbar machen

| Baustein | Aufwand | Gate | Anmerkung |
|---|---|---|---|
| Feature-Flag `NEXT_PUBLIC_ENABLE_STB_VERTIKALE=true` + Redeploy (bündelt ISSUE-111-Haiku-Fix) | ~0,5 Tag | keins | macht StB-Routen sichtbar |
| StB End-to-End im Browser verifizieren (Blueprint → Modul → Ampel/Rückfrage → Synthese → Workspace) | ~0,5–1 Tag | Flag an | war als AC-180-5 aufgeschoben |
| 1 realer Selbst-Durchlauf (du/befreundete Kanzlei) | — | — | der „eine echte Test" |

### Spur 3 — Konsolidiertes Kanzlei-Handbuch + SOP

| Baustein | Backlog | Aufwand | Gate | Anmerkung |
|---|---|---|---|---|
| SOP-Brücke UI-Trigger („Modul-SOPs erzeugen") | **neu** (kleiner Slice) | ~0,5–1 Tag | keins | verdrahtet SLC-181-Backend |
| Konsolidiertes StB-Kanzlei-Handbuch (alle Module + SOPs in EIN Dokument, druckbar) | **neu** (Slice, kein Slice existiert) | mittel | keins | nutzt vorhandenen Handbuch-Reader-Ansatz |

### Spur 4 — Exit-Ready-Ausgabe (Weg 1b, Business-Hebel)

| Baustein | Backlog | Aufwand | Gate | Anmerkung |
|---|---|---|---|---|
| Exit-/Übertragbarkeits-Report in Käufer-Sprache (Devil's-Advocate) | BL-515 | klein (Framing) | keins | höchster Business-Hebel, Engine liefert schon |
| KI-Reife → Exit-Framing umdeuten | BL-516 | klein | keins | Werkzeug existiert (V6.3), nur Reframe |
| Scope/Disclaimer/Spur + Ehrlichkeits-Sektion | BL-517 | klein + **Anwalt** | **Legal vor 1. zahlendem Kunden** | Haftung, pro Land |
| 6-Monats-Re-Assessment (Upsell) | BL-518 | mittel | keins | wiederkehrender Umsatz, später |

### Spur 5 — Wissensnetzwerk-Moat (Stufe 3, V12-Richtung) — ZURÜCKGESTELLT

| Baustein | Backlog | Gate | Anmerkung |
|---|---|---|---|
| IS-Knowledge-Push (Cross-Repo) | V9.9 | **IS V3.5 API + Anwalt** | nach echter Nutzung |
| OP→IS Verdichtungs-Cron | BL-124 / SLC-354 | **Anwalt + Consent** | dito |

**Warnung (ehrlich, Berater-Einschätzung 21.06.):** Spur 5 ist genau die Art „mehr Plattform bauen", die sich erst auszahlt, WENN echte Nutzung da ist. Gehört **hinter** den ersten realen Test.

---

## Roadmap & nächste Schritte

Reihenfolge nach **deiner Entscheidung (Workspace zuerst)**, mit ehrlichem Trade-off-Vermerk.

### Sofort (Abschluss laufender Deploy)

0. **`/post-launch V10.1`** — T+3h/T+24h Burn-In (Uptime/Health, 0 Error-Logs). Feature bleibt OFF. → V10.1 stabil.

### Phase 1 — Dein Cockpit (Founder-Prio: ZUERST)

1. **KI-Workspace RAG-Assistent** portieren (BL-123/SLC-353, ~2–3 Tage) — Berichts-Buttons + Frage-Box + Voice.
2. **„Mein Tag"-Cockpit für OP** definieren (kurzes `/discovery` + `/requirements`) + bauen — die OP-spezifischen Reports (Modul-/Mandanten-/Reife-Übersicht, nächste Schritte).

> **Trade-off-Vermerk (bewusst akzeptiert):** Diese Phase entsperrt *nicht* den ersten echten StB-Test — sie ist deine operative Grundlage. Die Berater-Einschätzung hätte den einen echten Test zuerst empfohlen; du hast dich für das Cockpit zuerst entschieden. Das ist vertretbar, weil das Cockpit *deine* Infrastruktur ist (du arbeitest darin, wir sehen den Status) — nur nicht als Grund nehmen, den Test *danach* weiter zu verschieben.

### Phase 2 — StB testbar machen

3. **Feature-Flag an + Redeploy** (mit ISSUE-111-Fix) → **StB-E2E-Verifikation** im Browser.
4. **SOP-Brücke UI-Trigger** nachziehen (kleiner Slice), damit der Handbuch-/SOP-Weg testbar ist.
5. **1 realer Selbst-Durchlauf** einer Kanzlei-Diagnose.

### Phase 3 — Endprodukt schärfen

6. **Konsolidiertes Kanzlei-Handbuch** (Module + SOPs in ein Dokument) — schließt Weg 1a/2 ab.
7. **Exit-Übersetzungs-Schicht** (BL-515/516) — schaltet Weg 1b scharf (Business-Hebel).

### Phase 4 — Vor erstem zahlendem Kunden

8. **BL-517 Scope/Disclaimer + Anwalts-Review** (Legal-Gate).
9. Billing/GTM-Minimalpfad.

### Später (Moat)

10. **Spur 5 (IS-Push/Wissensnetzwerk, V9.9/SLC-354)** — erst nach echter Nutzung + Anwalt.

---

## Was V10 gebaut hat vs. was offen ist (Kurzfassung)

- **V10 + V10.1 = Stufe-1-KERN gebaut:** Blueprint + 18 Module (Content) + Scoring/Ampel/Live-Rückfrage + per-Modul-Output + SOP-Brücke-Backend. **Steht.**
- **Bewusst noch offen:** konsolidiertes Kanzlei-Handbuch · SOP-UI-Trigger · KI-Workspace/„Mein Tag" · Exit-Layer · Live-Schaltung · Legal/Billing.

**Merksatz:** V10 hat die **Maschine + den Inhalt** gebaut — es fehlen **Bedien-Oberfläche, End-Dokument und Exit-Framing** (plus ein echter Test). Kein Engine-Neubau mehr nötig.
