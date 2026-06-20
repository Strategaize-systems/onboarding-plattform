# FEAT-090 — StB-Onboarding-Rahmen (Stufe-1 Eigen-Kanzlei)

- Version: V10
- Status: planned
- Backlog: BL-509
- Created: 2026-06-20

## Was
Minimaler Wholesale/StB-Account-Rahmen: der Steuerberater onboardet seine **eigene Kanzlei** als Tenant (Stufe-1). Er ist `tenant_admin` seines eigenen Tenants; das ist der Henne-Ei-Loeser (er erlebt den Wert selbst, bevor er uns fuer Mandanten beauftragt).

## Warum
Ohne einen Account-Einstieg fuer den StB gibt es keinen Stufe-1-Flow. Es braucht das absolute Minimum, kein Billing.

## In Scope (V10)
- StB registriert/onboardet die eigene Kanzlei als Tenant (Reuse OP-Tenant-Onboarding-Wizard FEAT-031).
- Rolle/Scope: StB = `tenant_admin` der eigenen Kanzlei.
- Markierung des Tenants als „StB-Vertikale / Stufe-1" (fuer spaetere Stufen-Abgrenzung).

## Out of Scope (V10)
- Billing / Anrechnung / Wholesale-Fakturierung (spaeter, separat).
- Mandanten-Tenants, Partner-Hierarchie (Stufe-2, spaetere Version).
- Self-Signup-Public-Flow (V7-Mechanik existiert, hier nicht erforderlich).

## Reuse
OP-Tenant-Onboarding (FEAT-031), Tenant/RLS/Rollen-Foundation, Tier-Gating-Foundation (`121_v975_tier_gating_foundation.sql`).

## Success / Acceptance
- Ein StB kann seine eigene Kanzlei als Tenant anlegen und sich als `tenant_admin` einloggen.
- Der Tenant ist als StB-Vertikale-Stufe-1 erkennbar.
- Tenant-Isolation (RLS) verifiziert.

> Detail + Constraints: PRD `## V10 — StB-Vertikale Phase 1`. Forks → /architecture V10.
