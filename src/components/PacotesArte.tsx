import { useRef, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Upload, ArrowLeft, Loader2, Wand2, Download, Move, Package as PackageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import JSZip from "jszip";

type Pacote = { id: string; nome: string; descricao: string | null };
type Campo = { id: string; tipo: string; x: number; y: number; fontSize: number; color: string; fontFamily: string; align: "left" | "center" | "right"; bold: boolean };
type Arte = { id: string; pacote_id: string; url: string; ordem: number; campos: Campo[] };
type Geracao = { id: string; pacote_nome: string | null; valores: any; zip_url: string | null; qtd: number; created_at: string };

const CAMPOS_TIPOS: Record<string, string> = { cidade: "Cidade", data: "Data", horario: "Horário", local: "Local" };
const FONTES = ["Inter", "Arial", "Georgia", "Times New Roman", "Impact", "Oswald", "Montserrat", "Bebas Neue", "Anton", "Roboto"];
const EXEMPLO: Record<string, string> = { cidade: "São Paulo", data: "17/06", horario: "14h às 19h", local: "Centro de Convenções" };

// Carrega fontes do Google uma vez (pra o canvas renderizar igual ao preview).
function useGoogleFonts() {
  useEffect(() => {
    if (document.getElementById("pacotes-fonts")) return;
    const link = document.createElement("link");
    link.id = "pacotes-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Montserrat:wght@400;700&family=Oswald:wght@400;700&family=Roboto:wght@400;700&display=swap";
    document.head.appendChild(link);
  }, []);
}

export default function PacotesArte() {
  useGoogleFonts();
  const queryClient = useQueryClient();
  const [selecionado, setSelecionado] = useState<Pacote | null>(null);

  const { data: pacotes = [] } = useQuery({
    queryKey: ["pacotes_arte"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("pacotes_arte").select("*").order("created_at", { ascending: false });
      return (data || []) as Pacote[];
    },
  });

  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const criar = async () => {
    if (!nome.trim()) { toast.error("Informe o nome do pacote"); return; }
    const { error } = await (supabase as any).from("pacotes_arte").insert({ nome: nome.trim() });
    if (error) { toast.error("Erro ao criar pacote"); return; }
    toast.success("Pacote criado");
    setOpen(false); setNome("");
    queryClient.invalidateQueries({ queryKey: ["pacotes_arte"] });
  };
  const excluir = async (p: Pacote) => {
    await (supabase as any).from("pacotes_arte").delete().eq("id", p.id);
    queryClient.invalidateQueries({ queryKey: ["pacotes_arte"] });
  };

  if (selecionado) return <PacoteDetalhe pacote={selecionado} onBack={() => setSelecionado(null)} />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Novo pacote</Button>
      </div>
      {pacotes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          Nenhum pacote ainda. Crie um pacote, suba as artes padrão e marque onde entram cidade/data/horário/local.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pacotes.map((p) => (
            <Card key={p.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelecionado(p)}>
              <CardContent className="p-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <PackageIcon className="h-5 w-5 text-primary shrink-0" />
                  <span className="font-medium truncate">{p.nome}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0"
                  onClick={(e) => { e.stopPropagation(); excluir(p); }}><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Novo pacote</DialogTitle></DialogHeader>
          <div className="space-y-1"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Pacote Stories Workshop" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={criar}>Criar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PacoteDetalhe({ pacote, onBack }: { pacote: Pacote; onBack: () => void }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editando, setEditando] = useState<Arte | null>(null);
  const [gerar, setGerar] = useState(false);

  const { data: artes = [] } = useQuery({
    queryKey: ["pacote_artes", pacote.id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("pacote_artes").select("*").eq("pacote_id", pacote.id).order("ordem");
      return (data || []) as Arte[];
    },
  });
  const { data: historico = [] } = useQuery({
    queryKey: ["pacote_geracoes", pacote.id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("pacote_geracoes").select("*").eq("pacote_id", pacote.id).order("created_at", { ascending: false }).limit(50);
      return (data || []) as Geracao[];
    },
  });

  const subir = async (files: FileList) => {
    setUploading(true);
    try {
      let ordem = artes.length;
      for (const file of Array.from(files)) {
        const path = `${pacote.id}/${crypto.randomUUID()}.${(file.name.split(".").pop() || "png").toLowerCase()}`;
        const up = await supabase.storage.from("artes-base").upload(path, file);
        if (up.error) throw up.error;
        const url = supabase.storage.from("artes-base").getPublicUrl(path).data.publicUrl;
        await (supabase as any).from("pacote_artes").insert({ pacote_id: pacote.id, url, ordem: ordem++ });
      }
      toast.success("Artes enviadas");
      queryClient.invalidateQueries({ queryKey: ["pacote_artes", pacote.id] });
    } catch (e: any) {
      toast.error(`Erro no upload: ${e?.message || "falhou"}`);
    } finally { setUploading(false); }
  };

  const removerArte = async (a: Arte) => {
    await (supabase as any).from("pacote_artes").delete().eq("id", a.id);
    queryClient.invalidateQueries({ queryKey: ["pacote_artes", pacote.id] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
        <span className="font-medium">{pacote.nome}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Subir artes
          </Button>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) subir(e.target.files); e.target.value = ""; }} />
          <Button size="sm" disabled={artes.length === 0} onClick={() => setGerar(true)}><Wand2 className="mr-2 h-4 w-4" /> Gerar pacote</Button>
        </div>
      </div>

      {artes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Suba as artes padrão deste pacote.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {artes.map((a) => (
            <div key={a.id} className="rounded-md border border-border overflow-hidden bg-muted/40">
              <img src={a.url} alt="arte" className="w-full aspect-square object-contain" />
              <div className="flex items-center justify-between p-2">
                <Badge variant="secondary" className="text-[10px]">{(a.campos || []).length} campo(s)</Badge>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditando(a)}><Move className="h-3 w-3 mr-1" /> Campos</Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removerArte(a)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {historico.length > 0 && (
        <div className="space-y-2 pt-2">
          <Label>Histórico de gerados</Label>
          {historico.map((g) => (
            <div key={g.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
              <span className="truncate">
                {g.valores?.cidade || "—"} {g.valores?.data ? `· ${g.valores.data}` : ""}
                <span className="text-muted-foreground"> · {g.qtd} artes · {new Date(g.created_at).toLocaleString("pt-BR")}</span>
              </span>
              {g.zip_url && <Button asChild variant="outline" size="sm"><a href={g.zip_url} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /></a></Button>}
            </div>
          ))}
        </div>
      )}

      {editando && <EditorCampos arte={editando} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); queryClient.invalidateQueries({ queryKey: ["pacote_artes", pacote.id] }); }} />}
      {gerar && <GerarDialog pacote={pacote} artes={artes} onClose={() => setGerar(false)} onDone={() => queryClient.invalidateQueries({ queryKey: ["pacote_geracoes", pacote.id] })} />}
    </div>
  );
}

// ---- Editor visual de campos (arrastar) ----
function EditorCampos({ arte, onClose, onSaved }: { arte: Arte; onClose: () => void; onSaved: () => void }) {
  const [campos, setCampos] = useState<Campo[]>(arte.campos || []);
  const [sel, setSel] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string } | null>(null);
  const resizeRef = useRef<{ id: string; startX: number; startSize: number } | null>(null);

  const addCampo = (tipo: string) => {
    const c: Campo = { id: crypto.randomUUID(), tipo, x: 50, y: 50, fontSize: 6, color: "#ffffff", fontFamily: "Inter", align: "center", bold: true };
    setCampos((p) => [...p, c]); setSel(c.id);
  };
  const upd = (id: string, patch: Partial<Campo>) => setCampos((p) => p.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const del = (id: string) => { setCampos((p) => p.filter((c) => c.id !== id)); if (sel === id) setSel(null); };

  const onMove = (e: React.PointerEvent) => {
    if (!boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    // Redimensionar (arrastando a alça do canto): muda o tamanho da fonte.
    if (resizeRef.current) {
      const dPct = ((e.clientX - resizeRef.current.startX) / r.width) * 100;
      const novo = Math.min(40, Math.max(2, Math.round((resizeRef.current.startSize + dPct) * 10) / 10));
      upd(resizeRef.current.id, { fontSize: novo });
      return;
    }
    // Mover
    if (!dragRef.current) return;
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    upd(dragRef.current.id, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  };
  const fimDrag = () => { dragRef.current = null; resizeRef.current = null; };

  const salvar = async () => {
    const { error } = await (supabase as any).from("pacote_artes").update({ campos }).eq("id", arte.id);
    if (error) { toast.error("Erro ao salvar campos"); return; }
    toast.success("Campos salvos");
    onSaved();
  };

  const selCampo = campos.find((c) => c.id === sel);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Posicionar campos — arraste sobre a arte</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-2 mb-2">
          {Object.entries(CAMPOS_TIPOS).map(([k, v]) => (
            <Button key={k} variant="outline" size="sm" onClick={() => addCampo(k)} disabled={campos.some((c) => c.tipo === k)}>
              <Plus className="mr-1 h-3 w-3" /> {v}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <div ref={boxRef} className="relative w-full select-none rounded-md overflow-hidden border border-border bg-black/20"
              style={{ containerType: "inline-size" }}
              onPointerMove={onMove} onPointerUp={fimDrag} onPointerLeave={fimDrag}>
              <img src={arte.url} alt="arte" className="w-full block pointer-events-none" />
              {campos.map((c) => (
                <span key={c.id}
                  onPointerDown={(e) => { e.preventDefault(); setSel(c.id); dragRef.current = { id: c.id }; }}
                  style={{
                    position: "absolute", left: `${c.x}%`, top: `${c.y}%`,
                    transform: `translate(${c.align === "center" ? "-50%" : c.align === "right" ? "-100%" : "0"}, -50%)`,
                    color: c.color, fontFamily: c.fontFamily, fontWeight: c.bold ? 700 : 400,
                    fontSize: `${c.fontSize}cqw`, whiteSpace: "nowrap", cursor: "grab",
                    textShadow: "0 1px 2px rgba(0,0,0,.4)", outline: sel === c.id ? "2px dashed #ef4444" : "none",
                  }}
                  className="px-0.5">
                  {EXEMPLO[c.tipo]}
                  {sel === c.id && (
                    <span
                      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); resizeRef.current = { id: c.id, startX: e.clientX, startSize: c.fontSize }; }}
                      style={{ position: "absolute", right: -6, bottom: -6, width: 14, height: 14, background: "#ef4444", borderRadius: 3, cursor: "nwse-resize", border: "2px solid #fff" }}
                      title="Arraste para redimensionar"
                    />
                  )}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Clique num campo pra editar fonte/cor/tamanho. Arraste pra posicionar.</p>
          </div>
          <div className="space-y-2">
            {!selCampo ? <p className="text-sm text-muted-foreground">Adicione e selecione um campo.</p> : (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{CAMPOS_TIPOS[selCampo.tipo]}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => del(selCampo.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="space-y-1"><Label className="text-xs">Fonte</Label>
                  <Select value={selCampo.fontFamily} onValueChange={(v) => upd(selCampo.id, { fontFamily: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{FONTES.map((f) => <SelectItem key={f} value={f}><span style={{ fontFamily: f }}>{f}</span></SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label className="text-xs">Cor</Label>
                  <input type="color" value={selCampo.color} onChange={(e) => upd(selCampo.id, { color: e.target.value })} className="h-8 w-full rounded border border-border bg-transparent" />
                </div>
                <div className="space-y-1"><Label className="text-xs">Tamanho (px)</Label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => upd(selCampo.id, { fontSize: Math.max(0.5, Math.round((selCampo.fontSize - 0.5) * 10) / 10) })}>−</Button>
                    <Input type="number" min={1} max={400} className="h-8 text-center"
                      value={Math.round(selCampo.fontSize * 10)}
                      onChange={(e) => { const px = Number(e.target.value) || 0; upd(selCampo.id, { fontSize: Math.max(0.1, px / 10) }); }} />
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => upd(selCampo.id, { fontSize: Math.round((selCampo.fontSize + 0.5) * 10) / 10 })}>+</Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Digite ou use +/−. Também dá pra arrastar a alça no canto do campo.</p>
                </div>
                <div className="space-y-1"><Label className="text-xs">Alinhamento</Label>
                  <Select value={selCampo.align} onValueChange={(v) => upd(selCampo.id, { align: v as any })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="left">Esquerda</SelectItem><SelectItem value="center">Centro</SelectItem><SelectItem value="right">Direita</SelectItem></SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selCampo.bold} onChange={(e) => upd(selCampo.id, { bold: e.target.checked })} /> Negrito</label>
              </>
            )}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={salvar}>Salvar campos</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Geração: aplica os textos via canvas e baixa ZIP ----
function GerarDialog({ pacote, artes, onClose, onDone }: { pacote: Pacote; artes: Arte[]; onClose: () => void; onDone: () => void }) {
  const [valores, setValores] = useState<Record<string, string>>({ cidade: "", data: "", horario: "", local: "" });
  const [gerando, setGerando] = useState(false);

  // Campos que existem em qualquer arte do pacote (pra mostrar só os necessários).
  const tipos = Array.from(new Set(artes.flatMap((a) => (a.campos || []).map((c) => c.tipo))));

  const carregarImg = (url: string) => new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => res(img); img.onerror = rej; img.src = url;
  });

  const gerar = async () => {
    setGerando(true);
    try {
      await (document as any).fonts?.ready;
      const zip = new JSZip();
      let n = 0;
      for (const arte of artes) {
        const img = await carregarImg(arte.url);
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        for (const c of arte.campos || []) {
          const valor = valores[c.tipo]?.trim();
          if (!valor) continue;
          const px = (c.fontSize / 100) * canvas.width;
          ctx.font = `${c.bold ? "bold " : ""}${px}px ${c.fontFamily}`;
          ctx.fillStyle = c.color; ctx.textAlign = c.align; ctx.textBaseline = "middle";
          ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = px * 0.08; ctx.shadowOffsetY = px * 0.04;
          ctx.fillText(valor, (c.x / 100) * canvas.width, (c.y / 100) * canvas.height);
          ctx.shadowColor = "transparent";
        }
        const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/png"));
        zip.file(`arte-${String(++n).padStart(2, "0")}.png`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });

      // Download imediato
      const cidadeSlug = (valores.cidade || "pacote").replace(/\s+/g, "_");
      const fname = `${pacote.nome.replace(/\s+/g, "_")}-${cidadeSlug}.zip`;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(zipBlob); link.download = fname; link.click();

      // Salva no histórico (storage + tabela)
      try {
        const path = `${pacote.id}/${crypto.randomUUID()}.zip`;
        const up = await supabase.storage.from("pacotes-gerados").upload(path, zipBlob, { contentType: "application/zip" });
        const zipUrl = up.error ? null : supabase.storage.from("pacotes-gerados").getPublicUrl(path).data.publicUrl;
        await (supabase as any).from("pacote_geracoes").insert({ pacote_id: pacote.id, pacote_nome: pacote.nome, valores, zip_url: zipUrl, qtd: n });
        onDone();
      } catch { /* histórico é best-effort */ }

      toast.success(`Pacote gerado: ${n} artes`);
      onClose();
    } catch (e: any) {
      toast.error(`Erro ao gerar: ${e?.message || "falhou"}`);
    } finally { setGerando(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Gerar pacote — {pacote.nome}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Preencha os campos usados nas artes. Sai um ZIP com {artes.length} arte(s).</p>
        <div className="space-y-3">
          {tipos.length === 0 && <p className="text-sm text-destructive">Nenhuma arte tem campos definidos. Edite os campos primeiro.</p>}
          {tipos.map((t) => (
            <div key={t} className="space-y-1">
              <Label>{CAMPOS_TIPOS[t]}</Label>
              <Input value={valores[t] || ""} onChange={(e) => setValores((v) => ({ ...v, [t]: e.target.value }))} placeholder={EXEMPLO[t]} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={gerar} disabled={gerando || tipos.length === 0}>
            {gerando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Gerar ZIP
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
