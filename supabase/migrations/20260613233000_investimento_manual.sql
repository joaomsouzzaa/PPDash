-- Investimento manual por canal (R$/dia) — fallback enquanto a integração de
-- ads (ex.: Google Ads aguardando Basic Access) não puxa o gasto automático.
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS investimento_manual numeric;
