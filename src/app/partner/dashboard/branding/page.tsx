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
 * V6 SLC-102 MT-4 — Stub fuer Branding-Verwaltung.
 *
 * Die Branding-UI (Logo + Primaerfarbe + Live-Preview + CSS-Custom-Properties)
 * kommt mit SLC-104 (FEAT-044). In V6 SLC-102 zeigt diese Page nur einen
 * Coming-Soon-Hinweis + Link zurueck zum Dashboard.
 */
export default function PartnerBrandingStubPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>
            Eigenes Branding fuer Mandanten-Sichten kommt mit dem naechsten
            Update.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            Du wirst dann ein eigenes Logo + eine Primaerfarbe hinterlegen
            koennen, die Mandanten in ihrer Onboarding-Sicht sehen.
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
