import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Produto {
  id: string;
  nome: string;
  slug: string;               // slug do UTM Campaign / nome da campanha (para o investimento)
  slug_source: string | null; // slug do UTM Source (para contar os leads)
  ativo: boolean;
}

export function useProdutos() {
  return useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("produtos")
        .select("id, nome, slug, slug_source, ativo")
        .order("nome", { ascending: true });

      if (error) throw error;
      return (data as Produto[]) || [];
    },
  });
}
