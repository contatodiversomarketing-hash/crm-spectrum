import { Zap, Clock, CheckCircle, AlertTriangle } from "lucide-react";

const mockAutomations = [
  { id: 1, tipo: "Lembrete consulta", sistema: "CRM", status: "executado", paciente: "PAC-2847" },
  { id: 2, tipo: "Nota fiscal", sistema: "Financeiro", status: "pendente", paciente: "PAC-1932" },
  { id: 3, tipo: "Atualizar prontuário", sistema: "Gestão", status: "executado", paciente: "PAC-4521" },
  { id: 4, tipo: "Envio pós-consulta", sistema: "CRM", status: "falha", paciente: "PAC-3190" },
];

const statusIcon: Record<string, React.ReactNode> = {
  executado: <CheckCircle className="h-4 w-4 text-success" />,
  pendente: <Clock className="h-4 w-4 text-warning" />,
  falha: <AlertTriangle className="h-4 w-4 text-destructive" />,
};

export function AutomationQueue() {
  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Fila de Automações</h3>
      </div>
      <div className="space-y-3">
        {mockAutomations.map((item) => (
          <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <div className="flex items-center gap-3">
              {statusIcon[item.status]}
              <div>
                <span className="text-sm font-medium">{item.tipo}</span>
                <p className="text-xs text-muted-foreground">{item.paciente} → {item.sistema}</p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground capitalize">{item.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
