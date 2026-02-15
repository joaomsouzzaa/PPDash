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

  // Authenticate via API key (query param, Bearer header, or webhook token header)
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
    let venda: Record<string, unknown>;

    if (payload.OrderId && payload.EventType) {
      // ===== GoExplosion =====
      const buyer = payload.Purchase?.Buyer || {};
      const marketing = payload.Purchase?.MarketingData || {};
      const totalDetails = payload.Purchase?.TotalDetails || payload.ProductTotalDetails || {};
      const product = payload.Product || {};

      venda = {
        plataforma: "goexplosion",
        id_transacao: payload.OrderId,
        status: mapStatus(payload.EventType),
        valor: totalDetails.Total ?? totalDetails.SubTotal ?? 0,
        quantidade: product.Quantity ?? 1,
        nome_comprador: buyer.FullName || null,
        email_comprador: buyer.Email || null,
        telefone_comprador: buyer.Phone || null,
        documento: buyer.Document || null,
        produto: product.Name || null,
        tipo_ingresso: detectTipoIngresso(product.Name || ""),
        produtor: product.Producer || null,
        cidade: buyer.Addresses?.[0]?.City || extractCidadeFromProduct(product.Name || "") || null,
        metodo_pagamento: payload.Purchase?.PaymentMethod?.metodoPagamento || null,
        cupom: totalDetails.CouponName || null,
        utm_source: marketing.UtmSource || null,
        utm_medium: marketing.UtmMedium || null,
        utm_campaign: marketing.UtmCampaign || null,
        utm_content: marketing.UtmContent || null,
        utm_term: marketing.UtmTerm || null,
        data_venda: payload.Purchase?.AuthorizedDate || payload.createdDate || new Date().toISOString(),
        payload,
      };
    } else if (payload.event || payload.webhook_event_type) {
      // ===== Kiwify =====
      venda = {
        plataforma: "kiwify",
        id_transacao: payload.order_id || payload.Transaction?.id || null,
        status: mapStatus(payload.order_status || payload.event || "aprovada"),
        valor: parseFloat(payload.order_price || payload.Transaction?.amount || "0"),
        quantidade: 1,
        nome_comprador: payload.Customer?.full_name || payload.customer?.name || null,
        email_comprador: payload.Customer?.email || payload.customer?.email || null,
        telefone_comprador: payload.Customer?.mobile || payload.customer?.phone || null,
        documento: null,
        produto: payload.Product?.name || payload.product?.name || null,
        tipo_ingresso: detectTipoIngresso(payload.Product?.name || payload.product?.name || ""),
        produtor: null,
        cidade: null,
        metodo_pagamento: null,
        cupom: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_content: null,
        utm_term: null,
        data_venda: payload.created_at || new Date().toISOString(),
        payload,
      };
    } else {
      // ===== Formato genérico =====
      venda = {
        plataforma: payload.plataforma || "desconhecida",
        id_transacao: payload.id_transacao || payload.transaction_id || null,
        status: mapStatus(payload.status || "aprovada"),
        valor: parseFloat(payload.valor || payload.amount || "0"),
        quantidade: payload.quantidade || 1,
        nome_comprador: payload.nome || payload.name || null,
        email_comprador: payload.email || null,
        telefone_comprador: payload.telefone || payload.phone || null,
        documento: null,
        produto: payload.produto || payload.product || null,
        tipo_ingresso: payload.tipo_ingresso || null,
        produtor: null,
        cidade: payload.cidade || payload.city || null,
        metodo_pagamento: null,
        cupom: null,
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_content: null,
        utm_term: null,
        data_venda: payload.data_venda || new Date().toISOString(),
        payload,
      };
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error } = await supabase.from("vendas").insert(venda);

    if (error) {
      console.error("[Webhook Error]", { timestamp: new Date().toISOString(), code: error.code, message: error.message });
      return new Response(JSON.stringify({ error: "Failed to process webhook" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Webhook Exception]", { timestamp: new Date().toISOString(), message: err instanceof Error ? err.message : "Unknown" });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function mapStatus(status: string): string {
  const s = status.toLowerCase().replace(/_/g, " ");
  if (s.includes("approved") || s.includes("purchase approved") || s.includes("paid") || s.includes("completed") || s.includes("ready")) return "aprovada";
  if (s.includes("refund")) return "reembolsada";
  if (s.includes("cancel") || s.includes("chargeback")) return "cancelada";
  if (s.includes("pending") || s.includes("waiting")) return "pendente";
  return status;
}

function detectTipoIngresso(productName: string): string | null {
  const name = productName.toLowerCase();
  if (name.includes("vip duplo")) return "vip_duplo";
  if (name.includes("vip")) return "vip";
  if (name.includes("duplo") || name.includes("2 pessoas")) return "duplo";
  if (name.includes("individual") || name.includes("1 pessoa")) return "individual";
  if (name.includes("diamond")) return "diamond";
  if (name.includes("gold")) return "gold";
  if (name.includes("silver")) return "silver";
  if (name.includes("bronze")) return "bronze";
  return null;
}

function extractCidadeFromProduct(productName: string): string | null {
  // Match patterns like "Workshop Scale - Natal )" or "Workshop Scale - São Luís"
  const match = productName.match(/[-–]\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)\s*(?:\)|$)/);
  if (match) return match[1].trim();
  return null;
}
