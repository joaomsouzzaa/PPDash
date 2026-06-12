import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { ModuloKey } from "@/hooks/useModulos";

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
  modulos: ModuloKey[];
  max_usuarios: number;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  plano: Plano | null;
  /** Módulos liberados = (plano da org) ∩ (módulos do usuário, se restrito). Super admin = todos. */
  modulosPermitidos: ModuloKey[];
  isSuperAdmin: boolean;
  isClientAdmin: boolean;
  signIn: (email: string, senha: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const TODOS_MODULOS: ModuloKey[] = ["eventos", "inside", "analytics", "growth"];

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plano, setPlano] = useState<Plano | null>(null);
  const [modulosPermitidos, setModulosPermitidos] = useState<ModuloKey[]>([]);

  const carregarPerfil = useCallback(async (uid: string) => {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, nome, email, org_id, papel, status")
      .eq("id", uid)
      .maybeSingle();

    const p = (prof as Profile) ?? null;
    setProfile(p);

    if (!p) {
      setPlano(null);
      setModulosPermitidos([]);
      return;
    }

    if (p.papel === "super_admin") {
      setPlano(null);
      setModulosPermitidos(TODOS_MODULOS);
      return;
    }

    // Plano da organização
    let modsPlano: ModuloKey[] = [];
    if (p.org_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("plano_id")
        .eq("id", p.org_id)
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
          modsPlano = (plano.modulos ?? []) as ModuloKey[];
        }
      }
    }

    // Restrição por usuário (se houver linhas em user_modulos, usa-as como whitelist)
    const { data: um } = await supabase
      .from("user_modulos")
      .select("modulo_key")
      .eq("user_id", uid);
    const userMods = ((um as { modulo_key: ModuloKey }[]) ?? []).map((r) => r.modulo_key);

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
