// Normaliza um telefone brasileiro para uma chave estável de deduplicação.
// Remove tudo que não é dígito, tira o código do país 55/+55 quando presente e
// mantém os últimos 11 dígitos (DDD + número). Assim "+5511994918920",
// "11994918920" e "(11) 99491-8920" colapsam na mesma chave "11994918920".
// Fixo de 10 dígitos ("1130001000") é preservado. Vazio/nulo → null.
// Cópia idêntica de supabase/functions/_shared/telefone.ts (edge/Deno não
// compartilha import com o front/Vite) — manter as duas em sincronia.
export function normalizarTelefone(raw?: string | null): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2); // tira +55/55 do BR
  if (d.length > 11) d = d.slice(-11); // guarda os últimos 11 dígitos
  return d || null;
}
