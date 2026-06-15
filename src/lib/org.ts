import { supabase } from "@/integrations/supabase/client";

let cache: string | null | undefined;

/** org_id do usuário logado (cacheado). Usado para prefixar caminhos de Storage. */
export async function getOrgId(): Promise<string | null> {
  if (cache !== undefined) return cache;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { cache = null; return null; }
  const { data } = await supabase.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  cache = data?.org_id ?? null;
  return cache;
}

/** Limpa o cache (ex.: ao trocar de conta). */
export function clearOrgIdCache() { cache = undefined; }
