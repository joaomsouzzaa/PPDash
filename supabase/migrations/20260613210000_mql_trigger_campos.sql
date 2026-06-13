-- Gatilho de MQL configurável por campo: quando lead_campos.mql_valores tem
-- uma lista de valores, aquele campo passa a contar para MQL — um lead é MQL
-- se o valor dele (custom ou padrão) estiver na lista de QUALQUER campo gatilho.
ALTER TABLE public.lead_campos ADD COLUMN IF NOT EXISTS mql_valores jsonb;
