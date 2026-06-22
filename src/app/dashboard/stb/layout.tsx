import { redirect } from "next/navigation";

import { isStbVerticalEnabled } from "@/lib/stb-vertikale/feature-gate";

// Route-Group-Guard fuer die V10 StB-Vertikale (DEC-239, SLC-171 MT-2).
// Auth ist bereits durch die /dashboard-Middleware abgedeckt; dieses Layout
// ergaenzt nur das Feature-Gate: bei OFF (Default) ist /dashboard/stb/* nicht
// erreichbar -> Redirect auf das Standard-Dashboard. Der Reader (SLC-175)
// haengt seine Seiten unter diese Gruppe und erbt das Gate automatisch.
export default function StbLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isStbVerticalEnabled()) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
