import { MessageSquare, Phone } from "lucide-react";

const mockInteractions = [
  { id: 1, paciente: "PAC-2847", canal: "whatsapp" as const, intencao: "Agendamento", estado: "concluído", tempo: "2 min atrás" },
  { id: 2, paciente: "PAC-1932", canal: "telefone" as const, intencao: "Cancelamento", estado: "supervisionado", tempo: "5 min atrás" },
  { id: 3, paciente: "PAC-4521", canal: "whatsapp" as const, intencao: "Dúvida procedimento", estado: "em andamento", tempo: "8 min atrás" },
  { id: 4, paciente: "PAC-3190", canal: "whatsapp" as const, intencao: "Confirmação", estado: "concluído", tempo: "12 min atrás" },
  { id: 5, paciente: "PAC-0872", canal: "telefone" as const, intencao: "Reagendamento", estado: "concluído", tempo: "15 min atrás" },
];

const estadoStyles: Record<string, string> = {
  "concluído": "bg-success/10 text-success",
  "supervisionado": "bg-warning/10 text-warning",
  "em andamento": "bg-info/10 text-info",
};

export function RecentInteractions() {
  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold mb-4">Interações Recentes</h3>
      <div className="space-y-3">
        {mockInteractions.map((item) => (
          <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <div className="flex items-center gap-3">
              {item.canal === "whatsapp" ? (
                <MessageSquare className="h-4 w-4 text-success" />
              ) : (
                <Phone className="h-4 w-4 text-info" />
              )}
              <div>
                <span className="text-sm font-medium">{item.paciente}</span>
                <p className="text-xs text-muted-foreground">{item.intencao}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoStyles[item.estado]}`}>
                {item.estado}
              </span>
              <span className="text-xs text-muted-foreground">{item.tempo}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
