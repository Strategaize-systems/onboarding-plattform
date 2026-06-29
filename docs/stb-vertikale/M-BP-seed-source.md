# M-BP Seed-Source — Kanzlei-Blueprint (Diagnostik + Routing)

> **Zweck:** menschen-lesbares Quell-Mapping für die geseedete `template`-Row
> `stb_blueprint_kanzlei` v1.0 (Folge-`/backend`-Slice, SLC-170b). Liefert **Diagnose
> (Ampel/Reifegrad/Empfehlung) + Routing** über die ganze Kanzlei — KEIN Triple, KEIN
> KI-Hebel-Katalog (das liefern die Fachmodule). Stand 2026-06-23 (DEC-234 / DEC-242).
>
> **IP-Quelle (research-grounded, NEUER StB-Inhalt — DEC-234, kein recyceltes exit_readiness):**
> - `docs/STB_VERTIKALE_KANZLEI_PAINS_2026-06-23.md` (Pain-Taxonomie, 8 Dimensionen, belegt)
> - `docs/STB_VERTIKALE_ZUKUNFT_BRANCHE_2026-06-23.md` (Branchen-Zukunft, Konsolidierung/KI/Berufsrecht)
> - Founder-Entscheide 2026-06-23 (Free/Paid-Schnitt, schlankes Kern-Set, Aha-Probing, KI-Druck + Mandanten-Erwartung als zentrale Achsen; a1 als Dreier-Kommando)
> - Tiefen-Maßstab: `M-04-seed-source.md` (für Format + Auto-Dedup-Korpus)
>
> **System-of-Record bleibt** die `template`-Tabelle. 20 Fragen (15 Kern / 5 Vertiefung), 7 Blöcke / 13 Unterthemen, 13 Routing-Ziele auf die 17 Kern-Module.

## 0. Produkt-Kontext (Free/Paid-Schnitt — Founder 2026-06-23)

- **Gratis-Test (Lead-Magnet):** der StB durchläuft `stufe1_kern` (**15 Fragen, ~15–20 Min**) als **interaktive KI-Capture** (Rückfragen, Dialog, Whisper-Voice) — **kein** statisches Ampel-Quiz. Ergebnis: Ampel/Reifegrad je Unterthema + Pain-Preview + Vorschau der gerouteten Module. Zweck-Aha: „die Jungs wissen, was sie tun" + „ich habe ein Thema, hier geht es weiter".
- **Bezahlt (~2.500 €):** der voll befüllte Blueprint — die gerouteten Fachmodule mit echtem Inhalt (Anleitungen, KI-Hebel je Reifegrad, SOPs). Das ist NICHT dieser Seed (das sind die Fachmodule, M-04 ff.).
- **Constraint (BLOCKING):** Gratis-Test bleibt kurz. Der automatische Pfad = **die 15 Kern-Fragen** (`stufe1_kern`). Längerer Pflicht-Fragebogen = größte Adoptionsfalle. Tiefe lebt in den Modulen, nicht im Blueprint.
- **Vertiefung-Surfacing (Founder-Entscheid 2026-06-23):** Die 5 Vertiefungsfragen (`stufe2_vertiefung`) sind **NICHT** Teil des automatischen 15-Fragen-Pfads. **Ziel = A (adaptiv):** eine Vertiefungsfrage erscheint nur, wenn die zugehörige Kern-Frage gelb/rot ergibt → die KI bohrt gezielt nach (gesunder Bereich bleibt bei 15). **V1-Fallback = B (optionales „Tiefer gehen"):** nach den 15 Kern als optionaler Block angeboten, falls die adaptive Live-Schicht (§7.3) für V1 noch nicht steht. Siehe §7.7.
- **Klarstellung (Founder):** Der Kern der Plattform ist die **KI-Interaktion** (diskutieren, Rückfragen, Dinge liefern lassen) — die Ampel/Reifegrad ist die strukturierte **Ausgabe** obendrauf, nicht der Mechanismus. Live-Rückfrage/Dialog ist die **Capture-Conversation-Schicht** (vom Founder als „noch zu überarbeiten" markiert), getrennt vom `diagnosis_prompt` (= Bewertung nach der Capture). Siehe §5d + §7.

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_blueprint_kanzlei` |
| `version` | `1.0` |
| `name` | Kanzlei-Blueprint – Standortbestimmung & Routing |
| Kategorie | Führung & Struktur / Blueprint (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `bp` — Marker „Diagnostik, kein Routing-Ziel". **Build-Flag:** passt NICHT in die `m\d{2}`-/`stb_modul_`-Konvention der Fachmodule (siehe §7.1). |
| Blocks (Capture) | 2 (`stufe1_kern` required=true · `stufe2_vertiefung` required=false) |
| Fragen | 20 (15 Kern / 5 Vertiefung), alle offen |
| Diagnose | `diagnosis_schema` (Blöcke A–G → Unterthemen → `question_keys` + Bewertungsfelder, §5) + `diagnosis_prompt` (§5d) |
| Routing | `metadata.routing[]` Block/Unterthema → `modul_key` — §6 |
| KI-Hebel / Output-Contract | **keine** (Blueprint liefert Diagnose+Routing, nicht Triple) |

**Block/Question-Shape** = identisch zu M-04 / `exit_readiness` (`src/lib/db/template-queries.ts`).
Scoring-Flags (`owner_dependency`/`deal_blocker`/`sop_trigger`/`ko_hart`/`ko_soft`) = `false` (Delivery-Schicht später, wie M-04).

## 2. Mapping Modul-Spec → DB-Felder

| Spec-Spalte | DB-Feld | Hinweis |
|---|---|---|
| Frage-ID (F-BP-xxx) | `question.frage_id` | verbatim; Namespace `stb_blueprint_kanzlei` (≠ exit_readiness F-BP-IDs, §7.2) |
| Ebene (Kern/Vertiefung) | `question.ebene` + Block-Zuordnung | Kern → `stufe1_kern`; Vertiefung → `stufe2_vertiefung` |
| Unterthema-Schlüssel | `question.unterbereich` | z. B. `a1_selbststeuerung` (= `question_keys`-Bindung an die Diagnose-Unterthemen, §5) |
| Fragetext | `question.text` | verbatim, offen |
| Themenbaum (Blöcke A–G) | `metadata.themenmodell[]` + `diagnosis_schema` | §3 + §5 |
| Bewertungs-Logik | `diagnosis_schema` + `diagnosis_prompt` | §5 |
| Routing | `metadata.routing[]` | §6 |

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, ".../q/<frage_id>")` — **NS muss den Slug `stb_blueprint_kanzlei` enthalten** (§7.2).

## 3. Themenbaum (Baustein 1) — `metadata.themenmodell[]`

| Block | Block-Name | Unterthema-Schlüssel | Unterthema |
|---|---|---|---|
| A | Kanzlei-Steuerung & Geschäftsmodell | `a1_selbststeuerung` | Eigene Kanzlei-Steuerung (Zahlen kennen → verstehen → beeinflussen) |
| | | `a2_erloesmix_marge` | Erlös-Mix & Marge (Compliance vs. Beratung, Honorar-Leckage) |
| B | Personal & Kapazität | `b1_personalengpass` | Stellenbesetzung & Auslastungsgrenze |
| | | `b2_bindung_wissen` | Mitarbeiterbindung & Einarbeitung |
| C | Mandanten-Erwartung & Beratung | `c1_beratungsverschiebung` | Beratung statt nur Compliance (geänderte Mandanten-Erwartung) |
| | | `c2_positionierung` | Positionierung & Mandantengewinnung |
| D | KI- & Digital-Readiness | `d1_ki_einsatz` | KI-Einsatz & Prozess-Automatisierung |
| | | `d2_systemlandschaft` | Systemlandschaft & Datensicherheit (DATEV-Cloud, §203, Belegquote) |
| E | Prozesse, Wissen & Ausfallsicherheit | `e1_prozesse_wissen` | Standardprozesse & Wissensplattform (Bus-Faktor) |
| | | `e2_stellvertretung_fristen` | Stellvertretung, Fristen & Ausfallrisiko |
| F | Nachfolge & Übergabefähigkeit | `f1_inhaberabhaengigkeit` | Inhaberabhängigkeit & Mandatsbindung |
| | | `f2_nachfolge` | Nachfolge-Strategie & Übergabewert |
| G | Zukunfts-Standort | `g1_zukunftsstandort` | Strategische Position im Strukturwandel (Konsolidierungs-Exposure) |

## 4. Fragebogen — Provenienz (Auto-Dedup gegen M-04-Korpus)

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 15 Fragen — der Gratis-Test)

| Pos | Frage-ID | Unterthema | Fragetext | Provenienz |
|---|---|---|---|---|
| 1 | F-BP-001 | `a1_selbststeuerung` | Welche Zahlen Ihrer **eigenen** Kanzlei (nicht die Ihrer Mandanten) schauen Sie regelmäßig an — und woran erkennen Sie daran, ob die Kanzlei wirtschaftlich gut läuft? | Variante von F-M04-001/002 (Kanzlei-Kontext, „Schuster-Kinder") |
| 2 | F-BP-002 | `a1_selbststeuerung` | Verstehen Sie, **wie** diese Zahlen zustande kommen — welche Treiber, Leistungen und Prozesse in Ihrer Kanzlei dahinterstehen? | Ergänzung (Tiefe 1 — Verständnis) |
| 3 | F-BP-003 | `a1_selbststeuerung` | Wissen Sie, an welchen konkreten **Stellschrauben** Sie drehen können, um diese Zahlen aktiv zu verbessern — und steuern Sie heute tatsächlich danach, oder läuft es nebenher mit? | Ergänzung (Tiefe 2 — Beeinflussung; Brücke zur Mandantenberatung) |
| 4 | F-BP-004 | `a2_erloesmix_marge` | Wie verteilt sich Ihr Honorarumsatz zwischen Pflicht-Compliance (FiBu, Lohn, Abschluss, Erklärung) und echter betriebswirtschaftlicher Beratung — und wie viel der Beratung rechnen Sie **separat** ab? | Ergänzung |
| 5 | F-BP-005 | `b1_personalengpass` | Wie viele Stellen haben Sie in den letzten 12 Monaten gesucht, wie viele tatsächlich besetzt — und mussten Sie deshalb schon Mandate ablehnen oder abgeben? | Ergänzung |
| 6 | F-BP-006 | `b2_bindung_wissen` | Wenn Ihre erfahrenste Fachkraft morgen kündigt — wie viel kritisches Mandantenwissen ginge verloren, und wie lange braucht eine neue Kraft bei Ihnen bis zur Eigenständigkeit? | Ergänzung |
| 7 | F-BP-007 | `c1_beratungsverschiebung` | Was erwarten Ihre Mandanten heute von Ihnen, das über die reine Steuer-/Compliance-Pflicht hinausgeht — und wie gut können Sie diese Erwartung aktuell bedienen? | Ergänzung |
| 8 | F-BP-008 | `c2_positionierung` | Wenn ein Wunschmandant Sie mit drei anderen Kanzleien vergleicht — was ist der eine Grund, warum er Sie nimmt, der nicht „Preis" oder „Nähe" ist? | Ergänzung |
| 9 | F-BP-009 | `d1_ki_einsatz` | Wo setzen Sie KI in Ihrer Kanzlei heute **produktiv** ein — nur zum Recherchieren, oder auch in FiBu/Belegverarbeitung/Mandantenkommunikation — und bei welchem Anteil Ihrer Mandate? | Ergänzung |
| 10 | F-BP-010 | `d2_systemlandschaft` | Kennen Sie Ihre digitale Belegquote, haben Sie einen Plan für die DATEV-Cloud-Umstellung ab Herbst 2026 — und eine klare Regel, welche KI-Tools mit Mandantenbezug erlaubt sind? | Ergänzung |
| 11 | F-BP-011 | `e1_prozesse_wissen` | Wie viele Ihrer wiederkehrenden Kernprozesse (Jahresabschluss, Fristen, Mandanten-Onboarding) laufen dokumentiert und identisch — egal wer sie ausführt — und wo findet ein Neuer an Tag 1 „wie machen wir das hier"? | Ergänzung |
| 12 | F-BP-012 | `e2_stellvertretung_fristen` | Für welche Schlüsselrollen — Sie selbst eingeschlossen — gibt es eine eingearbeitete Stellvertretung, und wie ist Ihr Fristen-/Posteingangsprozess gegen Ausfall abgesichert? | Ergänzung |
| 13 | F-BP-013 | `f1_inhaberabhaengigkeit` | Welcher Anteil Ihrer Mandate würde bei Ihrem Ausscheiden zu Ihnen **persönlich** halten statt zur Kanzlei — und bei welchen Ihrer größten Mandate sind ausschließlich Sie auskunftsfähig? | Ergänzung |
| 14 | F-BP-014 | `f2_nachfolge` | Welche konkrete Nachfolge-Strategie haben Sie (interne Nachfolge, Verkauf, Zusammenschluss), in welchem Zeithorizont — und welche **drei** Faktoren würden heute Ihren Übergabewert am stärksten drücken? | Ergänzung |
| 15 | F-BP-015 | `g1_zukunftsstandort` | Die Branche konsolidiert (PE-Aufkäufe, Plattform-Kanzleien) bei gleichzeitigem KI-Umbruch — wo sehen Sie Ihre Kanzlei in 5 Jahren: übergabe-/aufkauffähig, spezialisiert-unabhängig, oder vom Wandel überrollt? | Ergänzung |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 5 Fragen — optional/tiefer, nicht im Gratis-Pfad)

| Pos | Frage-ID | Unterthema | Fragetext | Provenienz |
|---|---|---|---|---|
| 16 | F-BP-016 | `a2_erloesmix_marge` | Wie viel Prozent Ihres Honorarpotenzials lassen Sie schätzungsweise liegen (Pro-bono-Drift, vergessene Mehrleistungen) — und was passiert mit Ihrem Umsatz, wenn KI Ihre FiBu-Zeit halbiert? | Ergänzung |
| 17 | F-BP-017 | `b1_personalengpass` | Wie hat sich Ihr Personalkostenanteil am Umsatz in den letzten 3–5 Jahren entwickelt — und welcher Anteil Ihrer und der Teamzeit geht ins reine Tagesgeschäft statt in höherwertige Beratung? | Ergänzung |
| 18 | F-BP-018 | `c1_beratungsverschiebung` | Bei welchem Anteil Ihrer Mandanten sprechen Sie aktiv über betriebswirtschaftliche Themen statt nur Pflicht-Compliance — und wer beginnt dieses Gespräch, Sie oder der Mandant? | Ergänzung |
| 19 | F-BP-019 | `d1_ki_einsatz` | Welcher Anteil Ihrer Mandanten liefert Belege noch analog / mit Medienbruch — und wo erfassen Sie mangels Schnittstelle doppelt? | Ergänzung |
| 20 | F-BP-020 | `f1_inhaberabhaengigkeit` | Was würde konkret mit Ihren drei größten Mandaten passieren, wenn Sie drei Monate ungeplant ausfielen — wer könnte einspringen, und woran würde der Mandant es merken? | Ergänzung (scharfe Aha-Folgefrage) |

> **Auto-Dedup-Befund:** Nur F-BP-001 überschneidet sich semantisch mit dem M-04-Korpus
> (F-M04-001/002 „gut läuft / welche Zahlen") — bewusst als Kanzlei-Variante geführt (M-04 fragt
> generisch „Ihr Unternehmen", der Blueprint fragt nach der **eigenen Kanzlei** = „Schuster-Kinder").
> Die a1-Vertiefung (F-BP-002/003) hat im M-04-Korpus eine konzeptionelle Nähe zu F-M04-003/004
> (Steuerungslogik) — aber kanzlei-spezifisch neu formuliert (Zahlen verstehen + beeinflussen).
> Alle übrigen sind Ergänzungen (DEC-234 gewahrt — kein exit_readiness-Recycling).

## 5. Bewertungs-Logik (Baustein 3) — `diagnosis_schema` + `diagnosis_prompt`

### 5a. Diagnose-Struktur (`diagnosis_schema`: Blöcke A–G → Unterthemen → `question_keys`)

Die Diagnose-Engine (`src/workers/diagnosis/`) arbeitet **pro Diagnose-Block** und füllt je **Unterthema** die Bewertungsfelder; sie ordnet die Capture-Antworten den Unterthemen über `question_keys` zu. (Capture-Blöcke `stufe1/stufe2` ≠ Diagnose-Blöcke A–G — zwei Gruppierungen, daher hier explizit.)

| Diagnose-Block | Unterthema (`key`) | `question_keys` |
|---|---|---|
| A Kanzlei-Steuerung | `a1_selbststeuerung` | F-BP-001, F-BP-002, F-BP-003 |
| | `a2_erloesmix_marge` | F-BP-004, F-BP-016 |
| B Personal | `b1_personalengpass` | F-BP-005, F-BP-017 |
| | `b2_bindung_wissen` | F-BP-006 |
| C Mandanten-Erwartung | `c1_beratungsverschiebung` | F-BP-007, F-BP-018 |
| | `c2_positionierung` | F-BP-008 |
| D KI-Readiness | `d1_ki_einsatz` | F-BP-009, F-BP-019 |
| | `d2_systemlandschaft` | F-BP-010 |
| E Prozesse/Wissen | `e1_prozesse_wissen` | F-BP-011 |
| | `e2_stellvertretung_fristen` | F-BP-012 |
| F Nachfolge | `f1_inhaberabhaengigkeit` | F-BP-013, F-BP-020 |
| | `f2_nachfolge` | F-BP-014 |
| G Zukunfts-Standort | `g1_zukunftsstandort` | F-BP-015 |

**Bewertungsfelder je Unterthema** (founder-facing Bedeutung): `ist_situation` · `ampel` (grün/gelb/rot) · `reifegrad` (1–4, siehe 5c) · `risiko` · `hebel` · `relevanz_90d` · `empfehlung` · `belege` (Bezug zu den verdichteten Antworten) · `naechster_schritt` · `zielbild`.
> **Build-Flag:** Die bestehende Engine (`diagnosis-prompt.ts`) nutzt intern **Reifegrad 0–10** und führt zusätzliche Felder (`belege`, `aufwand` S/M/L, `abhaengigkeiten`, `owner`). Beim Seed (a) Reifegrad-Bedeutung 1–4 → 0–10 mappen ODER `diagnosis_prompt` overridet die Skala, und (b) Feld-Set mit dem Report-Renderer (`src/lib/pdf/diagnose-report.tsx`, `src/lib/email/templates/diagnose-report.ts`) abgleichen. Founder liefert die **Bedeutung**, nicht die Zahlen-Skala.

### 5b. Ampel-Definition (StB-spezifisch, global)

- **rot** — blockiert die **Übergabefähigkeit** ODER ist **existenz-/haftungskritisch** (Fristenprozess ungesichert; keine Stellvertretung; Nachfolge ungeklärt bei Inhaber > 60; Mandate kleben ausschließlich am Inhaber; KI mit Mandantenbezug ohne §203-Regel). → akuter Handlungsbedarf.
- **gelb** — funktioniert **heute**, aber **personen-/inhaberabhängig**, nicht dokumentiert oder nicht skalierbar. Kippt unter Druck (Personalausfall, Wachstum, Übergabe, Betriebsprüfung).
- **grün** — **dokumentiert, vertreten, übergabefähig**. Würde Inhaberwechsel oder Betriebsprüfung ohne Bruch überstehen.

### 5c. Reifegrad 1–4 (in Kanzlei-Worten)

- **1 — nicht vorhanden / chaotisch:** läuft rein über den Inhaber / Bauchgefühl, nichts dokumentiert.
- **2 — rudimentär:** Ansätze vorhanden, aber lückenhaft, personenabhängig, nicht verbindlich.
- **3 — funktioniert, aber fragil:** etablierte Routine, hängt an einzelnen Köpfen — hält den Stresstest (Ausfall, Wachstum, Übergabe) nicht stand.
- **4 — professionell / übergabefähig:** dokumentiert, vertreten, skalierbar; würde Inhaberwechsel + Betriebsprüfung überstehen.

### 5d. `diagnosis_prompt` (Rolle · Ton · Fokus) — die Bewertung NACH der Capture

> **Rolle:** Du bist ein erfahrener Kanzlei- und Nachfolge-Berater, der die deutsche Steuerberatungsbranche von innen kennt — Personalmangel (Höchstwert aller Branchen), KI-Umbruch, Nachfolgewelle (überaltert, kaum Nachfolger), geänderte Mandanten-Erwartung (strategischer Partner statt nur Compliance).
>
> **Ton:** ehrlich, evidenzbasiert, handlungsorientiert, auf Augenhöhe. Zielgruppe ist die zahlen-affinste überhaupt — **keine falschen Zahlen, keine Plattitüden, kein Beschönigen**. Schwächen klar, aber respektvoll und lösungsorientiert benennen. Operative Wirk-Schicht, **kein** DATEV-Organisationshandbuch.
>
> **Worauf besonders achten:** (1) **Inhaberabhängigkeit** — kleben Mandate/Wissen/Entscheidungen am Inhaber? (2) **Personal-Nadelöhr** — Kapazität, Mandatsablehnung, operative Schere. (3) **KI-/Digital-Readiness** — produktiv vs. nur Oberfläche, DATEV-Cloud-2026, §203/Schatten-KI, Belegquote. (4) **Geänderte Mandanten-Erwartung** — Beratung vs. reine Compliance. (5) **Zahlen-Souveränität** (a1) — kennt der Inhaber seine Zahlen nicht nur, sondern **versteht** er ihre Entstehung und **beeinflusst** er sie aktiv (Brücke zur Mandantenberatung)? (6) **Übergabefähigkeit** — 5–10 Jahre Vorlauf, dokumentiert/vertreten. (7) **Fristen-/Haftungsrisiko**.
>
> **Priorisierung:** `relevanz_90d = hoch` bei `ampel = rot`. Bewerte je Unterthema die Felder aus 5a. Bewertung pro Mandanten-Kanzlei auf Basis dieser Maßstäbe — keine erfundenen Fakten; wo eine Antwort unklar/lückenhaft ist, benenne die Lücke (Ampel gelb/rot, niedrige Confidence) statt zu raten.

> **Live-Rückfrage / Aha (Capture-Conversation-Schicht — NICHT dieser Prompt):** Das adaptive Nachfragen *während* der Capture (die scharfe Rückfrage, auf die der Inhaber nicht gefasst war — z. B. nach „meine Mandanten halten zur Kanzlei" → „bei welchen Ihrer drei größten Mandate sind ausschließlich Sie auskunftsfähig?") ist eine **Capture-Conversation-Fähigkeit** (adaptive Nachfrage-Schleife), nicht Teil des Bewertungs-`diagnosis_prompt`. Founder hat diese Schicht als „noch zu überarbeiten" markiert (§7.3). Der Blueprint liefert die **Themen/Trigger** für diese Rückfragen über die Unterthemen + den Fokus oben; die Verdrahtung in die Live-Capture ist ein Engine-Thema, kein Seed-Thema.

## 6. Routing-Map (Baustein 4) — `metadata.routing[]`

Bedingung durchgängig: **Ampel `gelb`/`rot` → Modul aktivieren** (Vorschlag im Gratis-Test, Inhalt im bezahlten Blueprint). Nur die 17 erlaubten `modul_key`s (m05 nicht).

| Unterthema | Bedingung | primär `modul_key` | sekundär `modul_key` |
|---|---|---|---|
| `a1_selbststeuerung` | Ampel gelb/rot | `m07` | `m06` |
| `a2_erloesmix_marge` | Ampel gelb/rot | `m01` | `m04` |
| `b1_personalengpass` | Ampel gelb/rot | `m26` | `m27` |
| `b2_bindung_wissen` | Ampel gelb/rot | `m28` | `m27` |
| `c1_beratungsverschiebung` | Ampel gelb/rot | `m08` | `m15` |
| `c2_positionierung` | Ampel gelb/rot | `m15` | `m16` |
| `d1_ki_einsatz` | Ampel gelb/rot | `m36` | `m07` |
| `d2_systemlandschaft` | Ampel gelb/rot | `m38` | `m36` |
| `e1_prozesse_wissen` | Ampel gelb/rot | `m39` | `m02` |
| `e2_stellvertretung_fristen` | Ampel gelb/rot | `m02` | `m28` |
| `f1_inhaberabhaengigkeit` | Ampel gelb/rot | `m42` | `m03` |
| `f2_nachfolge` | Ampel gelb/rot | `m35` | `m01` |
| `g1_zukunftsstandort` | Ampel gelb/rot | `m01` | `m42` |

**Abdeckung (alle 17 Kern-Module erreichbar):** m01, m02, m03, m04, m06, m07, m08, m15, m16, m26, m27, m28, m35, m36, m38, m39, m42. m06 (Liquidität) hängt bewusst sekundär an `a1_selbststeuerung`.

## 7. Build-Hinweise (für die Folge-`/backend`-Session, SLC-170b)

1. **Blueprint ≠ Fachmodul-Capture.** `src/lib/stb-vertikale/modul-capture.ts` akzeptiert nur `modul_key` `^m\d{2}$` und mappt auf `stb_modul_<key>`. Der Blueprint (`stb_blueprint_kanzlei`, `modul_key='bp'`) passt da NICHT — er läuft über den **generischen Blueprint-Capture+Diagnose-Pfad** (capture_session → Synthese → `src/workers/diagnosis/` → diagnose-report), denselben wie der bestehende `exit_readiness`-Blueprint. **Reuse diesen Pfad, nicht den Modul-Capture.** Eigene Einstiegs-Route (nicht `/dashboard/stb/modul/[modulKey]`).
2. **F-BP-Namespace:** die F-BP-IDs gehören zum Template `stb_blueprint_kanzlei` und sind distinkt von den exit_readiness-F-BP-IDs (auf die M-04 dedupte: F-BP-045..049/052/053). `uuid5`-NS muss den Slug enthalten. M-04s Provenienz-Refs bleiben unverändert (zeigen auf exit_readiness, nicht hierher).
3. **Live-Rückfrage-Schicht (Founder-Flag „überarbeiten"):** der Kern-Mehrwert ist der KI-Dialog während der Capture (Rückfragen, Diskussion, Liefern). Prüfen, was die bestehende adaptive Nachfrage-Schleife schon kann, und ob/wie der Blueprint-`diagnosis_schema`-Fokus die Live-Rückfragen triggert. Eigenes Thema, ggf. eigener Folge-Slice/`/architecture`.
4. **Reifegrad + Feld-Set:** Engine intern 0–10 + Felder belege/aufwand/abhaengigkeiten/owner; Seed-Mapping + Report-Renderer-Abgleich (§5a Build-Flag).
5. **`metadata.routing[]`:** Format prüfen, das die Diagnose-Funktion liest (Block/Unterthema → primär/sekundär `modul_key` + Bedingung). §6 ist die Quelle.
6. **Gratis/Paid-Gating** (§0) = Plattform-/Delivery-Logik, nicht Teil dieses Seeds — hier nur dokumentiert für die Slice-Planung.
7. **Vertiefung-Surfacing (Founder-Entscheid, BLOCKING für die Slice-Planung):** **Ziel A = adaptiv** — die 5 Vertiefungsfragen erscheinen nur bei `ampel ∈ {gelb, rot}` der gekoppelten Kern-Frage, über die adaptive Nachfrage-Schleife / Live-Rückfrage-Schicht (§7.3). Der Trigger-Anker ist das **gemeinsame Unterthema** (§5a `question_keys`: z. B. `f1_inhaberabhaengigkeit` → Kern F-BP-013 triggert Vertiefung F-BP-020). **V1-Fallback B = optionaler „Tiefer gehen"-Block** nach Kern (M-04-Muster, rein über `required=false`, kein adaptiver Bau). Wenn die adaptive Schicht für V1 nicht steht: B ausliefern, A als Folge-Slice.

## 8. Regenerierung

Die `.sql`-Migration (`sql/migrations/<NNN>_..._stb_blueprint_seed.sql`, SLC-170b) ist das Artefakt und Source-of-Truth; sie wird aus dieser Datei deterministisch erzeugt (valides JSON via `json.dumps`, `uuid5`-IDs mit slug-haltigem NS). Bei Inhalts-Updates: neue Version (`1.1`) oder neue Migration, bestehende nicht editieren (Immutable-Migration-Disziplin).
