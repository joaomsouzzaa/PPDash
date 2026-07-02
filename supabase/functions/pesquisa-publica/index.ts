import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Endpoint PÚBLICO das Pesquisas (estilo Typeform).
// Respondentes não têm conta, então usamos o service_role (ignora RLS) e
// resolvemos a org pelo slug recebido. Ações (POST { acao, ... }):
//  - acao: "get"         { slug, org }                 -> pesquisa publicada + perguntas
//  - acao: "enviar"      { slug, org, respostas }      -> grava em pesquisa_respostas (+ score) e devolve o id
//  - acao: "diagnostico" { slug, org, resposta_id }    -> gera (ou devolve em cache) o relatório de IA
// Só aceita pesquisas com status = 'publicada'.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-slug",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Resolve o org_id pelo slug da organização (sem exigir login).
async function resolveOrgId(supabase: any, orgSlug: string | null): Promise<string | null> {
  if (!orgSlug) return null;
  const { data } = await supabase.from("organizations").select("id").eq("slug", orgSlug).maybeSingle();
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// Score determinístico (a IA nunca recalcula — só recebe o resultado pronto).
// Uma pergunta conta quando alguma de suas opções tem `pontos` numérico.
// ---------------------------------------------------------------------------
const PILARES = [
  "Maturidade & validação",
  "Rentabilidade",
  "Padronização & replicabilidade",
  "Independência do fundador",
  "Marca & jurídico",
  "Transmissibilidade do know-how",
  "Mercado & escalabilidade",
  "Capacidade de investimento",
];

function opcoesDaPergunta(p: any): any[] {
  if (p.tipo === "sim_nao") return [{ id: "sim", label: "Sim" }, { id: "nao", label: "Não" }];
  return p.opcoes || [];
}
const temPonto = (o: any) => typeof o?.pontos === "number";
const maxDaPergunta = (p: any) => Math.max(0, ...opcoesDaPergunta(p).map((o: any) => (temPonto(o) ? o.pontos : 0)));
const escolhidaDe = (p: any, respostas: Record<string, any>) => opcoesDaPergunta(p).find((o: any) => o.id === respostas?.[p.id]);
const pontosEscolhidos = (p: any, respostas: Record<string, any>) => {
  const e = escolhidaDe(p, respostas);
  return e && temPonto(e) ? (e.pontos as number) : 0;
};

function calcularScore(perguntas: any[], respostas: Record<string, any>) {
  const pontuadas = perguntas.filter((p) => opcoesDaPergunta(p).some(temPonto));
  const maxTotal = pontuadas.reduce((acc, p) => acc + maxDaPergunta(p), 0);
  const total = pontuadas.reduce((acc, p) => acc + pontosEscolhidos(p, respostas), 0);
  const score_geral_pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;

  const score_por_pilar = PILARES.map((pilar) => {
    const doPilar = pontuadas.filter((p) => (p.pilar || "").trim() === pilar);
    const max = doPilar.reduce((acc, p) => acc + maxDaPergunta(p), 0);
    if (max === 0) return null;
    const soma = doPilar.reduce((acc, p) => acc + pontosEscolhidos(p, respostas), 0);
    return { pilar, pct: Math.round((soma / max) * 100) };
  }).filter(Boolean) as { pilar: string; pct: number }[];

  return { score_geral_pct, score_por_pilar };
}

// ---------------------------------------------------------------------------
// Resolução da chave de IA por org (mesmo padrão de scraping-prospect), mas
// forçando o modelo Sonnet para o diagnóstico. Só usa provider anthropic.
// ---------------------------------------------------------------------------
const MODELO_SONNET = "claude-sonnet-4-6";

async function anthropicKey(supabase: any, orgId: string | null): Promise<string> {
  if (orgId) {
    const { data } = await supabase.from("ai_config").select("api_key").eq("org_id", orgId).eq("provider", "anthropic").maybeSingle();
    if (data?.api_key) return data.api_key;
  }
  const { data } = await supabase.from("ai_config").select("api_key").eq("provider", "anthropic").limit(1);
  if (data?.[0]?.api_key) return data[0].api_key;
  const env = Deno.env.get("ANTHROPIC_API_KEY");
  if (env) return env;
  throw new Error("Nenhuma chave Anthropic configurada (ai_config ou ANTHROPIC_API_KEY)");
}

const SYSTEM_PROMPT = `Você é um consultor sênior de estruturação de franquias, especialista em avaliar negócios independentes e apontar o que falta para se tornarem redes franqueáveis dentro da legislação brasileira (Lei 13.966/2019).

Você vai receber as respostas de um diagnóstico de franqueabilidade de 14 perguntas, já pontuadas (0 a 3) e agrupadas em 8 pilares: Maturidade & validação, Rentabilidade, Padronização & replicabilidade, Independência do fundador, Marca & jurídico, Transmissibilidade do know-how, Mercado & escalabilidade, Capacidade de investimento.
Você também recebe o Instagram da marca — use-o para situar segmento, posicionamento e vocabulário, e para que a análise soe como se conhecesse o negócio de verdade, não como um relatório genérico com o nome trocado.

REGRA DE FRAMING — não é negociável:
O score é sempre comunicado como "X% pronto pra virar franquia", nunca como um veredito de aptidão ou reprovação. Não existe negócio "não pronto": existe negócio em um ponto do caminho, com um plano claro pro trecho que falta. Evite qualquer linguagem de bloqueio, impedimento ou "ainda não é o momento". Cada ponto de atenção é um ajuste dentro de um plano, nunca um obstáculo.

REGRA DE PROFUNDIDADE — o relatório é consultoria, não checklist:
Para cada ajuste prioritário, não basta descrever o problema e sugerir uma ação. É preciso explicar a importância real de estruturar aquele ponto — o risco de negócio, jurídico ou financeiro de deixá-lo sem estrutura, e o que se destrava quando ele é resolvido. Pense como um consultor explicando para um investidor por que aquele pilar importa, não como uma lista de tarefas.

Sua tarefa é gerar uma análise personalizada — nunca genérica. Toda afirmação sobre o negócio precisa se conectar diretamente com a resposta específica que a pessoa deu. Não repita a pergunta, interprete o que a resposta revela sobre o negócio real.

Regras adicionais:
- Escreva em português do Brasil, tom profissional e consultivo — direto, mas sem soar casual ou motivacional. É o relatório que a pessoa mostra pro sócio ou pro banco, não uma mensagem de WhatsApp.
- Priorize os 2 a 3 pilares com pior desempenho relativo (não trate todos como igualmente urgentes — hierarquize).
- Reconheça pontos fortes reais antes de ir para os ajustes — e explique por que aquilo é um ativo de negócio, não um elogio solto.
- Nunca inclua o número de pontos ou a pergunta original no texto — fale do negócio, não do formulário.
- A mensagem de fechamento reforça que o caminho até 100% é conhecido e conduzido, sem soar como discurso de vendas.
- Responda apenas com o JSON no formato especificado, sem texto fora do JSON.

Formato do JSON de saída:
{
  "resumo_executivo": "3-4 frases: o estágio atual da marca, reconhecendo o que ela já construiu (usando o contexto do Instagram), e situando o score como ponto de partida de um plano — nunca como veredito",
  "pontos_fortes": [ { "ponto": "string", "por_que_importa": "por que isso é um ativo real pra uma franquia, não só um elogio" } ],
  "ajustes_prioritarios": [ { "pilar": "string", "diagnostico": "o que a resposta específica da pessoa revela sobre o negócio", "importancia_estruturacao": "por que formalizar/estruturar esse ponto importa de fato — risco de negócio, jurídico ou financeiro de deixar sem estrutura, e o que isso destrava quando resolvido", "acoes": ["ação concreta 1", "ação concreta 2"] } ],
  "plano_de_acao": { "curto_prazo_30_dias": ["string"], "medio_prazo_90_dias": ["string"] },
  "mensagem_fechamento": "reforça que o caminho até 100% é conhecido e conduzido, gancho pro agendamento sem tom de vendas"
}`;

// Monta o schema de entrada da IA a partir das perguntas + respostas.
function montarEntrada(pesquisa: any, perguntas: any[], respostas: Record<string, any>, score: any) {
  const porCampo = (campo: string) => {
    const p = perguntas.find((q) => (q.campo || "") === campo);
    if (!p) return "";
    const bruto = respostas?.[p.id];
    const op = opcoesDaPergunta(p).find((o: any) => o.id === bruto);
    return op ? op.label : (bruto ?? "");
  };

  const respostasFmt = perguntas
    .filter((p) => opcoesDaPergunta(p).some(temPonto))
    .map((p) => {
      const e = escolhidaDe(p, respostas);
      return { pergunta: p.titulo, resposta_escolhida: e?.label ?? "", pontos: e && temPonto(e) ? e.pontos : 0, pilar: p.pilar || null };
    });

  return {
    nome: porCampo("nome"),
    negocio: porCampo("negocio") || pesquisa.titulo || "",
    instagram_handle: porCampo("instagram"),
    segmento: porCampo("segmento"),
    faturamento_faixa: porCampo("faturamento"),
    respostas: respostasFmt,
    score_geral_pct: score.score_geral_pct,
    score_por_pilar: score.score_por_pilar,
  };
}

async function gerarAnalise(apiKey: string, entrada: unknown): Promise<any> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO_SONNET,
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(entrada) }],
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "Erro Anthropic");
  const texto = (j.content || []).map((c: any) => c.text).join("");
  // Extrai o primeiro bloco JSON, tolerando cercas ```json.
  const limpo = texto.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const inicio = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  return JSON.parse(inicio >= 0 && fim >= 0 ? limpo.slice(inicio, fim + 1) : limpo);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "método não suportado" }, 405);

  try {
    const supabase = svc();
    const body = await req.json().catch(() => ({}));
    const acao = body?.acao as string | undefined;
    const slug = body?.slug as string | undefined;
    const orgSlug = (body?.org as string | undefined) || req.headers.get("x-org-slug");

    if (!slug) return json({ error: "slug ausente" }, 400);
    const orgId = await resolveOrgId(supabase, orgSlug);
    if (!orgId) return json({ error: "org não encontrada" }, 404);

    const { data: pesquisa } = await supabase
      .from("pesquisas")
      .select("id, titulo, descricao, status, config")
      .eq("org_id", orgId)
      .eq("slug", slug)
      .maybeSingle();
    if (!pesquisa || pesquisa.status !== "publicada") return json({ error: "pesquisa não disponível" }, 404);

    // Perguntas (usadas por get, enviar e diagnostico).
    const { data: perguntas } = await supabase
      .from("pesquisa_perguntas")
      .select("id, ordem, titulo, descricao, tipo, obrigatoria, opcoes, logica, pilar, campo")
      .eq("pesquisa_id", pesquisa.id)
      .order("ordem", { ascending: true });
    const listaPerguntas = perguntas || [];

    if (acao === "get") {
      return json({
        pesquisa: { id: pesquisa.id, titulo: pesquisa.titulo, descricao: pesquisa.descricao, config: pesquisa.config ?? {} },
        perguntas: listaPerguntas,
      });
    }

    if (acao === "enviar") {
      const respostas = body?.respostas ?? {};
      const score = calcularScore(listaPerguntas, respostas);
      const { data: inserida, error } = await supabase
        .from("pesquisa_respostas")
        .insert({ org_id: orgId, pesquisa_id: pesquisa.id, respostas, score })
        .select("id")
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, resposta_id: inserida.id, score });
    }

    if (acao === "diagnostico") {
      const respostaId = body?.resposta_id as string | undefined;
      if (!respostaId) return json({ error: "resposta_id ausente" }, 400);

      const { data: resp } = await supabase
        .from("pesquisa_respostas")
        .select("id, respostas, score, analise, analise_status")
        .eq("id", respostaId)
        .eq("pesquisa_id", pesquisa.id)
        .maybeSingle();
      if (!resp) return json({ error: "resposta não encontrada" }, 404);

      const score = resp.score ?? calcularScore(listaPerguntas, resp.respostas || {});

      // Cache: se já foi gerada, devolve sem chamar a IA de novo.
      const forcar = body?.forcar === true;
      if (!forcar && resp.analise_status === "gerada" && resp.analise) {
        return json({ ok: true, analise: resp.analise, score });
      }

      try {
        const apiKey = await anthropicKey(supabase, orgId);
        const entrada = montarEntrada(pesquisa, listaPerguntas, resp.respostas || {}, score);
        const analise = await gerarAnalise(apiKey, entrada);
        await supabase.from("pesquisa_respostas").update({
          analise, score, analise_status: "gerada", analise_criada_em: new Date().toISOString(),
        }).eq("id", respostaId);
        return json({ ok: true, analise, score });
      } catch (e) {
        // Fallback: nunca trava a entrega — devolve ao menos o percentual.
        await supabase.from("pesquisa_respostas").update({ analise_status: "erro", score }).eq("id", respostaId);
        return json({ ok: true, analise: null, score, erro_ia: String((e as Error)?.message || e) });
      }
    }

    return json({ error: "ação inválida" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
