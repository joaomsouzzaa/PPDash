-- Criativos para o controle de CAC por criativo (tela Performance).
-- Cada criativo vincula utm_content(s) (leads/vendas) e ad_name(s) do Meta (investimento).
CREATE TABLE IF NOT EXISTS public.criativos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid,
  nome text NOT NULL,
  utm_contents jsonb,
  ad_names jsonb,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.criativos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "criativos_all" ON public.criativos;
CREATE POLICY "criativos_all" ON public.criativos FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
