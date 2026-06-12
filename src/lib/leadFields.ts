// Campos PADRÃO de lead disponíveis para mapeamento e exibição.
// (Os campos personalizados de cada org vêm da tabela lead_campos.)

export interface LeadFieldDef {
  key: string;     // app_field (coluna no banco)
  label: string;   // nome exibido
  tipo?: "texto" | "numero" | "data" | "booleano";
}

export const LEAD_CAMPOS_PADRAO: LeadFieldDef[] = [
  { key: "nome", label: "Nome" },
  { key: "email", label: "E-mail" },
  { key: "telefone", label: "Telefone" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "instagram", label: "Instagram" },
  { key: "cidade", label: "Cidade" },
  { key: "status", label: "Status" },
  { key: "tags", label: "Tags" },
  { key: "data_lead", label: "Data do lead", tipo: "data" },
  { key: "area_atuacao", label: "Área de atuação" },
  { key: "papel", label: "Papel na empresa" },
  { key: "faturamento", label: "Faturamento atual" },
  { key: "situacao_atual", label: "Situação atual" },
  { key: "is_sql", label: "SQL", tipo: "booleano" },
  { key: "is_reuniao_agendada", label: "Reunião agendada", tipo: "booleano" },
  { key: "is_reuniao_realizada", label: "Reunião realizada", tipo: "booleano" },
  { key: "is_venda_realizada", label: "Venda realizada", tipo: "booleano" },
  { key: "faturamento_venda", label: "Faturamento da venda", tipo: "numero" },
  { key: "data_venda_realizada", label: "Data da venda", tipo: "data" },
  { key: "utm_source", label: "UTM Source" },
  { key: "utm_medium", label: "UTM Medium" },
  { key: "utm_campaign", label: "UTM Campaign" },
  { key: "utm_content", label: "UTM Content" },
  { key: "utm_term", label: "UTM Term" },
  { key: "campaign_name", label: "Nome da campanha" },
  { key: "ad_name", label: "Nome do anúncio" },
  { key: "deal_user", label: "Responsável" },
];

export const LEAD_CAMPOS_PADRAO_KEYS = LEAD_CAMPOS_PADRAO.map((f) => f.key);
