import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function DefinirSenha() {
  const { session, loading } = useAuth();
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [salvando, setSalvando] = useState(false);
  const navigate = useNavigate();

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.length < 6) return toast.error("A senha deve ter ao menos 6 caracteres.");
    if (senha !== senha2) return toast.error("As senhas não coincidem.");
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Senha definida! Bem-vindo(a).");
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Definir senha</CardTitle>
          <CardDescription>Crie sua senha de acesso para concluir o cadastro.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !session ? (
            <p className="text-sm text-muted-foreground text-center">
              Link inválido ou expirado. Peça um novo convite ao administrador.
            </p>
          ) : (
            <form onSubmit={salvar} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="s1">Nova senha</Label>
                <Input id="s1" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s2">Confirmar senha</Label>
                <Input id="s2" type="password" autoComplete="new-password" value={senha2} onChange={(e) => setSenha2(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={salvando}>
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Definir senha e entrar
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
