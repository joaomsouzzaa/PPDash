import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Criativo {
  id: string;
  nome: string;
  utm_contents: string[] | null; // leads/vendas
  ad_names: string[] | null;     // investimento (Meta)
  ativo: boolean;
  ordem: number;
}

export function useCriativos() {
  return useQuery({
    queryKey: ["criativos"],
    queryFn: async (): Promise<Criativo[]> => {
      const { data, error } = await (supabase as any)
        .from("criativos")
        .select("id, nome, utm_contents, ad_names, ativo, ordem")
        .order("ordem", { ascending: true })
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data || []).map((c: any) => ({
        ...c,
        utm_contents: Array.isArray(c.utm_contents) ? c.utm_contents : [],
        ad_names: Array.isArray(c.ad_names) ? c.ad_names : [],
      }));
    },
  });
}
