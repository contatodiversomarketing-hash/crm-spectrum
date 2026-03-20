export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agendamentos: {
        Row: {
          clinica_id: string | null
          criado_em: string
          data_hora: string
          id: string
          paciente_id: string | null
          status: string
        }
        Insert: {
          clinica_id?: string | null
          criado_em?: string
          data_hora: string
          id?: string
          paciente_id?: string | null
          status?: string
        }
        Update: {
          clinica_id?: string | null
          criado_em?: string
          data_hora?: string
          id?: string
          paciente_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      analise_contratacao: {
        Row: {
          cargo: string
          clinica_id: string | null
          criado_em: string
          dados: Json | null
          id: string
          recomendacao: string | null
        }
        Insert: {
          cargo: string
          clinica_id?: string | null
          criado_em?: string
          dados?: Json | null
          id?: string
          recomendacao?: string | null
        }
        Update: {
          cargo?: string
          clinica_id?: string | null
          criado_em?: string
          dados?: Json | null
          id?: string
          recomendacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analise_contratacao_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      analise_rentabilidade: {
        Row: {
          clinica_id: string | null
          criado_em: string
          custo: number | null
          id: string
          margem: number | null
          procedimento: string
          receita: number | null
          recomendacao: string | null
        }
        Insert: {
          clinica_id?: string | null
          criado_em?: string
          custo?: number | null
          id?: string
          margem?: number | null
          procedimento: string
          receita?: number | null
          recomendacao?: string | null
        }
        Update: {
          clinica_id?: string | null
          criado_em?: string
          custo?: number | null
          id?: string
          margem?: number | null
          procedimento?: string
          receita?: number | null
          recomendacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analise_rentabilidade_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      automacoes: {
        Row: {
          clinica_id: string | null
          criado_em: string
          data_execucao: string | null
          id: string
          paciente_externo_id: string
          payload: Json | null
          respondeu: boolean
          sistema_alvo: string
          status: string
          tipo: string
        }
        Insert: {
          clinica_id?: string | null
          criado_em?: string
          data_execucao?: string | null
          id?: string
          paciente_externo_id: string
          payload?: Json | null
          respondeu?: boolean
          sistema_alvo: string
          status?: string
          tipo: string
        }
        Update: {
          clinica_id?: string | null
          criado_em?: string
          data_execucao?: string | null
          id?: string
          paciente_externo_id?: string
          payload?: Json | null
          respondeu?: boolean
          sistema_alvo?: string
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "automacoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      avaliacao_ligacoes: {
        Row: {
          clinica_id: string | null
          criado_em: string
          erros_detectados: string[] | null
          id: string
          nota_abertura: number
          nota_escuta_ativa: number
          nota_fechamento: number
          nota_gatilhos: number
          nota_geral: number
          nota_identificacao_dor: number
          nota_objecao_apa: number
          nota_rapport: number
          nota_seguranca_emocional: number
          pontos_fortes: string[] | null
          resultado_venda: boolean
          sugestao_pratica: string | null
          tecnica_recomendada: string | null
          transcricao_ligacao_id: string | null
          transcricao_texto: string
          vendedora_id: string | null
        }
        Insert: {
          clinica_id?: string | null
          criado_em?: string
          erros_detectados?: string[] | null
          id?: string
          nota_abertura?: number
          nota_escuta_ativa?: number
          nota_fechamento?: number
          nota_gatilhos?: number
          nota_geral?: number
          nota_identificacao_dor?: number
          nota_objecao_apa?: number
          nota_rapport?: number
          nota_seguranca_emocional?: number
          pontos_fortes?: string[] | null
          resultado_venda?: boolean
          sugestao_pratica?: string | null
          tecnica_recomendada?: string | null
          transcricao_ligacao_id?: string | null
          transcricao_texto: string
          vendedora_id?: string | null
        }
        Update: {
          clinica_id?: string | null
          criado_em?: string
          erros_detectados?: string[] | null
          id?: string
          nota_abertura?: number
          nota_escuta_ativa?: number
          nota_fechamento?: number
          nota_gatilhos?: number
          nota_geral?: number
          nota_identificacao_dor?: number
          nota_objecao_apa?: number
          nota_rapport?: number
          nota_seguranca_emocional?: number
          pontos_fortes?: string[] | null
          resultado_venda?: boolean
          sugestao_pratica?: string | null
          tecnica_recomendada?: string | null
          transcricao_ligacao_id?: string | null
          transcricao_texto?: string
          vendedora_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avaliacao_ligacoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacao_ligacoes_transcricao_ligacao_id_fkey"
            columns: ["transcricao_ligacao_id"]
            isOneToOne: false
            referencedRelation: "transcricoes_ligacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacao_ligacoes_vendedora_id_fkey"
            columns: ["vendedora_id"]
            isOneToOne: false
            referencedRelation: "vendedoras"
            referencedColumns: ["id"]
          },
        ]
      }
      call_recordings: {
        Row: {
          analyzed: boolean
          call_sid: string
          created_at: string
          duration: number
          id: string
          recording_url: string
        }
        Insert: {
          analyzed?: boolean
          call_sid: string
          created_at?: string
          duration?: number
          id?: string
          recording_url: string
        }
        Update: {
          analyzed?: boolean
          call_sid?: string
          created_at?: string
          duration?: number
          id?: string
          recording_url?: string
        }
        Relationships: []
      }
      clinicas: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          limite_ligacoes: number
          limite_whatsapp: number
          nome: string
          plano: Database["public"]["Enums"]["plano_clinica"]
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: string
          limite_ligacoes?: number
          limite_whatsapp?: number
          nome: string
          plano?: Database["public"]["Enums"]["plano_clinica"]
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          limite_ligacoes?: number
          limite_whatsapp?: number
          nome?: string
          plano?: Database["public"]["Enums"]["plano_clinica"]
        }
        Relationships: []
      }
      configuracoes_sistema: {
        Row: {
          criado_em: string
          dias_semana: string
          horario_fim: string
          horario_inicio: string
          id: string
          modo_supervisao_ativo: boolean
          nivel_autonomia: number
          telefone_ativo: boolean
          whatsapp_ativo: boolean
        }
        Insert: {
          criado_em?: string
          dias_semana?: string
          horario_fim?: string
          horario_inicio?: string
          id?: string
          modo_supervisao_ativo?: boolean
          nivel_autonomia?: number
          telefone_ativo?: boolean
          whatsapp_ativo?: boolean
        }
        Update: {
          criado_em?: string
          dias_semana?: string
          horario_fim?: string
          horario_inicio?: string
          id?: string
          modo_supervisao_ativo?: boolean
          nivel_autonomia?: number
          telefone_ativo?: boolean
          whatsapp_ativo?: boolean
        }
        Relationships: []
      }
      desempenho_vendedoras: {
        Row: {
          atualizado_em: string
          clinica_id: string | null
          criado_em: string
          id: string
          media_abertura: number
          media_escuta_ativa: number
          media_fechamento: number
          media_gatilhos: number
          media_geral: number
          media_identificacao_dor: number
          media_objecao_apa: number
          media_rapport: number
          media_seguranca_emocional: number
          taxa_conversao: number
          total_ligacoes_avaliadas: number
          vendedora_id: string
        }
        Insert: {
          atualizado_em?: string
          clinica_id?: string | null
          criado_em?: string
          id?: string
          media_abertura?: number
          media_escuta_ativa?: number
          media_fechamento?: number
          media_gatilhos?: number
          media_geral?: number
          media_identificacao_dor?: number
          media_objecao_apa?: number
          media_rapport?: number
          media_seguranca_emocional?: number
          taxa_conversao?: number
          total_ligacoes_avaliadas?: number
          vendedora_id: string
        }
        Update: {
          atualizado_em?: string
          clinica_id?: string | null
          criado_em?: string
          id?: string
          media_abertura?: number
          media_escuta_ativa?: number
          media_fechamento?: number
          media_gatilhos?: number
          media_geral?: number
          media_identificacao_dor?: number
          media_objecao_apa?: number
          media_rapport?: number
          media_seguranca_emocional?: number
          taxa_conversao?: number
          total_ligacoes_avaliadas?: number
          vendedora_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "desempenho_vendedoras_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "desempenho_vendedoras_vendedora_id_fkey"
            columns: ["vendedora_id"]
            isOneToOne: true
            referencedRelation: "vendedoras"
            referencedColumns: ["id"]
          },
        ]
      }
      insights_ia: {
        Row: {
          clinica_id: string | null
          criado_em: string
          descricao: string
          id: string
          impacto_estimado: string | null
          tipo: string
        }
        Insert: {
          clinica_id?: string | null
          criado_em?: string
          descricao: string
          id?: string
          impacto_estimado?: string | null
          tipo: string
        }
        Update: {
          clinica_id?: string | null
          criado_em?: string
          descricao?: string
          id?: string
          impacto_estimado?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_ia_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      interacoes_ia: {
        Row: {
          atendente_humano: string | null
          canal: string
          clinica_id: string | null
          criado_em: string
          estado_conversa: string | null
          id: string
          intencao_detectada: string | null
          mensagem_usuario: string | null
          paciente_externo_id: string
          resposta_final: string | null
          resposta_sugerida: string | null
          sistema_origem: string
          supervisionado: boolean
        }
        Insert: {
          atendente_humano?: string | null
          canal: string
          clinica_id?: string | null
          criado_em?: string
          estado_conversa?: string | null
          id?: string
          intencao_detectada?: string | null
          mensagem_usuario?: string | null
          paciente_externo_id: string
          resposta_final?: string | null
          resposta_sugerida?: string | null
          sistema_origem: string
          supervisionado?: boolean
        }
        Update: {
          atendente_humano?: string | null
          canal?: string
          clinica_id?: string | null
          criado_em?: string
          estado_conversa?: string | null
          id?: string
          intencao_detectada?: string | null
          mensagem_usuario?: string | null
          paciente_externo_id?: string
          resposta_final?: string | null
          resposta_sugerida?: string | null
          sistema_origem?: string
          supervisionado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "interacoes_ia_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          clinica_id: string | null
          criado_em: string
          id: string
          nome: string | null
          origem: string | null
          status: string
          telefone: string | null
        }
        Insert: {
          clinica_id?: string | null
          criado_em?: string
          id?: string
          nome?: string | null
          origem?: string | null
          status?: string
          telefone?: string | null
        }
        Update: {
          clinica_id?: string | null
          criado_em?: string
          id?: string
          nome?: string | null
          origem?: string | null
          status?: string
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      logs_decisao: {
        Row: {
          clinica_id: string | null
          confianca: number | null
          criado_em: string
          dados_entrada: Json | null
          decisao: string | null
          evento: string
          id: string
          regra_aplicada: string | null
        }
        Insert: {
          clinica_id?: string | null
          confianca?: number | null
          criado_em?: string
          dados_entrada?: Json | null
          decisao?: string | null
          evento: string
          id?: string
          regra_aplicada?: string | null
        }
        Update: {
          clinica_id?: string | null
          confianca?: number | null
          criado_em?: string
          dados_entrada?: Json | null
          decisao?: string | null
          evento?: string
          id?: string
          regra_aplicada?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_decisao_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      memorias_ia: {
        Row: {
          bloqueio_ate: string | null
          clinica_id: string | null
          id: string
          paciente_externo_id: string
          preferencia_profissional: string | null
          resumo_contextual: string | null
          risco_classificacao: string | null
          ultima_interacao: string | null
        }
        Insert: {
          bloqueio_ate?: string | null
          clinica_id?: string | null
          id?: string
          paciente_externo_id: string
          preferencia_profissional?: string | null
          resumo_contextual?: string | null
          risco_classificacao?: string | null
          ultima_interacao?: string | null
        }
        Update: {
          bloqueio_ate?: string | null
          clinica_id?: string | null
          id?: string
          paciente_externo_id?: string
          preferencia_profissional?: string | null
          resumo_contextual?: string | null
          risco_classificacao?: string | null
          ultima_interacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memorias_ia_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      pacientes: {
        Row: {
          clinica_id: string | null
          criado_em: string
          email: string | null
          externo_id: string
          id: string
          nome: string | null
          telefone: string | null
        }
        Insert: {
          clinica_id?: string | null
          criado_em?: string
          email?: string | null
          externo_id: string
          id?: string
          nome?: string | null
          telefone?: string | null
        }
        Update: {
          clinica_id?: string | null
          criado_em?: string
          email?: string | null
          externo_id?: string
          id?: string
          nome?: string | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      precificacao_ia: {
        Row: {
          clinica_id: string | null
          criado_em: string
          id: string
          justificativa: string | null
          preco_atual: number | null
          preco_sugerido: number | null
          procedimento: string
        }
        Insert: {
          clinica_id?: string | null
          criado_em?: string
          id?: string
          justificativa?: string | null
          preco_atual?: number | null
          preco_sugerido?: number | null
          procedimento: string
        }
        Update: {
          clinica_id?: string | null
          criado_em?: string
          id?: string
          justificativa?: string | null
          preco_atual?: number | null
          preco_sugerido?: number | null
          procedimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "precificacao_ia_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      previsao_demanda: {
        Row: {
          clinica_id: string | null
          criado_em: string
          id: string
          periodo: string
          previsao: Json | null
        }
        Insert: {
          clinica_id?: string | null
          criado_em?: string
          id?: string
          periodo: string
          previsao?: Json | null
        }
        Update: {
          clinica_id?: string | null
          criado_em?: string
          id?: string
          periodo?: string
          previsao?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "previsao_demanda_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean
          criado_em: string
          email: string
          id: string
          nome: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          email?: string
          id?: string
          nome?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          email?: string
          id?: string
          nome?: string
          user_id?: string
        }
        Relationships: []
      }
      relatorio_executivo_ia: {
        Row: {
          clinica_id: string | null
          criado_em: string
          id: string
          impacto_estimado: string | null
          prioridade_principal: string
          resumo: string
        }
        Insert: {
          clinica_id?: string | null
          criado_em?: string
          id?: string
          impacto_estimado?: string | null
          prioridade_principal: string
          resumo: string
        }
        Update: {
          clinica_id?: string | null
          criado_em?: string
          id?: string
          impacto_estimado?: string | null
          prioridade_principal?: string
          resumo?: string
        }
        Relationships: [
          {
            foreignKeyName: "relatorio_executivo_ia_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      score_reativacao: {
        Row: {
          clinica_id: string | null
          criado_em: string
          fatores: Json | null
          id: string
          paciente_externo_id: string
          score: number
        }
        Insert: {
          clinica_id?: string | null
          criado_em?: string
          fatores?: Json | null
          id?: string
          paciente_externo_id: string
          score?: number
        }
        Update: {
          clinica_id?: string | null
          criado_em?: string
          fatores?: Json | null
          id?: string
          paciente_externo_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "score_reativacao_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      transcricoes_ligacoes: {
        Row: {
          call_sid: string | null
          clinica_id: string | null
          criado_em: string
          id: string
          paciente_externo_id: string | null
          resultado: string | null
          transcricao: string | null
        }
        Insert: {
          call_sid?: string | null
          clinica_id?: string | null
          criado_em?: string
          id?: string
          paciente_externo_id?: string | null
          resultado?: string | null
          transcricao?: string | null
        }
        Update: {
          call_sid?: string | null
          clinica_id?: string | null
          criado_em?: string
          id?: string
          paciente_externo_id?: string | null
          resultado?: string | null
          transcricao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transcricoes_ligacoes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      treinamento_ia: {
        Row: {
          anexo_conteudo_extraido: string | null
          anexo_nome: string | null
          anexo_tipo: string | null
          anexo_url: string | null
          ativo: boolean
          atualizado_em: string
          canal: string
          categoria: string
          criado_em: string
          criado_por: string | null
          id: string
          instrucao: string
          titulo: string
        }
        Insert: {
          anexo_conteudo_extraido?: string | null
          anexo_nome?: string | null
          anexo_tipo?: string | null
          anexo_url?: string | null
          ativo?: boolean
          atualizado_em?: string
          canal?: string
          categoria?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          instrucao: string
          titulo: string
        }
        Update: {
          anexo_conteudo_extraido?: string | null
          anexo_nome?: string | null
          anexo_tipo?: string | null
          anexo_url?: string | null
          ativo?: boolean
          atualizado_em?: string
          canal?: string
          categoria?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          instrucao?: string
          titulo?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      uso_mensal_clinica: {
        Row: {
          clinica_id: string
          criado_em: string
          id: string
          ligacoes_realizadas: number
          mensagens_whatsapp_usadas: number
          mes_referencia: string
        }
        Insert: {
          clinica_id: string
          criado_em?: string
          id?: string
          ligacoes_realizadas?: number
          mensagens_whatsapp_usadas?: number
          mes_referencia: string
        }
        Update: {
          clinica_id?: string
          criado_em?: string
          id?: string
          ligacoes_realizadas?: number
          mensagens_whatsapp_usadas?: number
          mes_referencia?: string
        }
        Relationships: [
          {
            foreignKeyName: "uso_mensal_clinica_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendedoras: {
        Row: {
          ativo: boolean
          clinica_id: string | null
          criado_em: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          clinica_id?: string | null
          criado_em?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          clinica_id?: string | null
          criado_em?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendedoras_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_memory: {
        Row: {
          call_sid: string | null
          created_at: string
          id: string
          message: string
          phone_number: string
          role: string
        }
        Insert: {
          call_sid?: string | null
          created_at?: string
          id?: string
          message: string
          phone_number: string
          role: string
        }
        Update: {
          call_sid?: string | null
          created_at?: string
          id?: string
          message?: string
          phone_number?: string
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "supervisao" | "analista"
      plano_clinica: "growth" | "performance" | "elite"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "supervisao", "analista"],
      plano_clinica: ["growth", "performance", "elite"],
    },
  },
} as const
