import { useState, useEffect, useRef, useCallback } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Send, Bot, MessageSquare, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Agente = { id: string; nome: string; provider: string; modelo: string | null; ativo: boolean };
type Conversa = { id: string; titulo: string | null; agente_id: string | null; updated_at: string };
type Mensagem = { id?: string; role: "user" | "assistant"; conteudo: string };

export default function Chat() {
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [agenteId, setAgenteId] = useState<string>("");
  const [messages, setMessages] = useState<Mensagem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const carregarAgentes = useCallback(async () => {
    const { data } = await (supabase as any).from("agentes").select("id,nome,provider,modelo,ativo").eq("ativo", true).order("created_at");
    setAgentes(data || []);
    if (data?.length && !agenteId) setAgenteId(data[0].id);
  }, [agenteId]);

  const carregarConversas = useCallback(async () => {
    const { data } = await (supabase as any).from("conversas").select("*").order("updated_at", { ascending: false });
    setConversas(data || []);
  }, []);

  useEffect(() => { carregarAgentes(); carregarConversas(); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);

  const novaConversa = () => { setCurrentId(null); setMessages([]); };

  const abrirConversa = async (c: Conversa) => {
    setCurrentId(c.id);
    if (c.agente_id) setAgenteId(c.agente_id);
    const { data } = await (supabase as any).from("mensagens").select("role,conteudo").eq("conversa_id", c.id).order("created_at");
    setMessages((data || []) as Mensagem[]);
  };

  const excluirConversa = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await (supabase as any).from("mensagens").delete().eq("conversa_id", id);
    await (supabase as any).from("conversas").delete().eq("id", id);
    if (currentId === id) novaConversa();
    carregarConversas();
  };

  const enviar = async () => {
    const texto = input.trim();
    if (!texto) return;
    if (!agenteId) { toast.error("Selecione um agente"); return; }
    setInput("");
    setLoading(true);

    try {
      // Cria a conversa na primeira mensagem
      let convId = currentId;
      if (!convId) {
        const { data, error } = await (supabase as any).from("conversas")
          .insert({ titulo: texto.slice(0, 50), agente_id: agenteId }).select("id").single();
        if (error) throw error;
        convId = data.id;
        setCurrentId(convId);
        carregarConversas();
      }

      const userMsg: Mensagem = { role: "user", conteudo: texto };
      const novaLista = [...messages, userMsg];
      setMessages(novaLista);
      await (supabase as any).from("mensagens").insert({ conversa_id: convId, role: "user", conteudo: texto });

      // Chama o agente (modelo)
      const { data, error } = await supabase.functions.invoke("agente-chat", {
        body: { agente_id: agenteId, messages: novaLista.map((m) => ({ role: m.role, content: m.conteudo })) },
      });
      let reply = "";
      if (error) {
        let msg = error.message;
        try { const ctx = (error as any).context; if (ctx?.json) { const b = await ctx.json(); if (b?.error) msg = b.error; } } catch { /* */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      reply = data?.reply || "(sem resposta)";

      const botMsg: Mensagem = { role: "assistant", conteudo: reply };
      setMessages((prev) => [...prev, botMsg]);
      await (supabase as any).from("mensagens").insert({ conversa_id: convId, role: "assistant", conteudo: reply });
      await (supabase as any).from("conversas").update({ updated_at: new Date().toISOString() }).eq("id", convId);
      carregarConversas();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enviar");
      setMessages((prev) => [...prev, { role: "assistant", conteudo: `⚠️ ${e?.message || "Erro"}` }]);
    } finally {
      setLoading(false);
    }
  };

  const agenteAtual = agentes.find((a) => a.id === agenteId);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex h-screen overflow-hidden">
          {/* Histórico de conversas */}
          <aside className="w-72 shrink-0 border-r border-border flex flex-col bg-background/50">
            <div className="p-3 border-b border-border">
              <Button className="w-full" onClick={novaConversa}><Plus className="mr-2 h-4 w-4" /> Nova conversa</Button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {conversas.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">Nenhuma conversa ainda.</p>
              ) : conversas.map((c) => (
                <button key={c.id} onClick={() => abrirConversa(c)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 group transition-colors ${currentId === c.id ? "bg-accent" : "hover:bg-accent/60"}`}>
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1">{c.titulo || "Conversa"}</span>
                  <span onClick={(e) => excluirConversa(c.id, e)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          </aside>

          {/* Área de conversa */}
          <div className="flex-1 flex flex-col">
            <header className="shrink-0 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
              <SidebarTrigger />
              <div className="flex-1">
                <h1 className="text-lg font-bold tracking-tight">Chat</h1>
              </div>
              <div className="w-56">
                <Select value={agenteId} onValueChange={setAgenteId}>
                  <SelectTrigger><SelectValue placeholder="Selecione um agente" /></SelectTrigger>
                  <SelectContent>
                    {agentes.length === 0 ? (
                      <SelectItem value="_none" disabled>Crie um agente em Agentes</SelectItem>
                    ) : agentes.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 && !loading && (
                <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
                  <div className="mb-3 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center"><Bot className="h-6 w-6 text-primary" /></div>
                  <p className="font-medium">Converse com {agenteAtual?.nome || "um agente"}</p>
                  <p className="text-sm">{agenteAtual ? `${agenteAtual.provider} · ${agenteAtual.modelo}` : "Selecione um agente acima e mande sua mensagem."}</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {m.conteudo}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl px-4 py-2.5 text-sm flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> {agenteAtual?.nome || "Agente"} está pensando...
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-border p-4">
              <div className="flex items-end gap-2 max-w-3xl mx-auto">
                <Textarea
                  rows={1} value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                  placeholder={`Mensagem para ${agenteAtual?.nome || "o agente"}...`}
                  className="resize-none min-h-[44px] max-h-40"
                />
                <Button onClick={enviar} disabled={loading || !input.trim()} size="icon" className="h-11 w-11 shrink-0">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground text-center mt-2">Enter envia · Shift+Enter quebra linha</p>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
