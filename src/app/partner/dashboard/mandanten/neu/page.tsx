import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { InviteMandantForm } from "./InviteMandantForm";

/**
 * V6 SLC-103 MT-5 — Mandanten-Einladungs-Form (partner_admin).
 *
 * Server-Component fuer Auth-Gate (Defense-in-Depth). Form ist Client-Component
 * mit native HTML + useTransition.
 */

export default async function PartnerMandantenNewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "partner_admin" || !profile.tenant_id) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">
      <div>
        <Link
          href="/partner/dashboard/mandanten"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurueck zur Mandanten-Liste
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-slate-900">
          Mandant einladen
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Lege einen neuen Mandanten-Zugang an und sende einen Magic-Link an die
          Geschaeftsleitung.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mandanten-Stammdaten</CardTitle>
          <CardDescription>
            Pflichtfelder fuer die Einladung. Der Mandant kann seine Angaben
            spaeter selbst ergaenzen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteMandantForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Was passiert danach?</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
            <li>
              Wir legen einen Mandanten-Zugang an und erzeugen einen
              Magic-Link.
            </li>
            <li>
              Wir versenden den Magic-Link an die hinterlegte E-Mail. Der
              Mandant klickt den Link, vergibt ein Passwort und gelangt in sein
              Diagnose-Werkzeug.
            </li>
            <li>
              Sobald der Mandant die Diagnose abschliesst, siehst du den
              Bericht in deinem Partner-Bereich (verfuegbar mit dem naechsten
              Update).
            </li>
          </ol>
        </CardContent>
        <CardContent>
          <Link href="/partner/dashboard/mandanten">
            <Button variant="outline" size="sm">
              Abbrechen
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
