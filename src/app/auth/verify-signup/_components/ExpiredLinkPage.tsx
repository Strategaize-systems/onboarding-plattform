/**
 * V7 SLC-133 MT-3 — Branch "Bestaetigungslink abgelaufen".
 * Mandant muss Signup ueber die Partner-Landing-Page wiederholen (kein
 * Re-Send-Button in V7 per Slice Out-of-Scope, V8+ UX-Erweiterung).
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ExpiredLinkPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="relative w-full max-w-md overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-500 to-amber-300" />
        <CardHeader className="pt-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-full.png"
            alt="StrategAIze"
            className="mx-auto mb-2 h-12 w-auto"
          />
          <CardTitle className="text-2xl text-slate-900">
            Bestätigungslink abgelaufen
          </CardTitle>
          <CardDescription>
            Der Bestätigungslink ist 24 Stunden gültig und kann jetzt nicht
            mehr verwendet werden.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-8">
          <p className="text-sm text-slate-700">
            Bitte rufen Sie die Anmeldeseite Ihrer Partner-Kanzlei erneut auf
            und starten Sie den Signup-Prozess von vorne. Sie erhalten dann
            eine neue Bestätigungsmail mit gültigem Link.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
