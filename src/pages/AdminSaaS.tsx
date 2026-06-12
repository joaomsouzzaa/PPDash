import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { adminAction } from "@/lib/adminApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Plus, Loader2, Building2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ModuloKey } from "@/hooks/useModulos";

const MODULOS: { key: ModuloKey; nome: string }[] = [
  { key: "eventos", nome: "Eventos" },
  { key: "inside", nome: "Inside Sales" },
  { key: "analytics", nome: "Analytics" },
  { key: "growth", nome: "Growth" },
];

interface Plano {
  id: string; nome: string; slug: string; preco: number;
  modulos: ModuloKey[]; max_usuarios: number; max_instancias: number; ativo: boolean; ordem: number;
}
interface Org {
  id: string; nome: string; status: string; plano_id: string | null;
  plano_nome?: string; usuarios?: number;
}

const PLANO_VAZIO = { nome: "", slug: "", preco: 0, max_usuarios: 5, max_instancias: 1, modulos: [] as ModuloKey[], ordem: 0 };

export default function AdminSaaS() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);

  // ----- diálogo de cliente -----
  const [openOrg, setOpenOrg] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);
  const [formOrg, setFormOrg] = useState({ nome: "", plano_id: "", admin_nome: "", admin_email: "", admin_senha: "" });

  // ----- diálogo de plano -----
  const [openPlano, setOpenPlano] = useState(false);
  const [savingPlano, setSavingPlano] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formPlano, setFormPlano] = useState<typeof PLANO_VAZIO>(PLANO_VAZIO);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data: pls }, { data: os }, { data: profs }] = await Promise.all([
      supabase.from("planos").select("*").order("ordem"),
      supabase.from("organizations").select("id, nome, status, plano_id").order("created_at", { ascending: false }),
      supabase.from("profiles").select("org_id"),
    ]);
    const planosList = ((pls as unknown as Plano[]) ?? []);
    const contagem = new Map<string, number>();
    ((profs as { org_id: string | null }[]) ?? []).forEach((p) => {
      if (p.org_id) contagem.set(p.org_id, (contagem.get(p.org_id) ?? 0) + 1);
    });
    setPlanos(planosList);
    setOrgs(((os as Org[]) ?? []).map((o) => ({
      ...o,
      plano_nome: planosList.find((pl) => pl.id === o.plano_id)?.nome,
      usuarios: contagem.get(o.id) ?? 0,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  // ---------- Clientes ----------
  const criarOrg = async () => {
    if (!formOrg.nome || !formOrg.admin_email || formOrg.admin_senha.length < 6)
      return toast.error("Preencha nome da empresa, e-mail e senha (mín. 6) do admin.");
    setSavingOrg(true);
    try {
      await adminAction("create_org", formOrg);
      toast.success("Cliente criado.");
      setOpenOrg(false);
      setFormOrg({ nome: "", plano_id: "", admin_nome: "", admin_email: "", admin_senha: "" });
      await carregar();
    } catch (e) { toast.error((e as Error).message); }
    setSavingOrg(false);
  };
  const mudarPlano = async (org_id: string, plano_id: string) => {
    try { await adminAction("set_org_plan", { org_id, plano_id }); toast.success("Plano atualizado."); await carregar(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const mudarStatus = async (org_id: string, status: string) => {
    try { await adminAction("set_org_status", { org_id, status }); await carregar(); }
    catch (e) { toast.error((e as Error).message); }
  };

  // ---------- Planos (super admin escreve direto via RLS) ----------
  const abrirNovoPlano = () => { setEditId(null); setFormPlano({ ...PLANO_VAZIO, ordem: planos.length + 1 }); setOpenPlano(true); };
  const abrirEditarPlano = (p: Plano) => {
    setEditId(p.id);
    setFormPlano({ nome: p.nome, slug: p.slug, preco: Number(p.preco), max_usuarios: p.max_usuarios, max_instancias: p.max_instancias ?? 1, modulos: p.modulos ?? [], ordem: p.ordem });
    setOpenPlano(true);
  };
  const salvarPlano = async () => {
    if (!formPlano.nome.trim()) return toast.error("Informe o nome do plano.");
    const slug = (formPlano.slug.trim() || formPlano.nome.trim().toLowerCase().replace(/\s+/g, "-")).replace(/[^a-z0-9-]/g, "");
    const dados = { nome: formPlano.nome.trim(), slug, preco: Number(formPlano.preco) || 0, max_usuarios: Number(formPlano.max_usuarios) || 1, max_instancias: Number(formPlano.max_instancias) || 0, modulos: formPlano.modulos, ordem: Number(formPlano.ordem) || 0 };
    setSavingPlano(true);
    try {
      const q = editId
        ? await (supabase as any).from("planos").update(dados).eq("id", editId)
        : await (supabase as any).from("planos").insert(dados);
      if (q.error) throw new Error(q.error.message);
      toast.success(editId ? "Plano atualizado." : "Plano criado.");
      setOpenPlano(false);
      await carregar();
    } catch (e) { toast.error((e as Error).message); }
    setSavingPlano(false);
  };
  const excluirPlano = async (p: Plano) => {
    const emUso = orgs.some((o) => o.plano_id === p.id);
    if (emUso) return toast.error("Há clientes usando este plano. Troque-os antes de excluir.");
    if (!confirm(`Excluir o plano "${p.nome}"?`)) return;
    try {
      const { error } = await (supabase as any).from("planos").delete().eq("id", p.id);
      if (error) throw new Error(error.message);
      toast.success("Plano excluído."); await carregar();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <AppLayout titulo="Painel SaaS" descricao="Gerencie clientes e planos" icone={<Shield className="h-5 w-5 text-primary" />}>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Tabs defaultValue="clientes" className="space-y-4">
          <TabsList>
            <TabsTrigger value="clientes">Clientes</TabsTrigger>
            <TabsTrigger value="planos">Planos</TabsTrigger>
          </TabsList>

          {/* ---------------- CLIENTES ---------------- */}
          <TabsContent value="clientes" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={openOrg} onOpenChange={setOpenOrg}>
                <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Novo cliente</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1"><Label>Nome da empresa</Label>
                      <Input value={formOrg.nome} onChange={(e) => setFormOrg({ ...formOrg, nome: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Plano</Label>
                      <Select value={formOrg.plano_id} onValueChange={(v) => setFormOrg({ ...formOrg, plano_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{planos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                      </Select></div>
                    <div className="border-t pt-3 text-sm font-medium text-muted-foreground">Admin do cliente</div>
                    <div className="space-y-1"><Label>Nome</Label>
                      <Input value={formOrg.admin_nome} onChange={(e) => setFormOrg({ ...formOrg, admin_nome: e.target.value })} /></div>
                    <div className="space-y-1"><Label>E-mail</Label>
                      <Input type="email" value={formOrg.admin_email} onChange={(e) => setFormOrg({ ...formOrg, admin_email: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Senha inicial</Label>
                      <Input type="text" value={formOrg.admin_senha} onChange={(e) => setFormOrg({ ...formOrg, admin_senha: e.target.value })} /></div>
                  </div>
                  <DialogFooter>
                    <Button onClick={criarOrg} disabled={savingOrg}>
                      {savingOrg && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {orgs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum cliente ainda.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {orgs.map((o) => {
                  const plano = planos.find((p) => p.id === o.plano_id);
                  return (
                    <Card key={o.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 min-w-0"><Building2 className="h-4 w-4 shrink-0" /><span className="truncate">{o.nome}</span></span>
                          <Badge variant={o.status === "ativo" ? "default" : "destructive"}>{o.status}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <div className="text-muted-foreground">{o.usuarios}{plano ? ` / ${plano.max_usuarios}` : ""} usuários</div>
                        <div className="space-y-1">
                          <Label className="text-xs">Plano</Label>
                          <Select value={o.plano_id ?? ""} onValueChange={(v) => mudarPlano(o.id, v)}>
                            <SelectTrigger className="h-8"><SelectValue placeholder="Sem plano" /></SelectTrigger>
                            <SelectContent>{planos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <Button variant="outline" size="sm" className="w-full"
                          onClick={() => mudarStatus(o.id, o.status === "ativo" ? "suspenso" : "ativo")}>
                          {o.status === "ativo" ? "Suspender" : "Reativar"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ---------------- PLANOS ---------------- */}
          <TabsContent value="planos" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={abrirNovoPlano}><Plus className="mr-2 h-4 w-4" /> Novo plano</Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {planos.map((p) => (
                <Card key={p.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between gap-2">
                      <span className="truncate">{p.nome}</span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrirEditarPlano(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => excluirPlano(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="text-muted-foreground">R$ {Number(p.preco).toFixed(2)} · {p.max_usuarios} usuários · {p.max_instancias ?? 0} WhatsApp</div>
                    <div className="flex flex-wrap gap-1">
                      {(p.modulos ?? []).map((m) => <Badge key={m} variant="secondary">{MODULOS.find((x) => x.key === m)?.nome ?? m}</Badge>)}
                      {(!p.modulos || p.modulos.length === 0) && <span className="text-xs text-muted-foreground">Sem módulos</span>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Dialog open={openPlano} onOpenChange={setOpenPlano}>
              <DialogContent>
                <DialogHeader><DialogTitle>{editId ? "Editar plano" : "Novo plano"}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1"><Label>Nome</Label>
                    <Input value={formPlano.nome} onChange={(e) => setFormPlano({ ...formPlano, nome: e.target.value })} /></div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1"><Label>Preço (R$)</Label>
                      <Input type="number" value={formPlano.preco} onChange={(e) => setFormPlano({ ...formPlano, preco: Number(e.target.value) })} /></div>
                    <div className="space-y-1"><Label>Máx. usuários</Label>
                      <Input type="number" value={formPlano.max_usuarios} onChange={(e) => setFormPlano({ ...formPlano, max_usuarios: Number(e.target.value) })} /></div>
                    <div className="space-y-1"><Label>Máx. WhatsApp</Label>
                      <Input type="number" value={formPlano.max_instancias} onChange={(e) => setFormPlano({ ...formPlano, max_instancias: Number(e.target.value) })} /></div>
                  </div>
                  <div className="space-y-2">
                    <Label>Módulos incluídos</Label>
                    {MODULOS.map((m) => (
                      <div key={m.key} className="flex items-center gap-2">
                        <Checkbox checked={formPlano.modulos.includes(m.key)}
                          onCheckedChange={(v) => setFormPlano({
                            ...formPlano,
                            modulos: v ? [...formPlano.modulos, m.key] : formPlano.modulos.filter((k) => k !== m.key),
                          })} />
                        <span className="text-sm">{m.nome}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={salvarPlano} disabled={savingPlano}>
                    {savingPlano && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>
      )}
    </AppLayout>
  );
}
