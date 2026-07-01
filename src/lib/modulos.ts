// Catálogo único de módulos e seus itens. Fonte de verdade para:
// sidebar, gating de rotas, página de Módulos, planos (super admin) e equipe.

export type ModuloKey = "eventos" | "inside" | "analytics" | "growth";

export interface ItemDef { key: string; nome: string; url: string; }
export interface ModuloDef { key: ModuloKey; nome: string; desc: string; itens: ItemDef[]; }

export const MODULOS_CATALOGO: ModuloDef[] = [
  {
    key: "eventos", nome: "Eventos", desc: "Dashboards e vendas de eventos",
    itens: [
      { key: "eventos.dashboard", nome: "Dashboard WS", url: "/" },
      { key: "eventos.resumo", nome: "Resumo City", url: "/eventos-geral" },
      { key: "eventos.vendas", nome: "Vendas", url: "/vendas-eventos" },
    ],
  },
  {
    key: "inside", nome: "Inside Sales", desc: "Dashboard geral e leads",
    itens: [
      { key: "inside.dashboard", nome: "Dashboard Geral", url: "/inside-sales" },
      { key: "inside.leads", nome: "Leads", url: "/leads" },
    ],
  },
  {
    key: "analytics", nome: "Analytics", desc: "Performance e campanhas",
    itens: [
      { key: "analytics.performance", nome: "Performance", url: "/performance" },
      { key: "analytics.campanhas", nome: "Campanhas", url: "/campanhas" },
    ],
  },
  {
    key: "growth", nome: "Growth", desc: "Notificações, agentes, chat, workflow e designer",
    itens: [
      { key: "growth.notificacoes", nome: "Notificações", url: "/notificacoes" },
      { key: "growth.agentes", nome: "Agentes", url: "/agentes" },
      { key: "growth.chat", nome: "Chat", url: "/chat" },
      { key: "growth.workflow", nome: "Workflow", url: "/workflow" },
      { key: "growth.designer", nome: "Designer", url: "/designer" },
      { key: "growth.scraping", nome: "Scraping de Conteúdos", url: "/scraping-conteudos" },
      { key: "growth.metaads", nome: "Meta Ads", url: "/meta-ads" },
      { key: "growth.autodm", nome: "Auto-DM Instagram", url: "/auto-dm" },
      { key: "growth.videoeditor", nome: "Vídeo Editor", url: "/video-editor" },
      { key: "growth.pesquisas", nome: "Pesquisas", url: "/pesquisas" },
      { key: "growth.scrapingprospect", nome: "Scraping Prospect", url: "/scraping-prospect" },
    ],
  },
];

export const TODOS_OS_ITENS: string[] = MODULOS_CATALOGO.flatMap((m) => m.itens.map((i) => i.key));

export function itensDoModulo(k: ModuloKey): string[] {
  return MODULOS_CATALOGO.find((m) => m.key === k)?.itens.map((i) => i.key) ?? [];
}

const GRUPOS = new Set<string>(MODULOS_CATALOGO.map((m) => m.key));

/**
 * Expande uma lista de chaves (que pode conter chaves de grupo legadas, ex.: "eventos",
 * ou chaves de item, ex.: "eventos.vendas") para o conjunto de chaves de ITEM.
 */
export function expandirItens(keys: string[] | null | undefined): string[] {
  if (!keys) return [];
  const out = new Set<string>();
  for (const k of keys) {
    if (GRUPOS.has(k)) itensDoModulo(k as ModuloKey).forEach((i) => out.add(i));
    else out.add(k);
  }
  return [...out];
}
