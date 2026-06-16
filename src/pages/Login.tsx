import { useState, useEffect } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getTenantSlug } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LayoutGrid, Loader2 } from "lucide-react";

export default function Login() {
  const { signIn, session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [marca, setMarca] = useState<{ nome: string | null; logo: string | null }>({ nome: null, logo: null });
  const navigate = useNavigate();
  const location = useLocation();
  const destino = (location.state as { from?: string } | null)?.from ?? "/";

  // Branding do cliente (subdomínio) via RPC pública por slug.
  useEffect(() => {
    let ativo = true;
    supabase.rpc("org_branding", { p_slug: getTenantSlug() }).then(({ data }) => {
      if (!ativo) return;
      const row = (Array.isArray(data) ? data[0] : data) as { marca_nome: string | null; marca_logo_url: string | null } | null;
      if (row) setMarca({ nome: row.marca_nome, logo: row.marca_logo_url });
    });
    return () => { ativo = false; };
  }, []);

  if (!loading && session) return <Navigate to={destino} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const { error } = await signIn(email.trim(), senha);
    setEnviando(false);
    if (error) {
      setErro(error === "Invalid login credentials" ? "E-mail ou senha inválidos." : error);
      return;
    }
    navigate(destino, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden">
            {marca.logo
              ? <img src={marca.logo} alt={marca.nome ?? "Logo"} className="h-full w-full object-contain" />
              : <LayoutGrid className="h-6 w-6 text-primary" />}
          </div>
          <CardTitle className="text-2xl">{marca.nome ? `Entrar — ${marca.nome}` : "Entrar"}</CardTitle>
          <CardDescription>Acesse o painel com seu e-mail e senha</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </div>
            {erro && <p className="text-sm text-destructive">{erro}</p>}
            <Button type="submit" className="w-full" disabled={enviando}>
              {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
