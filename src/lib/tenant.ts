// Resolução do "tenant" (cliente/org) a partir do subdomínio.
// Cada cliente acessa por um subdomínio próprio: <slug>.<ROOT_DOMAIN> (ex.: premiapao.app.com).
// O slug é enviado ao Supabase no header `x-org-slug`; o RLS resolve org + valida membership.
//
// Ambientes sem subdomínio real (localhost, preview do Lovable, IP) usam um fallback:
//   1) localStorage "dev_org_slug"  2) VITE_DEFAULT_ORG_SLUG  3) "premiapao"

const ROOT_DOMAIN = (import.meta.env.VITE_ROOT_DOMAIN as string | undefined)?.toLowerCase() || "";
const DEFAULT_SLUG = (import.meta.env.VITE_DEFAULT_ORG_SLUG as string | undefined) || "premiapao";

const IGNORAR = new Set(["www", "app"]);

function ehHostLocalOuPreview(host: string): boolean {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovableproject.com") ||
    host.endsWith(".lovable.dev")
  );
}

function fallbackSlug(): string {
  try {
    const dev = localStorage.getItem("dev_org_slug");
    if (dev) return dev;
  } catch { /* ignore */ }
  return DEFAULT_SLUG;
}

/** Slug do cliente da requisição atual, derivado do subdomínio. */
export function getTenantSlug(): string {
  const host = (typeof window !== "undefined" ? window.location.hostname : "").toLowerCase();
  if (!host || ehHostLocalOuPreview(host)) return fallbackSlug();

  // Se o domínio raiz está configurado, o slug é o que vem antes dele.
  if (ROOT_DOMAIN && host.endsWith("." + ROOT_DOMAIN)) {
    const sub = host.slice(0, host.length - ROOT_DOMAIN.length - 1);
    const label = sub.split(".")[0];
    if (label && !IGNORAR.has(label)) return label;
    return fallbackSlug();
  }

  // Sem ROOT_DOMAIN configurado: heurística — primeiro label se houver subdomínio.
  const labels = host.split(".");
  if (labels.length >= 3 && !IGNORAR.has(labels[0])) return labels[0];

  return fallbackSlug();
}

/** Domínio raiz (apex) usado para montar subdomínios dos clientes. */
function rootDomain(): string {
  if (ROOT_DOMAIN) return ROOT_DOMAIN;
  const host = (typeof window !== "undefined" ? window.location.hostname : "").toLowerCase();
  const labels = host.split(".");
  // Em subdomínio com 3+ labels, remove o 1º (o slug) para chegar à raiz.
  if (labels.length >= 3) return labels.slice(1).join(".");
  return host || "localhost";
}

/** URL de login do cliente a partir do slug (ex.: https://premiapao.seudominio.com/login). */
export function loginUrlForSlug(slug: string): string {
  if (typeof window === "undefined") return `https://${slug}.${ROOT_DOMAIN}/login`;
  const proto = window.location.protocol;
  const port = window.location.port ? `:${window.location.port}` : "";
  return `${proto}//${slug}.${rootDomain()}${port}/login`;
}
