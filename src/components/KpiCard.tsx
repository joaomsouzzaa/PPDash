import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
}

export function KpiCard({ title, value, change, changeType = "neutral", icon: Icon, iconColor }: KpiCardProps) {
  return (
    <div className="kpi-card rounded-xl border border-border border-l-[3px] border-l-primary/40 bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="kpi-title text-sm text-muted-foreground font-medium">{title}</p>
          <p className="kpi-value text-2xl font-bold tracking-tight text-card-foreground">{value}</p>
          {change && (
            <p
              className={cn(
                "text-xs font-medium",
                changeType === "positive" && "text-[hsl(var(--success))]",
                changeType === "negative" && "text-destructive",
                changeType === "neutral" && "text-muted-foreground"
              )}
            >
              {change}
            </p>
          )}
        </div>
        <div
          className={cn(
            "kpi-icon-wrap flex h-10 w-10 items-center justify-center rounded-lg",
            iconColor || "bg-primary/10 text-primary"
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
