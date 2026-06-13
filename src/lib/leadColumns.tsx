import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { LEAD_CAMPOS_PADRAO } from "@/lib/leadFields";

// Colunas padrão exibidas na tabela de Leads (na ordem default).
export const TABLE_COL_KEYS: string[] = [
  "data_lead", "nome", "email", "telefone", "whatsapp", "instagram",
  "is_sql", "is_reuniao_agendada", "is_reuniao_realizada", "is_venda_realizada",
  "faturamento_venda", "data_venda_realizada", "area_atuacao", "papel",
  "faturamento", "situacao_atual", "utm_campaign", "utm_medium", "utm_content",
  "utm_term", "campaign_name", "ad_name", "deal_user", "tags",
];

// Chaves cuja coluna é ordenável (existem no SortKey da tabela).
export const SORTABLE = new Set<string>([
  "data_lead", "nome", "email", "telefone", "whatsapp", "instagram",
  "is_sql", "is_reuniao_agendada", "is_reuniao_realizada", "is_venda_realizada",
  "faturamento_venda", "data_venda_realizada", "area_atuacao", "papel",
  "faturamento", "situacao_atual", "utm_campaign", "utm_medium", "utm_content",
  "utm_term", "campaign_name", "ad_name", "deal_user", "tags",
]);

const sim = (v: unknown): ReactNode =>
  v ? <Badge variant="default">Sim</Badge> : <span className="text-muted-foreground">—</span>;
const txt = (v: unknown): ReactNode => (v != null && v !== "" ? String(v) : "—");

/** Renderizadores por chave de campo padrão. */
export const STANDARD_RENDER: Record<string, (l: any) => ReactNode> = {
  data_lead: (l) => <span className="whitespace-nowrap">{new Date(l.data_lead).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>,
  nome: (l) => <span className="font-medium">{l.nome || "—"}</span>,
  email: (l) => <span className="text-sm">{l.email || "—"}</span>,
  telefone: (l) => txt(l.telefone),
  whatsapp: (l) => txt(l.whatsapp),
  instagram: (l) => txt(l.instagram),
  is_sql: (l) => sim(l.is_sql),
  is_reuniao_agendada: (l) => sim(l.is_reuniao_agendada),
  is_reuniao_realizada: (l) => sim(l.is_reuniao_realizada),
  is_venda_realizada: (l) => sim(l.is_venda_realizada),
  faturamento_venda: (l) => (l.faturamento_venda != null ? `R$ ${Number(l.faturamento_venda).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"),
  data_venda_realizada: (l) => (l.data_venda_realizada ? new Date(l.data_venda_realizada).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"),
  area_atuacao: (l) => txt(l.area_atuacao),
  papel: (l) => txt(l.papel),
  faturamento: (l) => txt(l.faturamento),
  situacao_atual: (l) => txt(l.situacao_atual),
  utm_campaign: (l) => txt(l.utm_campaign),
  utm_medium: (l) => txt(l.utm_medium),
  utm_content: (l) => txt(l.utm_content),
  utm_term: (l) => txt(l.utm_term),
  campaign_name: (l) => txt(l.campaign_name),
  ad_name: (l) => txt(l.ad_name),
  deal_user: (l) => txt(l.deal_user),
  tags: (l) => (l.tags ? (
    <div className="flex flex-wrap gap-1">
      {String(l.tags).split(",").map((t: string, i: number) => (
        <Badge key={i} variant="secondary" className="text-xs whitespace-nowrap">{t.trim()}</Badge>
      ))}
    </div>
  ) : "—"),
};

// Rótulos padrão das colunas = os mesmos do catálogo de campos (fonte única,
// para o nome ser idêntico no gerenciador e na coluna da tabela).
export const LABEL_PADRAO: Record<string, string> = Object.fromEntries(
  LEAD_CAMPOS_PADRAO.map((f) => [f.key, f.label]),
);

/** Ordena uma lista de chaves segundo a ordem salva (lead_ordem); chaves fora ficam no fim, na ordem original. */
export function ordenarPor(keys: string[], ordem: string[]): string[] {
  const idx = (k: string) => {
    const i = ordem.indexOf(k);
    return i === -1 ? Infinity : i;
  };
  return [...keys].sort((a, b) => {
    const d = idx(a) - idx(b);
    if (d !== 0) return d;
    return keys.indexOf(a) - keys.indexOf(b);
  });
}
