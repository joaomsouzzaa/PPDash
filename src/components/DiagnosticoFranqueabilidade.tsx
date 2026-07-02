import { CheckCircle2, TrendingUp, Target, CalendarClock } from "lucide-react";

// Relatório do Diagnóstico de Franqueabilidade (schema de saída da IA).
// Reutilizado na tela final do respondente e na aba Resultados do admin.

export type ScorePorPilar = { pilar: string; pct: number };
export type Score = { score_geral_pct: number; score_por_pilar: ScorePorPilar[] };

export type AnaliseDiagnostico = {
  resumo_executivo?: string;
  pontos_fortes?: { ponto: string; por_que_importa: string }[];
  ajustes_prioritarios?: {
    pilar: string;
    diagnostico: string;
    importancia_estruturacao: string;
    acoes: string[];
  }[];
  plano_de_acao?: { curto_prazo_30_dias?: string[]; medio_prazo_90_dias?: string[] };
  mensagem_fechamento?: string;
};

function Prontidao({ pct }: { pct: number }) {
  return (
    <div className="text-center">
      <div className="text-5xl font-bold text-primary">{pct}%</div>
      <p className="text-muted-foreground">pronto pra virar franquia</p>
    </div>
  );
}

function BarraPilar({ pilar, pct }: ScorePorPilar) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{pilar}</span>
        <span className="font-medium text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}

export function DiagnosticoFranqueabilidade({
  analise,
  score,
  className,
}: {
  analise: AnaliseDiagnostico | null;
  score: Score | null;
  className?: string;
}) {
  const pct = score?.score_geral_pct ?? 0;
  const pilares = score?.score_por_pilar ?? [];

  return (
    <div className={`w-full space-y-6 text-left ${className ?? ""}`}>
      <div className="rounded-xl border border-border bg-background p-6 space-y-4">
        <Prontidao pct={pct} />
        {pilares.length > 0 && (
          <div className="space-y-3 pt-2">
            {pilares.map((p) => <BarraPilar key={p.pilar} {...p} />)}
          </div>
        )}
      </div>

      {/* Sem análise da IA (fallback): mostra só a prontidão acima. */}
      {!analise ? null : (
        <>
          {analise.resumo_executivo && (
            <p className="text-muted-foreground leading-relaxed">{analise.resumo_executivo}</p>
          )}

          {!!analise.pontos_fortes?.length && (
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 font-semibold"><TrendingUp className="h-4 w-4 text-primary" /> Pontos fortes</h3>
              {analise.pontos_fortes.map((pf, i) => (
                <div key={i} className="rounded-lg border border-border bg-background p-4">
                  <p className="font-medium">{pf.ponto}</p>
                  <p className="text-sm text-muted-foreground mt-1">{pf.por_que_importa}</p>
                </div>
              ))}
            </section>
          )}

          {!!analise.ajustes_prioritarios?.length && (
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 font-semibold"><Target className="h-4 w-4 text-primary" /> Ajustes prioritários</h3>
              {analise.ajustes_prioritarios.map((aj, i) => (
                <div key={i} className="rounded-lg border border-border bg-background p-4 space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-primary">{aj.pilar}</div>
                  <p className="text-sm">{aj.diagnostico}</p>
                  <p className="text-sm text-muted-foreground">{aj.importancia_estruturacao}</p>
                  {!!aj.acoes?.length && (
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      {aj.acoes.map((a, j) => <li key={j}>{a}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          )}

          {(analise.plano_de_acao?.curto_prazo_30_dias?.length || analise.plano_de_acao?.medio_prazo_90_dias?.length) && (
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4 text-primary" /> Plano de ação</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {!!analise.plano_de_acao?.curto_prazo_30_dias?.length && (
                  <div className="rounded-lg border border-border bg-background p-4">
                    <p className="font-medium mb-2">Próximos 30 dias</p>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      {analise.plano_de_acao.curto_prazo_30_dias.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
                {!!analise.plano_de_acao?.medio_prazo_90_dias?.length && (
                  <div className="rounded-lg border border-border bg-background p-4">
                    <p className="font-medium mb-2">Próximos 90 dias</p>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      {analise.plano_de_acao.medio_prazo_90_dias.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {analise.mensagem_fechamento && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed">{analise.mensagem_fechamento}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
