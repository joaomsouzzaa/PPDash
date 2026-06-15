import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, BookOpen, Loader2, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Repo = {
  id: string;
  titulo: string;
  conteudo: string;
  ativo: boolean;
  ordem: number;
};

const VAZIO = { titulo: "", conteudo: "", ativo: true, ordem: 0 };

export function BaseConhecimentoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [editId, setEditId] = useState<string | null>(null); // null = lista, "novo" = criando, id = editando
  const [form, setForm] = useState<typeof VAZIO>(VAZIO);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data } = await supabase
      .from("base_conhecimento")
      .select("*")
      .order("ordem")
      .order("created_at");
    setRepos((data || []) as Repo[]);
    setCarregando(false);
  }, []);

  useEffect(() => { if (open) { carregar(); setEditId(null); } }, [open, carregar]);

  const abrirNovo = () => { setForm(VAZIO); setEditId("novo"); };
  const abrirEdicao = (r: Repo) => { setForm({ titulo: r.titulo, conteudo: r.conteudo, ativo: r.ativo, ordem: r.ordem }); setEditId(r.id); };

  const salvar = async () => {
    if (!form.titulo.trim()) { toast.error("Dê um título ao repositório"); return; }
    setSalvando(true);
    const payload = { titulo: form.titulo.trim(), conteudo: form.conteudo, ativo: form.ativo, ordem: form.ordem, updated_at: new Date().toISOString() };
    const { error } = editId && editId !== "novo"
      ? await supabase.from("base_conhecimento").update(payload).eq("id", editId)
      : await supabase.from("base_conhecimento").insert(payload);
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Base de conhecimento salva");
    setEditId(null);
    carregar();
  };

  const excluir = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Excluir este repositório da base de conhecimento?")) return;
    const { error } = await supabase.from("base_conhecimento").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    carregar();
  };

  const alternarAtivo = async (r: Repo, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("base_conhecimento").update({ ativo: !r.ativo, updated_at: new Date().toISOString() }).eq("id", r.id);
    carregar();
  };

  const editando = editId !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> Base de Conhecimento
          </DialogTitle>
          <DialogDescription>
            Repositórios que <strong>todos os agentes</strong> consultam sempre antes de produzir algo
            (ex.: "Workshop Scale", "Raphael Mattos", "Tom de voz da marca").
          </DialogDescription>
        </DialogHeader>

        {!editando ? (
          <div className="space-y-3">
            <Button onClick={abrirNovo} className="w-full"><Plus className="mr-2 h-4 w-4" /> Novo repositório</Button>
            {carregando ? (
              <div className="py-8 flex justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : repos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum repositório ainda. Crie o primeiro acima.</p>
            ) : (
              <div className="space-y-2">
                {repos.map((r) => (
                  <button key={r.id} onClick={() => abrirEdicao(r)}
                    className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent/60 transition-colors flex items-start gap-3 group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{r.titulo}</span>
                        {!r.ativo && <span className="text-[10px] uppercase bg-muted text-muted-foreground px-1.5 py-0.5 rounded">inativo</span>}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{r.conteudo || "(vazio)"}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Switch checked={r.ativo} onCheckedChange={() => {}} onClick={(e) => alternarAtivo(r, e)} />
                      <span onClick={(e) => excluir(r.id, e)} className="text-muted-foreground hover:text-destructive p-1">
                        <Trash2 className="h-4 w-4" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setEditId(null)}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
            </Button>
            <div className="space-y-1">
              <label className="text-sm font-medium">Título do repositório</label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ex.: Workshop Scale, Raphael Mattos, Tom de voz da marca" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Conteúdo / informações</label>
              <Textarea rows={12} value={form.conteudo} onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
                placeholder="Cole aqui tudo que os agentes devem saber e considerar: descrição do produto, diferenciais, biografia, dores do público, provas sociais, regras de tom, o que evitar, etc." />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <span className="text-sm">Ativo (os agentes só consultam repositórios ativos)</span>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditId(null)}>Cancelar</Button>
              <Button onClick={salvar} disabled={salvando}>
                {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Salvar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
