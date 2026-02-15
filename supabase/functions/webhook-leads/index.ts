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

  // Authenticate via API key
  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token");
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const webhookToken = req.headers.get("x-webhook-token") || req.headers.get("token");
  const providedKey = queryToken || bearerToken || webhookToken;
  const expectedKey = Deno.env.get("WEBHOOK_API_KEY");

  if (!expectedKey || providedKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();

    const lead: Record<string, unknown> = {
      nome: payload.nome || payload.name || payload.full_name || null,
      email: payload.email || null,
      telefone: payload.telefone || payload.phone || payload.mobile || null,
      status: mapLeadStatus(payload.status || payload.lead_status || "lead"),
      utm_source: payload.utm_source || null,
      utm_medium: payload.utm_medium || null,
      utm_campaign: payload.utm_campaign || null,
      utm_content: payload.utm_content || null,
      utm_term: payload.utm_term || null,
      produto_slug: payload.produto_slug || payload.product_slug || null,
      cidade: payload.cidade || payload.city || null,
      origem: payload.origem || payload.source || payload.origin || "crm",
      data_lead: payload.data_lead || payload.created_at || new Date().toISOString(),
      payload,
    };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // If email is provided, check for existing lead to update status
    const email = lead.email as string | null;
    if (email) {
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("leads")
          .update({
            status: lead.status,
            nome: lead.nome,
            telefone: lead.telefone,
            utm_source: lead.utm_source,
            utm_medium: lead.utm_medium,
            utm_campaign: lead.utm_campaign,
            utm_content: lead.utm_content,
            utm_term: lead.utm_term,
            produto_slug: lead.produto_slug,
            cidade: lead.cidade,
            origem: lead.origem,
            payload: lead.payload,
          })
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
