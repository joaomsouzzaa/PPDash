import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Produto {
  id: string;
  nome: string;
  slug: string;               // slug do UTM Campaign / nome da campanha (para o investimento)
  slug_source: string | null; // slug do UTM Source (para contar os leads)
  conta_id: string | null;    // conta de anúncios do Meta (act_...) deste canal
  plataforma: "meta" | "google" | "none"; // de onde vem o investimento ("none" = sem investimento)
  google_conta_id: string | null; // customer id do Google Ads (só dígitos)
  investimento_manual: number | null; // R$/dia, fallback quando não há API
  metricas: string[] | null; // blocos/KPIs visíveis no dash (null = todos)
  ativo: boolean;
}

export function useProdutos() {
  return useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("produtos")
        .select("id, nome, slug, slug_source, conta_id, plataforma, google_conta_id, investimento_manual, metricas, ativo")
        .order("nome", { ascending: true });

      if (error) throw error;
      return (data as Produto[]) || [];
    },
  });
}
