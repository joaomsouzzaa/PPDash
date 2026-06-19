import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Agendador por cliente: roda de hora em hora (cron 0 * * * *).
// Para cada org cujo organizations.sync_horario == hora atual em America/Sao_Paulo,
// dispara crm-sync e meta-leads-sync com { org_id } — cada função sincroniza e
// envia seu relatório (gatilhos sync_concluido / sync_meta_concluido) inline.
// Substitui os crons globais fixos crm-sync-diario / meta-leads-sync-diario.
// Body opcional: { hora?: number, dias?: number } (hora força o filtro; útil p/ teste).

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// Hora (0-23) no fuso de São Paulo.
function horaBRT(): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date());
  const h = parseInt(s, 10);
  return h === 24 ? 0 : h; // "24" pode aparecer em alguns runtimes p/ meia-noite
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const supabase = svc();
    const body = await req.json().catch(() => ({}));
    const hora = Number.isInteger(body.hora) ? Number(body.hora) : horaBRT();

    const { data: orgs, error } = await supabase.from("organizations").select("id, slug, sync_horario").eq("sync_horario", hora);
    if (error) throw new Error(error.message);
    if (!orgs?.length) return json({ ok: true, hora, processados: 0, msg: "nenhuma org neste horario" });

    const baseUrl = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";

    const call = (slug: string, orgId: string) =>
      fetch(`${baseUrl}/functions/v1/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${anon}`, apikey: anon },
        body: JSON.stringify(body.dias ? { org_id: orgId, dias: body.dias } : { org_id: orgId }),
        signal: AbortSignal.timeout(170000),
      }).then((r) => r.json()).catch((e) => ({ erro: String(e) }));

    const resultados: any[] = [];
    for (const o of orgs) {
      const crm = await call("crm-sync", o.id);
      const meta = await call("meta-leads-sync", o.id);
      resultados.push({ org: o.slug, crm, meta });
    }
    return json({ ok: true, hora, processados: resultados.length, resultados });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "erro" }, 500);
  }
});
