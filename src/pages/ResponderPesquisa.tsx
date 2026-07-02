import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getTenantSlug } from "@/lib/tenant";
import { Loader2, CheckCircle2, MessageCircle } from "lucide-react";
import { DiagnosticoFranqueabilidade, type AnaliseDiagnostico, type Score } from "@/components/DiagnosticoFranqueabilidade";

type TipoPergunta =
  | "texto_curto" | "texto_longo" | "multipla_escolha" | "sim_nao"
  | "email" | "telefone" | "numero" | "data" | "dropdown"
  | "escala_opiniao" | "nps" | "avaliacao";
type Opcao = { id: string; label: string; pontos?: number | null };
type Regra = { quando_opcao_id: string; ir_para_pergunta_id: string | null };
type Pergunta = {
  id: string; ordem: number; titulo: string; descricao: string | null;
  tipo: TipoPergunta;
  obrigatoria: boolean; opcoes: Opcao[]; logica: Regra[];
};
type ConfigPesquisa = {
  diagnostico_ia?: boolean;
  mostrar_resultado?: boolean;
  resultado_texto?: string;
  whatsapp_numero?: string;
  whatsapp_botao?: string;
  whatsapp_mensagem?: string;
};

const TIPOS_BIFURCAVEIS: TipoPergunta[] = ["multipla_escolha", "dropdown", "sim_nao"];
// Tipos de seleção única: um clique define a resposta e avança sozinho.
const TIPOS_AUTO_AVANCO: TipoPergunta[] = ["multipla_escolha", "dropdown", "sim_nao", "escala_opiniao", "nps", "avaliacao"];

function opcoesDaPergunta(p: Pergunta): Opcao[] {
  if (p.tipo === "sim_nao") return [{ id: "sim", label: "Sim" }, { id: "nao", label: "Não" }];
  return p.opcoes || [];
}

export default function ResponderPesquisa() {
  const { slug } = useParams<{ slug: string }>();
  const orgSlug = getTenantSlug();

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigPesquisa>({});
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);

  const [idx, setIdx] = useState(0);              // índice da pergunta atual
  const [respostas, setRespostas] = useState<Record<string, any>>({});
  const [historico, setHistorico] = useState<number[]>([]); // pilha para "voltar"
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [erroCampo, setErroCampo] = useState<string | null>(null);
  const [avancando, setAvancando] = useState(false); // trava durante o auto-avanço (evita clique duplo)

  // Diagnóstico de IA (gerado após o envio, quando habilitado na pesquisa).
  const [gerandoDiag, setGerandoDiag] = useState(false);
  const [analise, setAnalise] = useState<AnaliseDiagnostico | null>(null);
  const [scoreDiag, setScoreDiag] = useState<Score | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.functions.invoke("pesquisa-publica", {
        body: { acao: "get", slug, org: orgSlug },
      });
      if (error || (data as any)?.error) {
        setErro((data as any)?.error || "Pesquisa não disponível");
      } else {
        setTitulo((data as any).pesquisa.titulo);
        setDescricao((data as any).pesquisa.descricao);
        setConfig((data as any).pesquisa.config || {});
        setPerguntas(((data as any).perguntas || []).map((p: any) => ({ ...p, opcoes: p.opcoes || [], logica: p.logica || [] })));
      }
      setCarregando(false);
    })();
  }, [slug, orgSlug]);

  const atual = perguntas[idx];

  // Calcula o índice da próxima pergunta seguindo a lógica de bifurcação.
  const proximoIndice = (p: Pergunta, valor: any): number | "fim" => {
    if (TIPOS_BIFURCAVEIS.includes(p.tipo)) {
      const regra = (p.logica || []).find((r) => r.quando_opcao_id === valor);
      if (regra) {
        if (regra.ir_para_pergunta_id === null) return "fim";
        if (regra.ir_para_pergunta_id) {
          const destino = perguntas.findIndex((x) => x.id === regra.ir_para_pergunta_id);
          if (destino >= 0) return destino;
        }
      }
    }
    return idx + 1 >= perguntas.length ? "fim" : idx + 1;
  };

  const setValor = (valor: any) => { setErroCampo(null); setRespostas((r) => ({ ...r, [atual.id]: valor })); };

  // Seleção única: grava o valor e avança sozinho — exceto na última pergunta do fluxo,
  // onde o respondente ainda precisa clicar em "Enviar/Concluir".
  const selecionarEAvancar = (valor: any) => {
    if (avancando) return;
    setErroCampo(null);
    setRespostas((r) => ({ ...r, [atual.id]: valor }));
    const prox = proximoIndice(atual, valor);
    if (prox === "fim") return; // última pergunta: espera o clique em "Enviar"
    setAvancando(true);
    setTimeout(() => {
      setHistorico((h) => [...h, idx]);
      setIdx(prox);
      setAvancando(false);
    }, 200); // breve destaque da opção escolhida antes de trocar de tela
  };

  const vazio = (v: any) => v === undefined || v === null || v === "";

  // Valida a resposta atual. Retorna mensagem de erro ou null se válida.
  const validar = (p: Pergunta, v: any): string | null => {
    if (vazio(v)) return p.obrigatoria ? "Esta pergunta é obrigatória." : null;
    if (p.tipo === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) return "Informe um email válido.";
    if (p.tipo === "telefone" && (String(v).replace(/\D/g, "").length < 8)) return "Informe um telefone válido.";
    if (p.tipo === "numero" && isNaN(Number(v))) return "Informe um número válido.";
    return null;
  };

  const avancar = async () => {
    const msg = validar(atual, respostas[atual.id]);
    if (msg) { setErroCampo(msg); return; }
    const prox = proximoIndice(atual, respostas[atual.id]);
    if (prox === "fim") {
      await enviar();
    } else {
      setHistorico((h) => [...h, idx]);
      setIdx(prox);
    }
  };

  const voltar = () => {
    setErroCampo(null);
    setHistorico((h) => {
      const copia = [...h];
      const ant = copia.pop();
      if (ant !== undefined) setIdx(ant);
      return copia;
    });
  };

  const enviar = async () => {
    setEnviando(true);
    const { data, error } = await supabase.functions.invoke("pesquisa-publica", {
      body: { acao: "enviar", slug, org: orgSlug, respostas },
    });
    setEnviando(false);
    if (error || (data as any)?.error) { setErro((data as any)?.error || "Erro ao enviar"); return; }
    setConcluido(true);

    // Se a pesquisa gera diagnóstico por IA, dispara a geração e mostra o relatório.
    const respostaId = (data as any)?.resposta_id;
    if (config.diagnostico_ia && respostaId) {
      setGerandoDiag(true);
      try {
        const { data: dg } = await supabase.functions.invoke("pesquisa-publica", {
          body: { acao: "diagnostico", slug, org: orgSlug, resposta_id: respostaId },
        });
        setAnalise((dg as any)?.analise ?? null);
        setScoreDiag((dg as any)?.score ?? null);
      } catch {
        // silencioso: cai no fallback de % abaixo
      } finally {
        setGerandoDiag(false);
      }
    }
  };

  if (carregando) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (erro) {
    return <div className="min-h-screen flex items-center justify-center p-6 text-center"><p className="text-muted-foreground">{erro}</p></div>;
  }
  if (concluido) {
    // Pontuação: uma pergunta conta quando alguma opção tem `pontos` numérico.
    const temPonto = (o: Opcao) => typeof o.pontos === "number";
    const pontuadas = perguntas.filter((p) => opcoesDaPergunta(p).some(temPonto));
    const maxTotal = pontuadas.reduce(
      (acc, p) => acc + Math.max(0, ...opcoesDaPergunta(p).map((o) => (temPonto(o) ? (o.pontos as number) : 0))),
      0,
    );
    const total = pontuadas.reduce((acc, p) => {
      const escolhida = opcoesDaPergunta(p).find((o) => o.id === respostas[p.id]);
      return acc + (escolhida && temPonto(escolhida) ? (escolhida.pontos as number) : 0);
    }, 0);
    const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
    const mostrarResultado = !!config.mostrar_resultado && maxTotal > 0;
    const textoResultado = (config.resultado_texto || "Você está {pct}% pronto pra virar franquia.").replace(/\{pct\}/g, String(pct));
    const numeroWa = (config.whatsapp_numero || "").replace(/\D/g, "");
    const linkWa = numeroWa
      ? `https://wa.me/${numeroWa}?text=${encodeURIComponent(config.whatsapp_mensagem || "")}`
      : "";
    // Diagnóstico de IA: mostra o relatório rico (ou fallback só com o %).
    const comDiagnostico = !!config.diagnostico_ia;

    const botaoWa = linkWa && (
      <a href={linkWa} target="_blank" rel="noreferrer">
        <Button size="lg" className="bg-[#25D366] hover:bg-[#1ebe5b] text-white">
          <MessageCircle className="mr-2 h-5 w-5" />
          {config.whatsapp_botao || "Falar no WhatsApp"}
        </Button>
      </a>
    );

    if (comDiagnostico) {
      return (
        <div className="min-h-screen flex flex-col items-center p-6 gap-6 bg-muted/30">
          <div className="w-full max-w-2xl flex flex-col items-center gap-6 py-6">
            <div className="text-center space-y-1">
              <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
              <h1 className="text-2xl font-semibold">Seu diagnóstico está pronto</h1>
            </div>
            {gerandoDiag ? (
              <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p>Gerando seu diagnóstico de franqueabilidade…</p>
              </div>
            ) : (
              <DiagnosticoFranqueabilidade
                analise={analise}
                score={scoreDiag ?? { score_geral_pct: pct, score_por_pilar: [] }}
              />
            )}
            {!gerandoDiag && botaoWa}
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-4">
        <CheckCircle2 className="h-12 w-12 text-primary" />
        <h1 className="text-2xl font-semibold">Obrigado!</h1>
        <p className="text-muted-foreground">Sua resposta foi registrada.</p>

        {mostrarResultado && (
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 space-y-2">
            <div className="text-5xl font-bold text-primary">{pct}%</div>
            <p className="text-muted-foreground">{textoResultado}</p>
          </div>
        )}

        {botaoWa}
      </div>
    );
  }
  if (!atual) {
    return <div className="min-h-screen flex items-center justify-center p-6 text-center"><p className="text-muted-foreground">Esta pesquisa não tem perguntas.</p></div>;
  }

  const respostaAtual = respostas[atual.id];
  const progresso = Math.round(((idx + 1) / perguntas.length) * 100);
  const ehTerminal = proximoIndice(atual, respostaAtual) === "fim";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-xl space-y-5">
        {/* Barra de progresso */}
        <div className="space-y-1">
          <div className="h-2 w-full rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${progresso}%` }} />
          </div>
          <div className="text-xs text-muted-foreground text-right">{idx + 1} de {perguntas.length}</div>
        </div>

        {idx === 0 && (titulo || descricao) && (
          <div className="space-y-1 pb-2">
            <h1 className="text-lg font-bold">{titulo}</h1>
            {descricao && <p className="text-sm text-muted-foreground">{descricao}</p>}
          </div>
        )}

        <h2 className="text-2xl font-semibold">{atual.titulo}{atual.obrigatoria && <span className="text-destructive">*</span>}</h2>
        {atual.descricao && <p className="text-muted-foreground">{atual.descricao}</p>}

        <div className="pt-1">
          {atual.tipo === "texto_curto" && (
            <Input autoFocus value={respostaAtual ?? ""} onChange={(e) => setValor(e.target.value)} placeholder="Responde aqui..." />
          )}
          {atual.tipo === "texto_longo" && (
            <Textarea autoFocus rows={4} value={respostaAtual ?? ""} onChange={(e) => setValor(e.target.value)} placeholder="Responde aqui..." />
          )}
          {atual.tipo === "email" && (
            <Input autoFocus type="email" value={respostaAtual ?? ""} onChange={(e) => setValor(e.target.value)} placeholder="nome@email.com" />
          )}
          {atual.tipo === "telefone" && (
            <Input autoFocus type="tel" value={respostaAtual ?? ""} onChange={(e) => setValor(e.target.value)} placeholder="(00) 00000-0000" />
          )}
          {atual.tipo === "numero" && (
            <Input autoFocus type="number" value={respostaAtual ?? ""} onChange={(e) => setValor(e.target.value)} placeholder="0" />
          )}
          {atual.tipo === "data" && (
            <Input autoFocus type="date" value={respostaAtual ?? ""} onChange={(e) => setValor(e.target.value)} />
          )}
          {atual.tipo === "dropdown" && (
            <select
              autoFocus
              value={respostaAtual ?? ""}
              onChange={(e) => selecionarEAvancar(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-4 py-3"
            >
              <option value="" disabled>Selecione uma opção</option>
              {opcoesDaPergunta(atual).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          )}
          {(atual.tipo === "multipla_escolha" || atual.tipo === "sim_nao") && (
            <div className="space-y-2">
              {opcoesDaPergunta(atual).map((o) => (
                <button
                  key={o.id}
                  onClick={() => selecionarEAvancar(o.id)}
                  className={`w-full text-left rounded-md border px-4 py-3 transition ${respostaAtual === o.id ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted/50"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {(atual.tipo === "escala_opiniao" || atual.tipo === "nps") && (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: atual.tipo === "nps" ? 11 : 10 }, (_, i) => (atual.tipo === "nps" ? i : i + 1)).map((n) => (
                <button
                  key={n}
                  onClick={() => selecionarEAvancar(n)}
                  className={`h-11 w-11 rounded-md border transition ${respostaAtual === n ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted/50"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          {atual.tipo === "avaliacao" && (
            <div className="flex gap-1 text-3xl">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => selecionarEAvancar(n)}
                  className={Number(respostaAtual) >= n ? "text-yellow-400" : "text-muted-foreground hover:text-yellow-300"}
                >
                  ★
                </button>
              ))}
            </div>
          )}
        </div>

        {erroCampo && <p className="text-sm text-destructive">{erroCampo}</p>}

        <div className="flex items-center justify-between pt-3">
          <Button variant="ghost" onClick={voltar} disabled={historico.length === 0}>Voltar</Button>
          {/* Em seleção única não-terminal o avanço é automático — o botão só aparece
              na pergunta final (Enviar) ou nos campos de texto (Avançar manual). */}
          {(ehTerminal || !TIPOS_AUTO_AVANCO.includes(atual.tipo)) && (
            <Button onClick={avancar} disabled={enviando || avancando}>
              {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {ehTerminal ? "Enviar" : "Avançar"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
