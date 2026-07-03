import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Normaliza telefone BR p/ chave de dedup (últimos 11 díg., tira 55). Espelha _shared/telefone.ts.
function normalizarTelefone(raw?: string | null): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length > 11) d = d.slice(-11);
  return d || null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Authentication: support token via query param, header, or skip if not configured
  // Note: Clint CRM does not support sending auth tokens in webhooks
  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token");
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const webhookToken = req.headers.get("x-webhook-token") || req.headers.get("token");
  const providedKey = queryToken || bearerToken || webhookToken;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Resolve a organização pelo token de webhook (multi-tenant).
  let orgId: string | null = null;
  let webhookLeadsAtivo = true;
  if (providedKey) {
    const { data: org } = await supabase
      .from("organizations")
      .select("id, status, webhook_leads_ativo")
      .eq("webhook_token", providedKey)
      .maybeSingle();
    if (org && org.status === "ativo") {
      orgId = org.id as string;
      webhookLeadsAtivo = (org as any).webhook_leads_ativo !== false;
    }
  }
  if (!orgId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Registra o evento cru recebido (rede de segurança: nada se perde, mesmo se falhar).
  const logEvento = async (campos: Record<string, unknown>) => {
    try { await supabase.from("webhook_eventos").insert({ org_id: orgId, ...campos }); } catch { /* não bloqueia o webhook */ }
  };

  try {
    const payload = await req.json();
    const crmOrigem = payload && (payload as any).leads ? "rd_station" : "webhook";

    // Webhook de leads desligado pela org: ignora sem gravar (200 para a RD/Clint não reenviar).
    if (!webhookLeadsAtivo) {
      await logEvento({ crm: crmOrigem, payload, status: "ignorado" });
      return new Response(JSON.stringify({ ignored: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mapeamento da org: campo da app  <-  chave do CRM (explícito).
    const { data: mapRows } = await supabase.from("lead_mapeamento").select("app_field, crm_key").eq("org_id", orgId);
    const mapa: Record<string, string> = {};
    for (const r of mapRows ?? []) mapa[(r as any).app_field] = (r as any).crm_key;
    const { data: customDefs } = await supabase.from("lead_campos").select("chave").eq("org_id", orgId).eq("padrao", false);

    // Lê o valor de um campo da app a partir do payload, conforme o mapeamento.
    // Suporta caminho aninhado com pontos (ex.: "leads.0.last_conversion.conversion_origin.source"),
    // com índice numérico de array. Sem ponto = lookup direto de chave de topo.
    const val = (appField: string): any => {
      const k = mapa[appField];
      if (k == null) return undefined;
      return k.split(".").reduce((acc: any, seg: string) => (acc == null ? undefined : acc[seg]), payload);
    };
    const tagsRaw = String(val("tags") ?? "");

    const lead: Record<string, unknown> = {
      nome: val("nome") ?? null,
      email: val("email") ?? null,
      telefone: val("telefone") ?? null,
      whatsapp: val("whatsapp") ?? null,
      instagram: val("instagram") ?? null,
      cidade: val("cidade") ?? null,
      status: mapLeadStatus(val("status") || "lead"),
      utm_source: val("utm_source") ?? null,
      utm_medium: val("utm_medium") ?? null,
      utm_campaign: val("utm_campaign") ?? null,
      utm_content: val("utm_content") ?? null,
      utm_term: val("utm_term") ?? null,
      campaign_name: val("campaign_name") ?? null,
      ad_name: val("ad_name") ?? null,
      deal_user: val("deal_user") ?? null,
      area_atuacao: val("area_atuacao") ?? null,
      papel: val("papel") ?? null,
      faturamento: val("faturamento") ?? null,
      situacao_atual: val("situacao_atual") ?? null,
      data_lead: parseDateValue(val("data_lead")) || new Date().toISOString(),
      tags: normalizeTags(tagsRaw || null),
      is_sql: (detectSqlTag(tagsRaw) || val("is_sql")) ? "Sim" : null,
      is_reuniao_agendada: (detectRaTag(tagsRaw) || val("is_reuniao_agendada")) ? "Sim" : null,
      is_reuniao_realizada: (detectRrTag(tagsRaw) || val("is_reuniao_realizada")) ? "Sim" : null,
      is_venda_realizada: (detectVrTag(tagsRaw) || val("is_venda_realizada")) ? "Sim" : null,
      faturamento_venda: parseVendaValue(val("faturamento_venda")),
      data_venda_realizada: parseDateValue(val("data_venda_realizada")) || (detectVrTag(tagsRaw) ? new Date().toISOString() : null),
      crm_external_id: (val("crm_external_id") != null ? String(val("crm_external_id")) : null),
      crm_origem: (payload && (payload as any).leads ? "rd_station" : null),
      payload,
      org_id: orgId,
    };
    // Campos personalizados (JSONB).
    const custom: Record<string, unknown> = {};
    for (const d of customDefs ?? []) {
      const v = val("custom:" + (d as any).chave);
      if (v !== undefined) custom[(d as any).chave] = v;
    }
    lead.custom = custom;

    // Auto-register new tags in the tags table
    if (lead.tags) {
      const tagNames = (lead.tags as string).split(",").map((t: string) => t.trim()).filter(Boolean);
      for (const tagName of tagNames) {
        await supabase.from("tags").upsert({ nome: tagName }, { onConflict: "nome" });
      }
    }

    // If email is provided, check for existing lead within 10-day window
    const email = lead.email as string | null;
    const telefone = lead.telefone as string | null;

    // Try to find existing lead by email or phone
    let existingId: string | null = null;
    if (email) {
      const { data } = await supabase
        .from("leads")
        .select("id")
        .eq("email", email)
        .eq("org_id", orgId)
        .order("data_lead", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) existingId = data.id;
    }
    const telefoneNorm = normalizarTelefone(telefone);
    if (!existingId && telefoneNorm) {
      const { data } = await supabase
        .from("leads")
        .select("id")
        .eq("telefone_norm", telefoneNorm)
        .eq("org_id", orgId)
        .order("data_lead", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) existingId = data.id;
    }

    if (existingId) {
      const hasSqlTag = detectSqlTag(tagsRaw) || !!val("is_sql");
      const hasRaTag = detectRaTag(tagsRaw) || !!val("is_reuniao_agendada");
      const hasRrTag = detectRrTag(tagsRaw) || !!val("is_reuniao_realizada");
      const hasVrTag = detectVrTag(tagsRaw) || !!val("is_venda_realizada");
      let updateError: string | null = null;

      if (hasSqlTag || hasRaTag || hasRrTag || hasVrTag) {
        // Tag detected: fetch existing tags to merge
        const { data: existingLead } = await supabase
          .from("leads")
          .select("tags")
          .eq("id", existingId)
          .maybeSingle();

        let mergedTags = existingLead?.tags || "";

        // Append SQL tag if needed
        if (hasSqlTag && !mergedTags.toLowerCase().split(",").some((t: string) => t.trim().toLowerCase() === "sql")) {
          mergedTags = mergedTags ? `${mergedTags}, SQL` : "SQL";
        }
        // Append Reunião Agendada tag if needed
        const raTagName = "Reunião Agendada";
        if (hasRaTag && !mergedTags.toLowerCase().split(",").some((t: string) => t.trim().toLowerCase().includes("reuniao agendada") || t.trim().toLowerCase().includes("reunião agendada"))) {
          mergedTags = mergedTags ? `${mergedTags}, ${raTagName}` : raTagName;
        }
        // Append Reunião Realizada tag if needed
        const rrTagName = "Reunião Realizada";
        if (hasRrTag && !mergedTags.toLowerCase().split(",").some((t: string) => t.trim().toLowerCase().includes("reuniao realizada") || t.trim().toLowerCase().includes("reunião realizada"))) {
          mergedTags = mergedTags ? `${mergedTags}, ${rrTagName}` : rrTagName;
        }
        // Append Venda Realizada tag if needed
        const vrTagName = "Venda Realizada";
        if (hasVrTag && !mergedTags.toLowerCase().split(",").some((t: string) => t.trim().toLowerCase().includes("venda realizada"))) {
          mergedTags = mergedTags ? `${mergedTags}, ${vrTagName}` : vrTagName;
        }

        const updateFields: Record<string, unknown> = { tags: mergedTags, payload: lead.payload };
        if (Object.keys(custom).length) updateFields.custom = custom;
        if (hasSqlTag) updateFields.is_sql = "Sim";
        if (hasRaTag) updateFields.is_reuniao_agendada = "Sim";
        if (hasRrTag) updateFields.is_reuniao_realizada = "Sim";
        if (hasVrTag) {
          updateFields.is_venda_realizada = "Sim";
          const vendaValue = parseVendaValue(val("faturamento_venda"));
          if (vendaValue !== null) updateFields.faturamento_venda = vendaValue;
          updateFields.data_venda_realizada = parseDateValue(val("data_venda_realizada")) || new Date().toISOString();
        }

        const { error } = await supabase
          .from("leads")
          .update(updateFields)
          .eq("id", existingId);
        if (error) updateError = error.message;
      } else {
        // No special tag: only update data_lead
        const camposSimples: Record<string, unknown> = { data_lead: lead.data_lead, payload: lead.payload };
        if (Object.keys(custom).length) camposSimples.custom = custom;
        const { error } = await supabase
          .from("leads")
          .update(camposSimples)
          .eq("id", existingId);
        if (error) updateError = error.message;
      }

      if (updateError) {
        console.error("[Webhook Leads Update Error]", updateError);
        await logEvento({ crm: crmOrigem, payload, status: "erro", erro: updateError, external_id: lead.crm_external_id as string | null, lead_id: existingId });
        return new Response(JSON.stringify({ error: "Failed to update lead" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await logEvento({ crm: crmOrigem, payload, status: "processado", external_id: lead.crm_external_id as string | null, lead_id: existingId });
      return new Response(JSON.stringify({ success: true, action: "updated" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert new lead
    const { data: inserted, error } = await supabase.from("leads").insert(lead).select("id").maybeSingle();

    if (error) {
      console.error("[Webhook Leads Error]", error.message);
      await logEvento({ crm: crmOrigem, payload, status: "erro", erro: error.message, external_id: lead.crm_external_id as string | null });
      return new Response(JSON.stringify({ error: "Failed to process lead" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logEvento({ crm: crmOrigem, payload, status: "processado", external_id: lead.crm_external_id as string | null, lead_id: inserted?.id ?? null });
    return new Response(JSON.stringify({ success: true, action: "created" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Webhook Leads Exception]", err instanceof Error ? err.message : "Unknown");
    await logEvento({ status: "erro", erro: err instanceof Error ? err.message : "Unknown" });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function normalizeTags(tags: unknown): string | null {
  if (!tags) return null;
  if (Array.isArray(tags)) {
    const names = tags.map((t) =>
      typeof t === "object" && t !== null && "name" in t ? String(t.name) : String(t)
    );
    return names.join(", ");
  }
  return String(tags);
}

function detectSqlTag(tags: unknown): boolean {
  if (!tags) return false;
  const normalized = normalizeTags(tags) || "";
  return normalized.toLowerCase().split(",").some((t) => t.trim() === "sql");
}

function detectRaTag(tags: unknown): boolean {
  if (!tags) return false;
  const normalized = (normalizeTags(tags) || "").toLowerCase();
  return normalized.split(",").some((t) => {
    const trimmed = t.trim();
    return trimmed === "reunião agendada" || trimmed === "reuniao agendada" || trimmed === "ra";
  });
}

function detectRrTag(tags: unknown): boolean {
  if (!tags) return false;
  const normalized = (normalizeTags(tags) || "").toLowerCase();
  return normalized.split(",").some((t) => {
    const trimmed = t.trim();
    return trimmed === "reunião realizada" || trimmed === "reuniao realizada" || trimmed === "rr";
  });
}

function detectVrTag(tags: unknown): boolean {
  if (!tags) return false;
  const normalized = (normalizeTags(tags) || "").toLowerCase();
  return normalized.split(",").some((t) => {
    const trimmed = t.trim();
    return trimmed === "venda realizada" || trimmed === "vr";
  });
}

function parseDateValue(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).trim();
  // Handle DD/MM/YYYY format
  const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T12:00:00Z`;
  }
  // Data ISO só-data (YYYY-MM-DD, sem hora): ancorar ao meio-dia UTC para não
  // deslocar o dia em BRT (UTC-3). new Date("YYYY-MM-DD") seria meia-noite UTC =
  // 21h do dia anterior em BRT, jogando o lead para o dia errado no dashboard.
  const isoDateOnly = s.match(/^\d{4}-\d{2}-\d{2}$/);
  if (isoDateOnly) return `${s}T12:00:00Z`;
  // Já é ISO com hora ou outro formato parseável.
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseVendaValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

function mapLeadStatus(status: string): string {
  const s = status.toLowerCase().replace(/[_-]/g, " ").trim();
  if (s === "lead" || s === "novo" || s === "new") return "lead";
  if (s === "mql" || s.includes("marketing qualified")) return "mql";
  if (s === "sql" || s.includes("sales qualified")) return "sql";
  if (s.includes("reuniao agendada") || s.includes("meeting scheduled") || s === "ra") return "reuniao_agendada";
  if (s.includes("reuniao realizada") || s.includes("meeting done") || s === "rr") return "reuniao_realizada";
  if (s.includes("venda") || s.includes("sale") || s.includes("won") || s.includes("closed")) return "venda";
  if (s.includes("perdido") || s.includes("lost")) return "perdido";
  return status;
}
