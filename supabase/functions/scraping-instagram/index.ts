import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// Resolve a org de quem chamou (chaves por organização, igual ao agente-chat).
async function resolveOrg(supabase: any, req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const { data: u } = await supabase.auth.getUser(token);
  if (!u?.user) return null;
  const { data: p } = await supabase.from("profiles").select("org_id").eq("id", u.user.id).maybeSingle();
  return p?.org_id ?? null;
}

// Lê a chave de um provider (org primeiro, depois variável de ambiente).
async function getKey(supabase: any, provider: string, orgId: string | null, envName: string): Promise<string> {
  let key: string | undefined;
  if (orgId) {
    const { data } = await supabase.from("ai_config").select("api_key").eq("provider", provider).eq("org_id", orgId).maybeSingle();
    key = data?.api_key ?? undefined;
  }
  if (!key) {
    const { data } = await supabase.from("ai_config").select("api_key").eq("provider", provider).maybeSingle();
    key = data?.api_key ?? undefined;
  }
  if (!key) key = Deno.env.get(envName) ?? undefined;
  if (!key) throw new Error(`Configure a chave do provider "${provider}" em Agentes → Configurar modelos`);
  return key;
}

function handleLimpo(raw: string): string {
  return (raw || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "").trim();
}

// Normaliza um item do Apify instagram-scraper para o formato da UI.
function normalizarItem(it: any) {
  const likes = Number(it.likesCount ?? 0) || 0;
  const comments = Number(it.commentsCount ?? 0) || 0;
  const views = Number(it.videoViewCount ?? it.videoPlayCount ?? 0) || 0;
  const isVideo = it.type === "Video" || !!it.videoUrl;
  // Score de engajamento: interações diretas pesam mais; views entram com peso menor.
  const engajamento = likes + comments * 2 + Math.round(views * 0.1);
  return {
    id: it.shortCode || it.id || it.url,
    shortCode: it.shortCode || null,
    tipo: it.type || (isVideo ? "Video" : "Image"),
    isVideo,
    caption: (it.caption || "").slice(0, 600),
    likes, comments, views,
    engajamento,
    thumbnail: it.displayUrl || it.thumbnailUrl || null,
    videoUrl: it.videoUrl || null,
    url: it.url || (it.shortCode ? `https://www.instagram.com/p/${it.shortCode}/` : null),
    timestamp: it.timestamp || null,
  };
}

async function scrape(supabase: any, orgId: string | null, handle: string, limit: number) {
  const token = await getKey(supabase, "apify", orgId, "APIFY_TOKEN");
  const conta = handleLimpo(handle);
  if (!conta) throw new Error("Informe um @ de Instagram válido");

  const url = `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      directUrls: [`https://www.instagram.com/${conta}/`],
      resultsType: "posts",
      resultsLimit: Math.min(Math.max(limit || 30, 1), 60),
      addParentData: false,
    }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Apify: ${txt.slice(0, 300)}`);
  let arr: any[];
  try { arr = JSON.parse(txt); } catch { throw new Error("Resposta inesperada do Apify"); }
  if (!Array.isArray(arr)) arr = [];

  const itens = arr
    .filter((it) => it && (it.shortCode || it.url) && !it.error)
    .map(normalizarItem)
    .sort((a, b) => b.engajamento - a.engajamento);

  return { conta, total: itens.length, itens };
}

// Baixa o vídeo e transcreve com Whisper (OpenAI).
async function transcrever(supabase: any, orgId: string | null, item: { id: string; videoUrl: string }) {
  const apiKey = await getKey(supabase, "openai", orgId, "OPENAI_API_KEY");
  if (!item.videoUrl) throw new Error("Conteúdo sem vídeo para transcrever");

  const vr = await fetch(item.videoUrl);
  if (!vr.ok) throw new Error("Falha ao baixar o vídeo");
  const bytes = new Uint8Array(await vr.arrayBuffer());
  // Whisper aceita até 25MB.
  if (bytes.byteLength > 25 * 1024 * 1024) throw new Error("Vídeo acima de 25MB (limite do Whisper)");

  const fd = new FormData();
  fd.append("file", new Blob([bytes], { type: "video/mp4" }), `${item.id}.mp4`);
  fd.append("model", "whisper-1");

  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || "Erro na transcrição");
  return { id: item.id, transcricao: j.text || "" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabase = svc();
    const orgId = await resolveOrg(supabase, req);
    const body = await req.json();
    const action = body?.action;

    if (action === "scrape") {
      const out = await scrape(supabase, orgId, body.handle, body.limit);
      return json(out);
    }
    if (action === "transcrever") {
      const items: any[] = Array.isArray(body.items) ? body.items.slice(0, 3) : [];
      const out: any[] = [];
      for (const it of items) {
        try { out.push(await transcrever(supabase, orgId, it)); }
        catch (e) { out.push({ id: it.id, erro: e instanceof Error ? e.message : "erro" }); }
      }
      return json({ resultados: out });
    }
    return json({ error: "Ação inválida" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro interno" }, 500);
  }
});
