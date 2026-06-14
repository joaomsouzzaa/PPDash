import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Valores distintos de utm_content nos leads (para vincular criativos).
export function useDistinctUtmContent() {
  return useQuery({
    queryKey: ["distinct-utm-content"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("leads")
        .select("utm_content")
        .not("utm_content", "is", null)
        .limit(5000);
      if (error) throw error;
      const set = new Set<string>();
      for (const r of data || []) {
        const v = (r as { utm_content: string | null }).utm_content;
        if (v && v.trim()) set.add(v.trim());
      }
      return [...set].sort((a, b) => a.localeCompare(b));
    },
    staleTime: 5 * 60 * 1000,
  });
}
