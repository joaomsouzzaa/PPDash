import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { ModuloKey } from "@/hooks/useModulos";
import { Loader2 } from "lucide-react";

interface Props {
  children: React.ReactNode;
  /** Se definido, exige que o módulo esteja liberado para o usuário. */
  modulo?: ModuloKey;
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

  if (papeis && profile && !papeis.includes(profile.papel)) {
    return <Navigate to="/" replace />;
  }

  if (modulo && !isSuperAdmin && !modulosPermitidos.includes(modulo)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
