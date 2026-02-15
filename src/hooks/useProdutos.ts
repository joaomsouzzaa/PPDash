import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Produto {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
}

export function useProdutos() {
  return useQuery({
    queryKey: ["produtos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id, nome, slug, ativo")
        .order("nome", { ascending: true });

      if (error) throw error;
      return (data as Produto[]) || [];
    },
  });
}
