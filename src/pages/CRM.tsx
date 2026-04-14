import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Users, FileText, Calendar, Phone, Mail, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Lead {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  origem: string | null;
  status: string;
  status_pipeline?: string;
  dados_triagem?: any;
  criado_em: string;
}

const statusColors: Record<string, string> = {
  novo: "bg-blue-100 text-blue-800",
  triagem_recebida: "bg-purple-100 text-purple-800",
  em_contato: "bg-yellow-100 text-yellow-800",
  agendado: "bg-green-100 text-green-800",
  consultou: "bg-emerald-100 text-emerald-800",
  perdido: "bg-red-100 text-red-800",
};

const statusLabels: Record<string, string> = {
  novo: "Novo",
  triagem_recebida: "Triagem Recebida",
  em_contato: "Em Contato",
  agendado: "Agendado",
  consultou: "Consultou",
  perdido: "Perdido",
};

export default function CRMPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");

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
    const matchSearch =
      !search ||
      (lead.nome || "").toLowerCase().includes(search.toLowerCase()) ||
      (lead.telefone || "").includes(search) ||
      (lead.email || "").toLowerCase().includes(search.toLowerCase());

    const matchStatus = filterStatus === "todos" || (lead as any).status_pipeline === filterStatus || lead.status === filterStatus;

    return matchSearch && matchStatus;
  });

  const stats = {
    total: leads.length,
    triagens: leads.filter((l) => (l as any).status_pipeline === "triagem_recebida").length,
    agendados: leads.filter((l) => (l as any).status_pipeline === "agendado").length,
    emContato: leads.filter((l) => (l as any).status_pipeline === "em_contato").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">CRM — Leads & Triagens</h1>
        <p className="text-sm text-muted-foreground">Gerencie leads recebidos do site vitta-care.com</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Leads</p>
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["todos", "novo", "triagem_recebida", "em_contato", "agendado", "consultou", "perdido"].map((s) => (
            <Button
              key={s}
              variant={filterStatus === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus(s)}
            >
              {s === "todos" ? "Todos" : statusLabels[s] || s}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhum lead encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">{lead.nome || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        {lead.telefone && (
                          <span className="flex items-center gap-1 text-xs">
                            <Phone className="h-3 w-3" /> {lead.telefone}
                          </span>
                        )}
                        {lead.email && (
                          <span className="flex items-center gap-1 text-xs">
                            <Mail className="h-3 w-3" /> {lead.email}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{lead.origem || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[(lead as any).status_pipeline || lead.status] || "bg-gray-100 text-gray-800"}>
                        {statusLabels[(lead as any).status_pipeline || lead.status] || lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(lead.criado_em).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      {lead.dados_triagem && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                            <DialogHeader>
                              <DialogTitle>Dados da Triagem — {lead.nome || "Sem nome"}</DialogTitle>
                            </DialogHeader>
                            <ScrollArea className="max-h-[400px]">
                              <pre className="text-xs bg-muted p-3 rounded-lg whitespace-pre-wrap">
                                {JSON.stringify(lead.dados_triagem, null, 2)}
                              </pre>
                            </ScrollArea>
                          </DialogContent>
                        </Dialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}