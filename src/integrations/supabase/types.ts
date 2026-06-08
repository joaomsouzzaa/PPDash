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
      agentes: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          descricao: string | null
          id: string
          modelo: string | null
          nome: string
          parent_id: string | null
          pos_x: number | null
          pos_y: number | null
          provider: string | null
          slug: string | null
          system_prompt: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          modelo?: string | null
          nome: string
          parent_id?: string | null
          pos_x?: number | null
          pos_y?: number | null
          provider?: string | null
          slug?: string | null
          system_prompt?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          modelo?: string | null
          nome?: string
          parent_id?: string | null
          pos_x?: number | null
          pos_y?: number | null
          provider?: string | null
          slug?: string | null
          system_prompt?: string | null
        }
        Relationships: []
      }
      ai_config: {
        Row: {
          api_key: string | null
          provider: string
          updated_at: string | null
        }
        Insert: {
          api_key?: string | null
          provider: string
          updated_at?: string | null
        }
        Update: {
          api_key?: string | null
          provider?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      cidades: {
        Row: {
          created_at: string
          data_evento: string
          id: string
          nome: string
          slug: string
        }
        Insert: {
          created_at?: string
          data_evento: string
          id?: string
          nome: string
          slug: string
        }
        Update: {
          created_at?: string
          data_evento?: string
          id?: string
          nome?: string
          slug?: string
        }
        Relationships: []
      }
      conversas: {
        Row: {
          agente_id: string | null
          created_at: string | null
          id: string
          titulo: string | null
          updated_at: string | null
        }
        Insert: {
          agente_id?: string | null
          created_at?: string | null
          id?: string
          titulo?: string | null
          updated_at?: string | null
        }
        Update: {
          agente_id?: string | null
          created_at?: string | null
          id?: string
          titulo?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      kanban_colunas: {
        Row: {
          agente_id: string | null
          created_at: string | null
          id: string
          nome: string
          ordem: number | null
        }
        Insert: {
          agente_id?: string | null
          created_at?: string | null
          id?: string
          nome: string
          ordem?: number | null
        }
        Update: {
          agente_id?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          ordem?: number | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          ad_name: string | null
          area_atuacao: string | null
          campaign_name: string | null
          cidade: string | null
          created_at: string
          data_lead: string
          data_venda_realizada: string | null
          deal_user: string | null
          email: string | null
          faturamento: string | null
          faturamento_venda: number | null
          id: string
          instagram: string | null
          is_reuniao_agendada: string | null
          is_reuniao_realizada: string | null
          is_sql: string | null
          is_venda_realizada: string | null
          nome: string | null
          papel: string | null
          payload: Json | null
          situacao_atual: string | null
          status: string
          tags: string | null
          telefone: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          whatsapp: string | null
        }
        Insert: {
          ad_name?: string | null
          area_atuacao?: string | null
          campaign_name?: string | null
          cidade?: string | null
          created_at?: string
          data_lead?: string
          data_venda_realizada?: string | null
          deal_user?: string | null
          email?: string | null
          faturamento?: string | null
          faturamento_venda?: number | null
          id?: string
          instagram?: string | null
          is_reuniao_agendada?: string | null
          is_reuniao_realizada?: string | null
          is_sql?: string | null
          is_venda_realizada?: string | null
          nome?: string | null
          papel?: string | null
          payload?: Json | null
          situacao_atual?: string | null
          status?: string
          tags?: string | null
          telefone?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp?: string | null
        }
        Update: {
          ad_name?: string | null
          area_atuacao?: string | null
          campaign_name?: string | null
          cidade?: string | null
          created_at?: string
          data_lead?: string
          data_venda_realizada?: string | null
          deal_user?: string | null
          email?: string | null
          faturamento?: string | null
          faturamento_venda?: number | null
          id?: string
          instagram?: string | null
          is_reuniao_agendada?: string | null
          is_reuniao_realizada?: string | null
          is_sql?: string | null
          is_venda_realizada?: string | null
          nome?: string | null
          papel?: string | null
          payload?: Json | null
          situacao_atual?: string | null
          status?: string
          tags?: string | null
          telefone?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      mensagens: {
        Row: {
          conteudo: string | null
          conversa_id: string | null
          created_at: string | null
          id: string
          role: string | null
        }
        Insert: {
          conteudo?: string | null
          conversa_id?: string | null
          created_at?: string | null
          id?: string
          role?: string | null
        }
        Update: {
          conteudo?: string | null
          conversa_id?: string | null
          created_at?: string | null
          id?: string
          role?: string | null
        }
        Relationships: []
      }
      meta_config: {
        Row: {
          access_token: string | null
          account_id: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      notificacao_logs: {
        Row: {
          cidade: string | null
          created_at: string | null
          destinatario: string | null
          erro: string | null
          id: string
          mensagem: string | null
          notificacao_id: string | null
          status: string | null
        }
        Insert: {
          cidade?: string | null
          created_at?: string | null
          destinatario?: string | null
          erro?: string | null
          id?: string
          mensagem?: string | null
          notificacao_id?: string | null
          status?: string | null
        }
        Update: {
          cidade?: string | null
          created_at?: string | null
          destinatario?: string | null
          erro?: string | null
          id?: string
          mensagem?: string | null
          notificacao_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          ativo: boolean | null
          cidade_slug: string | null
          created_at: string | null
          destinatario: string
          destinatario_nome: string | null
          destinatario_tipo: string
          destinatarios: Json | null
          gatilho: string
          horario: string | null
          id: string
          mensagem: string
          nome: string
        }
        Insert: {
          ativo?: boolean | null
          cidade_slug?: string | null
          created_at?: string | null
          destinatario: string
          destinatario_nome?: string | null
          destinatario_tipo: string
          destinatarios?: Json | null
          gatilho: string
          horario?: string | null
          id?: string
          mensagem: string
          nome: string
        }
        Update: {
          ativo?: boolean | null
          cidade_slug?: string | null
          created_at?: string | null
          destinatario?: string
          destinatario_nome?: string | null
          destinatario_tipo?: string
          destinatarios?: Json | null
          gatilho?: string
          horario?: string | null
          id?: string
          mensagem?: string
          nome?: string
        }
        Relationships: []
      }
      produtos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          slug: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          slug: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          slug?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      tarefa_anexos: {
        Row: {
          created_at: string
          id: string
          origem: string
          prompt: string | null
          status: string
          tarefa_id: string
          tipo: string
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          origem?: string
          prompt?: string | null
          status?: string
          tarefa_id: string
          tipo?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          origem?: string
          prompt?: string | null
          status?: string
          tarefa_id?: string
          tipo?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tarefa_anexos_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefa_respostas: {
        Row: {
          autor: string | null
          conteudo: string | null
          created_at: string | null
          id: string
          tarefa_id: string | null
        }
        Insert: {
          autor?: string | null
          conteudo?: string | null
          created_at?: string | null
          id?: string
          tarefa_id?: string | null
        }
        Update: {
          autor?: string | null
          conteudo?: string | null
          created_at?: string | null
          id?: string
          tarefa_id?: string | null
        }
        Relationships: []
      }
      tarefas: {
        Row: {
          agente_id: string | null
          coluna_id: string | null
          created_at: string | null
          descricao: string | null
          id: string
          ordem: number | null
          origem: string | null
          prioridade: string | null
          titulo: string
          updated_at: string | null
        }
        Insert: {
          agente_id?: string | null
          coluna_id?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          ordem?: number | null
          origem?: string | null
          prioridade?: string | null
          titulo: string
          updated_at?: string | null
        }
        Update: {
          agente_id?: string | null
          coluna_id?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          ordem?: number | null
          origem?: string | null
          prioridade?: string | null
          titulo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      vendas: {
        Row: {
          cidade: string | null
          created_at: string
          cupom: string | null
          data_venda: string
          documento: string | null
          email_comprador: string | null
          id: string
          id_transacao: string | null
          metodo_pagamento: string | null
          nome_comprador: string | null
          payload: Json | null
          plataforma: string
          produto: string | null
          produtor: string | null
          quantidade: number | null
          status: string
          telefone_comprador: string | null
          tipo_ingresso: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          valor: number
        }
        Insert: {
          cidade?: string | null
          created_at?: string
          cupom?: string | null
          data_venda?: string
          documento?: string | null
          email_comprador?: string | null
          id?: string
          id_transacao?: string | null
          metodo_pagamento?: string | null
          nome_comprador?: string | null
          payload?: Json | null
          plataforma: string
          produto?: string | null
          produtor?: string | null
          quantidade?: number | null
          status?: string
          telefone_comprador?: string | null
          tipo_ingresso?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          valor?: number
        }
        Update: {
          cidade?: string | null
          created_at?: string
          cupom?: string | null
          data_venda?: string
          documento?: string | null
          email_comprador?: string | null
          id?: string
          id_transacao?: string | null
          metodo_pagamento?: string | null
          nome_comprador?: string | null
          payload?: Json | null
          plataforma?: string
          produto?: string | null
          produtor?: string | null
          quantidade?: number | null
          status?: string
          telefone_comprador?: string | null
          tipo_ingresso?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          valor?: number
        }
        Relationships: []
      }
      whatsapp_config: {
        Row: {
          admin_token: string | null
          id: string
          instance: string | null
          instance_token: string | null
          numero: string | null
          server_url: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          admin_token?: string | null
          id?: string
          instance?: string | null
          instance_token?: string | null
          numero?: string | null
          server_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_token?: string | null
          id?: string
          instance?: string | null
          instance_token?: string | null
          numero?: string | null
          server_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      buscar_vendas: {
        Args: {
          p_city_slug?: string
          p_end: string
          p_start: string
          p_status: string
        }
        Returns: {
          cidade: string | null
          created_at: string
          cupom: string | null
          data_venda: string
          documento: string | null
          email_comprador: string | null
          id: string
          id_transacao: string | null
          metodo_pagamento: string | null
          nome_comprador: string | null
          payload: Json | null
          plataforma: string
          produto: string | null
          produtor: string | null
          quantidade: number | null
          status: string
          telefone_comprador: string | null
          tipo_ingresso: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          valor: number
        }[]
        SetofOptions: {
          from: "*"
          to: "vendas"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      immutable_unaccent: { Args: { "": string }; Returns: string }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
