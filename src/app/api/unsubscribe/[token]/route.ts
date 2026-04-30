import { createAdminClient } from "@/lib/supabase/admin";
import { captureException } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUCCESS_HTML = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Abmeldung bestaetigt</title>
    <meta name="robots" content="noindex,nofollow" />
    <style>
      body { font-family: Arial, sans-serif; max-width: 560px; margin: 64px auto; color: #1f2937; padding: 0 16px; }
      h1 { font-size: 22px; }
      a { color: #120774; }
    </style>
  </head>
  <body>
    <h1>Du wirst keine weiteren Erinnerungen erhalten.</h1>
    <p>Deine Abmeldung wurde gespeichert. Du kannst diese Einstellung jederzeit
    in deinem Konto aendern.</p>
    <p><a href="/">Zur Startseite</a></p>
  </body>
</html>`;

const NEUTRAL_HTML = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Link nicht gueltig</title>
    <meta name="robots" content="noindex,nofollow" />
    <style>
      body { font-family: Arial, sans-serif; max-width: 560px; margin: 64px auto; color: #1f2937; padding: 0 16px; }
      h1 { font-size: 22px; }
      a { color: #120774; }
    </style>
  </head>
  <body>
    <h1>Dieser Link ist nicht gueltig.</h1>
    <p>Falls du dich abmelden moechtest, oeffne den aktuellen Abmelde-Link
    aus der zuletzt erhaltenen Erinnerungs-E-Mail.</p>
    <p><a href="/">Zur Startseite</a></p>
  </body>
</html>`;

function htmlResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await params;

  // Token-Format-Validierung (64 hex chars per migration default).
  // Defense-in-depth: short-circuit on obviously bogus input.
  if (!token || !/^[a-f0-9]{16,128}$/i.test(token)) {
    return htmlResponse(NEUTRAL_HTML, 404);
  }

  try {
    const supabase = createAdminClient();
    // UPDATE returns rows that were updated. RLS-bypass legitim — kein Login,
    // Token IS the auth (DSGVO-konform fuer One-Click-Unsubscribe).
    const { data, error } = await supabase
      .from("user_settings")
      .update({ reminders_opt_out: true })
      .eq("unsubscribe_token", token)
      .select("user_id");

    if (error) {
      captureException(error, {
        source: "api/unsubscribe",
        metadata: { tokenPrefix: token.slice(0, 6) },
      });
      return htmlResponse(NEUTRAL_HTML, 404);
    }

    if (!Array.isArray(data) || data.length === 0) {
      return htmlResponse(NEUTRAL_HTML, 404);
    }

    return htmlResponse(SUCCESS_HTML, 200);
  } catch (e) {
    captureException(e, {
      source: "api/unsubscribe",
      metadata: { tokenPrefix: token.slice(0, 6) },
    });
    return htmlResponse(NEUTRAL_HTML, 404);
  }
}
