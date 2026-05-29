# V8 Privacy-Flow Mini-Discovery

**Status:** in_review
**Erstellt:** 2026-05-29
**Trigger:** BL-132 — Founder-Direktive 2026-05-29 zu Mandanten-Bericht-Daten-Eigentum
**Audience:** Founder + Architektur-Entscheidung vor /backend SLC-148

---

## Founder-Direktive (woertlich)

> "Die Daten, das ist ja das Erste, was wir auch versprechen: Die sind vertraulich. Die gehen erst, wenn der Kunde das will, zu uns rueber. Ansonsten sehen wir nur, ob was ausgefuellt ist."

Implikationen:
1. Mandanten-Daten sind **vertraulich** — nicht Strategaize-Eigentum per Default
2. Strategaize sieht **nur Status** (ausgefuellt ja/nein) bis Mandant explizit freigibt
3. Bericht geht **zurueck zum Mandant** (E-Mail) — Mandant kann ihn an Steuerberater weiterleiten oder bei sich behalten
4. **Strategaize-Freigabe** erfolgt erst bei explizitem Mandant-Action (Lead-Conversion-CTA)

---

## Konflikt mit aktuellem Plan

**DEC-163 sagt:** Bericht-Persistenz in `capture_session.metadata.v8_report_snapshot` JSONB (additivum, 0 neue Tabelle), PDF NICHT cached.

**Problem:** Snapshot in `capture_session.metadata` liegt in Strategaize-Supabase-DB. Strategaize-Admin hat technisch Lesezugriff via Supabase-Console + via Berater-Dashboard. Das widerspricht "Strategaize sieht nur ob ausgefuellt".

**Konsequenz:** DEC-163 muss entweder ueberarbeitet werden oder durch Admin-View-Gate ergaenzt werden.

---

## Drei Optionen

### Option A — Snapshot in Strategaize-DB + Admin-View-Gate via Freigabe-Flag

**Technik:** Snapshot bleibt in `capture_session.metadata.v8_report_snapshot`. Neues Feld `capture_session.released_for_strategaize_review BOOLEAN DEFAULT false`. Admin-View / Berater-Dashboard zeigt nur Status (`completed_at IS NOT NULL`), bis `released_for_strategaize_review = true` gesetzt wird. Erst dann Snapshot lesbar.

**Wer setzt das Flag?** Mandant via Lead-Conversion-CTA "Mit Strategaize sprechen" (V8.1) → setzt das Flag automatisch.

**RLS-Policy:** Standard-RLS auf `capture_session` so erweitern, dass `strategaize_admin`-Role den Snapshot nur lesen darf, wenn Flag gesetzt.

**Pro:**
- Minimaler Architektur-Change (1 BOOLEAN-Field + RLS-Anpassung)
- Snapshot-Persistenz bleibt simpel (eine Source of Truth)
- Wiedervorlage moeglich (Mandant kann spaeter doch freigeben)
- Steuerberater (= Owner der `partner_organization`) kann den Snapshot weiter sehen — entspricht "Daten gehen zu seinem Vertrauten"

**Contra:**
- Technisch liegen die Daten in Strategaize-Infrastruktur — strict-Lesart von "Daten gehen erst zu uns rueber" widerspricht das
- Verlangt Disziplin im Code (Berater-Dashboard / Admin-Views muessen Flag konsequent pruefen)
- Insider-Threat: Datenbank-Direktzugriff (Postgres-Console, Backups) umgeht das Flag

**Aufwand:** ~1h (Migration-Field, RLS-Update, Berater-Dashboard-Gate)

**DSGVO-Lesart:** Datenverarbeitung im Auftrag des Steuerberaters (StB als Verantwortlicher, Strategaize als Auftragsverarbeiter). AV-Vertrag noetig.

---

### Option B — Snapshot bleibt clientside / steuerberater-side

**Technik:** Snapshot wird NICHT in `capture_session.metadata` persistiert. Nach Bericht-Generierung wird PDF + JSON-Snapshot per E-Mail an Mandanten + (mit Mandant-Consent) an Steuerberater versendet. Strategaize-DB enthaelt nur: `capture_session` Eintrag + 47 `capture_response` Antworten + Status-Flag `completed_at`. Snapshot-Daten leben dann ausserhalb der Strategaize-DB.

**Wenn Strategaize-Freigabe gewuenscht:** Mandant lädt PDF + ggf. JSON-Snapshot über Lead-Conversion-CTA hoch (oder StB leitet weiter). Dann erst landet der Snapshot bei Strategaize (separate Tabelle `strategaize_review_submission`).

**Pro:**
- Konsequente Umsetzung der "Daten gehen erst zu uns rueber"-Direktive
- Strikter DSGVO-Schutz (Strategaize hat tatsaechlich keinen Snapshot-Zugriff)
- Klare Vertrauens-Geste: "Wir sehen es nur, wenn Sie es uns geben"

**Contra:**
- Aber: die 47 capture_response liegen weiter in Strategaize-DB! Das ist der eigentliche "Rohstoff". Snapshot-Verzicht ist nur kosmetisch, wenn die rohen Antworten daliegen
- Snapshot-Re-Generation aus rohen Antworten ist deterministisch (kein LLM) → jederzeit reproduzierbar von Strategaize-Side
- Komplexere Architektur: PDF-Generation muss synchron + E-Mail-Versand muss zuverlaessig sein (keine Re-Generation bei Mail-Bounce)
- Audit-Log fuer Bericht-Inhalt schwieriger (was hat Mandant gesehen?) — Steuerberater-Frage "was hat mein Mandant bekommen?" nicht beantwortbar

**Aufwand:** ~4-6h (Architektur-Aenderung, neue Versand-Pipeline, Snapshot-Upload-Flow fuer Strategaize-Freigabe)

**DSGVO-Lesart:** Datenverarbeitung im Auftrag des Steuerberaters fuer Rohdaten, Snapshot ist ephemer.

---

### Option C — Hybrid: Snapshot in DB, aber verschluesselt mit Mandant-/StB-Key

**Technik:** Snapshot liegt in `capture_session.metadata` aber **verschluesselt**. Schluessel kennt nur Mandant + Steuerberater. Strategaize-DB sieht nur Cipher-Text. Bei Mandant-Freigabe wird der Schluessel an Strategaize uebergeben (z.B. via Token im Lead-Conversion-CTA-Link).

**Pro:**
- Cryptographisch garantierter Strategaize-Blindheit-Schutz
- Maximaler DSGVO-Compliance-Wert (verschluesselt at-rest fuer Strategaize)

**Contra:**
- **Sehr hohe Komplexitaet** fuer V8.0 — Schluessel-Management, Key-Recovery, Browser-side Crypto
- Bricht "deterministisch reproduzierbar"-Eigenschaft (Snapshot kann ohne Schluessel nicht regeneriert werden)
- E-Mail-Versand wird komplex (Schluessel ueber separaten Kanal?)
- Backup/Recovery-Implikationen ungeklaert
- **V8.0-Overkill** — Strategaize ist KEIN Zero-Knowledge-Service, sondern Datenverarbeiter mit AV-Vertrag

**Aufwand:** ~3-5 Tage (eigene Architektur-Iteration)

**Empfehlung:** Nicht V8.0. Falls je benoetigt, eigenes V-Projekt mit eigener Discovery.

---

## Empfehlung

**Option A** — Snapshot in DB + Admin-View-Gate via `released_for_strategaize_review` Flag + RLS-Policy.

**Begruendung:**
1. **Geist der Direktive wird gewahrt:** Strategaize-Admin / Berater-Dashboard sieht den Snapshot nur, wenn der Mandant freigibt. Das ist die operative Realitaet der Founder-Direktive.
2. **Datenschutz-Rechtlicher Rahmen ist sauber:** Auftragsverarbeiter-Vertrag (AV) zwischen StB (Verantwortlicher) und Strategaize (Auftragsverarbeiter) deckt Snapshot-Persistenz ab — das ist der Standard fuer Co-Hosting-Plattform-Modelle.
3. **Aufwand minimal:** 1 BOOLEAN-Field + RLS-Update + Berater-Dashboard-Code-Gate. Keine Architektur-Umbauten.
4. **Option B's Vorteil ist scheinbar:** Die rohen 47 `capture_response`-Antworten bleiben so oder so in der Strategaize-DB. Snapshot-Verzicht waere nur Kosmetik, nicht echter Datenschutz.
5. **Option C ist V8.0-Overkill:** Zero-Knowledge-Architektur ist nicht das Geschaeftsmodell.

**Was Strategaize konkret tut, um Option A glaubwuerdig zu machen:**
- Berater-Dashboard zeigt fuer nicht-freigegebene Sessions nur Status (`completed_at`) + Mandanten-Name + Steuerberater-Name. KEIN Snapshot-Preview.
- Berater-Email-Funktion (z.B. "PDF nochmal senden") greift NICHT auf nicht-freigegebene Snapshots zu.
- DSGVO-Cookie-Banner / Datenschutz-Erklaerung sagt explizit: "Strategaize-Mitarbeiter sehen Ihre Diagnose-Inhalte erst, wenn Sie diese explizit an Strategaize freigeben."
- AV-Vertrag im Co-Hosting-Pattern (StB-Onboarding) macht das vertraglich verbindlich.

---

## Konkrete Slice-Edit-Empfehlung fuer SLC-148

**Migration 102 erweitern:**
```sql
ALTER TABLE public.capture_session
  ADD COLUMN IF NOT EXISTS released_for_strategaize_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS released_for_strategaize_review_at TIMESTAMPTZ;
```

**SLC-148 MT-6 (Server-Action) erweitern:**
- Pipeline schreibt Snapshot wie geplant
- `released_for_strategaize_review` bleibt `false` per Default
- KEINE Aenderung an Mandanten-/StB-Email-Versand (das ist BL-133)

**SLC-148 MT-2 RLS-Policy erweitern:**
- `capture_session.metadata.v8_report_snapshot` Lesezugriff fuer `strategaize_admin` NUR wenn `released_for_strategaize_review = true`
- Steuerberater (Owner der `partner_organization`) sieht weiterhin alles (Vertrauter)
- Mandant (`participant`) sieht eigene Session weiterhin

**DEC-163 Update:**
- Bestehende Entscheidung "Snapshot in capture_session.metadata" bleibt
- Ergaenzung: "+ Admin-View-Gate via `released_for_strategaize_review` Flag + RLS-Policy"

**Berater-Dashboard / Admin-Views (V8.0):**
- Sessions-Liste zeigt nur `completed_at`-Status, KEIN Snapshot-Preview
- Berater-Dashboard fuer nicht-freigegebene Sessions: "Diese Diagnose wurde abgeschlossen. Sie wurde noch nicht zur Strategaize-Beratung freigegeben."

**V8.1 Lead-Conversion-CTA (BL-134):**
- Bei "Mit Strategaize sprechen"-Klick im PDF (oder Folge-E-Mail) setzt das Flag `released_for_strategaize_review = true` + `released_for_strategaize_review_at = now()`
- Trigger E-Mail an Strategaize-Vertrieb mit Mandant-Kontaktdaten + Hinweis "Snapshot ist jetzt freigegeben"

---

## Naechste Schritte

1. **Founder-Entscheidung:** Option A/B/C bestaetigen (Empfehlung A).
2. **DEC-Update:** DEC-163 ergaenzen mit Admin-View-Gate (kein neuer DEC noetig).
3. **Slice-Edit SLC-148:** Migration-Erweiterung + RLS-Policy + Note in MT-6.
4. **BL-133 Versand-Pfad:** separate Discovery/Slice fuer Mandant→StB-Email-Versand.
5. **BL-134 V8.1 Lead-Conversion-CTA:** trigger fuer Flag-Setzung definieren.

---

## Cross-References

- DEC-163 (Bericht-Persistenz capture_session.metadata)
- SLC-148 MT-2 (Migration 102) + MT-6 (Server-Action)
- BL-132 (dieses Discovery-Item)
- BL-133 (Versand-Pfad — separater Punkt)
- BL-134 (Lead-Conversion V8.1 — setzt das Flag)
- Memory `feedback_mandanten_empfehlung_unsere_nicht_stb` (Tonalitaet ist Strategaize-Sicht — passt zur Trust-Erzaehlung)
