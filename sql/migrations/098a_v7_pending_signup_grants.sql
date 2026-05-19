-- V7 SLC-134 Pen-Test Finding (P0 Production-Bug):
--
-- Migration 098 hat `pending_signup` mit ENABLE ROW LEVEL SECURITY angelegt,
-- aber KEINE expliziten GRANTs auf service_role/authenticated/anon. Das
-- bedeutet: Production POST /api/public/signup wuerde mit "permission
-- denied for table pending_signup" crashen, sobald der erste Signup-
-- Versuch durchlaeuft. Pen-Test SLC-134 hat das vor Live-Smoke entdeckt.
--
-- Profiles-Tabelle hat zum Vergleich:
--   service_role  | INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER
--   authenticated | INSERT/SELECT/UPDATE/DELETE
--
-- pending_signup hatte vorher NUR postgres-Owner-Grants -> Production
-- haette beim ersten Signup-Call einen 500-Error geliefert.
--
-- Idempotent: GRANT-Statements koennen mehrfach ausgefuehrt werden.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_signup TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_signup TO authenticated;

-- Default-deny per RLS-Policy bleibt unveraendert. Anon-Role bekommt
-- ABSICHTLICH kein GRANT — der Public-Signup-Endpoint nutzt service_role,
-- der direkte anon-Zugriff aus Browser ist nicht erwuenscht (Service-Key-
-- gated per Architecture).
