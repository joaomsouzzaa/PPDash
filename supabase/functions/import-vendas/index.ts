import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const expected = Deno.env.get("WEBHOOK_API_KEY");
  if (!expected || token !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const { rows } = await req.json() as { rows: string[][] };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const records = rows.map((r) => {
      const [dataCompra, status, nome, telefone, email, produto, codProduto, _valorLiq, valorBruto,
        utmCampaign, utmMedium, utmSource, utmContent, utmTerm, _sck, metodoPagamento] = r;

      return {
        plataforma: "goexplosion",
        data_venda: parseDate(dataCompra),
        status: mapStatus(status),
        nome_comprador: nome || null,
        telefone_comprador: telefone || null,
        email_comprador: cleanEmail(email) || null,
        produto: cleanText(produto) || null,
        tipo_ingresso: detectTipoIngresso(produto || ""),
        cidade: extractCidade(produto || ""),
        valor: parseValor(valorBruto),
        quantidade: 1,
        metodo_pagamento: metodoPagamento || null,
        utm_campaign: cleanUtm(utmCampaign),
        utm_medium: cleanUtm(utmMedium),
        utm_source: cleanUtm(utmSource),
        utm_content: cleanUtm(utmContent),
        utm_term: cleanUtm(utmTerm),
        id_transacao: codProduto ? `sheet-${codProduto}-${cleanEmail(email)}-${parseDate(dataCompra)}` : null,
      };
    });

    // Insert in batches of 50
    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i += 50) {
      const batch = records.slice(i, i + 50);
      const { error, count } = await supabase.from("vendas").insert(batch);
      if (error) {
        errors.push(`Batch ${i}: ${error.message}`);
      } else {
        inserted += batch.length;
      }
    }

    return new Response(JSON.stringify({ inserted, skipped, errors, total: records.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function parseDate(d: string): string {
  if (!d) return new Date().toISOString();
  const parts = d.split("/");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}T12:00:00Z`;
  }
  return d;
}

function parseValor(v: string): number {
  if (!v) return 0;
  // "R$ 1.310,36" → 1310.36
  return parseFloat(v.replace("R$", "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}

function mapStatus(s: string): string {
  const lower = (s || "").toLowerCase().trim();
  if (lower === "pago" || lower === "aprovada" || lower === "paid") return "aprovada";
  if (lower.includes("reembols")) return "reembolsada";
  if (lower.includes("cancel")) return "cancelada";
  if (lower.includes("pendent")) return "pendente";
  return s || "aprovada";
}

function detectTipoIngresso(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("vip duplo")) return "vip_duplo";
  if (n.includes("individual vip") || (n.includes("vip") && !n.includes("duplo"))) return "vip";
  if (n.includes("duplo") || n.includes("2 pessoas")) return "duplo";
  if (n.includes("individual") || n.includes("1 pessoa")) return "individual";
  return null;
}

function extractCidade(produto: string): string | null {
  // "... (Workshop Scale - Aracaju )" → "Aracaju"
  const wsMatch = produto.match(/Workshop Scale\s*-\s*([^)]+)\)/i);
  if (wsMatch) return wsMatch[1].trim();
  // "(Recife Scale Summit)" → "Recife"
  const summitMatch = produto.match(/\((\w+)\s+Scale Summit\)/i);
  if (summitMatch) return summitMatch[1].trim();
  return null;
}

function cleanEmail(e: string): string {
  return (e || "").replace(/\\/g, "").trim();
}

function cleanText(t: string): string {
  return (t || "").replace(/\\\|/g, "|").replace(/\\/g, "").trim();
}

function cleanUtm(v: string | undefined): string | null {
  if (!v || !v.trim()) return null;
  const clean = v.replace(/\\/g, "").replace(/\[/g, "").replace(/\]/g, "").trim();
  // Skip template placeholders
  if (clean.includes("{{") || !clean) return null;
  return clean;
}
