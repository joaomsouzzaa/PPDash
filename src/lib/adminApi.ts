import { supabase } from "@/integrations/supabase/client";

/** Chama a edge function `admin` com uma ação. Lança erro com a mensagem do servidor. */
export async function adminAction<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin", {
    body: { action, payload },
  });
  if (error) {
    // tenta extrair a mensagem do corpo da resposta
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const body = await ctx.json();
        if (body?.error) msg = body.error;
      }
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const d = data as { error?: string } | null;
  if (d?.error) throw new Error(d.error);
  return data as T;
}
