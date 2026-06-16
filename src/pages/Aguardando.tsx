import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Clock } from "lucide-react";

export default function Aguardando() {
  const { signOut, profile } = useAuth();
  const semAcesso = profile?.status === "sem_acesso";
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="space-y-2">
          <div className="mx-auto h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Clock className="h-6 w-6 text-amber-500" />
          </div>
          <CardTitle>{semAcesso ? "Sem acesso a este cliente" : "Conta aguardando liberação"}</CardTitle>
          <CardDescription>
            {profile?.email ? <span className="font-medium">{profile.email}</span> : "Seu acesso"}{" "}
            {semAcesso
              ? "não tem acesso a este cliente. Verifique se o endereço (subdomínio) está correto ou peça ao administrador para liberar seu acesso."
              : "ainda não foi liberado. O administrador precisa aprovar sua conta e definir seu plano/acessos."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => signOut()}>Sair</Button>
        </CardContent>
      </Card>
    </div>
  );
}
