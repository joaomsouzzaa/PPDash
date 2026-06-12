import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Check, Loader2 } from "lucide-react";

const MODULO_LABEL: Record<string, string> = {
  eventos: "Eventos", inside: "Inside Sales", analytics: "Analytics", growth: "Growth",
};

export default function Plano() {
  const { plano, profile } = useAuth();
  const [usuarios, setUsuarios] = useState<number | null>(null);

  useEffect(() => {
    if (!profile?.org_id) return;
    supabase.from("profiles").select("id", { count: "exact", head: true })
      .eq("org_id", profile.org_id)
      .then(({ count }) => setUsuarios(count ?? 0));
  }, [profile?.org_id]);

  return (
    <AppLayout titulo="Gerenciar Plano" descricao="Seu plano atual e uso" icone={<CreditCard className="h-5 w-5 text-primary" />}>
      <div className="max-w-xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {plano?.nome ?? "Sem plano"} <Badge>Ativo</Badge>
            </CardTitle>
            <CardDescription>Plano contratado para sua organização</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Usuários</span>
              <span>{usuarios === null ? <Loader2 className="h-3 w-3 animate-spin" /> : usuarios}{plano ? ` / ${plano.max_usuarios}` : ""}</span>
            </div>
            <div>
              <p className="text-muted-foreground mb-2">Módulos incluídos</p>
              <div className="space-y-1">
                {(plano?.modulos ?? []).map((m) => (
                  <div key={m} className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> {MODULO_LABEL[m] ?? m}</div>
                ))}
                {(!plano?.modulos || plano.modulos.length === 0) && <p className="text-muted-foreground">Nenhum módulo definido.</p>}
              </div>
            </div>
          </CardContent>
        </Card>
        <p className="text-sm text-muted-foreground">
          Para mudar de plano ou aumentar o limite de usuários, entre em contato com o administrador do sistema.
        </p>
      </div>
    </AppLayout>
  );
}
