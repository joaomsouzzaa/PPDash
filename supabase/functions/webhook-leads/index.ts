import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  const expectedKey = Deno.env.get("WEBHOOK_LEADS_API_KEY");

  // If a token is configured AND provided, validate it
  // If no token is provided and none is required, allow through
  if (expectedKey && providedKey && providedKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();

    // Map CRM fields to database columns
    const lead: Record<string, unknown> = {
      nome: payload.contact_name || payload.Nome || payload.nome || payload.name || payload.full_name || null,
      email: payload.contact_email || payload.email || null,
      telefone: payload.contact_phone || payload.telefone || payload.phone || payload.mobile || null,
      status: mapLeadStatus(payload.status || payload.lead_status || "lead"),
      utm_source: payload.deal_utm_source || payload["Utm-source"] || payload.utm_source || null,
      utm_medium: payload.deal_utm_medium || payload.utm_medium || null,
      utm_campaign: payload.deal_utm_campaign || payload["Utm_campaing"] || payload.utm_campaign || null,
      utm_content: payload.deal_utm_content || payload.utm_content || null,
      utm_term: payload.utm_term || null,
      cidade: payload.cidade || payload.city || null,
      data_lead: payload.deal_created_at || payload["data da criação"] || payload.data_lead || payload.created_at || new Date().toISOString(),
      faturamento: payload.contact_scaleformatacao_fatu_1 || payload.faturamento || null,
      ad_name: payload.deal_ad_name || payload["nome do anúncio"] || null,
      campaign_name: payload.deal_campaign_name || payload["nome da campanha"] || payload.deal_utm_source || payload["Utm-source"] || payload.utm_source || null,
      deal_user: payload.deal_user || payload["dono do negócio"] || null,
      situacao_atual: payload.contact_quais_dessas_situaco || payload["situação atual?"] || payload["situacao atual"] || null,
      whatsapp: payload.contact_qual_seu_whatsapp || payload.Whatsapp || payload.whatsapp || null,
      instagram: payload.contact_qual_o_do_instagram || payload.Instagram || payload.instagram || null,
      area_atuacao: payload.deal_qual_sua_area_de_atu || payload["área de atuação"] || payload.area_atuacao || null,
      papel: payload.contact_qual_e_o_seu_papel_h || payload["Seu papel hoje?"] || payload.papel || null,
      tags: payload.contact_tag || payload.tags || null,
      payload,
    };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // If email is provided, check for existing lead within 10-day window
    const email = lead.email as string | null;
    if (email) {
      const { data: existing } = await supabase
        .from("leads")
        .select("id, data_lead")
        .eq("email", email)
        .order("data_lead", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        const existingDate = new Date(existing.data_lead);
        const now = new Date();
        const diffDays = (now.getTime() - existingDate.getTime()) / (1000 * 60 * 60 * 24);

        if (diffDays <= 10) {
          // Within 10 days — update existing lead (duplicate)
          const { payload: _p, ...updateFields } = lead;
          const { error } = await supabase
            .from("leads")
            .update({ ...updateFields, payload: lead.payload })
            .eq("id", existing.id);

          if (error) {
            console.error("[Webhook Leads Update Error]", error.message);
            return new Response(JSON.stringify({ error: "Failed to update lead" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ success: true, action: "updated" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // More than 10 days — fall through to insert as new lead
      }
    }

    // Insert new lead
    const { error } = await supabase.from("leads").insert(lead);

    if (error) {
      console.error("[Webhook Leads Error]", error.message);
      return new Response(JSON.stringify({ error: "Failed to process lead" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, action: "created" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Webhook Leads Exception]", err instanceof Error ? err.message : "Unknown");
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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
