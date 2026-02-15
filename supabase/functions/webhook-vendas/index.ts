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

  try {
    const payload = await req.json();

    // Detectar plataforma pelo formato do payload
    let venda: Record<string, unknown>;

    if (payload.event || payload.webhook_event_type) {
      // Kiwify format
      venda = {
        plataforma: "kiwify",
        id_transacao: payload.order_id || payload.Transaction?.id || null,
        status: mapStatus(payload.order_status || payload.event || "aprovada"),
        valor: parseFloat(payload.order_price || payload.Transaction?.amount || "0"),
        nome_comprador: payload.Customer?.full_name || payload.customer?.name || null,
        email_comprador: payload.Customer?.email || payload.customer?.email || null,
        telefone_comprador: payload.Customer?.mobile || payload.customer?.phone || null,
        produto: payload.Product?.name || payload.product?.name || null,
        tipo_ingresso: payload.Product?.name || null,
        cidade: null,
        data_venda: payload.created_at || new Date().toISOString(),
        payload,
      };
    } else {
      // GoExplosion / formato genérico
      venda = {
        plataforma: payload.plataforma || "goexplosion",
        id_transacao: payload.id_transacao || payload.transaction_id || payload.id || null,
        status: mapStatus(payload.status || "aprovada"),
        valor: parseFloat(payload.valor || payload.amount || payload.price || "0"),
        nome_comprador: payload.nome || payload.name || payload.customer_name || null,
        email_comprador: payload.email || payload.customer_email || null,
        telefone_comprador: payload.telefone || payload.phone || null,
        produto: payload.produto || payload.product || payload.product_name || null,
        tipo_ingresso: payload.tipo_ingresso || payload.ticket_type || null,
        cidade: payload.cidade || payload.city || null,
        data_venda: payload.data_venda || payload.date || new Date().toISOString(),
        payload,
      };
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error } = await supabase.from("vendas").insert(venda);

    if (error) {
      console.error("Erro ao inserir venda:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro no webhook:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function mapStatus(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("approv") || s.includes("paid") || s.includes("completed") || s === "order_paid") return "aprovada";
  if (s.includes("refund")) return "reembolsada";
  if (s.includes("cancel") || s.includes("chargeback")) return "cancelada";
  if (s.includes("pending") || s.includes("waiting")) return "pendente";
  return status;
}
