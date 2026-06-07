import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// SDK oficial do Higgsfield (cuida de auth + submit-and-poll)
import { higgsfield, config } from "https://esm.sh/@higgsfield/client@latest/v2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Modelos usados. Imagem = Soul/Flux text-to-image; vídeo = image-to-video.
const MODELO = {
  imagem: "flux-pro/kontext/max/text-to-image",
  video: "higgsfield/image-to-video",
};

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = svc();
  let anexoId: string | null = null;

  try {
    // Credencial (KEY_ID:KEY_SECRET): primeiro do painel (ai_config), senão secret.
    const { data: cfg } = await supabase
      .from("ai_config").select("api_key").eq("provider", "higgsfield").maybeSingle();
    const creds = cfg?.api_key || Deno.env.get("HIGGSFIELD_CREDENTIALS");
    if (!creds) throw new Error("Configure a chave do Higgsfield em Agentes → Configurar modelos");
    config({ credentials: creds });

    const body = await req.json();
    const tarefaId: string = body.tarefa_id;
    const tipo: "imagem" | "video" = body.tipo === "video" ? "video" : "imagem";
    const aspect: string = body.aspect_ratio || "9:16";
    if (!tarefaId) throw new Error("tarefa_id é obrigatório");

    // Monta o prompt a partir do copy da tarefa (descrição + último comentário).
    const { data: tarefa } = await supabase
      .from("tarefas").select("titulo,descricao").eq("id", tarefaId).maybeSingle();
    if (!tarefa) throw new Error("Tarefa não encontrada");

    const prompt: string = (body.prompt && String(body.prompt).trim())
      || [tarefa.titulo, tarefa.descricao].filter(Boolean).join(" — ");
    if (!prompt) throw new Error("Sem copy/prompt para gerar a arte");

    // Registra o anexo como "gerando" para o card mostrar o estado.
    const ins = await supabase.from("tarefa_anexos")
      .insert({ tarefa_id: tarefaId, tipo, prompt, status: "gerando" })
      .select("id").single();
    anexoId = ins.data?.id ?? null;

    // Dispara a geração e aguarda concluir.
    const jobSet = await higgsfield.subscribe(MODELO[tipo], {
      input: { prompt, aspect_ratio: aspect, safety_tolerance: 2 },
      withPolling: true,
    });

    const url = jobSet?.jobs?.[0]?.results?.raw?.url;
    if (!jobSet?.isCompleted || !url) throw new Error("Higgsfield não retornou a arte");

    await supabase.from("tarefa_anexos")
      .update({ url, status: "pronto" }).eq("id", anexoId);

    // Loga no histórico da tarefa.
    await supabase.from("tarefa_respostas").insert({
      tarefa_id: tarefaId, autor: "Higgsfield",
      conteudo: `Arte (${tipo}) gerada: ${url}`,
    });

    return new Response(JSON.stringify({ ok: true, url, tipo, anexo_id: anexoId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (anexoId) {
      await supabase.from("tarefa_anexos").update({ status: "erro" }).eq("id", anexoId);
    }
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
