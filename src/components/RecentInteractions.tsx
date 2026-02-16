import { MessageSquare, Phone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface InteractionItem {
  id: string;
  paciente: string;
  canal: string;
  intencao: string;
  estado: string;
  criado_em: string;
}

const estadoStyles: Record<string, string> = {
  "concluído": "bg-success/10 text-success",
  "supervisionado": "bg-warning/10 text-warning",
  "em andamento": "bg-info/10 text-info",
};

export function RecentInteractions({ items }: { items?: InteractionItem[] }) {
  const empty = !items || items.length === 0;

  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold mb-4">Interações Recentes</h3>
      {empty ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhuma interação hoje</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
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
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoStyles[item.estado] || "bg-secondary text-secondary-foreground"}`}>
                  {item.estado}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(item.criado_em), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
