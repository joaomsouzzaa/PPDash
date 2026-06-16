// Resolução do "tenant" (cliente/org) da requisição atual.
// O slug do cliente é enviado ao Supabase no header `x-org-slug`; o RLS resolve a
// org e valida a membership do usuário.
//
// Duas formas de identificar o cliente:
//   A) PRODUÇÃO (com domínio próprio): subdomínio <slug>.<ROOT_DOMAIN>
//      (ex.: premiapao.seudominio.com). Requer VITE_ROOT_DOMAIN + DNS curinga.
//   B) SEM domínio próprio (ex.: *.vercel.app, localhost, preview): parâmetro
//      ?org=<slug> na URL (ex.: appgrowthstack.vercel.app/login?org=hypper).
//      O valor é lembrado em localStorage para as próximas navegações.
//
// Atenção: em *.vercel.app NÃO dá para usar subdomínio — cada nome.vercel.app é um
// projeto diferente no namespace global da Vercel. Use o modo (B) até ter domínio.

const ROOT_DOMAIN = (import.meta.env.VITE_ROOT_DOMAIN as string | undefined)?.toLowerCase() || "";
const DEFAULT_SLUG = (import.meta.env.VITE_DEFAULT_ORG_SLUG as string | undefined) || "premiapao";

const IGNORAR = new Set(["www", "app"]);

function ehHostLocalOuPreview(host: string): boolean {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.endsWith(".vercel.app") ||
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovableproject.com") ||
    host.endsWith(".lovable.dev")
  );
}

/** Lê ?org=<slug> da URL e, se presente, persiste como cliente ativo. */
function lerOrgDaQuery(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const q = new URL(window.location.href).searchParams.get("org");
    if (q) {
      localStorage.setItem("dev_org_slug", q);
      return q.toLowerCase();
    }
  } catch { /* ignore */ }
  return null;
}

function fallbackSlug(): string {
  try {
    const dev = localStorage.getItem("dev_org_slug");
    if (dev) return dev;
  } catch { /* ignore */ }
  return DEFAULT_SLUG;
}

/** Slug do cliente da requisição atual. */
export function getTenantSlug(): string {
  const host = (typeof window !== "undefined" ? window.location.hostname : "").toLowerCase();

  // PRODUÇÃO: subdomínio sob o domínio raiz configurado.
  if (ROOT_DOMAIN && host.endsWith("." + ROOT_DOMAIN)) {
    const sub = host.slice(0, host.length - ROOT_DOMAIN.length - 1);
    const label = sub.split(".")[0];
    if (label && !IGNORAR.has(label)) return label;
    return fallbackSlug();
  }

  // ?org=<slug> tem prioridade (modo de teste sem domínio próprio).
  const q = lerOrgDaQuery();
  if (q) return q;

  // Ambientes sem subdomínio real → fallback (localStorage / default).
  if (!host || ehHostLocalOuPreview(host)) return fallbackSlug();

  // Outro host com subdomínio real (sem ROOT_DOMAIN): heurística do 1º label.
  const labels = host.split(".");
  if (labels.length >= 3 && !IGNORAR.has(labels[0])) return labels[0];

  return fallbackSlug();
}

/**
 * URL de login do cliente a partir do slug.
 * - Com VITE_ROOT_DOMAIN: https://<slug>.<ROOT_DOMAIN>/login (subdomínio).
 * - Sem domínio próprio (ex.: *.vercel.app): <origin>/login?org=<slug>.
 */
export function loginUrlForSlug(slug: string): string {
  if (ROOT_DOMAIN) {
    const proto = typeof window !== "undefined" ? window.location.protocol : "https:";
    const port = typeof window !== "undefined" && window.location.port ? `:${window.location.port}` : "";
    return `${proto}//${slug}.${ROOT_DOMAIN}${port}/login`;
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/login?org=${slug}`;
}
