// V10.4 SLC-190 (FEAT-107) MT-1 — Berater-Tenant-Filter fuer den Query-Layer (DEC-269/270).
//
// Ein additiver Pflicht-Filter, den JEDER Berater-relevante Loader auf JEDE
// tenant-tragende Query legt (R-190-1: ein ungefilterter Pfad = cross-tenant-Leak).
//
// Semantik (bewusst 3-wertig ueber `undefined` vs `[]`):
//   - allowedTenantIds === undefined  => Admin-Verhalten: KEIN Filter (0 Regression, SC-V10.4-5).
//   - allowedTenantIds === []         => Berater ohne Zuweisung: `.in(col, [])` => 0 Zeilen (fail-closed).
//   - allowedTenantIds === [ids]      => nur diese Tenants.
//
// Strukturell typisiert auf die PostgREST-`.in`-Methode, damit der Aufrufer den
// bestehenden Builder-Chain nur umschliesst (kein Bruch der `Promise.all`-Struktur).

/**
 * Minimal-Interface fuer den PostgREST-Filter-Builder. Bewusst OHNE Selbst-Referenz
 * auf den generischen Builder-Typ und NUR intern via Cast genutzt — der Aufrufer-Typ
 * `T` bleibt unconstrained, sonst laeuft die TS-Inferenz beim tief verschachtelten
 * Supabase-Builder in TS2589 ("excessively deep").
 */
interface TenantFilterable {
  in(column: string, values: readonly string[]): unknown;
}

/**
 * Wendet den Berater-Tenant-Filter auf einen PostgREST-Query-Builder an.
 * Gibt den Builder (unveraenderten Typ `T`, damit das `.data`-Typing erhalten
 * bleibt) zurueck; ohne `allowedTenantIds` unveraendert.
 *
 * @param column Spalte, auf die gefiltert wird — meist `tenant_id`, bei der
 *   `tenants`-Tabelle selbst `id`.
 */
export function scopeTenants<T>(
  query: T,
  column: string,
  allowedTenantIds: string[] | undefined,
): T {
  if (allowedTenantIds === undefined) return query;
  return (query as TenantFilterable).in(column, allowedTenantIds) as T;
}
