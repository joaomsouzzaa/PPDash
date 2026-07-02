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
          org_id: string
          provider: string
          updated_at: string | null
        }
        Insert: {
          api_key?: string | null
          org_id: string
          provider: string
          updated_at?: string | null
        }
        Update: {
          api_key?: string | null
          org_id?: string
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
      criativos: {
        Row: {
          ad_names: Json | null
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
          org_id: string
          utm_contents: Json | null
        }
        Insert: {
          ad_names?: Json | null
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          org_id?: string
          utm_contents?: Json | null
        }
        Update: {
          ad_names?: Json | null
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          org_id?: string
          utm_contents?: Json | null
        }
        Relationships: []
      }
      google_config: {
        Row: {
          access_token: string | null
          ads_login_customer_id: string | null
          client_id: string | null
          client_secret: string | null
          email: string | null
          org_id: string
          refresh_token: string | null
          token_expiry: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          ads_login_customer_id?: string | null
          client_id?: string | null
          client_secret?: string | null
          email?: string | null
          org_id: string
          refresh_token?: string | null
          token_expiry?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          ads_login_customer_id?: string | null
          client_id?: string | null
          client_secret?: string | null
          email?: string | null
          org_id?: string
          refresh_token?: string | null
          token_expiry?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ig_automacao_logs: {
        Row: {
          acoes: Json
          automacao_id: string | null
          comment_id: string
          comment_text: string | null
          created_at: string | null
          from_username: string | null
          id: string
          media_id: string | null
          org_id: string | null
        }
        Insert: {
          acoes?: Json
          automacao_id?: string | null
          comment_id: string
          comment_text?: string | null
          created_at?: string | null
          from_username?: string | null
          id?: string
          media_id?: string | null
          org_id?: string | null
        }
        Update: {
          acoes?: Json
          automacao_id?: string | null
          comment_id?: string
          comment_text?: string | null
          created_at?: string | null
          from_username?: string | null
          id?: string
          media_id?: string | null
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ig_automacao_logs_automacao_id_fkey"
            columns: ["automacao_id"]
            isOneToOne: false
            referencedRelation: "ig_automacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      ig_automacoes: {
        Row: {
          created_at: string | null
          dm_payload: Json
          enviar_dm: boolean
          escopo: string
          followup_ativo: boolean
          followup_delay_min: number
          followup_payload: Json
          gatilho_tipo: string
          id: string
          ig_conta_id: string | null
          match_tipo: string
          media_ids: Json
          nome: string
          org_id: string | null
          palavras: string[]
          responder_comentario: boolean
          resposta_comentario_templates: Json
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dm_payload?: Json
          enviar_dm?: boolean
          escopo?: string
          followup_ativo?: boolean
          followup_delay_min?: number
          followup_payload?: Json
          gatilho_tipo?: string
          id?: string
          ig_conta_id?: string | null
          match_tipo?: string
          media_ids?: Json
          nome?: string
          org_id?: string | null
          palavras?: string[]
          responder_comentario?: boolean
          resposta_comentario_templates?: Json
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dm_payload?: Json
          enviar_dm?: boolean
          escopo?: string
          followup_ativo?: boolean
          followup_delay_min?: number
          followup_payload?: Json
          gatilho_tipo?: string
          id?: string
          ig_conta_id?: string | null
          match_tipo?: string
          media_ids?: Json
          nome?: string
          org_id?: string | null
          palavras?: string[]
          responder_comentario?: boolean
          resposta_comentario_templates?: Json
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ig_automacoes_ig_conta_id_fkey"
            columns: ["ig_conta_id"]
            isOneToOne: false
            referencedRelation: "ig_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      ig_contas: {
        Row: {
          ativo: boolean
          created_at: string | null
          id: string
          ig_user_id: string
          ig_username: string | null
          org_id: string | null
          page_id: string
          page_name: string | null
          page_token: string | null
          updated_at: string | null
          webhook_assinado: boolean
        }
        Insert: {
          ativo?: boolean
          created_at?: string | null
          id?: string
          ig_user_id: string
          ig_username?: string | null
          org_id?: string | null
          page_id: string
          page_name?: string | null
          page_token?: string | null
          updated_at?: string | null
          webhook_assinado?: boolean
        }
        Update: {
          ativo?: boolean
          created_at?: string | null
          id?: string
          ig_user_id?: string
          ig_username?: string | null
          org_id?: string | null
          page_id?: string
          page_name?: string | null
          page_token?: string | null
          updated_at?: string | null
          webhook_assinado?: boolean
        }
        Relationships: []
      }
      ig_followups: {
        Row: {
          automacao_id: string | null
          created_at: string | null
          erro: string | null
          id: string
          org_id: string | null
          page_id: string
          payload: Json
          recipient_igsid: string
          send_at: string
          sent_at: string | null
          status: string
        }
        Insert: {
          automacao_id?: string | null
          created_at?: string | null
          erro?: string | null
          id?: string
          org_id?: string | null
          page_id: string
          payload?: Json
          recipient_igsid: string
          send_at: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          automacao_id?: string | null
          created_at?: string | null
          erro?: string | null
          id?: string
          org_id?: string | null
          page_id?: string
          payload?: Json
          recipient_igsid?: string
          send_at?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ig_followups_automacao_id_fkey"
            columns: ["automacao_id"]
            isOneToOne: false
            referencedRelation: "ig_automacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      ig_posts: {
        Row: {
          created_at: string
          creation_id: string | null
          erro: string | null
          id: string
          ig_conta_id: string | null
          ig_media_id: string | null
          ig_user_id: string | null
          legenda: string | null
          midias: Json
          org_id: string | null
          permalink: string | null
          publish_at: string | null
          published_at: string | null
          status: string
          tarefa_id: string | null
          tentativas: number
          tipo: string
        }
        Insert: {
          created_at?: string
          creation_id?: string | null
          erro?: string | null
          id?: string
          ig_conta_id?: string | null
          ig_media_id?: string | null
          ig_user_id?: string | null
          legenda?: string | null
          midias?: Json
          org_id?: string | null
          permalink?: string | null
          publish_at?: string | null
          published_at?: string | null
          status?: string
          tarefa_id?: string | null
          tentativas?: number
          tipo?: string
        }
        Update: {
          created_at?: string
          creation_id?: string | null
          erro?: string | null
          id?: string
          ig_conta_id?: string | null
          ig_media_id?: string | null
          ig_user_id?: string | null
          legenda?: string | null
          midias?: Json
          org_id?: string | null
          permalink?: string | null
          publish_at?: string | null
          published_at?: string | null
          status?: string
          tarefa_id?: string | null
          tentativas?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "ig_posts_ig_conta_id_fkey"
            columns: ["ig_conta_id"]
            isOneToOne: false
            referencedRelation: "ig_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ig_posts_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
        ]
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
      integracoes: {
        Row: {
          ativo: boolean
          config: Json
          created_at: string
          credenciais: Json
          crm: string
          id: string
          last_sync_at: string | null
          last_sync_result: Json | null
          last_sync_status: string | null
          org_id: string | null
        }
        Insert: {
          ativo?: boolean
          config?: Json
          created_at?: string
          credenciais?: Json
          crm: string
          id?: string
          last_sync_at?: string | null
          last_sync_result?: Json | null
          last_sync_status?: string | null
          org_id?: string | null
        }
        Update: {
          ativo?: boolean
          config?: Json
          created_at?: string
          credenciais?: Json
          crm?: string
          id?: string
          last_sync_at?: string | null
          last_sync_result?: Json | null
          last_sync_status?: string | null
          org_id?: string | null
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
      lead_campos: {
        Row: {
          chave: string
          created_at: string
          excluido: boolean
          id: string
          label: string
          mql_valores: Json | null
          oculto: boolean
          ordem: number
          org_id: string
          padrao: boolean
          tipo: string
        }
        Insert: {
          chave: string
          created_at?: string
          excluido?: boolean
          id?: string
          label: string
          mql_valores?: Json | null
          oculto?: boolean
          ordem?: number
          org_id: string
          padrao?: boolean
          tipo?: string
        }
        Update: {
          chave?: string
          created_at?: string
          excluido?: boolean
          id?: string
          label?: string
          mql_valores?: Json | null
          oculto?: boolean
          ordem?: number
          org_id?: string
          padrao?: boolean
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_campos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_mapeamento: {
        Row: {
          app_field: string
          created_at: string
          crm_key: string
          id: string
          org_id: string
        }
        Insert: {
          app_field: string
          created_at?: string
          crm_key: string
          id?: string
          org_id: string
        }
        Update: {
          app_field?: string
          created_at?: string
          crm_key?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_mapeamento_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ad_name: string | null
          area_atuacao: string | null
          campaign_name: string | null
          cidade: string | null
          clint_deal_id: string | null
          created_at: string
          crm_external_id: string | null
          crm_origem: string | null
          custom: Json
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
          status: string | null
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
          clint_deal_id?: string | null
          created_at?: string
          crm_external_id?: string | null
          crm_origem?: string | null
          custom?: Json
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
          status?: string | null
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
          clint_deal_id?: string | null
          created_at?: string
          crm_external_id?: string | null
          crm_origem?: string | null
          custom?: Json
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
          status?: string | null
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
      memberships: {
        Row: {
          created_at: string
          org_id: string
          papel: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          papel?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          papel?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      meta_ads_drive_config: {
        Row: {
          org_id: string
          pasta_criativos_id: string | null
          pasta_criativos_nome: string | null
          updated_at: string | null
        }
        Insert: {
          org_id: string
          pasta_criativos_id?: string | null
          pasta_criativos_nome?: string | null
          updated_at?: string | null
        }
        Update: {
          org_id?: string
          pasta_criativos_id?: string | null
          pasta_criativos_nome?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      meta_campanhas: {
        Row: {
          account_id: string
          created_at: string | null
          daily_budget: number | null
          estrutura: Json
          id: string
          last_synced_at: string | null
          lifetime_budget: number | null
          meta_campaign_id: string
          nome: string | null
          objetivo: string | null
          org_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          daily_budget?: number | null
          estrutura?: Json
          id?: string
          last_synced_at?: string | null
          lifetime_budget?: number | null
          meta_campaign_id: string
          nome?: string | null
          objetivo?: string | null
          org_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          daily_budget?: number | null
          estrutura?: Json
          id?: string
          last_synced_at?: string | null
          lifetime_budget?: number | null
          meta_campaign_id?: string
          nome?: string | null
          objetivo?: string | null
          org_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      meta_config: {
        Row: {
          access_token: string | null
          account_id: string | null
          contas: Json
          id: string
          org_id: string | null
          token_expires_at: number | null
          updated_at: string | null
          user_name: string | null
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          contas?: Json
          id?: string
          org_id?: string | null
          token_expires_at?: number | null
          updated_at?: string | null
          user_name?: string | null
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          contas?: Json
          id?: string
          org_id?: string | null
          token_expires_at?: number | null
          updated_at?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      meta_lead_paginas: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          org_id: string | null
          page_id: string
          page_name: string | null
          page_token: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          org_id?: string | null
          page_id: string
          page_name?: string | null
          page_token?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          org_id?: string | null
          page_id?: string
          page_name?: string | null
          page_token?: string | null
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
          canais: Json | null
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
          origem_lead: string | null
          sheets_aba: string | null
          sheets_ativo: boolean
          sheets_mapa: Json
          sheets_spreadsheet_id: string | null
          sheets_spreadsheet_nome: string | null
        }
        Insert: {
          ativo?: boolean | null
          canais?: Json | null
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
          origem_lead?: string | null
          sheets_aba?: string | null
          sheets_ativo?: boolean
          sheets_mapa?: Json
          sheets_spreadsheet_id?: string | null
          sheets_spreadsheet_nome?: string | null
        }
        Update: {
          ativo?: boolean | null
          canais?: Json | null
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
          origem_lead?: string | null
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
          lead_ordem: Json
          marca_logo_url: string | null
          marca_nome: string | null
          nome: string
          notif_gatilhos: Json | null
          plano_id: string | null
          slug: string | null
          status: string
          sync_horario: number
          webhook_leads_ativo: boolean
          webhook_token: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_ordem?: Json
          marca_logo_url?: string | null
          marca_nome?: string | null
          nome: string
          notif_gatilhos?: Json | null
          plano_id?: string | null
          slug?: string | null
          status?: string
          sync_horario?: number
          webhook_leads_ativo?: boolean
          webhook_token?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_ordem?: Json
          marca_logo_url?: string | null
          marca_nome?: string | null
          nome?: string
          notif_gatilhos?: Json | null
          plano_id?: string | null
          slug?: string | null
          status?: string
          sync_horario?: number
          webhook_leads_ativo?: boolean
          webhook_token?: string | null
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
      pesquisa_perguntas: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          logica: Json
          obrigatoria: boolean
          opcoes: Json
          ordem: number
          org_id: string | null
          pesquisa_id: string
          tipo: string
          titulo: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          logica?: Json
          obrigatoria?: boolean
          opcoes?: Json
          ordem?: number
          org_id?: string | null
          pesquisa_id: string
          tipo?: string
          titulo: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          logica?: Json
          obrigatoria?: boolean
          opcoes?: Json
          ordem?: number
          org_id?: string | null
          pesquisa_id?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pesquisa_perguntas_pesquisa_id_fkey"
            columns: ["pesquisa_id"]
            isOneToOne: false
            referencedRelation: "pesquisas"
            referencedColumns: ["id"]
          },
        ]
      }
      pesquisa_respostas: {
        Row: {
          created_at: string
          id: string
          org_id: string | null
          pesquisa_id: string
          respostas: Json
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string | null
          pesquisa_id: string
          respostas?: Json
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string | null
          pesquisa_id?: string
          respostas?: Json
        }
        Relationships: [
          {
            foreignKeyName: "pesquisa_respostas_pesquisa_id_fkey"
            columns: ["pesquisa_id"]
            isOneToOne: false
            referencedRelation: "pesquisas"
            referencedColumns: ["id"]
          },
        ]
      }
      pesquisas: {
        Row: {
          config: Json
          created_at: string
          descricao: string | null
          id: string
          org_id: string | null
          slug: string
          status: string
          titulo: string
        }
        Insert: {
          config?: Json
          created_at?: string
          descricao?: string | null
          id?: string
          org_id?: string | null
          slug: string
          status?: string
          titulo: string
        }
        Update: {
          config?: Json
          created_at?: string
          descricao?: string | null
          id?: string
          org_id?: string | null
          slug?: string
          status?: string
          titulo?: string
        }
        Relationships: []
      }
      planos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          max_instancias: number
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
          max_instancias?: number
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
          max_instancias?: number
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
          conta_id: string | null
          created_at: string
          google_conta_id: string | null
          id: string
          investimento_manual: number | null
          metricas: Json | null
          nome: string
          org_id: string | null
          paginas: Json | null
          plataforma: string
          slug: string
          slug_source: string | null
        }
        Insert: {
          ativo?: boolean
          conta_id?: string | null
          created_at?: string
          google_conta_id?: string | null
          id?: string
          investimento_manual?: number | null
          metricas?: Json | null
          nome: string
          org_id?: string | null
          paginas?: Json | null
          plataforma?: string
          slug: string
          slug_source?: string | null
        }
        Update: {
          ativo?: boolean
          conta_id?: string | null
          created_at?: string
          google_conta_id?: string | null
          id?: string
          investimento_manual?: number | null
          metricas?: Json | null
          nome?: string
          org_id?: string | null
          paginas?: Json | null
          plataforma?: string
          slug?: string
          slug_source?: string | null
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
      prospect_analises: {
        Row: {
          analise: Json
          bio: string | null
          created_at: string | null
          empresa_handle: string | null
          followers: number | null
          foto_url: string | null
          handle: string
          id: string
          is_business: boolean | null
          job_id: string | null
          mensagem_parte1: string | null
          mensagem_parte2: string | null
          niche_match: boolean
          nome: string | null
          org_id: string | null
          origem: string
          segmento: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          analise?: Json
          bio?: string | null
          created_at?: string | null
          empresa_handle?: string | null
          followers?: number | null
          foto_url?: string | null
          handle: string
          id?: string
          is_business?: boolean | null
          job_id?: string | null
          mensagem_parte1?: string | null
          mensagem_parte2?: string | null
          niche_match?: boolean
          nome?: string | null
          org_id?: string | null
          origem?: string
          segmento?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          analise?: Json
          bio?: string | null
          created_at?: string | null
          empresa_handle?: string | null
          followers?: number | null
          foto_url?: string | null
          handle?: string
          id?: string
          is_business?: boolean | null
          job_id?: string | null
          mensagem_parte1?: string | null
          mensagem_parte2?: string | null
          niche_match?: boolean
          nome?: string | null
          org_id?: string | null
          origem?: string
          segmento?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospect_analises_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "prospect_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_jobs: {
        Row: {
          created_at: string | null
          id: string
          log: string | null
          nicho: string
          org_id: string | null
          perfil_isca: string
          status: string
          total_encontrados: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          log?: string | null
          nicho: string
          org_id?: string | null
          perfil_isca: string
          status?: string
          total_encontrados?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          log?: string | null
          nicho?: string
          org_id?: string | null
          perfil_isca?: string
          status?: string
          total_encontrados?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      prospect_produtos: {
        Row: {
          ativo: boolean
          created_at: string | null
          descricao: string | null
          gatilhos: string[]
          id: string
          nome: string
          org_id: string | null
          publico_alvo: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string | null
          descricao?: string | null
          gatilhos?: string[]
          id?: string
          nome: string
          org_id?: string | null
          publico_alvo?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string | null
          descricao?: string | null
          gatilhos?: string[]
          id?: string
          nome?: string
          org_id?: string | null
          publico_alvo?: string | null
          updated_at?: string | null
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
      tarefa_checklist: {
        Row: {
          concluido: boolean
          created_at: string
          id: string
          item: string
          ordem: number
          org_id: string | null
          tarefa_id: string
        }
        Insert: {
          concluido?: boolean
          created_at?: string
          id?: string
          item: string
          ordem?: number
          org_id?: string | null
          tarefa_id: string
        }
        Update: {
          concluido?: boolean
          created_at?: string
          id?: string
          item?: string
          ordem?: number
          org_id?: string | null
          tarefa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefa_checklist_tarefa_id_fkey"
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
      tarefa_subtarefas: {
        Row: {
          concluida: boolean
          created_at: string
          id: string
          ordem: number
          org_id: string | null
          tarefa_id: string
          titulo: string
        }
        Insert: {
          concluida?: boolean
          created_at?: string
          id?: string
          ordem?: number
          org_id?: string | null
          tarefa_id: string
          titulo: string
        }
        Update: {
          concluida?: boolean
          created_at?: string
          id?: string
          ordem?: number
          org_id?: string | null
          tarefa_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefa_subtarefas_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas: {
        Row: {
          agente_id: string | null
          coluna_id: string | null
          created_at: string | null
          data_inicio: string | null
          data_vencimento: string | null
          deleted_at: string | null
          descricao: string | null
          etiquetas: string[]
          id: string
          legenda: string | null
          ordem: number | null
          org_id: string | null
          origem: string | null
          prioridade: string | null
          responsavel_id: string | null
          tempo_estimado: number | null
          tipo: string
          titulo: string
          updated_at: string | null
          video_ref: Json | null
        }
        Insert: {
          agente_id?: string | null
          coluna_id?: string | null
          created_at?: string | null
          data_inicio?: string | null
          data_vencimento?: string | null
          deleted_at?: string | null
          descricao?: string | null
          etiquetas?: string[]
          id?: string
          legenda?: string | null
          ordem?: number | null
          org_id?: string | null
          origem?: string | null
          prioridade?: string | null
          responsavel_id?: string | null
          tempo_estimado?: number | null
          tipo?: string
          titulo: string
          updated_at?: string | null
          video_ref?: Json | null
        }
        Update: {
          agente_id?: string | null
          coluna_id?: string | null
          created_at?: string | null
          data_inicio?: string | null
          data_vencimento?: string | null
          deleted_at?: string | null
          descricao?: string | null
          etiquetas?: string[]
          id?: string
          legenda?: string | null
          ordem?: number | null
          org_id?: string | null
          origem?: string | null
          prioridade?: string | null
          responsavel_id?: string | null
          tempo_estimado?: number | null
          tipo?: string
          titulo?: string
          updated_at?: string | null
          video_ref?: Json | null
        }
        Relationships: []
      }
      user_modulos: {
        Row: {
          modulo_key: string
          org_id: string
          user_id: string
        }
        Insert: {
          modulo_key: string
          org_id: string
          user_id: string
        }
        Update: {
          modulo_key?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_modulos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
      video_jobs: {
        Row: {
          brief: string | null
          created_at: string
          created_by: string | null
          edl: Json | null
          erro: string | null
          etapa: string | null
          id: string
          log: Json | null
          modo: string
          nome: string | null
          org_id: string | null
          resultado_url: string | null
          status: string
          timeline: Json | null
          updated_at: string
          video_url: string
        }
        Insert: {
          brief?: string | null
          created_at?: string
          created_by?: string | null
          edl?: Json | null
          erro?: string | null
          etapa?: string | null
          id?: string
          log?: Json | null
          modo?: string
          nome?: string | null
          org_id?: string | null
          resultado_url?: string | null
          status?: string
          timeline?: Json | null
          updated_at?: string
          video_url: string
        }
        Update: {
          brief?: string | null
          created_at?: string
          created_by?: string | null
          edl?: Json | null
          erro?: string | null
          etapa?: string | null
          id?: string
          log?: Json | null
          modo?: string
          nome?: string | null
          org_id?: string | null
          resultado_url?: string | null
          status?: string
          timeline?: Json | null
          updated_at?: string
          video_url?: string
        }
        Relationships: []
      }
      webhook_eventos: {
        Row: {
          created_at: string
          crm: string | null
          erro: string | null
          external_id: string | null
          id: string
          lead_id: string | null
          org_id: string | null
          payload: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          crm?: string | null
          erro?: string | null
          external_id?: string | null
          id?: string
          lead_id?: string | null
          org_id?: string | null
          payload?: Json | null
          status?: string
        }
        Update: {
          created_at?: string
          crm?: string | null
          erro?: string | null
          external_id?: string | null
          id?: string
          lead_id?: string | null
          org_id?: string | null
          payload?: Json | null
          status?: string
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
      whatsapp_instancias: {
        Row: {
          created_at: string
          id: string
          instance_token: string | null
          nome: string
          numero: string | null
          org_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_token?: string | null
          nome: string
          numero?: string | null
          org_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_token?: string | null
          nome?: string
          numero?: string | null
          org_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instancias_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      yt_canais: {
        Row: {
          access_token: string | null
          ativo: boolean
          channel_id: string
          channel_title: string | null
          created_at: string
          id: string
          org_id: string | null
          refresh_token: string | null
          thumbnail_url: string | null
          token_expiry: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          ativo?: boolean
          channel_id: string
          channel_title?: string | null
          created_at?: string
          id?: string
          org_id?: string | null
          refresh_token?: string | null
          thumbnail_url?: string | null
          token_expiry?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          ativo?: boolean
          channel_id?: string
          channel_title?: string | null
          created_at?: string
          id?: string
          org_id?: string | null
          refresh_token?: string | null
          thumbnail_url?: string | null
          token_expiry?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      yt_posts: {
        Row: {
          created_at: string
          descricao: string | null
          erro: string | null
          id: string
          org_id: string | null
          permalink: string | null
          publish_at: string | null
          published_at: string | null
          status: string
          tarefa_id: string | null
          titulo: string | null
          video_url: string
          youtube_video_id: string | null
          yt_canal_id: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          erro?: string | null
          id?: string
          org_id?: string | null
          permalink?: string | null
          publish_at?: string | null
          published_at?: string | null
          status?: string
          tarefa_id?: string | null
          titulo?: string | null
          video_url: string
          youtube_video_id?: string | null
          yt_canal_id?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          erro?: string | null
          id?: string
          org_id?: string | null
          permalink?: string | null
          publish_at?: string | null
          published_at?: string | null
          status?: string
          tarefa_id?: string | null
          titulo?: string | null
          video_url?: string
          youtube_video_id?: string | null
          yt_canal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yt_posts_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yt_posts_yt_canal_id_fkey"
            columns: ["yt_canal_id"]
            isOneToOne: false
            referencedRelation: "yt_canais"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      active_org_id: { Args: never; Returns: string }
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
      org_branding: {
        Args: { p_slug: string }
        Returns: {
          id: string
          marca_logo_url: string
          marca_nome: string
          nome: string
          slug: string
          status: string
        }[]
      }
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
