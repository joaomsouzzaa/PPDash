import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { TODOS_OS_ITENS, expandirItens } from "@/lib/modulos";
import { getTenantSlug } from "@/lib/tenant";

export interface Marca { nome: string | null; logo: string | null; }

export type Papel = "super_admin" | "client_admin" | "user";

export interface Profile {
  id: string;
  nome: string | null;
  email: string | null;
  org_id: string | null;
  papel: Papel;
  status: string;
}

export interface Plano {
  id: string;
  nome: string;
  slug: string;
  modulos: string[];
  max_usuarios: number;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  plano: Plano | null;
  marca: Marca;
  /** Itens liberados = (plano da org) ∩ (itens do usuário, se restrito). Super admin = todos. */
  modulosPermitidos: string[];
  isSuperAdmin: boolean;
  isClientAdmin: boolean;
  signIn: (email: string, senha: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const MARCA_PADRAO: Marca = { nome: null, logo: null };

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plano, setPlano] = useState<Plano | null>(null);
  const [marca, setMarca] = useState<Marca>(MARCA_PADRAO);
  const [modulosPermitidos, setModulosPermitidos] = useState<string[]>([]);

  const carregarPerfil = useCallback(async (uid: string) => {
    const slug = getTenantSlug();

    // Identidade global do usuário (papel super_admin é global; status = conta).
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, nome, email, papel, status")
      .eq("id", uid)
      .maybeSingle();
    const pg = (prof as { id: string; nome: string | null; email: string | null; papel: Papel; status: string }) ?? null;

    if (!pg) {
      setProfile(null); setPlano(null); setMarca(MARCA_PADRAO); setModulosPermitidos([]);
      return;
    }

    // Org ativa (do subdomínio) — id + marca, via RPC pública por slug.
    const { data: brandRows } = await supabase.rpc("org_branding", { p_slug: slug });
    const brand = (Array.isArray(brandRows) ? brandRows[0] : brandRows) as
      | { id: string; marca_nome: string | null; marca_logo_url: string | null }
      | null;
    const orgId = brand?.id ?? null;
    setMarca({ nome: brand?.marca_nome ?? null, logo: brand?.marca_logo_url ?? null });

    const contaAtiva = pg.status === "ativo";

    // Super admin: acesso total a qualquer org/subdomínio.
    if (pg.papel === "super_admin") {
      setProfile({ id: pg.id, nome: pg.nome, email: pg.email, org_id: orgId, papel: "super_admin", status: "ativo" });
      setPlano(null); setMarca(MARCA_PADRAO); setModulosPermitidos(TODOS_OS_ITENS);
      return;
    }

    // Membership do usuário NA org ativa define papel/acesso.
    const { data: mem } = orgId
      ? await supabase.from("memberships").select("papel, status").eq("user_id", uid).eq("org_id", orgId).maybeSingle()
      : { data: null };
    const m = mem as { papel: "client_admin" | "user"; status: string } | null;

    if (!orgId || !m || m.status !== "ativo" || !contaAtiva) {
      // Usuário não é membro ativo deste cliente → sem acesso a este subdomínio.
      setProfile({ id: pg.id, nome: pg.nome, email: pg.email, org_id: orgId, papel: "user", status: "sem_acesso" });
      setPlano(null); setModulosPermitidos([]);
      return;
    }

    setProfile({ id: pg.id, nome: pg.nome, email: pg.email, org_id: orgId, papel: m.papel, status: "ativo" });

    // Plano da org ativa.
    let modsPlano: string[] = [];
    const { data: org } = await supabase
      .from("organizations")
      .select("plano_id")
      .eq("id", orgId)
      .maybeSingle();
    const planoId = (org as { plano_id: string | null } | null)?.plano_id;
    if (planoId) {
      const { data: pl } = await supabase
        .from("planos")
        .select("id, nome, slug, modulos, max_usuarios")
        .eq("id", planoId)
        .maybeSingle();
      if (pl) {
        const plano = pl as unknown as Plano;
        setPlano(plano);
        modsPlano = expandirItens(plano.modulos ?? []);
      }
    }

    // Restrição por usuário NA org ativa (whitelist em user_modulos por org).
    const { data: um } = await supabase
      .from("user_modulos")
      .select("modulo_key")
      .eq("user_id", uid)
      .eq("org_id", orgId);
    const userMods = expandirItens(((um as { modulo_key: string }[]) ?? []).map((r) => r.modulo_key));

    const efetivos = userMods.length > 0
      ? modsPlano.filter((m) => userMods.includes(m))
      : modsPlano;
    setModulosPermitidos(efetivos);
  }, []);

  const aplicarSessao = useCallback(async (s: Session | null) => {
    setSession(s);
    if (s?.user) {
      await carregarPerfil(s.user.id);
    } else {
      setProfile(null);
      setPlano(null);
      setMarca(MARCA_PADRAO);
      setModulosPermitidos([]);
    }
  }, [carregarPerfil]);

  useEffect(() => {
    let ativo = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return;
      await aplicarSessao(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      // Evita travar dentro do callback do Supabase (recomendação oficial)
      setSession(s);
      if (s?.user) {
        setTimeout(() => { void carregarPerfil(s.user.id); }, 0);
      } else {
        setProfile(null);
        setPlano(null);
        setModulosPermitidos([]);
      }
    });

    return () => { ativo = false; sub.subscription.unsubscribe(); };
  }, [aplicarSessao, carregarPerfil]);

  const signIn = useCallback(async (email: string, senha: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refresh = useCallback(async () => {
    if (session?.user) await carregarPerfil(session.user.id);
  }, [session, carregarPerfil]);

  const value: AuthState = {
    loading,
    session,
    user: session?.user ?? null,
    profile,
    plano,
    marca,
    modulosPermitidos,
    isSuperAdmin: profile?.papel === "super_admin",
    isClientAdmin: profile?.papel === "client_admin",
    signIn,
    signOut,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
