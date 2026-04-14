# FEAT-001 — Foundation Data Model & RBAC

- Status: planned
- Version: V1
- Created: 2026-04-14

## Purpose
Das generische Datenmodell und Rollenmodell, auf dem alle weiteren V1-Features aufbauen. Muss template-ready sein (DEC-003) und Deployment-Flexibilitaet (DEC-002) unterstuetzen.

## Why it matters
Ohne sauberes Fundament ist jedes spaetere Feature blockiert oder wuerde das Schema in eine Blueprint-spezifische Richtung zementieren. Die Umbenennung von block_session → capture_session und debrief_item → knowledge_unit ist einmalig billig, spaeter sehr teuer.

## In Scope
- Tabellen: `capture_session`, `knowledge_unit`, `validation_layer`, `template`, `block_checkpoint`
- Generisches Naming (keine Blueprint-spezifischen Begriffe im Schema)
- Rollen: strategaize_admin, tenant_admin, tenant_member (aus Blueprint uebernommen)
- RLS-Policies fuer alle neuen Tabellen
- Migration-Skripte unter `sql/migrations/`
- Query-Layer-Abstraktion (`*-queries.ts`) generalisiert aus OS-Portierung
- Seed-Daten-Infrastruktur (leere Templates, Test-Tenants)

## Out of Scope
- Konkreter Template-Content (→ FEAT-002)
- UI fuer Rollen-Verwaltung (Blueprint-UI reicht fuer V1)
- Multi-Berater-Rolle "consultant" (V2+)
- Template-Switcher-UI (V2+)

## Success Criteria
- Alle 5 Kerntabellen existieren mit RLS-Policies und wurden auf Hetzner migriert (siehe rule sql-migration-hetzner)
- Mindestens zwei Test-Tenants koennen angelegt werden; Cross-Tenant-Read ist durch RLS geblockt
- strategaize_admin kann Cross-Tenant-Read (fuer Debrief-Review) explizit ueber eine Admin-Policy
- Query-Layer hat keine Hardcoded-Tenant-IDs oder Blueprint-spezifische Begriffe
- Schema-Dokumentation im Architecture-Doc nach /architecture

## Related
- DEC-001 (Blueprint-Basis), DEC-002 (Deployment-Flexibilitaet), DEC-003 (Template-ready), DEC-005 (OS-Portierung)
- SC-3 (template-ready), SC-4 (RLS-Isolation), SC-5 (Deployment-Flexibilitaet)
