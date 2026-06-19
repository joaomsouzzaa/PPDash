import { supabase } from "@/integrations/supabase/client";

// Wrappers do gerenciador de campanhas do Meta (edge function meta-ads-manager)
// e das ações de Drive (edge function google-sheets). Espelha o estilo de meta-ads.ts.

export interface AdRef { id: string; name: string; status: string; effective_status?: string; thumbnail?: string | null; }
export interface AdSetRefM { id: string; name: string; status: string; effective_status?: string; daily_budget?: number | null; lifetime_budget?: number | null; optimization_goal?: string; ads: AdRef[]; }
export interface CampaignTree {
  id: string; name: string; objetivo?: string; status: string; effective_status?: string;
  daily_budget?: number | null; lifetime_budget?: number | null; adsets: AdSetRefM[];
}
export interface SourceCampaign { id: string; name: string; objective?: string; status?: string; }
export interface DriveFolder { id: string; name: string; }
export interface DriveFile { id: string; name: string; mimeType: string; thumbnailLink?: string; size?: string; }

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export async function listCampaigns(accountId?: string): Promise<CampaignTree[]> {
  const d = await invoke<{ campaigns: CampaignTree[] }>("meta-ads-manager", { action: "list_campaigns", account_id: accountId });
  return d.campaigns || [];
}

export async function listSourceCampaigns(accountId?: string): Promise<SourceCampaign[]> {
  const d = await invoke<{ campaigns: SourceCampaign[] }>("meta-ads-manager", { action: "list_source_campaigns", account_id: accountId });
  return d.campaigns || [];
}

export async function duplicateCampaign(args: { source_campaign_id: string; novo_nome?: string; status_inicial?: string; account_id?: string }) {
  return invoke<{ ok: boolean; campaign_id: string }>("meta-ads-manager", { action: "duplicate_campaign", ...args });
}

export async function createCampaign(payload: Record<string, unknown>) {
  return invoke<{ ok: boolean; campaign_id: string; adset_id?: string; ad_ids?: string[] }>("meta-ads-manager", { action: "create_campaign", ...payload });
}

export async function updateEntity(args: { entity_id: string; nivel?: "campaign" | "adset" | "ad"; status?: string; daily_budget?: number; lifetime_budget?: number; name?: string }) {
  return invoke<{ ok: boolean }>("meta-ads-manager", { action: "update_entity", ...args });
}

// ---- Drive (reaproveita a conexão Google da org) ----
export async function listDriveFolders(): Promise<DriveFolder[]> {
  const d = await invoke<{ folders: DriveFolder[] }>("google-sheets", { action: "list_drive_folders" });
  return d.folders || [];
}

export async function listDriveFiles(folderId: string): Promise<DriveFile[]> {
  const d = await invoke<{ files: DriveFile[] }>("google-sheets", { action: "list_drive_files", folder_id: folderId });
  return d.files || [];
}

// Pasta default de criativos (por org)
export async function getDriveConfig(): Promise<{ pasta_criativos_id?: string; pasta_criativos_nome?: string } | null> {
  const { data } = await supabase.from("meta_ads_drive_config").select("pasta_criativos_id,pasta_criativos_nome").maybeSingle();
  return data ?? null;
}

export async function saveDriveConfig(pasta_criativos_id: string, pasta_criativos_nome: string): Promise<void> {
  const { data: existing } = await supabase.from("meta_ads_drive_config").select("org_id").maybeSingle();
  if (existing) {
    await supabase.from("meta_ads_drive_config").update({ pasta_criativos_id, pasta_criativos_nome, updated_at: new Date().toISOString() }).eq("org_id", (existing as any).org_id);
  } else {
    await supabase.from("meta_ads_drive_config").insert({ pasta_criativos_id, pasta_criativos_nome });
  }
}
