import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        "gradient-success":
          "border-transparent bg-gradient-to-r from-brand-success-dark to-brand-success text-white shadow-[0_4px_6px_rgba(0,168,79,0.2)]",
        "gradient-warning":
          "border-transparent bg-gradient-to-r from-brand-warning-dark to-brand-warning text-slate-900 shadow-[0_4px_6px_rgba(242,183,5,0.2)]",
        "gradient-primary":
          "border-transparent bg-gradient-to-r from-brand-primary-dark to-brand-primary text-white shadow-[0_4px_6px_rgba(68,84,184,0.2)]",
        neutral:
          "bg-slate-100 text-slate-600 border-slate-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
