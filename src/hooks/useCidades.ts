import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Cidade {
  id: string;
  nome: string;
  slug: string;
  data_evento: string;
}

export function useCidades() {
  return useQuery({
    queryKey: ["cidades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cidades")
        .select("id, nome, slug, data_evento")
        .order("nome");

      if (error) throw error;
      return (data as Cidade[]) || [];
    },
  });
}
