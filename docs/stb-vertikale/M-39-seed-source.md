# M-39 Seed-Source — Zentrale Wissensplattform & Dokumenttypen (SLC-170b, Welle 5)

> **Zweck:** menschen-lesbares Quell-Mapping für die zu seedende `template`-Row
> `stb_modul_m39` v1.0 (Folge-`/backend`-Slice, SLC-170b). Hält die Provenienz
> (Frage-IDs, Ebene, Auto-Dedup-Hinweise, KI-Hebel-Referenzen), die in der DB-Row
> nicht 1:1 abgelegt wird. **System-of-Record bleibt** die `template`-Tabelle.
> Stand 2026-07-02 (SLC-170b, DEC-242 · Modus A / `/module-author`). **Letztes Modul des
> StB-KERN-Cuts (18/18).**
>
> **⚠️ Rahmen (BLOCKING, `nicht raten`):** M-39 ist die **Standortbestimmung der zentralen
> Wissensplattform** — Prozess-Dokumentation/Standards, Wissensarten/Dokumenttypen, zentrale
> Ablage/Auffindbarkeit, Pflege/Verantwortung, Wissenssicherung bei Personalwechsel, Wissens-Reife/
> KI-Nutzung. Bewusst getrennt vom *Einarbeitungs-Wissen/Offboarding-Moment* (M-28), der
> *Entscheidungs-/Governance-Doku* (M-03), der *Prozess-Struktur* (M-02), dem *technischen DMS/System*
> (M-36) und dem *personellen* Klumpenrisiko (M-26). Alle Fragen sind offen; die KI-Hebel
> strukturieren/prüfen. Dieser Framing-Hinweis gehört in `metadata.output_contract` + `description`.
>
> **IP-Quelle:** Founder-Autoring 2026-07-02 (Themenbaum 6 Bereiche + Grenzziehung +
> Tiefe „bewusst schlanker" Founder-bestätigt via `/module-author`). Domänen-Struktur
> Wissensplattform / Dokumenttypen Steuerkanzlei (Wissensmanagement; xlsx „Welche Wissensarten
> existieren (Prozesse, Checklisten, Vorlagen, Playbooks), wo sie liegen und wie sie gepflegt
> werden"). Blueprint-Anker: `e1_prozesse_wissen` **primär** m39 (sekundär m02). Tiefen-/Format-
> Maßstab + Auto-Dedup-Korpus:
> `M-01/M-02/M-03/M-04/M-06/M-07/M-08/M-15/M-16/M-36/M-38/M-BP/M-26/M-27/M-28/M-35/M-42-seed-source.md`.
> Kein recyceltes exit_readiness-Material (DEC-234).
> **17 Fragen (9 Kern / 8 Workspace) · 8 KI-Hebel (Reifegrad 1–4).**

## 1. Geseedete Row

| Feld | Wert |
|---|---|
| `slug` | `stb_modul_m39` |
| `version` | `1.0` |
| `name` | M-39 – Zentrale Wissensplattform & Dokumenttypen |
| Kategorie | Wissensmanagement & Kommunikation (`metadata.modul_kategorie`) |
| `metadata.modul_key` | `m39` — Brücke zu `modul_output.modul_key` / `rpc_enqueue_module_output` (MIG-124) |
| Blocks | 2 (`stufe1_kern` required=true · `stufe2_vertiefung` required=false) |
| Fragen | 17 (9 Kern / 8 Workspace) |
| KI-Hebel | 8 (Reifegrad 1–4) in `metadata.ki_hebel[]` |

**Block/Question-Shape** = `src/lib/db/template-queries.ts` (`TemplateBlockSchema` /
`TemplateQuestionSchema`), identisch zum bisherigen StB-Seed-Korpus (MIG-029 / MIG-125). Die zwei
Stufen werden auf zwei Blocks abgebildet; „Ebene" (Kern/Workspace) landet zusätzlich pro Frage in
`question.ebene`.

## 2. Mapping Modul-Spec → DB-Felder

| Spec-Spalte | DB-Feld | Hinweis |
|---|---|---|
| Frage-ID (F-M39-xxx) | `question.frage_id` | verbatim |
| Ebene (Kern/Workspace) | `question.ebene` + Block-Zuordnung | Kern → `stufe1_kern`; Workspace → `stufe2_vertiefung` |
| Unterbereich (N1..N6 / Nxa …) | `question.unterbereich` | verbatim (Themenbaum-Schlüssel §3) — Prefix `N` = wisseNs-Management (M-39-modul-scoped) |
| Fragetext | `question.text` | verbatim, offen |
| Typ („offen") | — | ausschließlich offene Fragen; kein Score-Mapping. Kein DB-Feld nötig. |
| Hinweis/Kommentar (Dedup-Refs) | — | nur hier dokumentiert (§4) — Provenienz, nicht produktiv genutzt |
| Themenmodell N1–N6 | `metadata.themenmodell[]` | 6 Bereiche mit Unterthemen |
| KI-Hebel-Tabelle | `metadata.ki_hebel[]` | hebel_id/name/beschreibung/reifegrad/referenz (§5) |
| Output-Artefakte / Triple + Framing | `metadata.output_contract` + `description` | Modul-Kontext für den Synthese-Worker (SLC-174); Wissensmanagement-Diagnose-Framing (§6) |

**Scoring-Flags** (`owner_dependency`, `deal_blocker`, `sop_trigger`, `ko_hart`, `ko_soft`):
Die M-39-Spec liefert diese nicht → alle auf `false` (Default; Delivery-Schicht später).

**Block-/Question-UUIDs:** deterministisch via `uuid5(NS, "…/q/<frage_id>")` bzw.
`"…/block/<key>"` (NS slug-haltig `stb_modul_m39`) → stabil über Re-Applies.

## 3. Themenbaum (`metadata.themenmodell[]`)

| Bereich | Bereichs-Name | Unterthema-Schlüssel | Unterthema |
|---|---|---|---|
| N1 | Prozess-Dokumentation & Standards | `n1a_kernprozesse_dokumentiert` | Wiederkehrende Kernprozesse dokumentiert + identisch ausführbar |
| | | `n1b_standard_checklisten` | Standards/Checklisten für Routineaufgaben |
| | | `n1c_bus_faktor` | Prozess läuft unabhängig von der ausführenden Person (Bus-Faktor) |
| N2 | Wissensarten & Dokumenttypen | `n2a_wissensarten` | Welche Wissensarten/Dokumenttypen existieren |
| | | `n2b_fachwissen_ablage` | Fachliches Know-how dokumentiert vs. im Kopf |
| | | `n2c_vorlagen_muster` | Vorlagen/Muster/Textbausteine zentral verfügbar |
| N3 | Zentrale Plattform & Auffindbarkeit | `n3a_zentrale_plattform` | Zentrale Wissensablage vs. verstreut (Grenze: techn. DMS → M-36) |
| | | `n3b_auffindbarkeit` | Wissen schnell auffindbar (Struktur, Suche) |
| | | `n3c_aktualitaet` | Wissen aktuell vs. veraltet/widersprüchlich |
| N4 | Pflege & Verantwortung | `n4a_pflege_routine` | Pflege-Routine (wer aktualisiert wann) |
| | | `n4b_wissens_ownership` | Wer verantwortet die Wissensplattform (Grenze: Rollen → M-02) |
| | | `n4c_beitrag_kultur` | Mitarbeiter tragen aktiv Wissen bei vs. Einbahnstraße |
| N5 | Wissenssicherung bei Personalwechsel | `n5a_wissenssicherung` | Kritisches Wissen übergabefähig dokumentiert (Grenze: Offboarding → M-28, Klumpen → M-26) |
| | | `n5b_mandantenwissen` | Mandantenspezifisches Wissen zentral vs. personengebunden |
| | | `n5c_uebergabefaehigkeit` | Wissen bleibt bei Abgang erhalten (Grenze: pers. Nachfolge → M-26, Onboarding-Transfer → M-28) |
| N6 | Wissens-Reife & KI-Nutzung | `n6a_wissens_reife` | Bewusst aufgebaute Plattform vs. historisch/chaotisch |
| | | `n6b_ki_wissensnutzung` | KI-gestützte Wissensnutzung (durchsuchbar, Q&A) (Grenze: KI-Systemwahl → M-36) |
| | | `n6c_weiterentwicklung` | Wissensbasis bewusst weiterentwickelt |

## 4. Fragebogen — Provenienz (Auto-Dedup gegen den bisherigen StB-Seed-Korpus M-01…M-42)

### Stufe 1 – Kern (Block `stufe1_kern`, required=true, 9 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 1 | F-M39-001 | `n1a_kernprozesse_dokumentiert` | Wie viele Ihrer wiederkehrenden Kernprozesse (Jahresabschluss, Fristen, Mandanten-Onboarding) laufen dokumentiert und identisch — egal, wer sie ausführt — oder macht jeder es ein bisschen anders? | Variante von F-BP-011 (e1-Diagnose, primäres Zielmodul m39; hier die Prozess-Doku-/Standard-Seite; Grenze: der Onboarding-Aspekt „Neuer an Tag 1" → M-28 F-M28-007) |
| 2 | F-M39-002 | `n1b_standard_checklisten` | Gibt es für Ihre wiederkehrenden Routineaufgaben Standards und Checklisten — oder verlässt sich alles auf Erfahrung und „das weiß der Kollege"? | Ergänzung |
| 3 | F-M39-003 | `n2a_wissensarten` | Welche Arten von Wissen halten Sie überhaupt fest (Prozesse, Checklisten, Vorlagen, Playbooks, fachliche Musterlösungen) — oder existiert das meiste nur in Köpfen und verstreuten Dateien? | Ergänzung |
| 4 | F-M39-004 | `n2b_fachwissen_ablage` | Ist Ihr fachliches Spezial-Know-how (knifflige Auslegungen, Musterlösungen, Branchenwissen) irgendwo dokumentiert — oder steckt es ausschließlich in den Köpfen einzelner Personen? | Ergänzung |
| 5 | F-M39-005 | `n3a_zentrale_plattform` | Gibt es bei Ihnen eine zentrale Stelle, an der Wissen liegt — oder ist es über Laufwerke, Mail-Postfächer, Ordner und Köpfe verstreut? | Ergänzung (Grenze: das technische DMS/System → M-36; hier die zentrale Wissens-Struktur) |
| 6 | F-M39-006 | `n3b_auffindbarkeit` | Findet ein Mitarbeiter das Wissen, das er braucht, schnell selbst — oder muss er in der Praxis doch immer jemanden fragen, weil man nichts wiederfindet? | Ergänzung |
| 7 | F-M39-007 | `n4a_pflege_routine` | Wird Ihr dokumentiertes Wissen gepflegt und aktuell gehalten — gibt es eine Routine dafür — oder veraltet vieles, sobald es einmal geschrieben wurde? | Ergänzung |
| 8 | F-M39-008 | `n5a_wissenssicherung` | Ist kritisches Wissen so dokumentiert, dass jemand übernehmen könnte, wenn eine Schlüsselperson ausfällt — oder ginge mit ihr viel unwiederbringlich verloren? | Ergänzung (Grenze: der Offboarding-/Transfer-Moment → M-28 F-M28-008/023, strukturelles Klumpenrisiko → M-26 P3c; hier die Plattform-seitige Wissenssicherung) |
| 9 | F-M39-009 | `n6a_wissens_reife` | Ist Ihre Wissensablage bewusst aufgebaut und strukturiert — oder eher historisch gewachsen und chaotisch, sodass sie kaum jemand aktiv nutzt? | Ergänzung |

### Stufe 2 – Vertiefung (Block `stufe2_vertiefung`, required=false, 8 Fragen)

| Pos | Frage-ID | Unterbereich | Fragetext | Provenienz |
|---|---|---|---|---|
| 10 | F-M39-010 | `n1c_bus_faktor` | Wenn Sie einen Ihrer Kernprozesse hernehmen: Würde er genauso ablaufen, wenn die Person, die ihn „immer macht", drei Wochen ausfällt — oder hängt der Prozess faktisch an dieser Person? | Ergänzung |
| 11 | F-M39-011 | `n2c_vorlagen_muster` | Haben Sie zentrale Vorlagen, Muster und Textbausteine (Anschreiben, Mandantenkommunikation, Standard-Dokumente) — oder baut jeder seine eigenen immer wieder neu? | Ergänzung |
| 12 | F-M39-012 | `n3c_aktualitaet` | Können sich Ihre Mitarbeiter auf das dokumentierte Wissen verlassen — ist es aktuell und widerspruchsfrei — oder kursieren mehrere veraltete Versionen nebeneinander? | Ergänzung |
| 13 | F-M39-013 | `n4b_wissens_ownership` | Gibt es jemanden, der für die Wissensplattform verantwortlich ist (Struktur, Pflege, Qualität) — oder ist das niemandes Job und verwaist deshalb? | Ergänzung (Grenze: Rollen/Governance → M-02; hier das Wissens-Ownership) |
| 14 | F-M39-014 | `n4c_beitrag_kultur` | Tragen Ihre Mitarbeiter aktiv Wissen bei (halten fest, was sie gelernt haben) — oder ist Wissensdokumentation eine lästige Einbahnstraße, die kaum jemand freiwillig macht? | Ergänzung |
| 15 | F-M39-015 | `n5b_mandantenwissen` | Ist mandantenspezifisches Wissen (Besonderheiten, Historie, Absprachen) zentral festgehalten — oder weiß nur der jeweilige Betreuer, „wie dieser Mandant tickt"? | Ergänzung (Grenze: die Mandatsverantwortung/-zuordnung → M-02 s2b; hier das dokumentierte Mandantenwissen) |
| 16 | F-M39-016 | `n6b_ki_wissensnutzung` | Nutzen Sie (oder könnten Sie) KI, um Ihr Wissen durchsuchbar und sofort abrufbar zu machen (Fragen stellen statt Ordner durchsuchen) — oder ist Ihr Wissen dafür gar nicht aufbereitet? | Ergänzung (Grenze: die KI-Systemwahl/-Einführung → M-36 I3; hier die Wissens-Anwendung/-Aufbereitung) |
| 17 | F-M39-017 | `n6c_weiterentwicklung` | Wird Ihre Wissensbasis bewusst weiterentwickelt (neue Erkenntnisse, Lessons Learned fließen ein) — oder ist sie einmal entstanden und wird seither kaum noch angefasst? | Ergänzung |

> **Auto-Dedup-Befund:** M-39 (Zentrale Wissensplattform & Dokumenttypen) ist der **Zielort vieler
> „→ M-39"-Grenzverweise** aus dem Korpus und daher weitgehend frisch — **16 Ergänzungen, 1 Variante**.
> Die Variante **F-M39-001 ↔ F-BP-011** (`e1_prozesse_wissen`, primäres Zielmodul m39) nimmt die
> **Prozess-Doku-/Wissensplattform-Seite**, während M-28 (F-M28-007) den **Onboarding-Aspekt
> „Neuer an Tag 1"** hält (bewusste Teilung, in M-28 §4 dokumentiert). Grenzen sauber gezogen:
> **M-28** (Einarbeitungs-Wissen + Offboarding-*Moment*, F-M28-008/023 defern die Plattform hierher —
> M-39 = die Plattform-Sicherung), **M-03** (Entscheidungs-/Governance-*Doku*, F-M03-015/017 defern
> die Wissensplattform hierher — M-39 = Prozess-/Fachwissen), **M-02** (Prozess-*Struktur*, F-M02-014
> defert die Doku hierher), **M-36** (technisches *DMS/System* — M-39 = Wissens-Inhalte/Struktur/
> Pflege; KI-Wissensnutzung deferiert die *Systemwahl* → M-36), **M-26** (Schlüsselperson-Klumpen
> *personell*), **M-40** (Kommunikation/Meetings — nicht im Cut). **Bewusst gedeckelt**
> (Founder-Entscheid „schlanker", nicht stillschweigend gefüllt): `n5c_uebergabefaehigkeit` ist im
> Themenbaum angelegt, aber in v1.0 ohne eigene Frage (implizit in F-M39-008; Grenze M-26/M-28) —
> v1.1-Kandidat. DEC-234 gewahrt.

## 5. KI-Hebel-Katalog (`metadata.ki_hebel[]`)

| Hebel-ID | Name | Reifegrad | Referenz (Themen; Fragen) |
|---|---|---|---|
| H-M39-001 | Prozess-Dokumentations-Generator (Kernprozesse als Standard/Checkliste festhalten) | 2 | N1; F-M39-001, F-M39-002, F-M39-010 |
| H-M39-002 | Wissens-Inventar (welche Wissensarten/Dokumenttypen existieren, welche fehlen) | 2 | N2; F-M39-003, F-M39-004 |
| H-M39-003 | Zentrale-Wissensplattform-Struktur (Aufbau + Auffindbarkeit + Struktur) | 2 | N3; F-M39-005, F-M39-006 |
| H-M39-004 | Wissens-Pflege-/Aktualitäts-Radar (veraltete/widersprüchliche Inhalte finden, Pflege-Routine) | 3 | N3c/N4; F-M39-007, F-M39-012 |
| H-M39-005 | Vorlagen-/Textbaustein-Bibliothek (zentrale Muster/Templates generieren & pflegen) | 2 | N2c; F-M39-011 |
| H-M39-006 | Wissenssicherungs-Assistent (kritisches/mandantenspezifisches Wissen dokumentieren, bevor es verloren geht) | 3 | N5; F-M39-008, F-M39-015 (Grenze: Offboarding → M-28) |
| H-M39-007 | KI-Wissens-Assistent (durchsuchbares Q&A über die Wissensbasis „wie machen wir das hier") | 4 | N6b; F-M39-016 (Grenze: KI-Systemwahl → M-36) |
| H-M39-008 | Wissens-Reife-Radar (dokumentiert, zentral, gepflegt, gesichert, KI-nutzbar — Gesamtbild) | 4 | N1–N6; F-M39-001, F-M39-005, F-M39-009 |

## 6. Output-Contract (`metadata.output_contract`)

> **Framing (Pflicht in jedem M-39-Output):** Selbst-Diagnose der Wissensplattform, keine
> Wissensmanagement-Beratung im Einzelfall. Die Ausgabe strukturiert die eigenen Angaben und macht
> Dokumentations-/Wissens-Lücken sichtbar.

Aus den M-39-Antworten leitet der Synthese-Worker (`module_output_synthesis`, SLC-174) je
relevantes Thema ein Liefer-**Triple** ab — Werte gemäß `modul_output.output_kind`-CHECK (MIG-124):

- `entscheidung` — was zu entscheiden ist (z. B. Kernprozesse dokumentieren, eine zentrale
  Wissensplattform einführen, Wissens-Ownership festlegen, kritisches Wissen sichern, Vorlagen-
  Bibliothek aufbauen, KI-gestützte Wissenssuche einführen).
- `standard` — welche Norm/Routine gilt (z. B. dokumentierte + identisch ausführbare Kernprozesse,
  zentrale gepflegte Wissensablage, definierte Dokumenttypen, Pflege-Routine mit Owner, gesichertes
  mandantenspezifisches Wissen, Beitrags-Kultur).
- `implementierungsschritt` — konkreter nächster Schritt (z. B. Top-Kernprozesse verschriftlichen,
  Wissensplattform-Struktur anlegen, Owner benennen, Vorlagen zentralisieren, kritisches Wissen einer
  Schlüsselperson dokumentieren).

KI-Hebel werden als `output_kind = 'ki_hebel'` mit `reifegrad` 1–4 ausgegeben (§5).

## 7. Regenerierung

Die `.sql`-Datei (Folge-`/backend`-Slice, `sql/migrations/<NNN>_..._stb_template_seed.sql`, SLC-170b)
ist das Artefakt und Source-of-Truth für den Seed. Sie wird aus dieser Datei deterministisch
erzeugt (valides JSON via `json.dumps`, `uuid5`-IDs mit slug-haltigem NS `stb_modul_m39`).
Bei Inhalts-Updates: neue Version (`1.1`) oder neue Migration, bestehende nicht editieren
(Immutable-Migration-Disziplin). Records (slices/INDEX, STATE, MIGRATIONS) werden im Build-Slice
aktualisiert, nicht in diesem Autoring-Schritt.
