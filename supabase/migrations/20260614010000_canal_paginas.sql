-- Em quais páginas o botão do canal aparece (null = todas).
-- Valores: "dashboard", "performance", "campanhas".
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS paginas jsonb;
