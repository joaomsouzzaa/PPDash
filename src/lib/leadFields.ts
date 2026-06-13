// Campos PADRÃO de lead disponíveis para mapeamento e exibição.
// (Os campos personalizados de cada org vêm da tabela lead_campos.)

export interface LeadFieldDef {
  key: string;     // app_field (coluna no banco)
  label: string;   // nome exibido
  tipo?: "texto" | "numero" | "data" | "booleano";
  fixo?: boolean;  // núcleo essencial: não pode renomear/ocultar
}

export const LEAD_CAMPOS_PADRAO: LeadFieldDef[] = [
  { key: "nome", label: "Nome", fixo: true },
  { key: "email", label: "E-mail", fixo: true },
  { key: "telefone", label: "Telefone", fixo: true },
  { key: "data_lead", label: "Data do lead", tipo: "data", fixo: true },
  { key: "utm_source", label: "UTM Source", fixo: true },
  { key: "utm_medium", label: "UTM Medium", fixo: true },
  { key: "utm_campaign", label: "UTM Campaign", fixo: true },
  { key: "utm_content", label: "UTM Content", fixo: true },
  { key: "utm_term", label: "UTM Term", fixo: true },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "instagram", label: "Instagram" },
  { key: "cidade", label: "Cidade" },
  { key: "tags", label: "Tags" },
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
  { key: "campaign_name", label: "Nome da campanha" },
  { key: "ad_name", label: "Nome do anúncio" },
  { key: "deal_user", label: "Responsável" },
];

export const LEAD_CAMPOS_PADRAO_KEYS = LEAD_CAMPOS_PADRAO.map((f) => f.key);
