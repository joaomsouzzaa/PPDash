import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings, Loader2 } from "lucide-react";
import { toast } from "sonner";

const PAPEL_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  client_admin: "Admin",
  user: "Usuário",
};

export default function Configuracoes() {
  const { profile, plano, isSuperAdmin } = useAuth();
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [salvando, setSalvando] = useState(false);

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
      <div className="max-w-xl space-y-6">
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
