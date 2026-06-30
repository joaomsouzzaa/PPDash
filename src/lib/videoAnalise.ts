// Cliente do /analisar-referencia (streaming NDJSON com progresso por etapa).
import { supabase } from "@/integrations/supabase/client";

const SERVICE_URL = (import.meta.env.VITE_VIDEO_EDITOR_URL as string | undefined)?.replace(/\/$/, "");

export type AnaliseProgresso = { pct: number; etapa: string; log?: string };

export type PlataformaCookies = "instagram" | "youtube";

// Status dos cookies (Instagram ou YouTube) na VPS (p/ a UI mostrar se está configurado).
export async function cookiesStatus(plataforma: PlataformaCookies = "instagram"): Promise<{ configurado: boolean; atualizado_em?: string; tem_sessao?: boolean }> {
  if (!SERVICE_URL) throw new Error("Serviço de vídeo não configurado.");
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
  const res = await fetch(`${SERVICE_URL}/cookies-status?plataforma=${plataforma}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Falha (${res.status})`);
  return res.json();
}

// Envia o cookies.txt (exportado do navegador) direto pra VPS — sem SSH.
export async function configurarCookiesInstagram(file: File, plataforma: PlataformaCookies = "instagram"): Promise<void> {
  if (!SERVICE_URL) throw new Error("Serviço de vídeo não configurado.");
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
  const form = new FormData();
  form.append("file", file, file.name || "cookies.txt");
  const res = await fetch(`${SERVICE_URL}/configurar-cookies?plataforma=${plataforma}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.ok) throw new Error(j?.detail || j?.error || `Falha ao enviar cookies (${res.status})`);
}

/**
 * Chama o serviço de análise e acompanha o progresso por etapa (baixando → frames → transcrição → IA).
 * Retorna o objeto final (com ok=true). Lança erro com a mensagem do serviço.
 */
export async function analisarReferenciaStream(
  body: Record<string, unknown>,
  onProgress: (p: AnaliseProgresso) => void,
): Promise<any> {
  if (!SERVICE_URL) throw new Error("Serviço de vídeo não configurado (VITE_VIDEO_EDITOR_URL).");
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";

  // Watchdog: se nenhuma linha de progresso chegar por STALL_MS (download pendurado
  // por bloqueio do Instagram / cookies vencidos), aborta com mensagem acionável.
  const STALL_MS = 90_000;
  const ac = new AbortController();
  let ultimoSinal = Date.now();
  let parouDownload = false;
  const watchdog = setInterval(() => {
    if (Date.now() - ultimoSinal > STALL_MS) {
      parouDownload = true;
      ac.abort();
    }
  }, 5_000);

  try {
    const res = await fetch(`${SERVICE_URL}/analisar-referencia`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok || !res.body) {
      let msg = `Falha (${res.status})`;
      try { const j = await res.json(); if (j?.detail) msg = j.detail; } catch { /* ignore */ }
      throw new Error(msg);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let final: any = null;
    const handle = (obj: any) => {
      if (obj.erro) throw new Error(obj.erro);
      if (typeof obj.pct === "number") onProgress({ pct: obj.pct, etapa: obj.etapa || "", log: obj.log });
      if (obj.ok) final = obj;
    };
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      ultimoSinal = Date.now();
      buf += dec.decode(value, { stream: true });
      const linhas = buf.split("\n");
      buf = linhas.pop() || "";
      for (const l of linhas) if (l.trim()) handle(JSON.parse(l));
    }
    if (buf.trim()) handle(JSON.parse(buf));
    if (!final) throw new Error("A análise não retornou resultado.");
    return final;
  } catch (e) {
    if (parouDownload) {
      throw new Error("O download travou (provável bloqueio do Instagram). Atualize os cookies do Instagram e tente de novo.");
    }
    throw e;
  } finally {
    clearInterval(watchdog);
  }
}
