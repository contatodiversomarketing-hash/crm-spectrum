import { Brain, Activity, MessageSquare, Zap, Shield, Settings, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { StatusCard } from "@/components/StatusCard";
import { SystemStatusBadge } from "@/components/SystemStatusBadge";
import { RecentInteractions } from "@/components/RecentInteractions";
import { AutomationQueue } from "@/components/AutomationQueue";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Core IA Clínica</h1>
              <p className="text-xs text-muted-foreground">Central de Orquestração Inteligente</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SystemStatusBadge status="online" label="Sistemas conectados" />
            {profile && <span className="text-xs text-muted-foreground hidden sm:inline">{profile.nome || profile.email}</span>}
            <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
              <Settings className="h-5 w-5 text-muted-foreground" />
            </button>
            <button onClick={signOut} className="p-2 rounded-lg hover:bg-secondary transition-colors" title="Sair">
              <LogOut className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatusCard
            title="Interações Hoje"
            value={142}
            subtitle="+12% vs ontem"
            icon={MessageSquare}
            variant="info"
          />
          <StatusCard
            title="Automações Executadas"
            value={87}
            subtitle="98.8% taxa de sucesso"
            icon={Zap}
            variant="success"
          />
          <div onClick={() => navigate("/supervisao")} className="cursor-pointer">
            <StatusCard
              title="Supervisões Pendentes"
              value={3}
              subtitle="Aguardando revisão"
              icon={Shield}
              variant="warning"
            />
          </div>
          <StatusCard
            title="Nível Autonomia"
            value="75%"
            subtitle="Modo supervisão ativo"
            icon={Activity}
          />
        </section>

        {/* Two Column Layout */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RecentInteractions />
          <AutomationQueue />
        </section>

        {/* Connected Systems */}
        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold mb-4">Sistemas Integrados</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { name: "Gestão", status: "online" as const },
              { name: "CRM", status: "online" as const },
              { name: "Financeiro", status: "online" as const },
              { name: "Odonto", status: "degraded" as const },
            ].map((sys) => (
              <div key={sys.name} className="flex items-center gap-2 rounded-lg border bg-secondary/50 px-4 py-3">
                <span className={`h-2 w-2 rounded-full ${sys.status === "online" ? "bg-success" : "bg-warning"} animate-pulse`} />
                <span className="text-sm font-medium">{sys.name}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Index;
