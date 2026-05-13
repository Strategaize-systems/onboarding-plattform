// V6 SLC-106 — Business-System Lead-Intake Types (FEAT-046, MT-3)
//
// Payload + Response Shape fuer den Outbound HTTP-Call an
// POST <BUSINESS_SYSTEM_INTAKE_URL>. Zwei harte Regeln (DSGVO + DEC-091):
//
//   - `notes` ist 2-3 Saetze Strukturtext, KEIN Roh-Bericht. Datensparsamkeit.
//   - `utm_source` ist immer `partner_<parent_partner_tenant_id>` damit der
//     First-Touch-Lock im Business-System Attribution korrekt anlegt.

export interface LeadIntakePayload {
  first_name: string;
  last_name: string;
  email: string;
  notes: string;
  utm_source: string;
  utm_campaign: string;
  utm_medium: string;
}

export type LeadIntakeResponse =
  | {
      ok: true;
      contact_id: string;
      was_new: boolean;
    }
  | {
      ok: false;
      error: string;
    };
