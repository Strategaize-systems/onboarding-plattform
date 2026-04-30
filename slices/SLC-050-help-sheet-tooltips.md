# SLC-050 — In-App-Hilfe (Help-Sheet auf 5 Pages + 5 Tooltips an UI-Elementen)

## Goal
Letzter V4.2-Slice. In-App-Hilfe-Foundation: Right-Side `Sheet` (shadcn/ui) mit Markdown-Inhalten pro Hauptansicht, geoeffnet via `?`-Trigger im Header. Help-Content unter `src/content/help/<page-key>.md` (statisch via `fs.readFileSync` zur Server-Render-Zeit). Wiederverwendung von `react-markdown` + `remark-gfm` aus FEAT-028 Reader (V4.1, DEC-049). Plus Tooltips an mind. 5 spezifischen UI-Elementen (DEC-058).

## Feature
FEAT-033 (In-App-Hilfe)

## In Scope

### A — Help-Markdown-Files (5 Pages)

Pfad: `src/content/help/` (neu, 5 Files)

Pflicht-Inhalte (mind. 100 Worter pro File, kein Lorem-Ipsum):

**`src/content/help/dashboard.md`:**
- Was zeigt das Cockpit (Sessions, Mitarbeiter, Bridge, Handbuch, Reviews)
- Was bedeutet "naechster Schritt"-Banner
- Wie nutze ich das Onboarding optimal

**`src/content/help/capture.md`:**
- Wie funktioniert Block-Submit
- Was sind Knowledge Units
- Was passiert nach dem Submit (Verdichtung)
- Wann sollte ich einen Block submitten

**`src/content/help/bridge.md`:**
- Was macht die Bridge-Engine
- Wann nutze ich die Bridge (nach GF-Blueprint)
- Wie reviewe ich Bridge-Vorschlaege

**`src/content/help/reviews.md`:**
- Wozu Block-Reviews
- Wie approven oder rejecten
- Was passiert bei Reject (Mitarbeiter-Antwort fliesst nicht ins Handbuch)
- Quality-Gate erklaerung

**`src/content/help/handbook.md`:**
- Wie liest man das Handbuch (Reader-Navigation)
- Was sind Snapshots
- Wie generiere ich einen neuen Snapshot
- Cross-Link zum Editor

### B — Help-Loader

Pfad: `src/lib/help/load.ts` (neu)

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

const HELP_DIR = join(process.cwd(), 'src/content/help');
const VALID_KEYS = ['dashboard', 'capture', 'bridge', 'reviews', 'handbook'] as const;
type HelpPageKey = typeof VALID_KEYS[number];

export function loadHelpMarkdown(pageKey: HelpPageKey): string {
  if (!VALID_KEYS.includes(pageKey)) {
    throw new Error(`Unknown help page key: ${pageKey}`);
  }
  return readFileSync(join(HELP_DIR, `${pageKey}.md`), 'utf-8');
}

export function listAvailableHelpPages(): HelpPageKey[] {
  return [...VALID_KEYS];
}
```

Server-Component-Read zur Render-Zeit. Next.js Server Components cachen das Ergebnis pro Request — kein Re-Read pro Sheet-Open.

### C — Help-Sheet-Komponente

Pfad: `src/components/help/HelpSheet.tsx` (neu)

```typescript
type HelpSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  markdown: string;
};

export function HelpSheet({ open, onOpenChange, markdown }: HelpSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Hilfe</SheetTitle>
        </SheetHeader>
        <div className="prose prose-sm mt-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

Wiederverwendung `react-markdown` + `remark-gfm` aus FEAT-028 (DEC-049).

### D — Help-Trigger-Button im Header

Pfad: `src/components/help/HelpTrigger.tsx` (neu)

Verhalten:
- `?`-Icon-Button (z.B. Lucide `HelpCircle`).
- Nimmt `pageKey` Prop.
- Lokaler React-State fuer `open`.
- Server-Component-Parent laedt Markdown via `loadHelpMarkdown(pageKey)` und reicht es als Prop.

```typescript
type HelpTriggerProps = {
  pageKey: 'dashboard' | 'capture' | 'bridge' | 'reviews' | 'handbook';
  markdown: string;
};

export function HelpTrigger({ pageKey, markdown }: HelpTriggerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <HelpCircle className="h-5 w-5" />
        <span className="sr-only">Hilfe oeffnen</span>
      </Button>
      <HelpSheet open={open} onOpenChange={setOpen} markdown={markdown} />
    </>
  );
}
```

### E — Layout-Integration auf 5 Pages

Pflicht-Pages (DEC-057):
1. `/dashboard` → `src/app/dashboard/page.tsx` (geaendert, Header bekommt HelpTrigger)
2. `/capture/[sessionId]` → `src/app/capture/[sessionId]/page.tsx` (geaendert)
3. `/admin/bridge` → `src/app/admin/bridge/page.tsx` (geaendert, falls existing)
4. `/admin/reviews` → `src/app/admin/reviews/page.tsx` (geaendert, FEAT-030)
5. `/dashboard/handbook[/...]` → `src/app/dashboard/handbook/page.tsx` + `src/app/dashboard/handbook/[snapshotId]/page.tsx` (geaendert, FEAT-028)

Pattern pro Page:
- Server-Component laedt Markdown: `const helpMd = loadHelpMarkdown('dashboard');`
- Server-Component rendert `<HelpTrigger pageKey="dashboard" markdown={helpMd} />` im Page-Header.
- Optional: Layout-Refactor zu shared `<PageHeader />` Komponente die HelpTrigger einbettet (nur falls Pattern-Konsolidierung leicht moeglich).

### F — Tooltips an 5 UI-Elementen (DEC-058)

Pflicht-Tooltips:

| UI-Element | Pfad (vermutlich) | Tooltip-Text |
|---|---|---|
| Bridge-Trigger-Button | `src/app/admin/bridge/...` | "Erzeugt Mitarbeiter-Capture-Vorschlaege aus GF-Blueprint" |
| Approve-Block-Button | `src/app/admin/blocks/[blockKey]/review/...` | "Approve = Mitarbeiter-Antworten fliessen ins Handbuch" |
| Generate-Snapshot-Button | `src/app/admin/handbook/...` | "Generiert das Unternehmerhandbuch aus aktuellem Stand" |
| Wizard-"Spaeter"-Button | `src/components/onboarding-wizard/Wizard.tsx` (SLC-047) | "Du kannst den Wizard jederzeit abschliessen" |
| Inactive-Employees-Badge | `src/components/cockpit/InactiveEmployeesCard.tsx` (SLC-049) | "Mitarbeiter mit accepted Invitation aber ohne Block-Submit" |

Pattern: shadcn `Tooltip` (Radix-basiert):
```typescript
<Tooltip>
  <TooltipTrigger asChild>
    <Button onClick={...}>...</Button>
  </TooltipTrigger>
  <TooltipContent>
    <p>Erzeugt Mitarbeiter-Capture-Vorschlaege aus GF-Blueprint</p>
  </TooltipContent>
</Tooltip>
```

Kein "Verstanden, nicht mehr zeigen"-Toggle (DEC-058 Q-V4.2-F).

### G — Tests

- `src/lib/help/__tests__/load.test.ts` (neu): 3 Test-Cases — valid keys, invalid key wirft Error, alle 5 Files existieren.
- `src/components/help/__tests__/HelpSheet.test.tsx` (neu): Render-Test mit Markdown-String + Sheet-Open/Close.
- `src/components/help/__tests__/HelpTrigger.test.tsx` (neu): Trigger-Click oeffnet Sheet.
- Snapshot-Tests fuer alle 5 Help-Markdown-Files (`src/content/help/__tests__/files.test.ts`):
  - Pflicht-Check: jede Datei existiert.
  - Pflicht-Check: jede Datei hat mind. 100 Worter (kein Lorem-Ipsum-Platzhalter).
  - Pflicht-Check: jede Datei rendert ohne Error durch react-markdown.

## Out of Scope

- AI-gestuetzte Hilfe / Chatbot (V5+)
- Mehrsprachige Hilfe-Inhalte (V5+, DE-only in V4.2)
- Externe Onboarding-Videos / Tutorials-Hosting (V5+)
- Help-Content in DB + In-App-Editor (V5+, DEC-057 = statisch im Repo)
- Help-Suche ueber alle Files (V5+)
- Tooltip-"Verstanden, nicht mehr zeigen"-Toggle (DEC-058)
- Onboarding-Tour-Overlay / Joyride (DEC-058 explizit nein)

## Acceptance Criteria

- AC-1: 5 Markdown-Files unter `src/content/help/` existieren mit jeweils mind. 100 Worter Inhalt (kein Lorem-Ipsum).
- AC-2: `loadHelpMarkdown(pageKey)`-Helper liest die Files korrekt. Invalid Key wirft Error.
- AC-3: HelpSheet-Komponente rendert Markdown via react-markdown + remark-gfm (gleiche Lib wie Reader FEAT-028).
- AC-4: HelpTrigger-Button (`?`-Icon) ist auf `/dashboard` sichtbar im Header.
- AC-5: HelpTrigger-Button ist auf den 4 weiteren Pflicht-Pages sichtbar: `/capture/[sessionId]`, `/admin/bridge`, `/admin/reviews`, `/dashboard/handbook[/...]`.
- AC-6: Klick auf `?`-Icon oeffnet Right-Side-Sheet mit Markdown-Inhalt der jeweiligen Page.
- AC-7: Sheet schliesst via Esc, Outside-Click, X-Button.
- AC-8: Sheet-Lade-Performance: erstes Open der Page < 100ms (Markdown wird zur Render-Zeit geladen, kein Network-Roundtrip — SC-V4.2-7).
- AC-9: Build-Bundle-Overhead durch Help-Content < 25KB (5 Files × max 5KB) — verifiziert via `npm run build` Bundle-Analyzer.
- AC-10: Sheet ist auf Mobile (375×667) lesbar — Sheet nimmt mind. 80% Screen-Width, Markdown bleibt lesbar.
- AC-11: 5 Pflicht-Tooltips an UI-Elementen sichtbar bei Hover/Focus.
- AC-12: Tooltip-Text-Laenge max. 100 Zeichen pro Tooltip (Lesbarkeit, DEC-058).
- AC-13: Keine Tooltip-Persistenz-Toggle (DEC-058 Q-V4.2-F bestaetigt).
- AC-14: `npm run build` + `npm run test` gruen.
- AC-15: TypeScript strict — kein `any`, keine `@ts-ignore`.

## Dependencies

- Vorbedingung: V4.1 react-markdown + remark-gfm in `package.json` (DEC-049, FEAT-028 Reader). Wird wiederverwendet, kein neuer NPM-Pakete.
- Vorbedingung: shadcn `Sheet` + `Tooltip` Komponenten (V3+ etabliert).
- Tooltip-Targets: SLC-047 (Wizard-Spaeter-Button), SLC-049 (Inactive-Badge), V4 (Bridge-Trigger), V4.1 (Approve-Block, Generate-Snapshot). Tooltips werden in den jeweiligen Slice-Files NICHT mehr nachgepflegt — SLC-050 erweitert die Buttons.
- Nachgelagert: keine. SLC-050 ist letzter V4.2-Slice.

## Worktree

Mandatory (SaaS).

## Migrations-Zuordnung

Keine — Help ist statisches Repo-Content, kein DB-Schema.

## Pflicht-QA-Vorgaben

- **Pflicht-Gate: Browser-Smoke** auf allen 5 Pflicht-Pages — HelpTrigger sichtbar, Sheet oeffnet sich, Markdown rendert.
- **Pflicht-Gate: Mobile-Render-Test** auf 375×667 — Sheet lesbar, Markdown nicht abgeschnitten.
- **Pflicht-Gate: 5 Tooltip-Hover-Tests** — alle 5 Pflicht-Tooltips sichtbar bei Hover.
- **Pflicht-Gate: Help-Content-Inhalts-Pruefung** — User reviewt die 5 Markdown-Files inhaltlich (kein "passt schon" — Berater muss bestaetigen dass Texte korrekt sind).
- **Pflicht-Gate: Bundle-Size-Check** — `npm run build` Output zeigt Help-Content-Overhead < 25KB.
- `npm run test` + `npm run build` gruen.
- Cockpit-Records-Update nach Slice-Ende: slices/INDEX.md SLC-050 status `done`, FEAT-033 status `done`.

## Risks

- **R1 — Help-Content-Drift gegenueber UI-Stand:** Wenn UI-Aenderungen kommen (V5+), Help-Files veralten. Mitigation = R-V4.2-3 aus PRD: Help-Update als Pflicht-Item im Slice-Review (Code-Review-Lint, kein automatischer CI-Block).
- **R2 — Markdown-Render-Edge-Cases:** Komplexe Markdown-Konstrukte (Tables, Nested Listen) koennten in Sheet-Layout brechen. Mitigation = react-markdown + remark-gfm aus FEAT-028 deckt Standard-Faelle ab. Wenn Edge-Cases auftauchen: spezifischer Fix im Slice.
- **R3 — Bundle-Size-Growth:** 5 × ~5KB Markdown plus Render-Library plus Komponenten kann mehr werden als 25KB. Mitigation = AC-9 Bundle-Check, Inhalte bewusst kompakt halten (Pflicht: max 5KB pro File).
- **R4 — Tooltip-Performance bei vielen UI-Elementen:** shadcn Tooltip ist Radix-basiert (lazy mount). Akzeptabel.
- **R5 — Help-Content-PR-Workflow zu schwerfaellig:** Berater muss fuer Help-Update einen PR machen statt In-App-Edit. Akzeptabel fuer V4.2-Volume (5 Pages). Wenn Berater haeufig editiert: V5+ In-App-Editor.

### Micro-Tasks

#### MT-1: 5 Help-Markdown-Files schreiben (Inhalt)
- Goal: Real-User-Inhalt fuer 5 Files (mind. 100 Worter pro File) — kein Lorem-Ipsum.
- Files: `src/content/help/dashboard.md`, `src/content/help/capture.md`, `src/content/help/bridge.md`, `src/content/help/reviews.md`, `src/content/help/handbook.md` (alle neu)
- Expected behavior: Jede Datei beantwortet Pflicht-Inhalts-Stichpunkte aus In-Scope-Sektion oben. Berater-Review verifiziert Inhalt vor Slice-Done.
- Verification: User-Bestaetigung (Berater) + Word-Count-Test (>=100 Worter pro File).
- Dependencies: keine
- Pflicht-Gate: Berater-Inhalts-Review.

#### MT-2: loadHelpMarkdown-Helper + Tests
- Goal: Server-Side-Loader mit Type-Safety + Error-Handling.
- Files: `src/lib/help/load.ts` (neu), `src/lib/help/__tests__/load.test.ts` (neu)
- Expected behavior: Liest Files korrekt, wirft bei invalid keys.
- Verification: 3 Vitest-Tests gruen.
- Dependencies: MT-1 (Files muessen existieren fuer Tests)

#### MT-3: HelpSheet + HelpTrigger-Komponenten
- Goal: shadcn Sheet + Trigger-Button + Markdown-Render.
- Files: `src/components/help/HelpSheet.tsx` (neu), `src/components/help/HelpTrigger.tsx` (neu), `src/components/help/__tests__/HelpSheet.test.tsx` (neu), `src/components/help/__tests__/HelpTrigger.test.tsx` (neu)
- Expected behavior: Sheet rendert Markdown + Open/Close-Verhalten + Trigger-Click.
- Verification: 4 Vitest-Tests + Render-Snapshot.
- Dependencies: MT-2

#### MT-4: Layout-Integration auf 5 Pages
- Goal: HelpTrigger in den Headers der 5 Pflicht-Pages einbinden.
- Files: `src/app/dashboard/page.tsx` (geaendert), `src/app/capture/[sessionId]/page.tsx` (geaendert), `src/app/admin/bridge/page.tsx` (geaendert), `src/app/admin/reviews/page.tsx` (geaendert), `src/app/dashboard/handbook/page.tsx` (geaendert), `src/app/dashboard/handbook/[snapshotId]/page.tsx` (geaendert)
- Expected behavior: Auf jeder der 5 Pages erscheint `?`-Icon im Header. Klick oeffnet Sheet mit korrektem Page-Content.
- Verification: Browser-Smoke auf allen 5 Pages + Snapshot-Tests.
- Dependencies: MT-3

#### MT-5: 5 Pflicht-Tooltips an UI-Elementen
- Goal: shadcn Tooltip an Bridge-Trigger, Approve-Block, Generate-Snapshot, Wizard-Spaeter (SLC-047), Inactive-Badge (SLC-049).
- Files: betroffene Komponenten (5 Files, alle bereits existing oder aus SLC-047/049)
- Expected behavior: Hover zeigt Tooltip mit dem in der Tabelle (oben) definierten Text.
- Verification: 5 Hover-Tests + Browser-Smoke.
- Dependencies: SLC-047 done (Wizard-Spaeter-Button existiert), SLC-049 done (Inactive-Badge existiert), V4 (Bridge-Trigger existiert), V4.1 (Approve-Block + Generate-Snapshot existieren).

#### MT-6: Bundle-Size-Verifikation
- Goal: `npm run build` Output pruefen — Help-Content-Bundle unter 25KB.
- Files: keine (Test-Dokumentation in Slice-Report)
- Expected behavior: Build-Output zeigt Help-Markdown-Files als statische Imports, Total-Bundle-Increase < 25KB.
- Verification: Bundle-Analyzer-Output im Slice-Report dokumentiert.
- Dependencies: MT-1, MT-2, MT-3, MT-4 done.

#### MT-7: Mobile-Render-Smoke
- Goal: Sheet auf 375×667 ist lesbar — Markdown nicht abgeschnitten, Sheet nimmt 80% Width.
- Files: keine (Test-Dokumentation)
- Expected behavior: Browser-DevTools-Mobile-Mode zeigt Sheet korrekt.
- Verification: Screenshot in Slice-Report.
- Dependencies: MT-3, MT-4 done.

#### MT-8: Berater-Inhalts-Review der 5 Help-Files
- Goal: Pflicht-Gate. Berater (User) liest alle 5 Help-Markdown-Files und bestaetigt Inhalts-Korrektheit.
- Files: keine
- Expected behavior: User-Bestaetigung "alle 5 Files inhaltlich OK" oder spezifische Edits.
- Verification: User-Bestaetigung im Slice-Report.
- Dependencies: MT-1 done.
- Pflicht-Gate: Berater-Inhalts-Review.
