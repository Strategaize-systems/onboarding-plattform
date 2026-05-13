import { PartnerSidebar } from "@/components/partner/PartnerSidebar";

interface Props {
  email?: string;
  partnerDisplayName?: string;
  children: React.ReactNode;
}

export function PartnerShell({ email, partnerDisplayName, children }: Props) {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <aside className="hidden lg:block w-[280px] flex-shrink-0">
        <PartnerSidebar email={email} partnerDisplayName={partnerDisplayName} />
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
