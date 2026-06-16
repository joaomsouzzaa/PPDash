import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { adminAction } from "@/lib/adminApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Users, Plus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MODULOS_CATALOGO, TODOS_OS_ITENS, expandirItens } from "@/lib/modulos";

interface Membro {
  id: string; nome: string | null; email: string | null; papel: string; status: string;
  modulos: string[];
}

/** Itens (filtrados ao que o plano libera) agrupados por módulo, para render. */
function ModulosCheckboxes({ valor, disponiveis, onToggle }: {
  valor: string[]; disponiveis: string[]; onToggle: (key: string, on: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      {MODULOS_CATALOGO.map((mod) => {
        const itens = mod.itens.filter((it) => disponiveis.includes(it.key));
        if (itens.length === 0) return null;
        return (
          <div key={mod.key} className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">{mod.nome}</p>
            <div className="pl-1 grid grid-cols-2 gap-1">
              {itens.map((it) => (
                <label key={it.key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={valor.includes(it.key)} onCheckedChange={(v) => onToggle(it.key, !!v)} />
                  {it.nome}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Equipe() {
  const { plano, profile, isSuperAdmin } = useAuth();
  const disponiveis = isSuperAdmin ? TODOS_OS_ITENS : expandirItens(plano?.modulos ?? []);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<{ nome: string; email: string; senha: string; modulos: string[] }>(
    { nome: "", email: "", senha: "", modulos: [] }
  );
  const [convidar, setConvidar] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    const orgId = profile?.org_id;
    if (!orgId) { setMembros([]); setLoading(false); return; }
    // Membros = memberships desta org (papel/status vêm da membership).
    const { data: mems } = await supabase
      .from("memberships")
      .select("user_id, papel, status")
      .eq("org_id", orgId);
    const memRows = (mems as { user_id: string; papel: string; status: string }[]) ?? [];
    const ids = memRows.map((m) => m.user_id);
    if (ids.length === 0) { setMembros([]); setLoading(false); return; }

    const { data: profs } = await supabase
      .from("profiles")
      .select("id, nome, email")
      .in("id", ids);
    const mapProf = new Map<string, { nome: string | null; email: string | null }>();
    ((profs as { id: string; nome: string | null; email: string | null }[]) ?? []).forEach((p) =>
      mapProf.set(p.id, { nome: p.nome, email: p.email })
    );

    const { data: ums } = await supabase
      .from("user_modulos")
      .select("user_id, modulo_key")
      .eq("org_id", orgId)
      .in("user_id", ids);
    const mapMods = new Map<string, string[]>();
    ((ums as { user_id: string; modulo_key: string }[]) ?? []).forEach((r) => {
      mapMods.set(r.user_id, [...(mapMods.get(r.user_id) ?? []), r.modulo_key]);
    });

    setMembros(memRows.map((m) => ({
      id: m.user_id,
      nome: mapProf.get(m.user_id)?.nome ?? null,
      email: mapProf.get(m.user_id)?.email ?? null,
      papel: m.papel,
      status: m.status,
      modulos: mapMods.get(m.user_id) ?? [],
    })));
    setLoading(false);
  }, [profile?.org_id]);

  useEffect(() => { void carregar(); }, [carregar]);

  const criar = async () => {
    if (!form.email) return toast.error("Informe o e-mail.");
    if (!convidar && form.senha.length < 6) return toast.error("Defina uma senha (mín. 6 caracteres).");
    setSalvando(true);
    try {
      const org_id = profile?.org_id;
      if (convidar) {
        await adminAction("invite_member", { email: form.email, nome: form.nome, modulos: form.modulos, org_id });
        toast.success("Convite enviado por e-mail.");
      } else {
        await adminAction("create_member", { ...form, org_id });
        toast.success("Membro criado.");
      }
      setOpen(false);
      setForm({ nome: "", email: "", senha: "", modulos: [] });
      await carregar();
    } catch (e) { toast.error((e as Error).message); }
    setSalvando(false);
  };

  const toggleModulo = async (m: Membro, key: string, on: boolean) => {
    const novos = on ? [...m.modulos, key] : m.modulos.filter((k) => k !== key);
    try {
      await adminAction("set_member_modules", { user_id: m.id, modulos: novos, org_id: profile?.org_id });
      setMembros((prev) => prev.map((x) => x.id === m.id ? { ...x, modulos: novos } : x));
    } catch (e) { toast.error((e as Error).message); }
  };

  const toggleStatus = async (m: Membro) => {
    const status = m.status === "ativo" ? "inativo" : "ativo";
    try { await adminAction("set_member_status", { user_id: m.id, status, org_id: profile?.org_id }); await carregar(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const excluir = async (m: Membro) => {
    if (!confirm(`Remover ${m.email} deste cliente?`)) return;
    try { await adminAction("delete_member", { user_id: m.id, org_id: profile?.org_id }); toast.success("Removido."); await carregar(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <AppLayout
      titulo="Minha Equipe"
      descricao="Gerencie os usuários e os módulos que cada um acessa"
      icone={<Users className="h-5 w-5 text-primary" />}
      acoes={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> Novo membro</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo membro</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1"><Label>Nome</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
              <div className="space-y-1"><Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={convidar} onCheckedChange={(v) => setConvidar(!!v)} />
                Enviar convite por e-mail (a pessoa define a própria senha)
              </label>
              {!convidar && (
                <div className="space-y-1"><Label>Senha inicial</Label>
                  <Input type="text" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} /></div>
              )}
              <div className="space-y-2">
                <Label>Itens liberados</Label>
                {disponiveis.length === 0 && <p className="text-xs text-muted-foreground">Seu plano não tem itens definidos.</p>}
                <ModulosCheckboxes
                  valor={form.modulos}
                  disponiveis={disponiveis}
                  onToggle={(key, on) => setForm({
                    ...form,
                    modulos: on ? [...form.modulos, key] : form.modulos.filter((k) => k !== key),
                  })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={criar} disabled={salvando}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {convidar ? "Enviar convite" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 items-start">
          {membros.map((m) => (
            <Card key={m.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{m.nome || m.email}</span>
                  <span className="flex items-center gap-2">
                    {m.papel === "client_admin" && <Badge variant="secondary">Admin</Badge>}
                    {m.id === profile?.id && <Badge>Você</Badge>}
                    <Badge variant={m.status === "ativo" ? "default" : "destructive"}>{m.status}</Badge>
                  </span>
                </CardTitle>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {m.papel !== "client_admin" && (
                  <ModulosCheckboxes
                    valor={m.modulos}
                    disponiveis={disponiveis}
                    onToggle={(key, on) => toggleModulo(m, key, on)}
                  />
                )}
                {m.id !== profile?.id && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => toggleStatus(m)}>
                      {m.status === "ativo" ? "Desativar" : "Ativar"}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => excluir(m)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
