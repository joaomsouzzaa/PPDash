import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { getOrgId } from "@/lib/org";
import { useRef, useEffect } from "react";

const PAPEL_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  client_admin: "Admin",
  user: "Usuário",
};

export default function Configuracoes() {
  const { profile, plano, isSuperAdmin, isClientAdmin, marca, refresh } = useAuth();
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [salvando, setSalvando] = useState(false);

  // ---- Marca (admin do cliente) ----
  const [marcaNome, setMarcaNome] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [salvandoMarca, setSalvandoMarca] = useState(false);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMarcaNome(marca.nome || "");
    setLogoUrl(marca.logo || null);
  }, [marca]);

  const enviarLogo = async (file: File) => {
    if (!profile?.org_id) return;
    if (file.size > 1024 * 1024) return toast.error("A imagem deve ter no máximo 1 MB.");
    setEnviandoLogo(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const orgId = await getOrgId();
      const path = `${orgId}/logo-${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("branding").upload(path, file, { upsert: true });
      if (up.error) throw up.error;
      const url = supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
      setLogoUrl(url);
      toast.success("Logo carregada. Clique em Salvar marca para aplicar.");
    } catch (e: any) { toast.error(`Erro no upload: ${e?.message || "falhou"}`); }
    setEnviandoLogo(false);
  };

  const salvarMarca = async () => {
    if (!profile?.org_id) return;
    setSalvandoMarca(true);
    const { error } = await (supabase as any).from("organizations")
      .update({ marca_nome: marcaNome.trim() || null, marca_logo_url: logoUrl })
      .eq("id", profile.org_id);
    setSalvandoMarca(false);
    if (error) return toast.error(error.message);
    await refresh();
    toast.success("Marca atualizada.");
  };

  const trocarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.length < 6) return toast.error("A senha deve ter ao menos 6 caracteres.");
    if (senha !== senha2) return toast.error("As senhas não coincidem.");
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) return toast.error(error.message);
    setSenha(""); setSenha2("");
    toast.success("Senha atualizada com sucesso.");
  };

  return (
    <AppLayout titulo="Configurações da Conta" descricao="Seus dados de acesso" icone={<Settings className="h-5 w-5 text-primary" />}>
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perfil</CardTitle>
            <CardDescription>Informações da sua conta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Nome</span><span>{profile?.nome ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">E-mail</span><span>{profile?.email}</span></div>
            <div className="flex justify-between items-center"><span className="text-muted-foreground">Papel</span><Badge variant="secondary">{PAPEL_LABEL[profile?.papel ?? "user"]}</Badge></div>
            {!isSuperAdmin && (
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Plano</span><Badge>{plano?.nome ?? "Sem plano"}</Badge></div>
            )}
          </CardContent>
        </Card>

        {isClientAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Marca</CardTitle>
              <CardDescription>Personalize o nome e o logo (aparecem no menu e na aba do navegador)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-lg border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {logoUrl ? <img src={logoUrl} alt="logo" className="h-full w-full object-contain" /> : <span className="text-xs text-muted-foreground">sem logo</span>}
                </div>
                <div>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden"
                    onChange={(e) => { if (e.target.files?.[0]) enviarLogo(e.target.files[0]); e.target.value = ""; }} />
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={enviandoLogo}>
                    {enviandoLogo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    Enviar logo
                  </Button>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    Recomendado: <strong>256 × 256 px</strong> (quadrado), PNG com <strong>fundo transparente</strong>.<br />
                    Máx. 1&nbsp;MB · também aceita JPG, SVG ou WEBP.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="marca">Nome da marca</Label>
                <Input id="marca" value={marcaNome} onChange={(e) => setMarcaNome(e.target.value)} placeholder="Ex.: Minha Empresa" />
              </div>
              <Button onClick={salvarMarca} disabled={salvandoMarca}>
                {salvandoMarca && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar marca
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trocar senha</CardTitle>
            <CardDescription>Defina uma nova senha de acesso</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={trocarSenha} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="s1">Nova senha</Label>
                <Input id="s1" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s2">Confirmar nova senha</Label>
                <Input id="s2" type="password" value={senha2} onChange={(e) => setSenha2(e.target.value)} autoComplete="new-password" />
              </div>
              <Button type="submit" disabled={salvando}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
