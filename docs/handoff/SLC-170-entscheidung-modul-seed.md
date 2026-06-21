# SLC-170 Entscheidungs-Briefing — Modul-Template-Seed (V10 StB-Vertikale)

Stand: 2026-06-21 · Kontext: V10 StB-Vertikale Phase 1 · SLC-170 (`/backend`) · Entscheidung Founder erforderlich

## Worum es geht (ein Satz)

SLC-170 soll den **Inhalt** der StB-Vertikale als feste Daten in die Datenbank schreiben — die Fragebögen und KI-Hebel-Kataloge, mit denen der Steuerberater später seine eigene Kanzlei durchleuchtet. Der Code dafür ist trivial; die Frage ist, **welcher Inhalt** geseedet wird — und der ist nur zu einem Viertel vorhanden.

## Was ein „Template-Seed" konkret bedeutet

Ein „Template" ist in V10 kein Design, sondern eine **Zeile in der `template`-Tabelle** mit:

- einem **Fragebogen** (`blocks`): Fragen in zwei Stufen — Stufe-1-Kern (Pflicht) + Stufe-2-Vertiefung (optional),
- einem **KI-Hebel-Katalog** (`metadata.ki_hebel[]`): konkrete KI-/Automatisierungs-Ansätze, jeder mit einem **Reifegrad 1–4**,
- beim Blueprint zusätzlich einem **Diagnose-Schema** (Ampel/Reifegrad) + **Routing** zu den passenden Modulen.

Was der StB später im Capture-Flow (SLC-172/173) sieht, sind **exakt diese Fragen**. Aus seinen Antworten baut der Synthese-Worker (SLC-174) das Liefer-Triple **Entscheidung / Standard / Implementierungsschritt**. Heißt: Die Qualität des Endprodukts hängt 1:1 an der Qualität dieser geseedeten Inhalte. Schlechte/erfundene Fragen → schlechtes Liefer-Ergebnis. Garbage in, garbage out.

SLC-170 soll **4 Templates** anlegen: 1 Blueprint (`stb_blueprint_kanzlei`) + 3 Module M-04 / M-05 / M-06 (der Finanzen-&-Controlling-Kern).

## Die Inhaltslage: was da ist, was fehlt

Ich habe deine drei IP-Dateien im Dev-System vollständig ausgelesen (`M-04 …docx`, `StrategAIze Module.xlsx`, `StrategAIze Workspace.docx`) und zusätzlich `SCOS_Package.zip` geprüft (= reines Marken-/Persona-Profil, kein Modul-Inhalt).

| Template | Was in deinem IP steht | Bewertung |
|---|---|---|
| **M-04** Grundlegende Finanzsteuerung | Voll ausformuliert: 7-Bereiche-Themenbaum, **26 Fragen** (10 Kern / 16 Vertiefung), 5 Output-Artefakte, **13 KI-Hebel mit Reifegrad 1–4** | **VOLLSTÄNDIG — sofort seedbar** |
| **M-05** Ergebnisrechnung / Deckungsbeitrag | Nur **4 Fragen** (2 davon aus dem Blueprint geborgt), kein Themenbaum, **kein KI-Hebel, kein Reifegrad** | **DÜNN — Inhalt fehlt** |
| **M-06** Liquiditätsplanung | **0 Fragen** — nur ein Einzeiler im Katalog | **LEER — Inhalt fehlt komplett** |
| **Blueprint** Kanzlei-Diagnostik | Diagnose-Fragen + Ampel-Schema **nicht in den Dateien** | **Inhalt fehlt** |

Zur Einordnung: M-04 ist genau das, was eine gute Modul-Spec ausmacht — du hast es durchdacht und spezifisch ausgearbeitet (z.B. KI-Hebel „Cashflow-Brücke Ergebnis→Cash", Reifegrad 2, mit Bezug auf konkrete Fragen). M-06 hat dagegen nur den Satz „Zahlungsziele, Mahnprozesse, Cash-Reserven, Abhängigkeit von Einzelkunden und saisonalen Schwankungen" — das ist ein Themen-Hinweis, kein Fragebogen.

Kurioses Detail: In deiner Prioritätsliste steht **M-06 auf Rang A-2** (noch vor M-05 auf A-3) — also das inhaltlich leerste Modul ist das zweitwichtigste.

## Warum ich M-05 / M-06 / Blueprint nicht einfach selbst schreibe

Das ist der Kern. Einen Fragebogen + KI-Hebel-Katalog + Reifegrad-Logik zu erfinden ist **keine Programmierarbeit, sondern dein fachliches Produkt-IP**. M-04 zeigt, wie spezifisch und durchdacht dein Standard ist. Wenn ich M-05/M-06 „plausibel fülle", seedest du **KI-erfundene Methodik** als „deinen Standard" in die Plattform — und der StB liefert das später an seine Mandanten aus. Die Slice-Regel sagt dazu wörtlich: bei Inhaltslücken **„nicht raten", Founder-Rückfrage**. Genau deshalb stoppe ich hier statt durchzubauen.

## Was an SLC-170 hängt (Build-Reihenfolge)

```
SLC-170  Template-Seed (DIESER Slice)
   │
   ├─► SLC-172  Blueprint-Diagnostik-UI   (braucht das Blueprint-Template)
   └─► SLC-173  Modul-Capture-UI          (braucht die Modul-Templates M-04/05/06)
                     │
                     └─► SLC-174  Synthese-Worker  (Antworten → Entscheidung/Standard/Schritt)
                                      │
                                      └─► SLC-175  Workspace-Reader (Liefer-Ansicht + KI-Hebel-Liste)
```

Wichtig: Mit **nur M-04** kannst du den **kompletten End-to-End-Flow** schon durchspielen — ein echtes Modul ausfüllen, vom Worker verarbeiten lassen, das Liefer-Triple im Reader sehen. Du brauchst nicht alle 4 Templates, um zu sehen, ob die Maschinerie funktioniert. Du brauchst alle 4 erst, wenn die Vertikale inhaltlich „komplett" sein soll.

## Die drei Optionen, mit Konsequenzen

### Option A — M-04 jetzt, Rest später (meine Empfehlung)
Ich baue MIG-125 mit dem **voll ausformulierten M-04-Template** (Fragebogen Stufe-1/2 + 13 KI-Hebel + Output-Contract) + DB-Sidecar-Test. SLC-170 wird auf M-04 umgeschnitten; M-05/M-06 + Blueprint werden ein **Folge-Seed** (z.B. SLC-170b), sobald du den Inhalt geschrieben hast.

- **Plus:** Heute lieferbar, kein erfundenes IP, du kommst sofort zum lauffähigen E2E-Test mit dem wichtigsten Modul (A-1). M-04 ist ohnehin Prio 1.
- **Minus:** Die Vertikale ist erst „1 von 3 Modulen". SLC-172 (Blueprint) wartet weiter auf Blueprint-Content. M-05/M-06-Nachzug = ein kurzer Folge-Slice (~30 Min Seed, wenn der Inhalt da ist).

### Option B — Du schreibst M-05 / M-06 / Blueprint zuerst
SLC-170 pausiert. Ich gebe dir eine **Vorlage-Struktur** (Themenbaum + Fragen-Slots + KI-Hebel/Reifegrad-Tabelle) wie bei M-04. Du füllst sie für M-05, M-06 und den Blueprint. Ich baue dann alle 4 auf einmal.

- **Plus:** Vollständigste Lösung, alles aus deiner Hand, keine Kompromisse.
- **Minus:** V10 pausiert, bis du den Inhalt geschrieben hast — das ist substanzielle Arbeit (≈ die M-04-docx mal drei).

### Option C — Ich drafte Vorschläge, du autorisierst
Ich entwerfe M-05/M-06/Blueprint-Inhalt aus angrenzendem Material (M-04-Schnittstellen, Katalog-Einzeiler, deine Strategie-Docs). Du reviewst und gibst frei, bevor es in den Seed geht.

- **Plus:** Schnell, du musst nur reviewen statt schreiben.
- **Minus:** Der Inhalt stammt von mir — Risiko, dass du KI-erfundene Methodik durchwinkst und sie als „deinen Standard" zementierst. Steht im Spannungsfeld zum „nicht raten".

## Empfehlung

**Option A.** Gründe: (1) M-04 ist Prio A-1 und vollständig da; (2) du bekommst mit einem echten Modul den ganzen V10-Flow (Capture → Worker → Reader) lauffähig und testbar, *bevor* du Zeit in M-05/M-06-Content investierst; (3) null erfundenes IP; (4) M-05/M-06/Blueprint sind echte Founder-Arbeit, die du in deinem Tempo nachlieferst — dann ist der Folge-Seed eine Kurzsache.

## Falls du selbst schreibst: was ich pro Modul bräuchte

Damit ein Modul M-04-Tiefe erreicht, brauche ich von dir:

1. **Themenbaum** — 5–7 Bereiche mit je 2–3 Unterthemen (bei M-04 z.B. „Steuerungslogik & Entscheidungsnutzung").
2. **Fragebogen** — die Fragen, markiert als Stufe-1-Kern (Pflicht) vs. Stufe-2-Vertiefung (optional).
3. **KI-Hebel-Katalog** — pro Hebel: Name, kurze Beschreibung, **Reifegrad 1–4**.
4. **Output-Contract** — was am Ende als Entscheidung / Standard / Implementierungsschritt rauskommen soll (die generische Triple-Definition aus deinem Workspace-Angebot reicht als Rahmen).

Für den **Blueprint** zusätzlich: die Diagnose-Fragen über die ganze Kanzlei + die Ampel-/Reifegrad-Logik + welche Antworten zu welchem Modul (M-04/05/06) routen sollen.
