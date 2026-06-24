import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getTenantSlug } from "@/lib/tenant";
import { Loader2, CheckCircle2 } from "lucide-react";

type TipoPergunta =
  | "texto_curto" | "texto_longo" | "multipla_escolha" | "sim_nao"
  | "email" | "telefone" | "numero" | "data" | "dropdown"
  | "escala_opiniao" | "nps" | "avaliacao";
type Opcao = { id: string; label: string };
type Regra = { quando_opcao_id: string; ir_para_pergunta_id: string | null };
type Pergunta = {
  id: string; ordem: number; titulo: string; descricao: string | null;
  tipo: TipoPergunta;
  obrigatoria: boolean; opcoes: Opcao[]; logica: Regra[];
};

const TIPOS_BIFURCAVEIS: TipoPergunta[] = ["multipla_escolha", "dropdown", "sim_nao"];

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
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);

  const [idx, setIdx] = useState(0);              // índice da pergunta atual
  const [respostas, setRespostas] = useState<Record<string, any>>({});
  const [historico, setHistorico] = useState<number[]>([]); // pilha para "voltar"
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

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

  const setValor = (valor: any) => setRespostas((r) => ({ ...r, [atual.id]: valor }));

  const avancar = async () => {
    if (atual.obrigatoria && (respostas[atual.id] === undefined || respostas[atual.id] === "")) return;
    const prox = proximoIndice(atual, respostas[atual.id]);
    if (prox === "fim") {
      await enviar();
    } else {
      setHistorico((h) => [...h, idx]);
      setIdx(prox);
    }
  };

  const voltar = () => {
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
  };

  if (carregando) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (erro) {
    return <div className="min-h-screen flex items-center justify-center p-6 text-center"><p className="text-muted-foreground">{erro}</p></div>;
  }
  if (concluido) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-3">
        <CheckCircle2 className="h-12 w-12 text-primary" />
        <h1 className="text-2xl font-semibold">Obrigado!</h1>
        <p className="text-muted-foreground">Sua resposta foi registrada.</p>
      </div>
    );
  }
  if (!atual) {
    return <div className="min-h-screen flex items-center justify-center p-6 text-center"><p className="text-muted-foreground">Esta pesquisa não tem perguntas.</p></div>;
  }

  const respostaAtual = respostas[atual.id];
  const podeAvancar = !atual.obrigatoria || (respostaAtual !== undefined && respostaAtual !== "");

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-xl space-y-5">
        {idx === 0 && (titulo || descricao) && (
          <div className="space-y-1 pb-2">
            <h1 className="text-lg font-bold">{titulo}</h1>
            {descricao && <p className="text-sm text-muted-foreground">{descricao}</p>}
          </div>
        )}

        <div className="text-xs text-muted-foreground">Pergunta {idx + 1}</div>
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
              onChange={(e) => setValor(e.target.value)}
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
                  onClick={() => setValor(o.id)}
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
                  onClick={() => setValor(n)}
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
                  onClick={() => setValor(n)}
                  className={Number(respostaAtual) >= n ? "text-yellow-400" : "text-muted-foreground hover:text-yellow-300"}
                >
                  ★
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-3">
          <Button variant="ghost" onClick={voltar} disabled={historico.length === 0}>Voltar</Button>
          <Button onClick={avancar} disabled={!podeAvancar || enviando}>
            {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {proximoIndice(atual, respostaAtual) === "fim" ? "Enviar" : "Avançar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
