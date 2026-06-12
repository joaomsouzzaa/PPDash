import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { adminAction } from "@/lib/adminApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Plus, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";

interface Plano { id: string; nome: string; max_usuarios: number; }
interface Org {
  id: string; nome: string; status: string; plano_id: string | null;
  plano_nome?: string; usuarios?: number;
}

export default function AdminSaaS() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ nome: "", plano_id: "", admin_nome: "", admin_email: "", admin_senha: "" });

  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data: pls }, { data: os }, { data: profs }] = await Promise.all([
      supabase.from("planos").select("id, nome, max_usuarios").order("ordem"),
      supabase.from("organizations").select("id, nome, status, plano_id").order("created_at", { ascending: false }),
      supabase.from("profiles").select("org_id"),
    ]);
    const planosList = (pls as Plano[]) ?? [];
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

  const criarOrg = async () => {
    if (!form.nome || !form.admin_email || form.admin_senha.length < 6)
      return toast.error("Preencha nome da empresa, e-mail e senha (mín. 6) do admin.");
    setSalvando(true);
    try {
      await adminAction("create_org", form);
      toast.success("Cliente criado com sucesso.");
      setOpen(false);
      setForm({ nome: "", plano_id: "", admin_nome: "", admin_email: "", admin_senha: "" });
      await carregar();
    } catch (e) { toast.error((e as Error).message); }
    setSalvando(false);
  };

  const mudarPlano = async (org_id: string, plano_id: string) => {
    try { await adminAction("set_org_plan", { org_id, plano_id }); toast.success("Plano atualizado."); await carregar(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const mudarStatus = async (org_id: string, status: string) => {
    try { await adminAction("set_org_status", { org_id, status }); toast.success("Status atualizado."); await carregar(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <AppLayout
      titulo="Painel SaaS"
      descricao="Gerencie os clientes (organizações) e seus planos"
      icone={<Shield className="h-5 w-5 text-primary" />}
      acoes={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Novo cliente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1"><Label>Nome da empresa</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
              <div className="space-y-1"><Label>Plano</Label>
                <Select value={form.plano_id} onValueChange={(v) => setForm({ ...form, plano_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{planos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="border-t pt-3 text-sm font-medium text-muted-foreground">Admin do cliente</div>
              <div className="space-y-1"><Label>Nome</Label>
                <Input value={form.admin_nome} onChange={(e) => setForm({ ...form, admin_nome: e.target.value })} /></div>
              <div className="space-y-1"><Label>E-mail</Label>
                <Input type="email" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} /></div>
              <div className="space-y-1"><Label>Senha inicial</Label>
                <Input type="text" value={form.admin_senha} onChange={(e) => setForm({ ...form, admin_senha: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button onClick={criarOrg} disabled={salvando}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : orgs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum cliente ainda. Crie o primeiro com o botão acima.</p>
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
                  <div className="text-muted-foreground">
                    {o.usuarios}{plano ? ` / ${plano.max_usuarios}` : ""} usuários
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Plano</Label>
                    <Select value={o.plano_id ?? ""} onValueChange={(v) => mudarPlano(o.id, v)}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Sem plano" /></SelectTrigger>
                      <SelectContent>{planos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline" size="sm" className="w-full"
                    onClick={() => mudarStatus(o.id, o.status === "ativo" ? "suspenso" : "ativo")}
                  >
                    {o.status === "ativo" ? "Suspender" : "Reativar"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
