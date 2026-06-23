import { supabase } from "@/integrations/supabase/client";

// Wrappers da edge function instagram-connect (conectar conta, assinar webhook, listar mídias)
// para a página Growth → Auto-DM Instagram. Espelha o estilo de meta-ads-manager.ts.

export interface IgConta {
  id?: string; // id da linha em ig_contas (presente quando vem do banco; usado p/ filtrar automações)
  ig_user_id: string;
  ig_username: string | null;
  page_id: string;
  page_name: string | null;
  profile_picture_url?: string | null;
}

export interface IgMidia {
  id: string;
  caption: string;
  media_type: string;
  thumbnail: string | null;
  permalink: string;
  timestamp?: string;
}

// Botão de DM (link). Texto + botões viram o template do Private Reply.
export interface DmBotao { titulo: string; url: string; }
// DM em 2 modos (estilo ManyChat):
//  - "direto": uma DM única já com o link nos botões (texto + botoes).
//  - "optin": 1ª DM de abertura com botão SEM link (postback); ao tocar, envia a 2ª com o link.
export interface DmPayload {
  modo: "optin" | "direto";
  // direto
  texto: string;
  botoes: DmBotao[];
  // optin
  optin_texto: string;
  optin_botao_titulo: string;
  link_texto: string;
  link_botoes: DmBotao[];
}
export interface FollowupPayload { texto: string; botoes: DmBotao[]; }

export interface IgAutomacao {
  id: string;
  ig_conta_id: string | null;
  nome: string;
  status: "live" | "pausada";
  escopo: "post_especifico" | "qualquer" | "proximo";
  media_ids: string[];
  gatilho_tipo: "palavra" | "qualquer_comentario";
  palavras: string[];
  match_tipo: "contem" | "exato";
  responder_comentario: boolean;
  resposta_comentario_templates: string[];
  enviar_dm: boolean;
  dm_payload: DmPayload;
  followup_ativo: boolean;
  followup_delay_min: number;
  followup_payload: FollowupPayload;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("instagram-connect", { body });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export async function listarContas(): Promise<IgConta[]> {
  const d = await invoke<{ contas: IgConta[] }>({ action: "listar_contas" });
  return d.contas || [];
}

export async function assinarWebhook(igUserId: string): Promise<void> {
  await invoke({ action: "assinar_webhook", ig_user_id: igUserId });
}

export async function listarMidias(igUserId: string): Promise<IgMidia[]> {
  const d = await invoke<{ midias: IgMidia[] }>({ action: "listar_midias", ig_user_id: igUserId });
  return d.midias || [];
}
