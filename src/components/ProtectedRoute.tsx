import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { MODULOS_CATALOGO } from "@/lib/modulos";
import { Loader2 } from "lucide-react";

interface Props {
  children: React.ReactNode;
  /** Se definido, exige que o item (ex.: "eventos.vendas") esteja liberado. */
  modulo?: string;
  /** Se definido, exige um destes papéis. */
  papeis?: Array<"super_admin" | "client_admin" | "user">;
}

function TelaCarregando() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function ProtectedRoute({ children, modulo, papeis }: Props) {
  const { loading, session, profile, modulosPermitidos, isSuperAdmin } = useAuth();
  const location = useLocation();

  if (loading) return <TelaCarregando />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  // Conta criada mas ainda sem organização/aprovação
  if (profile && profile.status !== "ativo") {
    return <Navigate to="/aguardando" replace />;
  }

  // Primeiro item liberado (destino seguro quando a home não está acessível).
  const primeiraUrl = (() => {
    for (const m of MODULOS_CATALOGO) for (const it of m.itens) {
      if (isSuperAdmin || modulosPermitidos.includes(it.key)) return it.url;
    }
    return "/configuracoes";
  })();

  if (papeis && profile && !papeis.includes(profile.papel)) {
    return primeiraUrl === location.pathname ? <>{children}</> : <Navigate to={primeiraUrl} replace />;
  }

  if (modulo && !isSuperAdmin && !modulosPermitidos.includes(modulo)) {
    return primeiraUrl === location.pathname
      ? <SemAcesso />
      : <Navigate to={primeiraUrl} replace />;
  }

  return <>{children}</>;
}

function SemAcesso() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div>
        <p className="text-lg font-medium">Sem acesso a nenhum módulo</p>
        <p className="text-sm text-muted-foreground mt-1">Fale com o administrador para liberar seus acessos.</p>
      </div>
    </div>
  );
}
