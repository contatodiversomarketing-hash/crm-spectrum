import { MessageSquare, Phone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  const [selectedPaciente, setSelectedPaciente] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedPaciente) return;
    
    let isMounted = true;
    setLoading(true);
    
    async function fetchHistory() {
      const { data, error } = await supabase
        .from('interacoes_ia')
        .select('*')
        .eq('paciente_externo_id', selectedPaciente)
        .order('criado_em', { ascending: true });
        
      if (isMounted) {
        if (!error && data) {
          setHistory(data);
        }
        setLoading(false);
      }
    }
    
    fetchHistory();
    
    return () => { isMounted = false; };
  }, [selectedPaciente]);

  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold mb-4">Interações Recentes</h3>
      {empty ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhuma interação hoje</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div 
              key={item.id} 
              className="flex items-center justify-between py-2 border-b border-border last:border-0 cursor-pointer hover:bg-secondary/30 transition-colors px-2 -mx-2 rounded"
              onClick={() => setSelectedPaciente(item.paciente)}
            >
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

      <Dialog open={!!selectedPaciente} onOpenChange={(open) => !open && setSelectedPaciente(null)}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Histórico de Conversa</DialogTitle>
            <DialogDescription>
              Paciente: {selectedPaciente}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 mt-4">
            {loading ? (
              <div className="text-center py-4 text-muted-foreground">Carregando mensagens...</div>
            ) : history.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">Nenhuma mensagem encontrada.</div>
            ) : (
              history.map((msg, i) => (
                <div key={msg.id || i} className="flex flex-col gap-2 text-sm">
                  {msg.mensagem_usuario && (
                    <div className="flex justify-end w-full">
                      <div className="bg-primary text-primary-foreground px-4 py-2 rounded-2xl rounded-tr-sm max-w-[85%] whitespace-pre-wrap break-words shadow-sm">
                        {msg.mensagem_usuario}
                      </div>
                    </div>
                  )}
                  {(msg.resposta_final || msg.resposta_sugerida) && (
                    <div className="flex justify-start w-full">
                      <div className="bg-muted text-foreground px-4 py-2 rounded-2xl rounded-tl-sm max-w-[85%] whitespace-pre-wrap break-words border shadow-sm">
                        {msg.resposta_final || msg.resposta_sugerida}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
