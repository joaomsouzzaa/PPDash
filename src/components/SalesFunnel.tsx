interface FunnelStep {
  label: string;
  value: string;
  count: number | null;
  conversionLabel: string | null;
}

interface SalesFunnelProps {
  steps: FunnelStep[];
}

// Tom sobre tom: vermelho do painel, do mais vivo (topo) ao mais escuro (fundo).
const NEON_COLORS = [
  { bg: "from-[#ff4d5e] to-[#e11d2a]", glow: "rgba(225,29,42,0.20)", text: "#fff" },
  { bg: "from-[#e83440] to-[#c01622]", glow: "rgba(192,22,34,0.18)", text: "#fff" },
  { bg: "from-[#cc1d29] to-[#a3121d]", glow: "rgba(163,18,29,0.18)", text: "#fff" },
  { bg: "from-[#b01620] to-[#861019]", glow: "rgba(134,16,25,0.16)", text: "#fff" },
  { bg: "from-[#8f1119] to-[#6b0d14]", glow: "rgba(107,13,20,0.16)", text: "#fff" },
  { bg: "from-[#6e0d14] to-[#520a0f]", glow: "rgba(82,10,15,0.16)", text: "#fff" },
  { bg: "from-[#520a10] to-[#3a070b]", glow: "rgba(58,7,11,0.16)", text: "#fff" },
  { bg: "from-[#3a070b] to-[#260508]", glow: "rgba(38,5,8,0.16)", text: "#fff" },
  { bg: "from-[#260508] to-[#160304]", glow: "rgba(22,3,4,0.16)", text: "#fff" },
];

function calcConversionPercent(current: number | null, previous: number | null): string {
  if (current === null || previous === null || previous === 0) return "0%";
  return `${((current / previous) * 100).toFixed(1)}%`;
}

export function SalesFunnel({ steps }: SalesFunnelProps) {
  const totalSteps = steps.length;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-base font-semibold text-card-foreground mb-4">
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
                  height: "62px",
                  clipPath: isLast
                    ? `polygon(0% 0%, 100% 0%, 85% 100%, 15% 100%)`
                    : `polygon(0% 0%, 100% 0%, ${100 - ((1 / Math.max(totalSteps - 1, 1)) * 35)}% 100%, ${(1 / Math.max(totalSteps - 1, 1)) * 35}% 100%)`,
                  borderRadius: isFirst ? "16px 16px 0 0" : "0",
                  boxShadow: `0 4px 16px ${color.glow}, inset 0 1px 2px rgba(255,255,255,0.12), inset 0 -2px 4px rgba(0,0,0,0.3)`,
                  marginBottom: "-2px",
                }}
              >
                {/* 3D highlight strip */}
                <div
                  className="absolute top-0 left-0 right-0 h-[6px] rounded-t-md"
                  style={{
                    background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 100%)",
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
                  className="text-base font-extrabold drop-shadow-md"
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
