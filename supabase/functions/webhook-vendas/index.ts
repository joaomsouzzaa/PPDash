import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  console.log("webhook-vendas atualizado");
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
      const product = payload.Product || payload.product || {};
      const customer = payload.Customer || payload.customer || {};
      const commissions = payload.Commissions || {};
      const tracking = payload.TrackingParameters || {};
      const productName = fixMojibake(product.product_name || product.name || "") || null;
      // charge_amount vem em centavos (ex.: 24700 = R$ 247,00)
      const chargeAmount = commissions.charge_amount ?? commissions.product_base_price;

      venda = {
        plataforma: "kiwify",
        id_transacao: payload.order_id || payload.Transaction?.id || null,
        status: mapStatus(payload.order_status || payload.webhook_event_type || payload.event || "aprovada"),
        valor: chargeAmount != null ? Number(chargeAmount) / 100 : parseFloat(payload.order_price || payload.Transaction?.amount || "0"),
        quantidade: Array.isArray(payload.event_tickets) && payload.event_tickets.length > 0 ? payload.event_tickets.length : 1,
        nome_comprador: fixMojibake(customer.full_name || customer.name || "") || null,
        email_comprador: customer.email || null,
        telefone_comprador: customer.mobile || customer.phone || null,
        documento: customer.CPF || customer.cnpj || null,
        produto: productName,
        tipo_ingresso: detectTipoIngresso(`${productName || ""} ${payload.event_batch?.name || ""}`),
        produtor: null,
        cidade: extractCidadeFromKiwify(productName || ""),
        metodo_pagamento: payload.payment_method || null,
        cupom: null,
        utm_source: tracking.utm_source || null,
        utm_medium: tracking.utm_medium || null,
        utm_campaign: tracking.utm_campaign || null,
        utm_content: tracking.utm_content || null,
        utm_term: tracking.utm_term || null,
        data_venda: payload.approved_date || payload.created_at || new Date().toISOString(),
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

    const status = venda.status as string;
    const idTransacao = venda.id_transacao as string | null;

    // If it's a cancellation/refund and we have a transaction ID, update existing record
    if (idTransacao && (status === "cancelada" || status === "reembolsada")) {
      const { data: existing } = await supabase
        .from("vendas")
        .select("id")
        .eq("id_transacao", idTransacao)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("vendas")
          .update({ status, payload: venda.payload })
          .eq("id_transacao", idTransacao);

        if (error) {
          console.error("[Webhook Update Error]", { timestamp: new Date().toISOString(), code: error.code, message: error.message });
          return new Response(JSON.stringify({ error: "Failed to update sale status" }), {
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

    // Upgrade (orderbump): a quantidade deve ser a mesma da compra principal
    // (Workshop) do mesmo comprador/cidade — o webhook costuma mandar 1.
    await resolveUpgradeQuantity(supabase, venda);

    // Otherwise insert as new record
    const { error } = await supabase.from("vendas").insert(venda);

    if (error) {
      console.error("[Webhook Error]", { timestamp: new Date().toISOString(), code: error.code, message: error.message });
      return new Response(JSON.stringify({ error: "Failed to process webhook" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Se chegou a compra principal, atualiza upgrades já existentes desse
    // comprador/cidade para refletirem a quantidade correta (ordem inversa).
    await syncUpgradesForCompra(supabase, venda);

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

function isUpgradeProduto(nome: unknown): boolean {
  return typeof nome === "string" && nome.toLowerCase().includes("upgrade");
}

// Se a venda for um Upgrade (orderbump), copia a quantidade da compra principal
// (Workshop/ingresso) do mesmo comprador e cidade. O webhook do upgrade costuma
// vir com quantidade 1, mas ela deve refletir a compra principal.
async function resolveUpgradeQuantity(supabase: any, venda: Record<string, unknown>) {
  if (!isUpgradeProduto(venda.produto)) return;
  const email = venda.email_comprador as string | null;
  const cidade = venda.cidade as string | null;
  if (!email) return;
  try {
    let query = supabase
      .from("vendas")
      .select("quantidade")
      .eq("email_comprador", email)
      .eq("status", "aprovada")
      .not("produto", "ilike", "%upgrade%")
      .order("quantidade", { ascending: false })
      .limit(1);
    if (cidade) query = query.eq("cidade", cidade);
    const { data } = await query.maybeSingle();
    if (data && data.quantidade != null) {
      venda.quantidade = data.quantidade;
    }
  } catch (_) {
    // silencioso: na pior hipótese mantém a quantidade do webhook
  }
}

// Quando chega a compra principal (não-upgrade), atualiza upgrades já existentes
// do mesmo comprador/cidade para terem a mesma quantidade (caso o upgrade tenha
// chegado antes da compra principal).
async function syncUpgradesForCompra(supabase: any, venda: Record<string, unknown>) {
  if (isUpgradeProduto(venda.produto)) return;
  const email = venda.email_comprador as string | null;
  const cidade = venda.cidade as string | null;
  const qty = venda.quantidade;
  if (!email || qty == null) return;
  try {
    let query = supabase
      .from("vendas")
      .update({ quantidade: qty })
      .eq("email_comprador", email)
      .eq("status", "aprovada")
      .ilike("produto", "%upgrade%");
    if (cidade) query = query.eq("cidade", cidade);
    await query;
  } catch (_) {
    // silencioso
  }
}

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
  if (name.includes("vip") && (name.includes("individual") || name.includes("1 pessoa"))) return "vip_individual";
  if (name.includes("vip")) return "vip_individual";
  if (name.includes("duplo") || name.includes("2 pessoas")) return "duplo";
  if (name.includes("individual") || name.includes("1 pessoa")) return "individual";
  if (name.includes("diamond")) return "diamond";
  if (name.includes("gold")) return "gold";
  if (name.includes("silver")) return "silver";
  if (name.includes("bronze")) return "bronze";
  return null;
}

// Kiwify: extrai a cidade procurando o padrão "Cidade - UF" (UF = 2 letras
// maiúsculas) em qualquer trecho do nome do produto, e remove prefixos
// comerciais (Upgrade/Ingresso/Lote). Produtos sem "- UF" (ex.: "Trilha
// Mentor", produtos online) retornam null.
function extractCidadeFromKiwify(productName: string): string | null {
  if (!productName) return null;
  const match = productName.match(/([^|]+?)\s*-\s*[A-Z]{2}\b/);
  if (match) {
    const cidade = match[1].trim().replace(/^(Upgrade|Ingresso|Lote)\s+/i, "").trim();
    if (cidade) return cidade;
  }
  // fallback para o padrão dos outros produtos
  return extractCidadeFromProduct(productName);
}

// Corrige texto UTF-8 que chegou decodificado como latin-1 (ex.: "BelÃ©m" -> "Belém").
// Strings já corretas lançam erro no decode e são retornadas intactas.
function fixMojibake(s: string): string {
  if (!s) return s;
  try {
    return decodeURIComponent(escape(s));
  } catch {
    return s;
  }
}

function extractCidadeFromProduct(productName: string): string | null {
  // Match "Recife Scale Summit" or similar city-named summits
  const summitMatch = productName.match(/\((\w[\w\s]*?)\s+Scale\s+Summit\)/i);
  if (summitMatch) return summitMatch[1].trim();
  // Match patterns like "Workshop Scale - Natal )" or "Workshop Scale - São Luís"
  const match = productName.match(/[-–]\s*([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)\s*(?:\)|$)/);
  if (match) return match[1].trim();
  return null;
}
