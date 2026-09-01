import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import SupervisaoIA from "./pages/SupervisaoIA";
import DashboardInteligenciaIA from "./pages/DashboardInteligenciaIA";
import Login from "./pages/Login";
import TreinamentoIA from "./pages/TreinamentoIA";
import CRM from "./pages/CRM";
import Agenda from "./pages/Agenda";
import Pacientes from "./pages/Pacientes";
import Usuarios from "./pages/Usuarios";
import Conversas from "./pages/Conversas";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute requiredRoles={["admin", "supervisao", "analista"]}><AppLayout><Index /></AppLayout></ProtectedRoute>} />
            <Route path="/supervisao" element={<ProtectedRoute requiredRoles={["admin", "supervisao"]}><AppLayout><SupervisaoIA /></AppLayout></ProtectedRoute>} />
            <Route path="/dashboard-ia" element={<ProtectedRoute requiredRoles={["admin", "supervisao", "analista"]}><AppLayout><DashboardInteligenciaIA /></AppLayout></ProtectedRoute>} />
            <Route path="/treinamento-ia" element={<ProtectedRoute requiredRoles={["admin"]}><AppLayout><TreinamentoIA /></AppLayout></ProtectedRoute>} />
            <Route path="/usuarios" element={<ProtectedRoute requiredRoles={["admin"]}><AppLayout><Usuarios /></AppLayout></ProtectedRoute>} />
            <Route path="/crm" element={<ProtectedRoute><AppLayout><CRM /></AppLayout></ProtectedRoute>} />
            <Route path="/agenda" element={<ProtectedRoute><AppLayout><Agenda /></AppLayout></ProtectedRoute>} />
            <Route path="/pacientes" element={<ProtectedRoute><AppLayout><Pacientes /></AppLayout></ProtectedRoute>} />
            <Route path="/conversas-ia" element={<Navigate to="/conversas" replace />} />
            <Route path="/conversas-atendente" element={<Navigate to="/conversas" replace />} />
            <Route path="/conversas" element={<ProtectedRoute requiredRoles={["admin", "supervisao", "analista"]}><AppLayout><Conversas /></AppLayout></ProtectedRoute>} />


            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
