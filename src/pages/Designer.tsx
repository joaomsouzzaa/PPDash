import { useRef, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Palette, Plus, Trash2, Upload, Image as ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type Projeto = { id: string; nome: string; descricao: string | null; cores: string | null; logo_posicao: string; palavras_chave: string | null };
type Asset = { id: string; projeto_id: string; tipo: string; url: string; descricao: string | null };

const POSICOES: Record<string, string> = { "cima-centro": "Topo (centro)", "baixo-centro": "Base (centro)" };
const TIPOS: { key: string; label: string; hint: string }[] = [
  { key: "logo", label: "Logo (PNG)", hint: "PNG com fundo transparente — sobreposta na arte" },
  { key: "referencia", label: "Referências de layout", hint: "Exemplos de arte/criativos pra IA seguir o estilo" },
  { key: "identidade", label: "Identidade visual", hint: "Manual de marca, paleta, tipografia" },
];

export default function Designer() {
  const queryClient = useQueryClient();

  const { data: projetos = [] } = useQuery({
    queryKey: ["projetos_design"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("projetos_design").select("*").order("created_at", { ascending: false });
      return (data || []) as Projeto[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Projeto | null>(null);
  const empty = { nome: "", descricao: "", cores: "", logo_posicao: "baixo-centro", palavras_chave: "" };
  const [form, setForm] = useState({ ...empty });

  const novo = () => { setEditing(null); setForm({ ...empty }); setOpen(true); };
  const editar = (p: Projeto) => {
    setEditing(p);
    setForm({ nome: p.nome, descricao: p.descricao || "", cores: p.cores || "", logo_posicao: p.logo_posicao || "baixo-centro", palavras_chave: p.palavras_chave || "" });
    setOpen(true);
  };

  const salvar = async () => {
    if (!form.nome.trim()) { toast.error("Informe o nome do projeto"); return; }
    const payload = { nome: form.nome.trim(), descricao: form.descricao || null, cores: form.cores || null, logo_posicao: form.logo_posicao, palavras_chave: form.palavras_chave || null };
    const res = editing
      ? await (supabase as any).from("projetos_design").update(payload).eq("id", editing.id)
      : await (supabase as any).from("projetos_design").insert(payload);
    if (res.error) { toast.error("Erro ao salvar projeto"); return; }
    toast.success("Projeto salvo");
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["projetos_design"] });
  };

  const excluir = async (p: Projeto) => {
    await (supabase as any).from("projetos_design").delete().eq("id", p.id);
    queryClient.invalidateQueries({ queryKey: ["projetos_design"] });
    queryClient.invalidateQueries({ queryKey: ["projeto_assets"] });
    toast.success("Projeto excluído");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          <header className="shrink-0 flex items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-3">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><Palette className="h-5 w-5 text-primary" /> Designer</h1>
              <p className="text-sm text-muted-foreground">Materiais de marca e referências usados na geração de artes</p>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-6">
            <Tabs defaultValue="repo">
              <TabsList>
                <TabsTrigger value="repo">Repositório de Projetos</TabsTrigger>
              </TabsList>

              <TabsContent value="repo" className="mt-4 space-y-4">
                <div className="flex justify-end">
                  <Button onClick={novo}><Plus className="mr-2 h-4 w-4" /> Novo projeto</Button>
                </div>

                {projetos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">
                    Nenhum projeto ainda. Crie um (ex.: "Workshop Scale") e suba a logo e as referências.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {projetos.map((p) => (
                      <ProjetoCard key={p.id} projeto={p} onEdit={() => editar(p)} onDelete={() => excluir(p)} />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      {/* Dialog do projeto */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar projeto" : "Novo projeto"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nome</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Workshop Scale" /></div>
            <div className="space-y-1"><Label>Descrição</Label><Textarea rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Sobre o projeto / instruções de estilo..." /></div>
            <div className="space-y-1"><Label>Cores da marca</Label><Input value={form.cores} onChange={(e) => setForm({ ...form, cores: e.target.value })} placeholder="Ex: preto, vermelho, branco" /></div>
            <div className="space-y-1">
              <Label>Palavras-chave (detecção automática)</Label>
              <Input value={form.palavras_chave} onChange={(e) => setForm({ ...form, palavras_chave: e.target.value })} placeholder="Ex: workshop scale, ws, scale" />
              <p className="text-[11px] text-muted-foreground">Quando o briefing contiver uma dessas palavras (ou o nome do projeto), este repositório é usado automaticamente.</p>
            </div>
            <div className="space-y-1"><Label>Posição da logo na arte</Label>
              <Select value={form.logo_posicao} onValueChange={(v) => setForm({ ...form, logo_posicao: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(POSICOES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

function ProjetoCard({ projeto, onEdit, onDelete }: { projeto: Projeto; onEdit: () => void; onDelete: () => void }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: assets = [] } = useQuery({
    queryKey: ["projeto_assets", projeto.id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("projeto_assets").select("*").eq("projeto_id", projeto.id).order("created_at");
      return (data || []) as Asset[];
    },
  });

  const subir = async (tipo: string, file: File) => {
    setUploading(tipo);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${projeto.id}/${tipo}-${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("projeto-assets").upload(path, file, { upsert: false });
      if (up.error) throw up.error;
      const url = supabase.storage.from("projeto-assets").getPublicUrl(path).data.publicUrl;
      const ins = await (supabase as any).from("projeto_assets").insert({ projeto_id: projeto.id, tipo, url });
      if (ins.error) throw ins.error;
      toast.success("Material enviado");
      queryClient.invalidateQueries({ queryKey: ["projeto_assets", projeto.id] });
    } catch (e: any) {
      toast.error(`Erro no upload: ${e?.message || "falhou"}`);
    } finally {
      setUploading(null);
    }
  };

  const removerAsset = async (a: Asset) => {
    await (supabase as any).from("projeto_assets").delete().eq("id", a.id);
    queryClient.invalidateQueries({ queryKey: ["projeto_assets", projeto.id] });
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{projeto.nome}</span>
              {projeto.cores && <Badge variant="outline" className="text-[10px]">{projeto.cores}</Badge>}
              <Badge variant="secondary" className="text-[10px]">logo: {POSICOES[projeto.logo_posicao] || projeto.logo_posicao}</Badge>
            </div>
            {projeto.descricao && <p className="text-xs text-muted-foreground mt-1">{projeto.descricao}</p>}
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={onEdit}>Editar</Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TIPOS.map((t) => {
            const itens = assets.filter((a) => a.tipo === t.key);
            return (
              <div key={t.key} className="rounded-md border border-border p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{t.label}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={uploading === t.key}
                    onClick={() => inputs.current[t.key]?.click()}>
                    {uploading === t.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  </Button>
                  <input ref={(el) => (inputs.current[t.key] = el)} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(t.key, f); e.target.value = ""; }} />
                </div>
                <p className="text-[10px] text-muted-foreground">{t.hint}</p>
                <div className="grid grid-cols-3 gap-1">
                  {itens.map((a) => (
                    <div key={a.id} className="relative group rounded overflow-hidden border border-border bg-muted/40">
                      <a href={a.url} target="_blank" rel="noreferrer">
                        <img src={a.url} alt={t.key} className="w-full aspect-square object-contain" />
                      </a>
                      <button onClick={() => removerAsset(a)}
                        className="absolute top-0.5 right-0.5 bg-black/60 rounded p-0.5 opacity-0 group-hover:opacity-100">
                        <Trash2 className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ))}
                  {itens.length === 0 && <div className="col-span-3 flex items-center justify-center py-3 text-muted-foreground"><ImageIcon className="h-4 w-4" /></div>}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
