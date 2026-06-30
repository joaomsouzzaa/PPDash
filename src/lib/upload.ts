// Uploads com progresso de bytes (o supabase.storage.upload() não expõe onprogress).
// Dois destinos:
//   - uploadComProgresso: bucket do Supabase Storage (imagens; isolado por org via RLS).
//   - uploadMidiaVPS: serviço de vídeo na VPS, para arquivos grandes (vídeo) que estourariam
//     o limite de 50MB do Storage no plano free. Devolve uma URL pública servida pela VPS.
import { supabase } from "@/integrations/supabase/client";
import { getTenantSlug } from "@/lib/tenant";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const VIDEO_EDITOR_URL = (import.meta.env.VITE_VIDEO_EDITOR_URL as string | undefined)?.replace(/\/$/, "");

function safeMsg(responseText: string, status: number): string {
  try {
    const body = JSON.parse(responseText);
    if (body?.message) return body.message;
    if (body?.error) return body.error;
    if (body?.detail) return typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
  } catch { /* não é JSON */ }
  return responseText || `HTTP ${status}`;
}

// Núcleo: POST do arquivo como corpo cru, com progresso. Resolve com o responseText.
function xhrPost(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (loaded: number, total: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (file.type) xhr.setRequestHeader("content-type", file.type);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded, e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
      ? resolve(xhr.responseText)
      : reject(new Error(safeMsg(xhr.responseText, xhr.status)));
    xhr.onerror = () => reject(new Error("falha de rede"));
    xhr.send(file);
  });
}

/** Upload para o Storage do Supabase (replica os headers do client; RLS continua valendo). */
export async function uploadComProgresso(
  bucket: string,
  path: string,
  file: File,
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? ANON;
  await xhrPost(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURI(path)}`, {
    authorization: `Bearer ${token}`,
    apikey: ANON,
    "x-org-slug": getTenantSlug(),
    "x-upsert": "false",
  }, file, onProgress);
}

/** Upload de mídia grande (vídeo) para a VPS. Devolve a URL pública servida pela VPS. */
export async function uploadMidiaVPS(
  file: File,
  orgId: string,
  onProgress: (loaded: number, total: number) => void,
): Promise<string> {
  if (!VIDEO_EDITOR_URL) throw new Error("Serviço de vídeo não configurado (VITE_VIDEO_EDITOR_URL).");
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Sessão expirada, faça login novamente.");
  const qs = new URLSearchParams({ org_id: orgId, filename: file.name }).toString();
  const resp = await xhrPost(`${VIDEO_EDITOR_URL}/upload-midia?${qs}`, {
    authorization: `Bearer ${token}`,
  }, file, onProgress);
  const url = (() => { try { return JSON.parse(resp)?.url as string | undefined; } catch { return undefined; } })();
  if (!url) throw new Error("resposta inválida do serviço de vídeo");
  return url;
}
