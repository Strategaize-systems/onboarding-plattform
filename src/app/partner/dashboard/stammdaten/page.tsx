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
 * V6 SLC-102 MT-4 — Stub fuer Stammdaten-Edit.
 *
 * Die Edit-UI fuer partner_admin (display_name, contact_email, contact_phone)
 * kommt mit MT-5 dieses Slices. In MT-4 zeigt diese Page nur einen
 * Coming-Soon-Hinweis + Link zurueck zum Dashboard, damit die Sidebar-
 * Navigation auf "Stammdaten" keinen 404 erzeugt.
 *
 * Wird in MT-5 vollstaendig durch ein Edit-Formular (updatePartnerStammdaten)
 * ersetzt.
 */
export default function PartnerStammdatenStubPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Stammdaten bearbeiten</CardTitle>
          <CardDescription>
            Stammdaten-Bearbeitung wird im naechsten Schritt aktiviert.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            Du wirst Anzeigename, Kontakt-E-Mail und Telefon aktualisieren
            koennen. Rechtlicher Name und Land werden weiterhin von Strategaize
            zentral gepflegt.
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
