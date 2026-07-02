// Edge function de operações administrativas (multi-tenant N:N por memberships).
// Valida o papel do chamador (super_admin global / client_admin da org alvo) via JWT
// e usa a service_role para operações privilegiadas (criar usuários, orgs, vínculos).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-slug",
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

function slugify(s: string): string {
  return (
    (s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org"
  );
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

    const { data: caller } = await admin.from("profiles").select("papel, status").eq("id", callerId).maybeSingle();
    if (!caller) return json({ error: "Perfil não encontrado" }, 403);
    const isSuper = caller.papel === "super_admin";

    const { action, payload } = await req.json();

    // caller é admin da org alvo? (super sempre; senão precisa membership client_admin ativa)
    const callerIsOrgAdmin = async (orgId: string): Promise<boolean> => {
      if (isSuper) return true;
      if (!orgId) return false;
      const { data } = await admin
        .from("memberships")
        .select("papel")
        .eq("user_id", callerId)
        .eq("org_id", orgId)
        .eq("status", "ativo")
        .maybeSingle();
      return data?.papel === "client_admin";
    };
    // usuário alvo pertence à org? (para ações sobre membros)
    const targetInOrg = async (userId: string, orgId: string): Promise<boolean> => {
      if (!orgId) return false;
      const { data } = await admin
        .from("memberships")
        .select("user_id")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();
      return !!data;
    };
    // localiza um usuário existente pelo e-mail (reuso de conta entre clientes)
    const acharUserPorEmail = async (email: string): Promise<string | null> => {
      const { data } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
      return (data as { id: string } | null)?.id ?? null;
    };
    // limite de usuários do plano da org (conta memberships)
    const limiteAtingido = async (orgId: string): Promise<string | null> => {
      const { data: org } = await admin.from("organizations").select("plano_id").eq("id", orgId).maybeSingle();
      if (!org?.plano_id) return null;
      const { data: plano } = await admin.from("planos").select("max_usuarios").eq("id", org.plano_id).maybeSingle();
      const { count } = await admin.from("memberships").select("*", { count: "exact", head: true }).eq("org_id", orgId);
      if (plano && count !== null && count >= plano.max_usuarios) {
        return `Limite do plano atingido (${plano.max_usuarios} usuários).`;
      }
      return null;
    };
    const setModulos = async (userId: string, orgId: string, modulos: string[]) => {
      await admin.from("user_modulos").delete().eq("user_id", userId).eq("org_id", orgId);
      if (Array.isArray(modulos) && modulos.length) {
        await admin.from("user_modulos").insert(modulos.map((m) => ({ user_id: userId, org_id: orgId, modulo_key: m })));
      }
    };

    switch (action) {
      // ---------- SUPER ADMIN ----------
      case "create_org": {
        if (!isSuper) return json({ error: "Apenas super admin" }, 403);
        const { nome, plano_id, admin_email, admin_nome, admin_senha, slug } = payload;
        const orgSlug = slugify(slug || nome);
        const { data: org, error: orgErr } = await admin
          .from("organizations")
          .insert({ nome, slug: orgSlug, plano_id: plano_id || null, created_by: callerId })
          .select("id")
          .single();
        if (orgErr) return json({ error: orgErr.message }, 400);

        // admin do cliente: reusa usuário existente ou cria
        let adminId = await acharUserPorEmail(admin_email);
        if (!adminId) {
          const { data: created, error: cErr } = await admin.auth.admin.createUser({
            email: admin_email,
            password: admin_senha,
            email_confirm: true,
            user_metadata: { nome: admin_nome },
          });
          if (cErr) return json({ error: "Org criada, mas falha ao criar admin: " + cErr.message }, 400);
          adminId = created.user.id;
        }
        await admin.from("profiles").update({ nome: admin_nome, status: "ativo" }).eq("id", adminId);
        await admin.from("memberships").upsert({ user_id: adminId, org_id: org.id, papel: "client_admin", status: "ativo" });
        return json({ ok: true, org_id: org.id, slug: orgSlug });
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
      case "rename_org": {
        if (!isSuper) return json({ error: "Apenas super admin" }, 403);
        const { org_id, nome } = payload;
        if (!nome?.trim()) return json({ error: "Informe o nome" }, 400);
        const { error } = await admin.from("organizations").update({ nome: nome.trim() }).eq("id", org_id);
        return error ? json({ error: error.message }, 400) : json({ ok: true });
      }
      case "set_org_slug": {
        if (!isSuper) return json({ error: "Apenas super admin" }, 403);
        const { org_id, slug } = payload;
        const novo = slugify(slug);
        const { error } = await admin.from("organizations").update({ slug: novo }).eq("id", org_id);
        return error ? json({ error: error.message }, 400) : json({ ok: true, slug: novo });
      }
      case "delete_org": {
        if (!isSuper) return json({ error: "Apenas super admin" }, 403);
        const { org_id } = payload;
        const { data: membros } = await admin.from("memberships").select("user_id").eq("org_id", org_id);
        const ids = (membros ?? []).map((m: { user_id: string }) => m.user_id);
        // apaga a org (cascata remove memberships e user_modulos desta org)
        const { error } = await admin.from("organizations").delete().eq("id", org_id);
        if (error) return json({ error: error.message }, 400);
        // remove usuários que ficaram sem nenhuma org
        for (const uid of ids) {
          const { count } = await admin.from("memberships").select("*", { count: "exact", head: true }).eq("user_id", uid);
          if (count === 0) await admin.auth.admin.deleteUser(uid).catch(() => {});
        }
        return json({ ok: true });
      }

      // ---------- CLIENT ADMIN (ou super) — sempre escopado por payload.org_id ----------
      case "create_member": {
        const orgId = payload.org_id;
        if (!(await callerIsOrgAdmin(orgId))) return json({ error: "Sem permissão nesta organização" }, 403);
        const { email, nome, senha, modulos = [], papel = "user" } = payload;
        if (!email) return json({ error: "Informe o e-mail" }, 400);

        const existente = await acharUserPorEmail(email);
        if (existente && (await targetInOrg(existente, orgId))) {
          return json({ error: "Este usuário já é membro deste cliente." }, 400);
        }
        const lim = await limiteAtingido(orgId);
        if (lim) return json({ error: lim }, 400);

        let userId = existente;
        if (!userId) {
          const { data: created, error: cErr } = await admin.auth.admin.createUser({
            email,
            password: senha,
            email_confirm: true,
            user_metadata: { nome },
          });
          if (cErr) return json({ error: cErr.message }, 400);
          userId = created.user.id;
          await admin.from("profiles").update({ nome, status: "ativo" }).eq("id", userId);
        }
        await admin.from("memberships").upsert({
          user_id: userId,
          org_id: orgId,
          papel: papel === "client_admin" ? "client_admin" : "user",
          status: "ativo",
        });
        await setModulos(userId, orgId, modulos);
        return json({ ok: true, user_id: userId, reused: !!existente });
      }
      case "invite_member": {
        const orgId = payload.org_id;
        if (!(await callerIsOrgAdmin(orgId))) return json({ error: "Sem permissão nesta organização" }, 403);
        const { email, nome, modulos = [], papel = "user" } = payload;
        if (!email) return json({ error: "Informe o e-mail" }, 400);

        const existente = await acharUserPorEmail(email);
        if (existente && (await targetInOrg(existente, orgId))) {
          return json({ error: "Este usuário já é membro deste cliente." }, 400);
        }
        const lim = await limiteAtingido(orgId);
        if (lim) return json({ error: lim }, 400);

        let userId = existente;
        let convidado = false;
        let inviteLink: string | null = null;
        let emailEnviado = false;
        if (!userId) {
          const redirectTo = (Deno.env.get("APP_URL") || "https://appgrowthstack.vercel.app") + "/definir-senha";
          convidado = true;
          // 1) Tenta o convite por e-mail (envia o e-mail e cria o usuário).
          const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
            data: { nome },
            redirectTo,
          });
          if (!invErr && invited?.user) {
            userId = invited.user.id;
            emailEnviado = true;
          } else {
            // 2) E-mail falhou (ex.: rate limit do SMTP padrão / sem SMTP).
            // Garante o usuário e gera um link manual para definir a senha,
            // que NÃO envia e-mail — logo, não esbarra no rate limit.
            userId = await acharUserPorEmail(email);
            if (!userId) {
              const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
                type: "invite",
                email,
                options: { data: { nome }, redirectTo },
              });
              if (linkErr) return json({ error: linkErr.message }, 400);
              userId = linkData.user.id;
              inviteLink = linkData.properties?.action_link ?? null;
            } else {
              // Usuário chegou a ser criado apesar do erro de e-mail: gera link de recuperação.
              const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
                type: "recovery",
                email,
                options: { redirectTo },
              });
              if (linkErr) return json({ error: linkErr.message }, 400);
              inviteLink = linkData.properties?.action_link ?? null;
            }
          }
          await admin.from("profiles").update({ nome: nome || null, status: "ativo" }).eq("id", userId);
        }
        await admin.from("memberships").upsert({
          user_id: userId,
          org_id: orgId,
          papel: papel === "client_admin" ? "client_admin" : "user",
          status: "ativo",
        });
        await setModulos(userId, orgId, modulos);
        // usuário já existia (outra org): apenas vinculado, sem novo convite/senha
        return json({ ok: true, user_id: userId, convidado, reused: !!existente, invite_link: inviteLink, email_enviado: emailEnviado });
      }
      case "set_member_modules": {
        const { user_id, modulos, org_id } = payload;
        if (!(await callerIsOrgAdmin(org_id))) return json({ error: "Sem permissão nesta organização" }, 403);
        if (!(await targetInOrg(user_id, org_id))) return json({ error: "Usuário não é membro deste cliente" }, 403);
        await setModulos(user_id, org_id, modulos);
        return json({ ok: true });
      }
      case "set_member_status": {
        const { user_id, status, org_id } = payload;
        if (!(await callerIsOrgAdmin(org_id))) return json({ error: "Sem permissão nesta organização" }, 403);
        if (!(await targetInOrg(user_id, org_id))) return json({ error: "Usuário não é membro deste cliente" }, 403);
        const { error } = await admin.from("memberships").update({ status }).eq("user_id", user_id).eq("org_id", org_id);
        return error ? json({ error: error.message }, 400) : json({ ok: true });
      }
      case "delete_member": {
        const { user_id, org_id } = payload;
        if (user_id === callerId) return json({ error: "Você não pode remover a si mesmo" }, 400);
        if (!(await callerIsOrgAdmin(org_id))) return json({ error: "Sem permissão nesta organização" }, 403);
        if (!(await targetInOrg(user_id, org_id))) return json({ error: "Usuário não é membro deste cliente" }, 403);
        // remove o vínculo desta org (não apaga o usuário, que pode estar em outras)
        await admin.from("user_modulos").delete().eq("user_id", user_id).eq("org_id", org_id);
        const { error } = await admin.from("memberships").delete().eq("user_id", user_id).eq("org_id", org_id);
        if (error) return json({ error: error.message }, 400);
        // se não restar nenhuma org, apaga o usuário do Auth
        const { count } = await admin.from("memberships").select("*", { count: "exact", head: true }).eq("user_id", user_id);
        if (count === 0) await admin.auth.admin.deleteUser(user_id).catch(() => {});
        return json({ ok: true });
      }
      case "reset_password": {
        const { user_id, senha, org_id } = payload;
        if (!(await callerIsOrgAdmin(org_id))) return json({ error: "Sem permissão nesta organização" }, 403);
        if (!(await targetInOrg(user_id, org_id))) return json({ error: "Usuário não é membro deste cliente" }, 403);
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
