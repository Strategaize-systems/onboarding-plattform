import { PartnerSidebar } from "@/components/partner/PartnerSidebar";

interface Props {
  email?: string;
  partnerDisplayName?: string;
  children: React.ReactNode;
}

/**
 * V6 SLC-102 MT-4 — Partner-Shell (analog EmployeeShell / TenantAdminShell).
 *
 * Persistent linke Sidebar (lg+, 280px) plus scrollbarer Main-Bereich. Footer
 * "Powered by Strategaize" als minimaler Stub fuer SLC-104 (Server-Component-
 * Variante mit i18n-Lookup wird dort eingefuegt).
 */
export function PartnerShell({ email, partnerDisplayName, children }: Props) {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <aside className="hidden lg:block w-[280px] flex-shrink-0">
        <PartnerSidebar email={email} partnerDisplayName={partnerDisplayName} />
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col">
          <div className="flex-1">{children}</div>
          <footer className="mt-8 border-t border-slate-200 bg-white px-6 py-4 text-center text-xs text-slate-400">
            Powered by Strategaize
          </footer>
        </div>
      </main>
    </div>
  );
}
