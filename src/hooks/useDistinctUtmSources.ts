import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Valores distintos de utm_source registrados nos leads — usado para popular
// o seletor de UTM Source no cadastro de canais de aquisição.
export function useDistinctUtmSources() {
  return useQuery({
    queryKey: ["distinct-utm-sources"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select("utm_source")
        .not("utm_source", "is", null)
        .limit(5000);
      if (error) throw error;
      const distinct = new Set<string>();
      for (const r of data || []) {
        const v = (r as { utm_source: string | null }).utm_source;
        if (v) distinct.add(v);
      }
      return [...distinct].sort((a, b) => a.localeCompare(b));
    },
    staleTime: 5 * 60 * 1000,
  });
}
