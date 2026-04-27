import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  href: string;
  tone?: "default" | "warning" | "success";
}

const TONE_CLASS: Record<NonNullable<Props["tone"]>, string> = {
  default: "border-slate-200",
  warning: "border-amber-300 bg-amber-50/40",
  success: "border-green-300 bg-green-50/40",
};

export function MetricCard({ icon: Icon, label, value, hint, href, tone = "default" }: Props) {
  return (
    <Link href={href} className="group">
      <Card
        className={`h-full border ${TONE_CLASS[tone]} transition-shadow hover:shadow-md`}
      >
        <CardContent className="flex h-full flex-col gap-2 py-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 group-hover:text-brand-primary-dark">
            <Icon className="h-3.5 w-3.5" />
            {label}
          </div>
          <div className="text-2xl font-bold text-slate-900">{value}</div>
          {hint && <div className="text-xs text-slate-500">{hint}</div>}
        </CardContent>
      </Card>
    </Link>
  );
}
