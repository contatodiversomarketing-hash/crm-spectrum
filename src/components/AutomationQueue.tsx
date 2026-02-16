import { Zap, Clock, CheckCircle, AlertTriangle } from "lucide-react";

interface AutomationItem {
  id: string;
  tipo: string;
  sistema: string;
  status: string;
  paciente: string;
}

const statusIcon: Record<string, React.ReactNode> = {
  executado: <CheckCircle className="h-4 w-4 text-success" />,
  pendente: <Clock className="h-4 w-4 text-warning" />,
  falha: <AlertTriangle className="h-4 w-4 text-destructive" />,
};

const tipoLabels: Record<string, string> = {
  reativacao_score: "Reativação WhatsApp",
  reativacao_voz: "Reativação Voz",
  prospeccao_lead: "Prospecção Lead",
  confirmacao_voz: "Confirmação",
};

export function AutomationQueue({ items }: { items?: AutomationItem[] }) {
  const empty = !items || items.length === 0;

  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Fila de Automações</h3>
      </div>
      {empty ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhuma automação recente</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div className="flex items-center gap-3">
                {statusIcon[item.status] || statusIcon.pendente}
                <div>
                  <span className="text-sm font-medium">{tipoLabels[item.tipo] || item.tipo}</span>
                  <p className="text-xs text-muted-foreground">{item.paciente} → {item.sistema}</p>
                </div>
              </div>
              <span className="text-xs text-muted-foreground capitalize">{item.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
