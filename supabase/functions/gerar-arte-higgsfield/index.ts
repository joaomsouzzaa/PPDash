import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://platform.higgsfield.ai";
// Caminhos dos modelos (sob o BASE). Ajustar se o plano usar outros slugs.
const MODELO = {
  imagem: "flux-pro/kontext/max/text-to-image",
  video: "higgsfield/image-to-video",
};

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// Procura uma URL de mídia em formatos de resposta variados.
function extrairUrl(obj: any): string | null {
  if (!obj) return null;
  return obj.images?.[0]?.url || obj.image?.url || obj.video?.url
    || obj.results?.raw?.url || obj.result?.url || obj.url
    || obj.output?.[0]?.url || null;
}

Deno.serve(async (req) => {
  console.log("gerar-arte-higgsfield v2");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = svc();
  let anexoId: string | null = null;

  try {
    const { data: cfg } = await supabase
      .from("ai_config").select("api_key").eq("provider", "higgsfield").maybeSingle();
    const creds = cfg?.api_key || Deno.env.get("HIGGSFIELD_CREDENTIALS");
    if (!creds) throw new Error("Configure a chave do Higgsfield em Agentes → Configurar modelos");

    const authHeaders = {
      "Authorization": `Key ${creds.trim()}`,
      "Content-Type": "application/json",
      "User-Agent": "scaledash/1.0",
    };

    const body = await req.json();
    const tarefaId: string = body.tarefa_id;
    const tipo: "imagem" | "video" = body.tipo === "video" ? "video" : "imagem";
    const aspect: string = body.aspect_ratio || "9:16";
    if (!tarefaId) throw new Error("tarefa_id é obrigatório");

    const { data: tarefa } = await supabase
      .from("tarefas").select("titulo,descricao").eq("id", tarefaId).maybeSingle();
    if (!tarefa) throw new Error("Tarefa não encontrada");

    const prompt: string = (body.prompt && String(body.prompt).trim())
      || [tarefa.titulo, tarefa.descricao].filter(Boolean).join(" — ");
    if (!prompt) throw new Error("Sem copy/prompt para gerar a arte");

    const ins = await supabase.from("tarefa_anexos")
      .insert({ tarefa_id: tarefaId, tipo, prompt, status: "gerando" })
      .select("id").single();
    anexoId = ins.data?.id ?? null;

    // 1) Submete o job.
    const submitRes = await fetch(`${BASE}/${MODELO[tipo]}`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ input: { prompt, aspect_ratio: aspect, safety_tolerance: 2 } }),
    });
    const submitText = await submitRes.text();
    let submit: any = {};
    try { submit = JSON.parse(submitText); } catch { submit = { raw: submitText }; }
    if (!submitRes.ok) {
      throw new Error(`Higgsfield ${submitRes.status}: ${submit?.detail || submit?.error || submit?.message || submitText.slice(0, 200)}`);
    }

    const requestId = submit.request_id || submit.id || submit.requestId;
    let url = extrairUrl(submit); // alguns modelos já retornam pronto

    // 2) Polling até concluir (máx ~2 min).
    if (!url && requestId) {
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const stRes = await fetch(`${BASE}/requests/${requestId}/status`, { headers: authHeaders });
        const st = await stRes.json().catch(() => ({}));
        const status = (st.status || "").toLowerCase();
        if (status === "completed" || status === "succeeded" || status === "success") {
          url = extrairUrl(st);
          break;
        }
        if (status === "failed" || status === "error" || status === "nsfw") {
          throw new Error(`Geração falhou no Higgsfield (status: ${status})`);
        }
      }
    }

    if (!url) throw new Error("Higgsfield não retornou a arte (timeout ou formato inesperado)");

    await supabase.from("tarefa_anexos").update({ url, status: "pronto" }).eq("id", anexoId);
    await supabase.from("tarefa_respostas").insert({
      tarefa_id: tarefaId, autor: "Higgsfield", conteudo: `Arte (${tipo}) gerada: ${url}`,
    });

    return new Response(JSON.stringify({ ok: true, url, tipo, anexo_id: anexoId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (anexoId) await supabase.from("tarefa_anexos").update({ status: "erro" }).eq("id", anexoId);
    return new Response(JSON.stringify({ ok: false, error: String((e as any)?.message || e) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
