# OP — Standort-Abgleich (Stand 2026-07-06)

Abgleich gegen die Standortbestimmung vom 04.07. (`OP_STANDORT_UND_ROADMAP_2026-07-04`). Alle Aussagen live verifiziert (Prod-Container, Feature-Flag, Backlog, Roadmap) — nicht aus dem Gedächtnis.

**Kernaussage in einem Satz:** Seit dem 04.07. ist **Phase 1 (dein Cockpit) komplett fertig und live** — übrig bis „geschäftlich aktiv" sind exakt die Phasen 2–4 aus dem Dokument: **Flag an + ein echter Test → Handbuch/SOP-Endstück + Exit-Framing → Legal/Billing.** Kein Engine-Bau mehr darunter. V9.9/V9.10 bleiben korrekt zurückgestellt.

---

## Was sich seit dem 04.07. getan hat

Das Dokument vom 04.07. endete mit „Nächster Schritt: /post-launch V10.1, dann Phase 1 Cockpit". Seitdem ist passiert:

| Punkt aus dem 04.07.-Plan | Status heute | Beleg |
|---|---|---|
| /post-launch V10.1 (Burn-In) | ✅ **STABLE** (05.07.) | RPT-575, INERT-Release verifiziert |
| **Phase 1.1 — KI-Workspace RAG-Assistent** (Berichts-Buttons + Frage-Box + Voice) | ✅ **GEBAUT + DEPLOYED + STABLE** als **V10.2 „Mein Tag"** (04./05.07.) | REL-038, RPT-573/574; Route `/admin/mein-tag` |
| **Phase 1.2 — „Mein Tag"-Cockpit für OP definieren + bauen** (OP-spezifische Reports) | ✅ **FERTIG** — 5 Standard-Berichte cross-Mandant (Mandanten-Übersicht mit Fortschritt/Diagnose-Ampel/Modul-Reife, Review-Queue, Wo-stockt-es, System-Status, Activity-Timeline) + Haiku-Kurzfazit | FEAT-100, deployed |
| RAG-Frage-Antwort über deine Daten (Text + **Voice/Whisper**) mit Quellen + Coverage-Guard | ✅ live (Live-Browser-Smoke PASS) | FEAT-101 |
| RAG-Zuverlässigkeit (Index-Lücken, „5 von 35 indexiert") | ✅ **selbstheilend seit HEUTE** — V10.2.1 Reconcile-Cron alle 10 min; erster Lauf hat deine Lücke geheilt (alle 35 Erkenntnisse indexiert) | REL-039, RPT-585; ISSUE-112 resolved |
| ISSUE-111 (Haiku-Model-Pin für Live-Scoring) | ✅ resolved — Code-Override ist live; der Punkt „Flag-Redeploy bündelt ISSUE-111-Fix" ist damit **hinfällig** | KNOWN_ISSUES |

**Damit ist die Founder-Prio vom 04.07. („Cockpit ZUERST") vollständig abgearbeitet.** Der im Dokument festgehaltene Trade-off-Vermerk gilt jetzt in die andere Richtung: Das Cockpit ist da — **der eine echte Test ist jetzt der nächste Business-Schritt und sollte nicht weiter geschoben werden.**

---

## Deine Frage: V9.9 und V9.10

Deine Erinnerung ist korrekt — **beide sind für den jetzigen Schritt nicht relevant** und stehen bewusst hinter dem ersten echten Test (Spur 5 „Wissensnetzwerk-Moat" im 04.07.-Dokument, Berater-Warnung inklusive):

- **V9.9 (IS-Knowledge-Push):** hart geblockt durch zwei Pre-Conditions — IS-Knowledge-API (IS V3.5 SLC-352) live UND Anwalts-Sign-off PII-Redaction. Beides nicht da. Bleibt geparkt.
- **V9.10 (Knowledge Foundation):** besteht aus zwei Hälften — und hier gibt es eine **Neuigkeit durch V10.2**:
  - **BL-123 (KI-Workspace, SLC-353): de facto substanziell durch V10.2 erledigt.** Das P-010-Muster (Berichts-Buttons + Frage-Box + Voice + RAG) ist gebaut — als Berater-Cockpit cross-Mandant. Offen aus der alten BL-123-Spec bleibt nur: dieselbe Fläche **für den StB/Mandanten selbst** (Mandanten-Sicht) + IS-Knowledge-API als zweite RAG-Quelle. → Empfehlung: BL-123 beim nächsten Planungs-Schritt re-scopen (Rest-Delta statt Vollbau), nicht jetzt bauen.
  - **BL-124 (OP→IS Verdichtungs-Cron): Anwalt- + Consent-Gate**, Moat-Baustein — bleibt klar hinter dem ersten Test.

**Fazit: V9.9/V9.10 ändern nichts an der Reihenfolge. Sie sind Moat, nicht Markteintritt.**

---

## Was JETZT noch offen ist bis „geschäftlich aktiv"

Die drei roten Kanten vom 04.07. minus die erledigte Cockpit-Spur. Live-verifiziert: Feature-Flag `NEXT_PUBLIC_ENABLE_STB_VERTIKALE` ist im Prod-Container **weiterhin nicht gesetzt (= OFF)**.

### Phase 2 — StB testbar machen (nächster Block, ~1,5–2 Tage + dein Durchlauf)

| # | Baustein | Aufwand | Gate | Status |
|---|---|---|---|---|
| 1 | Feature-Flag `NEXT_PUBLIC_ENABLE_STB_VERTIKALE=true` in Coolify (Build-Variable!) + Redeploy | ~0,5 Tag | keins — ISSUE-111 ist bereits gefixt | ❌ offen |
| 2 | StB End-to-End im Browser verifizieren: Blueprint → Modul-Wizard → Ampel/Live-Rückfrage → Synthese → Workspace-Reader (der aufgeschobene AC-180-5) | ~0,5–1 Tag | Flag an | ❌ offen |
| 3 | SOP-Brücke UI-Trigger („Modul-SOPs erzeugen" — Backend SLC-181 existiert, Knopf fehlt) | ~0,5–1 Tag | keins | ❌ offen |
| 4 | **1 realer Selbst-Durchlauf** (du bzw. befreundete Kanzlei) — „der eine echte Test" | dein Kalender | — | ❌ offen |

### Phase 3 — Endprodukt schärfen (schließt Weg 1a/1b/2 ab)

| # | Baustein | Backlog | Aufwand | Status |
|---|---|---|---|---|
| 5 | **Konsolidiertes Kanzlei-Handbuch** — alle Module + SOPs in EIN druckbares Dokument (die Lücke am „Ende" des Selbst-Durchlaufs) | neu (Slice fehlt) | mittel | ❌ offen |
| 6 | **Exit-Übersetzungs-Schicht** — Engine-Output in Käufer-/Übergabe-Sprache (schaltet Weg 1b scharf; höchster Business-Hebel, Engine liefert schon) | BL-515 + BL-516 | klein (Framing) | ❌ offen |

### Phase 4 — Vor dem ersten zahlenden Kunden

| # | Baustein | Backlog | Gate | Status |
|---|---|---|---|---|
| 7 | Scope/Disclaimer/Haftung + Anwalts-Review | BL-517 | **Legal-Gate** | ❌ offen |
| 8 | Billing-/GTM-Minimalpfad | neu | — | ❌ offen (bewusst 0 gebaut) |
| 9 | (Upsell, später) 6-Monats-Re-Assessment | BL-518 | — | geparkt |

### Bewusst dahinter (Moat)

V9.9 IS-Knowledge-Push · V9.10/BL-124 OP→IS-Cron (Anwalt + Consent) · BL-123-Rest (Mandanten-Sicht des Workspace) — **alles erst nach echter Nutzung.**

---

## Empfohlene Reihenfolge ab heute

1. **Läuft bereits:** /post-launch V10.2.1 T+24h (~07.07. 10:30 UTC) — reine Formsache, blockiert nichts.
2. **Phase 2 starten:** Flag an + Redeploy → E2E-Browser-Verifikation → SOP-UI-Trigger (zusammen ~1,5–2 Tage). Danach hast du eine **komplett bedienbare StB-Strecke inklusive deines Cockpits**.
3. **Der eine echte Test** (Selbst-Durchlauf). Alles, was der Test an Reibung zeigt, schlägt jede theoretische Priorisierung.
4. Parallel/danach: **konsolidiertes Handbuch** (Punkt 5) und **Exit-Framing** (Punkt 6) — beide klein genug, um sie nach den Test-Erkenntnissen zu schneiden.
5. **Erst vor dem ersten zahlenden Kunden:** Legal (BL-517) + Billing-Minimalpfad.

**Merksatz (aktualisiert):** Am 04.07. fehlten „Bedien-Oberfläche, End-Dokument, Exit-Framing + ein echter Test". Die **Bedien-Oberfläche ist seit V10.2 fertig** — es bleiben **End-Dokument, Exit-Framing, ein echter Test** und dahinter Legal/Billing. Reifegrad Richtung „geschäftlich aktiv": **~90 %** der Technik, 0 % des einen echten Durchlaufs.
