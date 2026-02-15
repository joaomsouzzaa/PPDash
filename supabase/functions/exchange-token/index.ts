import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { short_lived_token } = await req.json();

    if (!short_lived_token) {
      return new Response(
        JSON.stringify({ error: "short_lived_token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const appId = "24154258840827764";
    const appSecret = Deno.env.get("META_APP_SECRET");

    if (!appSecret) {
      return new Response(
        JSON.stringify({ error: "META_APP_SECRET not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(short_lived_token)}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.error) {
      return new Response(
        JSON.stringify({ error: data.error?.message || "Failed to exchange token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        access_token: data.access_token,
        expires_in: data.expires_in,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
