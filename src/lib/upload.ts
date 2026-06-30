// Upload para o Storage do Supabase com progresso de bytes.
// O método supabase.storage.upload() não expõe onprogress, então subimos via
// XMLHttpRequest direto no endpoint REST, replicando os headers que o client injeta
// (Authorization com o JWT do usuário, apikey e x-org-slug). A RLS continua valendo.
import { supabase } from "@/integrations/supabase/client";
import { getTenantSlug } from "@/lib/tenant";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

function safeMsg(responseText: string, status: number): string {
  try {
    const body = JSON.parse(responseText);
    if (body?.message) return body.message;
    if (body?.error) return body.error;
  } catch { /* não é JSON */ }
  return responseText || `HTTP ${status}`;
}

export async function uploadComProgresso(
  bucket: string,
  path: string,
  file: File,
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? ANON;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURI(path)}`);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", ANON);
    xhr.setRequestHeader("x-org-slug", getTenantSlug());
    xhr.setRequestHeader("x-upsert", "false");
    if (file.type) xhr.setRequestHeader("content-type", file.type);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded, e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
      ? resolve()
      : reject(new Error(safeMsg(xhr.responseText, xhr.status)));
    xhr.onerror = () => reject(new Error("falha de rede"));
    xhr.send(file);
  });
}
