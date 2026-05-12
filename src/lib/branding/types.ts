// V6 SLC-104 — Partner-Branding Types (FEAT-044)
//
// BrandingConfig wird vom Resolver (rpc_get_branding_for_tenant) zurueckgegeben
// und vom Root-Layout in CSS-Custom-Properties uebersetzt (DEC-106).

export interface BrandingConfig {
  /** Public-Proxy-URL fuer das Logo (z.B. "/api/partner-branding/<tenant_id>/logo"), null = kein Logo. */
  logoUrl: string | null;
  /** Hex-Format "#rrggbb" — Primaerfarbe, immer gesetzt (Default Strategaize-Blau). */
  primaryColor: string;
  /** RGB-Triplet "r g b" — fuer Tailwind alpha-value-Syntax (rgb(var(--brand-primary-rgb) / <alpha-value>)). */
  primaryColorRgb: string;
  /** Hex-Format "#rrggbb" — Sekundaerfarbe optional (V6.1+). */
  secondaryColor: string | null;
  /** Anzeige-Name (Partner-Display-Name) oder null fuer Strategaize-Default. */
  displayName: string | null;
}

/** Raw JSONB-Payload von rpc_get_branding_for_tenant. Snake-case wie DB-Spalten. */
export interface BrandingRpcPayload {
  logo_url: string | null;
  primary_color: string;
  secondary_color: string | null;
  display_name: string | null;
}
