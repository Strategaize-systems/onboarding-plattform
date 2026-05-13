// V6 SLC-106 — Outbound HTTP-Adapter Business-System Lead-Intake (FEAT-046, MT-3)
//
// Synchroner POST an `BUSINESS_SYSTEM_INTAKE_URL` mit Bearer-Auth. 10s Timeout.
// Bei Fail (HTTP 4xx/5xx, Network-Error, Timeout) liefert `{ ok: false, error }`
// zurueck — Caller (Server-Action oder Retry-Worker) entscheidet ueber Retry.
// Audit-Logging (error_log) ist Caller-Verantwortung, der Adapter ist isoliert.
//
// Sicherheits-Hinweise (R-106-2):
//   - ENV NICHT als NEXT_PUBLIC_* bundlen — beide Variablen sind server-only.
//   - Bei fehlender ENV wirft die Funktion — Caller muss das behandeln (im
//     V6-Pfad ist Konfigurations-Pflicht; MT-12 ENV-Setup-Smoke verifiziert).

import type { LeadIntakePayload, LeadIntakeResponse } from "./types";

const REQUEST_TIMEOUT_MS = 10_000;

export async function pushLeadToBusinessSystem(
  payload: LeadIntakePayload,
): Promise<LeadIntakeResponse> {
  const url = process.env.BUSINESS_SYSTEM_INTAKE_URL;
  const apiKey = process.env.BUSINESS_SYSTEM_INTAKE_API_KEY;
  if (!url || !apiKey) {
    throw new Error(
      "BUSINESS_SYSTEM_INTAKE_URL or BUSINESS_SYSTEM_INTAKE_API_KEY not configured",
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as {
      contact_id?: unknown;
      was_new?: unknown;
    };

    if (typeof data.contact_id !== "string" || typeof data.was_new !== "boolean") {
      return { ok: false, error: "Invalid response shape" };
    }

    return { ok: true, contact_id: data.contact_id, was_new: data.was_new };
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      return { ok: false, error: `Timeout (${REQUEST_TIMEOUT_MS / 1000}s)` };
    }
    return { ok: false, error: (e as Error).message };
  } finally {
    clearTimeout(timeoutId);
  }
}
