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
    PostgrestVersion: "14.5"
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
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
          org_id: string | null
          provider: string
          updated_at: string | null
        }
        Insert: {
          api_key?: string | null
          org_id?: string | null
          provider: string
          updated_at?: string | null
        }
        Update: {
          api_key?: string | null
          org_id?: string | null
          provider?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      base_conhecimento: {
        Row: {
          ativo: boolean
          conteudo: string
          created_at: string
          id: string
          ordem: number
          org_id: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          conteudo?: string
          created_at?: string
          id?: string
          ordem?: number
          org_id?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          conteudo?: string
          created_at?: string
          id?: string
          ordem?: number
          org_id?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      cidades: {
        Row: {
          created_at: string
          data_evento: string
          id: string
          nome: string
          org_id: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          data_evento: string
          id?: string
          nome: string
          org_id?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          data_evento?: string
          id?: string
          nome?: string
          org_id?: string | null
          slug?: string
        }
        Relationships: []
      }
      conversas: {
        Row: {
          agente_id: string | null
          created_at: string | null
          id: string
          org_id: string | null
          titulo: string | null
          updated_at: string | null
        }
        Insert: {
          agente_id?: string | null
          created_at?: string | null
          id?: string
          org_id?: string | null
          titulo?: string | null
          updated_at?: string | null
        }
        Update: {
          agente_id?: string | null
          created_at?: string | null
          id?: string
          org_id?: string | null
          titulo?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      convites: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          modulos: Json
          org_id: string
          papel: string
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          id?: string
          modulos?: Json
          org_id: string
          papel?: string
          status?: string
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          modulos?: Json
          org_id?: string
          papel?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "convites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_config: {
        Row: {
          access_token: string | null
          client_id: string | null
          client_secret: string | null
          email: string | null
          id: number
          org_id: string | null
          refresh_token: string | null
          token_expiry: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          client_id?: string | null
          client_secret?: string | null
          email?: string | null
          id?: number
          org_id?: string | null
          refresh_token?: string | null
          token_expiry?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          client_id?: string | null
          client_secret?: string | null
          email?: string | null
          id?: number
          org_id?: string | null
          refresh_token?: string | null
          token_expiry?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      insights_trafego: {
        Row: {
          cidade_slug: string
          insights: Json
          org_id: string | null
          updated_at: string
        }
        Insert: {
          cidade_slug: string
          insights?: Json
          org_id?: string | null
          updated_at?: string
        }
        Update: {
          cidade_slug?: string
          insights?: Json
          org_id?: string | null
          updated_at?: string
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
          org_id: string | null
        }
        Insert: {
          agente_id?: string | null
          created_at?: string | null
          id?: string
          nome: string
          ordem?: number | null
          org_id?: string | null
        }
        Update: {
          agente_id?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          org_id?: string | null
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
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
          org_id: string | null
          role: string | null
        }
        Insert: {
          conteudo?: string | null
          conversa_id?: string | null
          created_at?: string | null
          id?: string
          org_id?: string | null
          role?: string | null
        }
        Update: {
          conteudo?: string | null
          conversa_id?: string | null
          created_at?: string | null
          id?: string
          org_id?: string | null
          role?: string | null
        }
        Relationships: []
      }
      meta_config: {
        Row: {
          access_token: string | null
          account_id: string | null
          id: string
          org_id: string | null
          token_expires_at: number | null
          updated_at: string | null
          user_name: string | null
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          id?: string
          org_id?: string | null
          token_expires_at?: number | null
          updated_at?: string | null
          user_name?: string | null
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          id?: string
          org_id?: string | null
          token_expires_at?: number | null
          updated_at?: string | null
          user_name?: string | null
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
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
          disparo_dia_evento: boolean
          gatilho: string
          horario: string | null
          horario_evento: string | null
          id: string
          mensagem: string
          nome: string
          org_id: string | null
          sheets_aba: string | null
          sheets_ativo: boolean
          sheets_mapa: Json
          sheets_spreadsheet_id: string | null
          sheets_spreadsheet_nome: string | null
        }
        Insert: {
          ativo?: boolean | null
          cidade_slug?: string | null
          created_at?: string | null
          destinatario: string
          destinatario_nome?: string | null
          destinatario_tipo: string
          destinatarios?: Json | null
          disparo_dia_evento?: boolean
          gatilho: string
          horario?: string | null
          horario_evento?: string | null
          id?: string
          mensagem: string
          nome: string
          org_id?: string | null
          sheets_aba?: string | null
          sheets_ativo?: boolean
          sheets_mapa?: Json
          sheets_spreadsheet_id?: string | null
          sheets_spreadsheet_nome?: string | null
        }
        Update: {
          ativo?: boolean | null
          cidade_slug?: string | null
          created_at?: string | null
          destinatario?: string
          destinatario_nome?: string | null
          destinatario_tipo?: string
          destinatarios?: Json | null
          disparo_dia_evento?: boolean
          gatilho?: string
          horario?: string | null
          horario_evento?: string | null
          id?: string
          mensagem?: string
          nome?: string
          org_id?: string | null
          sheets_aba?: string | null
          sheets_ativo?: boolean
          sheets_mapa?: Json
          sheets_spreadsheet_id?: string | null
          sheets_spreadsheet_nome?: string | null
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          nome: string
          plano_id: string | null
          slug: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          plano_id?: string | null
          slug?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          plano_id?: string | null
          slug?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      pacote_artes: {
        Row: {
          campos: Json
          created_at: string
          id: string
          ordem: number
          org_id: string | null
          pacote_id: string
          url: string
        }
        Insert: {
          campos?: Json
          created_at?: string
          id?: string
          ordem?: number
          org_id?: string | null
          pacote_id: string
          url: string
        }
        Update: {
          campos?: Json
          created_at?: string
          id?: string
          ordem?: number
          org_id?: string | null
          pacote_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "pacote_artes_pacote_id_fkey"
            columns: ["pacote_id"]
            isOneToOne: false
            referencedRelation: "pacotes_arte"
            referencedColumns: ["id"]
          },
        ]
      }
      pacote_geracoes: {
        Row: {
          created_at: string
          id: string
          org_id: string | null
          pacote_id: string | null
          pacote_nome: string | null
          qtd: number
          valores: Json
          zip_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string | null
          pacote_id?: string | null
          pacote_nome?: string | null
          qtd?: number
          valores?: Json
          zip_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string | null
          pacote_id?: string | null
          pacote_nome?: string | null
          qtd?: number
          valores?: Json
          zip_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pacote_geracoes_pacote_id_fkey"
            columns: ["pacote_id"]
            isOneToOne: false
            referencedRelation: "pacotes_arte"
            referencedColumns: ["id"]
          },
        ]
      }
      pacotes_arte: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          nome: string
          org_id: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          org_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          org_id?: string | null
        }
        Relationships: []
      }
      planos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          max_usuarios: number
          modulos: Json
          nome: string
          ordem: number
          preco: number
          slug: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          max_usuarios?: number
          modulos?: Json
          nome: string
          ordem?: number
          preco?: number
          slug: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          max_usuarios?: number
          modulos?: Json
          nome?: string
          ordem?: number
          preco?: number
          slug?: string
        }
        Relationships: []
      }
      produtos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          org_id: string | null
          slug: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          org_id?: string | null
          slug: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          org_id?: string | null
          slug?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string | null
          org_id: string | null
          papel: string
          status: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
          org_id?: string | null
          papel?: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          org_id?: string | null
          papel?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      projeto_assets: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          org_id: string | null
          projeto_id: string
          tipo: string
          url: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          org_id?: string | null
          projeto_id: string
          tipo?: string
          url: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          org_id?: string | null
          projeto_id?: string
          tipo?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "projeto_assets_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos_design"
            referencedColumns: ["id"]
          },
        ]
      }
      projetos_design: {
        Row: {
          cores: string | null
          created_at: string
          descricao: string | null
          id: string
          logo_posicao: string
          nome: string
          org_id: string | null
          palavras_chave: string | null
        }
        Insert: {
          cores?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          logo_posicao?: string
          nome: string
          org_id?: string | null
          palavras_chave?: string | null
        }
        Update: {
          cores?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          logo_posicao?: string
          nome?: string
          org_id?: string | null
          palavras_chave?: string | null
        }
        Relationships: []
      }
      tags: {
        Row: {
          created_at: string
          id: string
          nome: string
          org_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          org_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          org_id?: string | null
        }
        Relationships: []
      }
      tarefa_anexos: {
        Row: {
          created_at: string | null
          id: string
          org_id: string | null
          origem: string
          prompt: string | null
          status: string
          tarefa_id: string
          tipo: string
          url: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          org_id?: string | null
          origem?: string
          prompt?: string | null
          status?: string
          tarefa_id: string
          tipo?: string
          url?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          org_id?: string | null
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
          org_id: string | null
          tarefa_id: string | null
        }
        Insert: {
          autor?: string | null
          conteudo?: string | null
          created_at?: string | null
          id?: string
          org_id?: string | null
          tarefa_id?: string | null
        }
        Update: {
          autor?: string | null
          conteudo?: string | null
          created_at?: string | null
          id?: string
          org_id?: string | null
          tarefa_id?: string | null
        }
        Relationships: []
      }
      tarefas: {
        Row: {
          agente_id: string | null
          coluna_id: string | null
          created_at: string | null
          deleted_at: string | null
          descricao: string | null
          id: string
          ordem: number | null
          org_id: string | null
          origem: string | null
          prioridade: string | null
          titulo: string
          updated_at: string | null
        }
        Insert: {
          agente_id?: string | null
          coluna_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          descricao?: string | null
          id?: string
          ordem?: number | null
          org_id?: string | null
          origem?: string | null
          prioridade?: string | null
          titulo: string
          updated_at?: string | null
        }
        Update: {
          agente_id?: string | null
          coluna_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          descricao?: string | null
          id?: string
          ordem?: number | null
          org_id?: string | null
          origem?: string | null
          prioridade?: string | null
          titulo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_modulos: {
        Row: {
          modulo_key: string
          user_id: string
        }
        Insert: {
          modulo_key: string
          user_id: string
        }
        Update: {
          modulo_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_modulos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
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
          org_id: string | null
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
      current_org_id: { Args: never; Returns: string }
      current_papel: { Args: never; Returns: string }
      immutable_unaccent: { Args: { "": string }; Returns: string }
      is_client_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
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
