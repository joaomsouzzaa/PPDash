-- Métricas/blocos do dashboard visíveis por canal (null = todos).
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS metricas jsonb;
