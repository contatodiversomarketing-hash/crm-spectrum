import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type AppRole = "admin" | "supervisao" | "analista" | "auxiliar";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRoles?: AppRole[];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { user, loading, hasAnyRole } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles && requiredRoles.length > 0 && !hasAnyRole(...requiredRoles)) {
    // Auxiliares acessam Agenda, Pacientes, CRM e Conversas — mandamos para a Agenda
    if (hasAnyRole("auxiliar")) {
      return <Navigate to="/agenda" replace />;
    }
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="rounded-lg border bg-card p-8 max-w-md text-center space-y-3">
          <h2 className="text-lg font-bold">Acesso Negado</h2>
          <p className="text-sm text-muted-foreground">Você não tem permissão para acessar esta página.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
