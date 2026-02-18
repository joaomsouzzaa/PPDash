interface FunnelStep {
  label: string;
  value: string;
  count: number | null;
  conversionLabel: string | null;
}

interface SalesFunnelProps {
  steps: FunnelStep[];
}

const NEON_COLORS = [
  { bg: "from-[#FFE135] to-[#FFD000]", glow: "rgba(255,225,53,0.4)", text: "#1a1a2e" },
  { bg: "from-[#FF2D75] to-[#FF1493]", glow: "rgba(255,45,117,0.4)", text: "#fff" },
  { bg: "from-[#00BFFF] to-[#1E90FF]", glow: "rgba(0,191,255,0.4)", text: "#fff" },
  { bg: "from-[#39FF14] to-[#32CD32]", glow: "rgba(57,255,20,0.4)", text: "#1a1a2e" },
  { bg: "from-[#FF6F00] to-[#FF8C00]", glow: "rgba(255,111,0,0.4)", text: "#fff" },
  { bg: "from-[#BF40BF] to-[#9B30FF]", glow: "rgba(155,48,255,0.4)", text: "#fff" },
  { bg: "from-[#FF2D75] to-[#FF69B4]", glow: "rgba(255,45,117,0.3)", text: "#fff" },
  { bg: "from-[#00CED1] to-[#20B2AA]", glow: "rgba(0,206,209,0.4)", text: "#1a1a2e" },
  { bg: "from-[#FFD700] to-[#FFA500]", glow: "rgba(255,215,0,0.4)", text: "#1a1a2e" },
];

function calcConversionPercent(current: number | null, previous: number | null): string {
  if (current === null || previous === null || previous === 0) return "0%";
  return `${((current / previous) * 100).toFixed(1)}%`;
}

export function SalesFunnel({ steps }: SalesFunnelProps) {
  const totalSteps = steps.length;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-base font-semibold text-card-foreground mb-8">
        Funil de Conversão
      </h3>
      <div className="relative flex flex-col items-center">
        {steps.map((step, index) => {
          const color = NEON_COLORS[index % NEON_COLORS.length];
          const widthPercent = 100 - (index / Math.max(totalSteps - 1, 1)) * 70;
          const isLast = index === totalSteps - 1;
          const isFirst = index === 0;

          // Conversion from previous step
          const showConversion = index > 0 && step.conversionLabel !== null;
          const prevStep = index > 0 ? steps[index - 1] : null;
          const conversionPercent = showConversion ? calcConversionPercent(step.count, prevStep?.count ?? null) : null;

          return (
            <div
              key={step.label}
              className="relative flex items-center w-full"
              style={{ justifyContent: "center" }}
            >
              {/* Funnel segment */}
              <div
                className={`relative bg-gradient-to-b ${color.bg} flex flex-col items-center justify-center transition-all`}
                style={{
                  width: `${widthPercent}%`,
                  minWidth: "140px",
                  height: "100px",
                  clipPath: isLast
                    ? `polygon(0% 0%, 100% 0%, 85% 100%, 15% 100%)`
                    : `polygon(0% 0%, 100% 0%, ${100 - ((1 / Math.max(totalSteps - 1, 1)) * 35)}% 100%, ${(1 / Math.max(totalSteps - 1, 1)) * 35}% 100%)`,
                  borderRadius: isFirst ? "16px 16px 0 0" : "0",
                  boxShadow: `0 4px 20px ${color.glow}, inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.2)`,
                  marginBottom: "-2px",
                }}
              >
                {/* 3D highlight strip */}
                <div
                  className="absolute top-0 left-0 right-0 h-[6px] rounded-t-md"
                  style={{
                    background: "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 100%)",
                    borderRadius: isFirst ? "16px 16px 0 0" : "0",
                  }}
                />
                <span
                  className="text-[11px] font-bold uppercase tracking-widest drop-shadow-sm"
                  style={{ color: color.text }}
                >
                  {step.label}
                </span>
                <span
                  className="text-xl font-extrabold drop-shadow-md mt-0.5"
                  style={{ color: color.text }}
                >
                  {step.value}
                </span>
              </div>

              {/* Conversion percentage on the right */}
              {showConversion && conversionPercent && (
                <div
                  className="absolute flex items-center gap-2"
                  style={{
                    left: `calc(50% + ${widthPercent / 2}% + 12px)`,
                    top: "50%",
                    transform: "translateY(-50%)",
                  }}
                >
                  <div className="h-[1px] w-5 bg-muted-foreground/40" />
                  <div className="flex flex-col items-start">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {step.conversionLabel}
                    </span>
                    <span className="text-sm font-bold text-[hsl(var(--success))]">
                      {conversionPercent}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Bottom spout */}
        <div
          className="w-4 h-6 rounded-b-full"
          style={{
            background: "linear-gradient(180deg, hsl(var(--muted)) 0%, transparent 100%)",
          }}
        />
      </div>
    </div>
  );
}
