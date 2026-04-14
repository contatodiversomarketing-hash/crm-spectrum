import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Users, FileText, Phone, Calendar } from "lucide-react";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import type { Lead } from "@/components/crm/LeadCard";

export default function CRMPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(500);

    if (!error && data) {
      setLeads(data as Lead[]);
    }
    setLoading(false);
  };

  const filteredLeads = leads.filter((lead) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (lead.nome || "").toLowerCase().includes(s) ||
      (lead.telefone || "").includes(s) ||
      (lead.email || "").toLowerCase().includes(s) ||
      (lead.cpf || "").includes(s)
    );
  });

  const stats = {
    total: leads.length,
    triagens: leads.filter((l) => l.status_pipeline === "triagem_recebida").length,
    agendados: leads.filter((l) => l.status_pipeline === "agendado").length,
    emContato: leads.filter((l) => l.status_pipeline === "em_contato").length,
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">CRM — Pacientes</h1>
        <p className="text-sm text-muted-foreground">Pipeline de leads recebidos do vitta-care.com</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <FileText className="h-8 w-8 text-purple-500" />
            <div>
              <p className="text-2xl font-bold">{stats.triagens}</p>
              <p className="text-xs text-muted-foreground">Triagens</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Phone className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold">{stats.emContato}</p>
              <p className="text-xs text-muted-foreground">Em Contato</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Calendar className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{stats.agendados}</p>
              <p className="text-xs text-muted-foreground">Agendados</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, telefone, email ou CPF..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Kanban */}
      {loading ? (
        <p className="text-center text-muted-foreground py-12">Carregando...</p>
      ) : (
        <KanbanBoard leads={filteredLeads} />
      )}
    </div>
  );
}
