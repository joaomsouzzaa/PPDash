import { supabase } from "@/integrations/supabase/client";
import { getTenantSlug } from "@/lib/tenant";

let cache: string | null | undefined;

/**
 * org_id da ORG ATIVA (do subdomínio), cacheado. Usado para prefixar caminhos de Storage.
 * Resolvido pelo slug via RPC pública `org_branding` (não depende de login).
 */
export async function getOrgId(): Promise<string | null> {
  if (cache !== undefined) return cache;
  const slug = getTenantSlug();
  const { data } = await supabase.rpc("org_branding", { p_slug: slug });
  const row = Array.isArray(data) ? data[0] : data;
  cache = (row as { id?: string } | null)?.id ?? null;
  return cache;
}

/** Limpa o cache (ex.: ao trocar de conta). */
export function clearOrgIdCache() { cache = undefined; }
