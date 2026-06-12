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
import type { ModuloKey } from "@/hooks/useModulos";

const MODULOS: { key: ModuloKey; nome: string }[] = [
  { key: "eventos", nome: "Eventos" },
  { key: "inside", nome: "Inside Sales" },
  { key: "analytics", nome: "Analytics" },
  { key: "growth", nome: "Growth" },
];

interface Membro {
  id: string; nome: string | null; email: string | null; papel: string; status: string;
  modulos: ModuloKey[];
}

export default function Equipe() {
  const { plano, profile, isSuperAdmin } = useAuth();
  const disponiveis = isSuperAdmin
    ? MODULOS.map((m) => m.key)
    : ((plano?.modulos ?? []) as ModuloKey[]);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<{ nome: string; email: string; senha: string; modulos: ModuloKey[] }>(
    { nome: "", email: "", senha: "", modulos: [] }
  );

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, nome, email, papel, status")
      .order("created_at");
    const ids = ((profs as Membro[]) ?? []).map((p) => p.id);
    const { data: ums } = ids.length
      ? await supabase.from("user_modulos").select("user_id, modulo_key").in("user_id", ids)
      : { data: [] as { user_id: string; modulo_key: ModuloKey }[] };
    const mapMods = new Map<string, ModuloKey[]>();
    ((ums as { user_id: string; modulo_key: ModuloKey }[]) ?? []).forEach((r) => {
      mapMods.set(r.user_id, [...(mapMods.get(r.user_id) ?? []), r.modulo_key]);
    });
    setMembros(((profs as Membro[]) ?? []).map((p) => ({ ...p, modulos: mapMods.get(p.id) ?? [] })));
    setLoading(false);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const criar = async () => {
    if (!form.email || form.senha.length < 6) return toast.error("Informe e-mail e senha (mín. 6 caracteres).");
    setSalvando(true);
    try {
      await adminAction("create_member", form);
      toast.success("Membro criado.");
      setOpen(false);
      setForm({ nome: "", email: "", senha: "", modulos: [] });
      await carregar();
    } catch (e) { toast.error((e as Error).message); }
    setSalvando(false);
  };

  const toggleModulo = async (m: Membro, key: ModuloKey, on: boolean) => {
    const novos = on ? [...m.modulos, key] : m.modulos.filter((k) => k !== key);
    try {
      await adminAction("set_member_modules", { user_id: m.id, modulos: novos });
      setMembros((prev) => prev.map((x) => x.id === m.id ? { ...x, modulos: novos } : x));
    } catch (e) { toast.error((e as Error).message); }
  };

  const toggleStatus = async (m: Membro) => {
    const status = m.status === "ativo" ? "inativo" : "ativo";
    try { await adminAction("set_member_status", { user_id: m.id, status }); await carregar(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const excluir = async (m: Membro) => {
    if (!confirm(`Excluir ${m.email}?`)) return;
    try { await adminAction("delete_member", { user_id: m.id }); toast.success("Excluído."); await carregar(); }
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
              <div className="space-y-1"><Label>Senha inicial</Label>
                <Input type="text" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Módulos liberados</Label>
                {disponiveis.length === 0 && <p className="text-xs text-muted-foreground">Seu plano não tem módulos definidos.</p>}
                {MODULOS.filter((m) => disponiveis.includes(m.key)).map((m) => (
                  <div key={m.key} className="flex items-center gap-2">
                    <Checkbox
                      checked={form.modulos.includes(m.key)}
                      onCheckedChange={(v) => setForm({
                        ...form,
                        modulos: v ? [...form.modulos, m.key] : form.modulos.filter((k) => k !== m.key),
                      })}
                    />
                    <span className="text-sm">{m.nome}</span>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={criar} disabled={salvando}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3 max-w-3xl">
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
                  <div className="flex flex-wrap gap-4">
                    {MODULOS.filter((mod) => disponiveis.includes(mod.key)).map((mod) => (
                      <label key={mod.key} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={m.modulos.includes(mod.key)} onCheckedChange={(v) => toggleModulo(m, mod.key, !!v)} />
                        {mod.nome}
                      </label>
                    ))}
                  </div>
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
