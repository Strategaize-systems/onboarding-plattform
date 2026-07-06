# Soll-Rollenmodell V2 — konsolidiert nach Founder-Feedback

**Onboarding-Plattform · Stand 2026-07-06 · baut auf der Status-Quo-Doku (RPT-586) auf**

Founder-Feedback vom 2026-07-06 auf die Delta-Liste, konsolidiert gegen den Code-Status-Quo und das Business-System-Rollen-Pattern (Reuse-Sweep). Ziel dieses Dokuments: die klare Übersicht "wer sieht was, welche Rolle hat er, reicht die Struktur?" — als Freigabe-Grundlage vor der technischen Umsetzung.

---

## 1. Die Founder-Entscheidungen (Grundlage dieses Modells)

1. **StB = EIN Login, DREI einzeln an-/abschaltbare Funktionen** — nicht zwei Logins, nicht drei Rollen: (1) selbst Strategaize-Kunde für die eigene Kanzlei, (2) Empfehlungsgeber (Landingpage → Exit-Ready-Mandanten), (3) eigener Beratungs-Umsatz mit unserer Plattform bei seinen Mandanten.
2. **Strategaize bekommt eine zweite Ebene:** Admin (Founder, sieht alles) + **Strategaize-Berater** (ausführende Rolle, sieht NUR zugewiesene Steuerberater/Kunden). Pattern-Reuse aus dem Business System.
3. **Die Zwischenebene beim Kunden fliegt raus:** keine Führungskräfte-/Vertriebsleiter-Verwaltungsebene, kein Mirror. Es bleibt GF + Mitarbeiter. Einladen tut der GF selbst — oder er delegiert es an seinen Berater (StB Funktion 3 bzw. Strategaize-Berater).
4. **StB (Funktion 3) darf Mitarbeiter seiner Workspace-Mandanten einladen** (z.B. anhand des Organigramms), damit er als Dienstleister Daten auf Mitarbeiter-/Führungskraft-Ebene erheben kann.
5. **"Mein Tag" bekommt der StB definitiv auch** — funktionsabhängig freigeschaltet.

---

## 2. Das Ziel-Rollenmodell (5 Rollen, anders geschnitten als heute)

| # | Rolle | Wer | Sieht | Verwaltet | Heute im Code |
|---|---|---|---|---|---|
| 1 | `strategaize_admin` | Founder (+ ggf. später Betriebs-Admins) | ALLES cross-tenant | alles: Partner anlegen, Berater anlegen + zuweisen, jede Freischaltung | existiert unverändert |
| 2 | `strategaize_berater` **(NEU)** | Strategaize-Consultants (ausführend, kein Admin) | NUR zugewiesene StB-Kanzleien + zugewiesene Direkt-Kunden, inkl. deren Mandanten-/Capture-Daten; eigenes "Mein Tag" über diesen Ausschnitt | betreut zugewiesene Kunden, kann dort delegiert Mitarbeiter einladen | fehlt — **1:1-Port aus Business System** (Details §4) |
| 3 | `partner` (StB) | Steuerberater-Kanzlei | funktionsabhängig (§3): eigene Kanzlei-Erfassung + Mandanten-Liste + Advisory-Workspace | Kanzlei-Stammdaten/Branding; F2: Mandanten einladen; F3: Mandanten-Mitarbeiter einladen | heute `partner_admin` (nur F2-Teilmenge) |
| 4 | `tenant_admin` (GF) | Geschäftsführer/Inhaber eines Unternehmens (Direkt-Kunde ODER StB-Mandant) | eigenes Unternehmen komplett: Dashboard, Capture, Diagnose, Handbuch, Berichte | lädt eigene Mitarbeiter ein (oder delegiert an Berater) | existiert unverändert |
| 5 | `employee` | Mitarbeiter (inkl. Führungskräfte!) | NUR eigene zugewiesene Capture-Aufgaben + Walkthroughs | nichts | existiert unverändert — sauberster Perimeter, bleibt wie er ist |

**Entfällt:** `tenant_member` (Zwischenebene, Founder-Entscheidung 3), `mirror_respondent` (Legacy-Pfad), `tenant_owner`-Reste in RLS-Policies. Eine Führungskraft, die Wissen liefern soll, ist aus Plattform-Sicht ein `employee` mit anderen zugewiesenen Blöcken — keine eigene Rolle.

---

## 3. Die drei StB-Funktionen — ein Login, drei Schalter

Die Schalter leben als drei Flags an der Kanzlei (`partner_organization`), gesetzt durch Strategaize (Admin oder zuständiger Berater). Der StB loggt sich EINMAL ein; seine Oberfläche zeigt genau die Bereiche, deren Flag an ist.

### F1 — Eigene Kanzlei als Strategaize-Kunde (`cap_own_company`)
- **Umsetzungs-Idee (0 Doppel-Login):** Die Kanzlei IST ein Unternehmen. Ihr Partner-Tenant wird selbst capture-fähig — der StB bekommt zusätzlich zum Partner-Bereich einen Bereich **"Meine Kanzlei"** mit derselben Dashboard-/Capture-/Diagnose-Strecke wie jeder GF (inkl. StB-Fachmodule, sobald das StB-Vertikale-Flag an ist).
- Der StB agiert dort faktisch wie ein tenant_admin seines eigenen Tenants — technisch OHNE zweite Rolle/zweiten User (Gate: `partner` + Flag F1).
- Produkt 1 (read-only "wer hat was gemacht, gemeinsam ausarbeiten") = Strategaize-Seite darauf: sein zuständiger Strategaize-Berater/Admin sieht seine Kanzlei-Erfassung wie jeden anderen Kunden.

### F2 — Empfehlungsgeber (`cap_referral`)
- **Existiert heute schon fast vollständig:** Partner-Slug + Landingpage + Self-Signup-Strecke (V7) → Interessent wird automatisch eigener Mandanten-Tenant (`partner_client`) unter der Kanzlei, Exit-Ready-Strang läuft mit Strategaize.
- Neu ist nur: an das Flag hängen (Slug/Landingpage-Resolver + Mandanten-Einladen nur bei F2 an) und die Mandanten-Liste nach "empfohlen (Exit-Ready, Strategaize betreut)" vs. "Workspace-Mandant (F3, StB betreut)" trennen.

### F3 — Berater-Workspace / eigener Umsatz (`cap_advisory`)
- Der StB betreut Mandanten SELBST unternehmensberatend mit unserer Technologie. Braucht:
  1. **Mandanten-Drilldown** (heute fehlend, D5): pro Workspace-Mandant Fortschritt, Erhebungen, Diagnose-Ampel, "wer hat was gemacht" — die RLS-Lesebasis (`partner_client_mapping`) existiert bereits.
  2. **Mein Tag für Partner** (D3): dieselbe Workspace-Mechanik wie V10.2, aber hart auf seine akzeptierten Mandanten gescoped (Berichte + RAG-Fragen nur über deren Daten).
  3. **Mitarbeiter-Invites in Workspace-Mandanten** (Founder-Entscheidung 4): StB lädt anhand Organigramm Mitarbeiter/Führungskräfte des Mandanten als `employee` DES MANDANTEN-TENANTS ein (nicht seiner Kanzlei!) — die werden ganz normal abgefragt.

**Beispiele:** Nur F2 an = der heutige Empfehlungs-Partner. F1+F2 = Kanzlei arbeitet selbst mit uns UND empfiehlt. F1+F2+F3 = Vollausbau mit eigenem Beratungsgeschäft.

---

## 4. Strategaize-Berater — Reuse aus dem Business System

Der BS-Sweep bestätigt: das Muster ist dort komplett gebaut und port-fähig (MIG-033/034/035 + `cockpit/src/lib/auth/*`):

- **Rollen** `admin`/`teamlead`/`member` mit CHECK-Constraint; `team_id` auf profiles.
- **Sichtbarkeits-Helfer** (SQL, SECURITY DEFINER): `is_admin()`, `is_teamlead()`, `get_my_team_id()`, `can_see_owner(target_owner)` — Owner-Spalten (`owner_user_id`) auf den Kern-Tabellen, RLS-Policies bauen darauf.
- **Invite-Flow** `inviteUserAndCreateProfile()` (generateLink + Profil + Rollback + Audit-Log) und Rollen-gestufte Verwaltung (Teamlead nur eigenes Team, nur member).
- **UI-Gating** über `visibleFor`-Rollenlisten in der Sidebar-Config + `assertRole()`.

**Übersetzung auf OP** (Anpassung, kein Neubau): Statt Leads/Deals sind die "Objekte" hier Kanzleien und Kunden-Tenants. Vorschlag: Zuweisungsspalte `betreuer_user_id` auf `tenants` (bzw. `partner_organization`) + OP-Variante von `can_see_owner()` → `can_see_tenant(tenant_id)` = admin ODER zugewiesener Berater ODER (bei Mandanten) Berater der übergeordneten Kanzlei-Zuweisung. Teams/Teamlead-Ebene brauchen wir am Anfang NICHT (ein Berater, direkt zugewiesen) — das BS-Pattern erlaubt, sie später ohne Umbau nachzuziehen. "Mein Tag" für den Berater = V10.2-Workspace mit `can_see_tenant`-Scope statt Voll-Zugriff.

---

## 5. Wer sieht was — die Soll-Gesamtmatrix

| Bereich | strategaize_admin | strategaize_berater | partner (StB) | tenant_admin (GF) | employee |
|---|---|---|---|---|---|
| Plattform-Betrieb (`/admin`: Tenants, Partner, Reviews, Debrief, Text-Overrides, Audit) | ✅ alles | 🔶 nur zugewiesene Kunden (Reviews/Debrief seiner Kunden) | ❌ | ❌ | ❌ |
| **Mein Tag** | ✅ alle Tenants | ✅ zugewiesene | ✅ mit F3, nur eigene Workspace-Mandanten | ❌ (V1) | ❌ |
| Partner-Bereich (Stammdaten, Branding, Mandanten-Liste) | ✅ | 🔶 zugewiesene Kanzleien | ✅ eigene Kanzlei | ❌ | ❌ |
| "Meine Kanzlei" (Erfassung der eigenen Firma) | ✅ (Einblick) | 🔶 zugewiesene | ✅ mit F1 | — (hat sein eigenes Dashboard) | ❌ |
| Mandanten-Drilldown ("wer hat was gemacht") | ✅ | 🔶 zugewiesene | ✅ mit F3 (Workspace-Mandanten) / read-only-Basis bei F2 | ❌ | ❌ |
| GF-Dashboard (Capture, Diagnose, Handbuch, Berichte) | ✅ (Demo/Einblick) | 🔶 zugewiesene | ✅ mit F1 für die eigene Kanzlei | ✅ eigenes Unternehmen | ❌ |
| Mitarbeiter einladen | ✅ überall | 🔶 in zugewiesene (delegiert) | ✅ mit F3 in Workspace-Mandanten; mit F1 in die eigene Kanzlei | ✅ eigenes Unternehmen | ❌ |
| Employee-Bereich (zugewiesene Aufgaben) | — | — | — | — | ✅ nur eigene |

🔶 = wie Admin, aber auf den zugewiesenen Ausschnitt begrenzt (`can_see_tenant`).

---

## 6. Delta-Liste — Neuabgleich nach dem Feedback

| Delta | Status nach Founder-Feedback |
|---|---|
| **D2** StB-Doppelrolle | **ENTSCHIEDEN + erweitert:** ein Login, drei Funktions-Flags (§3). Wird Umsetzungs-Paket P3. |
| **D4** keine Strategaize-Abstufung | **ENTSCHIEDEN:** Rolle `strategaize_berater` mit Zuweisungs-Sichtbarkeit, BS-Port (§4). Paket P2. |
| **D8** tenant_member unscharf | **ENTSCHIEDEN:** Zwischenebene entfällt ersatzlos; Führungskräfte = employee. Paket P1. |
| **D6** Legacy-Reste (tenant_owner, mirror) | Geht im selben Aufräum-Paket P1 mit raus. |
| **D3** Mein Tag nur Admin | **ENTSCHIEDEN:** Mein Tag für strategaize_berater (zugewiesener Scope) + partner mit F3 (Mandanten-Scope). Pakete P2/P4. |
| **D5** Mandanten-Drilldown fehlt | Wird Kern von F3 (Paket P4); RLS-Basis vorhanden. |
| **D1** GF-Funktionen unter /admin-URLs | Bleibt nötig — wird durch das neue Modell sogar dringlicher (klare Bereichs-Trennung pro Rolle). Paket P5. |
| **D7** kein Passwort-Reset | Unverändert offen, VOR jedem externen Test. Paket P1. |
| **D9** Test nur im StB-Strang | Durch Modell geklärt: Direkt-Kunden legt Strategaize an (Admin/Berater), Self-Signup bleibt der F2-Weg. Kein separater Direkt-Self-Signup nötig — es sei denn, du willst später einen. |
| **D10** StB-Vertikale-Flag OFF | Wird Teil von F1 ("Meine Kanzlei" inkl. Fachmodule); Flag-Enable im Zuge von P3. |

**Damit sind alle 10 Deltas entweder entschieden oder einem Umsetzungs-Paket zugeordnet — kein offener Widerspruch zwischen Geschäftsmodell und Struktur.**

## 7. Struktur-Check: Reicht das Modell? (Einschätzung)

**Ja — das Modell ist tragfähig und macht die Plattform einfacher statt komplexer.** Fünf Rollen, jede mit genau einem Zweck; Variabilität steckt in zwei sauberen Mechanismen (Funktions-Flags am Partner, Zuweisung am Berater) statt in immer neuen Rollen. Der Wegfall der Zwischenebene ist konsistent mit dem Geschäftsmodell (Exit-Ready + StB-Beratung, keine Selbstbedienungs-Wissensplattform).

Drei Punkte zur Bestätigung, bevor die technische Detail-Planung startet:

1. **F1-Mechanik:** Einverstanden, dass die Kanzlei-Erfassung IM Partner-Tenant läuft ("Meine Kanzlei"-Bereich, kein zweiter Account)? Das ist der einfachste und robusteste Weg.
2. **Mein Tag für GF:** bewusst NICHT (V1), richtig? Der GF hat sein Dashboard; Mein Tag bleibt ein Betreuer-Werkzeug (Strategaize + StB-F3).
3. **Empfohlene Mandanten (F2) im StB-Blick:** Wie viel sieht der StB von Exit-Ready-Mandanten, die Strategaize betreut — nur Status ("aktiv, in Erhebung") oder auch Inhalte? Vorschlag: nur Status-Zeile, Inhalte erst wenn der Mandant auch Workspace-Mandant (F3) wird.

## 8. Umsetzungs-Skizze (Paket-Reihenfolge, noch keine Slice-Planung)

| Paket | Inhalt | Aufwand grob |
|---|---|---|
| **P1 — Fundament & Aufräumen** | tenant_member/mirror/tenant_owner raus (Migration + Code), Passwort-Reset-Flow (D7) | klein |
| **P2 — Strategaize-Berater** | BS-Port: Rolle, Zuweisung (`betreuer_user_id`), `can_see_tenant()`-RLS, Invite, Sidebar-Gating, Mein Tag mit Berater-Scope | mittel |
| **P3 — Partner-Funktions-Flags + F1** | 3 Flags an partner_organization, Admin-UI zum Schalten, "Meine Kanzlei"-Bereich (Dashboard/Capture im Partner-Tenant), StB-Vertikale-Flag-Enable | mittel |
| **P4 — F3 Advisory-Workspace** | Mandanten-Drilldown, Mein Tag Partner-Scope, Mitarbeiter-Invite in Workspace-Mandanten | mittel-groß |
| **P5 — Bereichs-Entmischung** | GF-Funktionen von /admin-URLs nach /dashboard (D1), Redirect-Hygiene | klein-mittel |

Reihenfolge-Logik: P1 entfernt Altlast bevor neue Rollen draufkommen; P2 vor P4 (Mein-Tag-Scoping-Mechanik wird in P2 gebaut und in P4 wiederverwendet); P5 jederzeit einschiebbar. Nach deiner Freigabe von §7 geht das Ganze in den regulären Workflow (/requirements → /architecture → /slice-planning pro Paket).

---

*Grundlagen: Status-Quo-Doku RPT-586 (`docs/OP_ROLLEN_LOGIN_SICHTBARKEIT_2026-07-06.html`), Founder-Feedback 2026-07-06, BS-Reuse-Sweep (MIG-033/034/035, cockpit/src/lib/auth + team).*
