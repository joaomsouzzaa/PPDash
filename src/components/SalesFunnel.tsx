interface FunnelStep {
  label: string;
  value: string;
  sublabel?: string;
}

interface SalesFunnelProps {
  steps: FunnelStep[];
}

export function SalesFunnel({ steps }: SalesFunnelProps) {
  const totalSteps = steps.length;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-base font-semibold text-card-foreground mb-6">
        Funil de Conversão
      </h3>
      <div className="flex flex-col items-center gap-0">
        {steps.map((step, index) => {
          // Width decreases from 100% to ~35% as we go down
          const widthPercent = 100 - (index / Math.max(totalSteps - 1, 1)) * 65;
          // Opacity increases slightly for depth effect
          const bgOpacity = 0.08 + (index / totalSteps) * 0.12;

          return (
            <div
              key={step.label}
              className="relative flex flex-col items-center justify-center py-3 transition-all"
              style={{
                width: `${widthPercent}%`,
                minWidth: "180px",
                background: `linear-gradient(180deg, hsl(var(--muted) / ${bgOpacity}) 0%, hsl(var(--muted) / ${bgOpacity + 0.05}) 100%)`,
                borderLeft: "2px solid hsl(var(--border))",
                borderRight: "2px solid hsl(var(--border))",
                borderTop: index === 0 ? "2px solid hsl(var(--border))" : "1px solid hsl(var(--border) / 0.5)",
                borderBottom: index === totalSteps - 1 ? "2px solid hsl(var(--border))" : "none",
                borderRadius:
                  index === 0
                    ? "12px 12px 0 0"
                    : index === totalSteps - 1
                    ? "0 0 12px 12px"
                    : "0",
              }}
            >
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {step.label}
              </span>
              <span className="text-lg font-bold text-primary mt-0.5">
                {step.value}
              </span>
              {step.sublabel && (
                <span className="text-xs text-muted-foreground">{step.sublabel}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
