import { createAdminClient } from "@/lib/supabase/admin";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AcceptInvitationForm } from "./AcceptInvitationForm";

interface PageProps {
  params: Promise<{ token: string }>;
}

interface InvitationContext {
  valid: true;
  tenantName: string;
  email: string;
  displayName: string | null;
  roleHint: string | null;
}

interface InvitationError {
  valid: false;
  reason:
    | "invalid_token"
    | "not_found"
    | "expired"
    | "revoked"
    | "already_accepted"
    | "server_error";
}

async function loadInvitation(token: string): Promise<InvitationContext | InvitationError> {
  if (!token || !/^[0-9a-f]{64}$/i.test(token)) {
    return { valid: false, reason: "invalid_token" };
  }

  const admin = createAdminClient();

  const { data: inv, error } = await admin
    .from("employee_invitation")
    .select("id, tenant_id, email, display_name, role_hint, status, expires_at")
    .eq("invitation_token", token)
    .maybeSingle();

  if (error) {
    return { valid: false, reason: "server_error" };
  }

  if (!inv) {
    return { valid: false, reason: "not_found" };
  }

  if (inv.status === "accepted") {
    return { valid: false, reason: "already_accepted" };
  }

  if (inv.status === "revoked") {
    return { valid: false, reason: "revoked" };
  }

  if (new Date(inv.expires_at).getTime() < Date.now() || inv.status === "expired") {
    return { valid: false, reason: "expired" };
  }

  const { data: tenant } = await admin
    .from("tenants")
    .select("name")
    .eq("id", inv.tenant_id)
    .single();

  return {
    valid: true,
    tenantName: tenant?.name ?? "StrategAIze",
    email: inv.email,
    displayName: inv.display_name,
    roleHint: inv.role_hint,
  };
}

function ErrorCard({ reason }: { reason: InvitationError["reason"] }) {
  const messages: Record<InvitationError["reason"], { title: string; description: string }> = {
    invalid_token: {
      title: "Ungültiger Einladungslink",
      description:
        "Der Link ist nicht korrekt aufgebaut. Bitte prüfe, ob du ihn vollständig kopiert hast, oder wende dich an deinen Administrator.",
    },
    not_found: {
      title: "Einladung nicht gefunden",
      description:
        "Diese Einladung existiert nicht. Bitte wende dich an deinen Administrator.",
    },
    expired: {
      title: "Einladung abgelaufen",
      description:
        "Dieser Einladungslink ist abgelaufen. Bitte wende dich an deinen Administrator, um eine neue Einladung zu erhalten.",
    },
    revoked: {
      title: "Einladung widerrufen",
      description:
        "Diese Einladung wurde widerrufen. Bitte wende dich an deinen Administrator.",
    },
    already_accepted: {
      title: "Einladung bereits angenommen",
      description:
        "Diese Einladung wurde bereits angenommen. Bitte logge dich direkt ein.",
    },
    server_error: {
      title: "Serverfehler",
      description:
        "Beim Laden der Einladung ist ein Fehler aufgetreten. Bitte versuche es in Kürze erneut.",
    },
  };
  const m = messages[reason];

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="relative w-full max-w-md overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-red-600 to-red-400" />
        <CardHeader className="pt-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-full.png" alt="StrategAIze" className="mx-auto mb-2 h-12 w-auto" />
          <CardTitle className="text-2xl text-slate-900">{m.title}</CardTitle>
          <CardDescription>{m.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mt-6 text-center text-xs text-slate-400">
            Keine Navigation moeglich — Einladungslinks sind einmalig.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function AcceptInvitationPage({ params }: PageProps) {
  const { token } = await params;
  const ctx = await loadInvitation(token);

  if (!ctx.valid) {
    return <ErrorCard reason={ctx.reason} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="relative w-full max-w-md overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-primary-dark to-brand-primary" />
        <CardHeader className="pt-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-full.png" alt="StrategAIze" className="mx-auto mb-2 h-12 w-auto" />
          <CardTitle className="text-2xl text-slate-900">Einladung annehmen</CardTitle>
          <CardDescription>
            {ctx.displayName ? `Hallo ${ctx.displayName}, ` : ""}
            du wurdest eingeladen als Mitarbeiter bei <strong>{ctx.tenantName}</strong>.
            {ctx.roleHint ? <> Vorgesehene Rolle: <strong>{ctx.roleHint}</strong>.</> : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-slate-600">
            Deine E-Mail: <strong>{ctx.email}</strong>
          </p>
          <AcceptInvitationForm token={token} />
        </CardContent>
      </Card>
    </div>
  );
}
