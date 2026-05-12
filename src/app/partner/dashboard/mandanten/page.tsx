import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * V6 SLC-102 MT-4 — Stub fuer Mandanten-Verwaltung.
 *
 * Die volle Mandanten-Einladungs-UI kommt mit SLC-103 (FEAT-043). In V6
 * SLC-102 zeigt diese Page nur einen Coming-Soon-Hinweis + Link zurueck zum
 * Dashboard.
 */
export default function PartnerMandantenStubPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Meine Mandanten</CardTitle>
          <CardDescription>
            Mandanten-Einladungen werden mit dem naechsten Update freigeschaltet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            Du kannst dann pro Mandant einen Magic-Link an die
            Geschaeftsleitung verschicken und den Status der Wissenserhebung
            verfolgen.
          </p>
          <div className="mt-6">
            <Link href="/partner/dashboard">
              <Button variant="outline">Zurueck zum Dashboard</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
