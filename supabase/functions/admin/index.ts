// Edge function de operações administrativas (multi-tenant).
// Valida o papel do chamador (super_admin / client_admin) via JWT e usa
// a service_role para operações privilegiadas (criar usuários, orgs, etc).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Não autenticado" }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Sessão inválida" }, 401);
    const callerId = userData.user.id;

    const { data: caller } = await admin
      .from("profiles")
      .select("papel, org_id, status")
      .eq("id", callerId)
      .maybeSingle();
    if (!caller) return json({ error: "Perfil não encontrado" }, 403);

    const isSuper = caller.papel === "super_admin";
    const isClientAdmin = caller.papel === "client_admin";
    if (!isSuper && !isClientAdmin) return json({ error: "Sem permissão" }, 403);

    const { action, payload } = await req.json();

    // Garante que o alvo pertence à org do client_admin
    const assertMesmaOrg = async (userId: string) => {
      if (isSuper) return true;
      const { data: alvo } = await admin.from("profiles").select("org_id").eq("id", userId).maybeSingle();
      return alvo?.org_id && alvo.org_id === caller.org_id;
    };

    switch (action) {
      // ---------- SUPER ADMIN ----------
      case "create_org": {
        if (!isSuper) return json({ error: "Apenas super admin" }, 403);
        const { nome, plano_id, admin_email, admin_nome, admin_senha } = payload;
        const { data: org, error: orgErr } = await admin
          .from("organizations")
          .insert({ nome, plano_id: plano_id || null, created_by: callerId })
          .select("id")
          .single();
        if (orgErr) return json({ error: orgErr.message }, 400);

        // cria o admin do cliente
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email: admin_email,
          password: admin_senha,
          email_confirm: true,
          user_metadata: { nome: admin_nome },
        });
        if (cErr) return json({ error: "Org criada, mas falha ao criar admin: " + cErr.message }, 400);
        await admin.from("profiles").update({
          papel: "client_admin", org_id: org.id, nome: admin_nome, status: "ativo",
        }).eq("id", created.user.id);
        return json({ ok: true, org_id: org.id });
      }
      case "set_org_plan": {
        if (!isSuper) return json({ error: "Apenas super admin" }, 403);
        const { org_id, plano_id } = payload;
        const { error } = await admin.from("organizations").update({ plano_id }).eq("id", org_id);
        return error ? json({ error: error.message }, 400) : json({ ok: true });
      }
      case "set_org_status": {
        if (!isSuper) return json({ error: "Apenas super admin" }, 403);
        const { org_id, status } = payload;
        const { error } = await admin.from("organizations").update({ status }).eq("id", org_id);
        return error ? json({ error: error.message }, 400) : json({ ok: true });
      }

      // ---------- CLIENT ADMIN (ou super) ----------
      case "create_member": {
        const orgId = isSuper ? payload.org_id : caller.org_id;
        if (!orgId) return json({ error: "Organização não definida" }, 400);
        const { email, nome, senha, modulos = [], papel = "user" } = payload;

        // checa limite do plano
        const { data: org } = await admin.from("organizations").select("plano_id").eq("id", orgId).maybeSingle();
        if (org?.plano_id) {
          const { data: plano } = await admin.from("planos").select("max_usuarios").eq("id", org.plano_id).maybeSingle();
          const { count } = await admin.from("profiles").select("*", { count: "exact", head: true }).eq("org_id", orgId);
          if (plano && count !== null && count >= plano.max_usuarios) {
            return json({ error: `Limite do plano atingido (${plano.max_usuarios} usuários).` }, 400);
          }
        }

        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email, password: senha, email_confirm: true, user_metadata: { nome },
        });
        if (cErr) return json({ error: cErr.message }, 400);
        await admin.from("profiles").update({
          papel: papel === "client_admin" ? "client_admin" : "user",
          org_id: orgId, nome, status: "ativo",
        }).eq("id", created.user.id);
        if (Array.isArray(modulos) && modulos.length) {
          await admin.from("user_modulos").insert(modulos.map((m: string) => ({ user_id: created.user.id, modulo_key: m })));
        }
        return json({ ok: true, user_id: created.user.id });
      }
      case "set_member_modules": {
        const { user_id, modulos } = payload;
        if (!(await assertMesmaOrg(user_id))) return json({ error: "Fora da sua organização" }, 403);
        await admin.from("user_modulos").delete().eq("user_id", user_id);
        if (Array.isArray(modulos) && modulos.length) {
          await admin.from("user_modulos").insert(modulos.map((m: string) => ({ user_id, modulo_key: m })));
        }
        return json({ ok: true });
      }
      case "set_member_status": {
        const { user_id, status } = payload;
        if (!(await assertMesmaOrg(user_id))) return json({ error: "Fora da sua organização" }, 403);
        const { error } = await admin.from("profiles").update({ status }).eq("id", user_id);
        return error ? json({ error: error.message }, 400) : json({ ok: true });
      }
      case "delete_member": {
        const { user_id } = payload;
        if (user_id === callerId) return json({ error: "Você não pode excluir a si mesmo" }, 400);
        if (!(await assertMesmaOrg(user_id))) return json({ error: "Fora da sua organização" }, 403);
        const { error } = await admin.auth.admin.deleteUser(user_id);
        return error ? json({ error: error.message }, 400) : json({ ok: true });
      }
      case "reset_password": {
        const { user_id, senha } = payload;
        if (!(await assertMesmaOrg(user_id))) return json({ error: "Fora da sua organização" }, 403);
        const { error } = await admin.auth.admin.updateUserById(user_id, { password: senha });
        return error ? json({ error: error.message }, 400) : json({ ok: true });
      }

      default:
        return json({ error: "Ação desconhecida: " + action }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
