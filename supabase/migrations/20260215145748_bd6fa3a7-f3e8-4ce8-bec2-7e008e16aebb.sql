CREATE OR REPLACE FUNCTION public.buscar_vendas(
  p_status text,
  p_start timestamptz,
  p_end timestamptz,
  p_city_slug text DEFAULT NULL
)
RETURNS SETOF vendas
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT *
  FROM vendas
  WHERE status = p_status
    AND data_venda >= p_start
    AND data_venda <= p_end
    AND (
      p_city_slug IS NULL
      OR replace(immutable_unaccent(lower(cidade)), ' ', '') ILIKE '%' || replace(immutable_unaccent(lower(p_city_slug)), ' ', '') || '%'
    )
  ORDER BY data_venda ASC;
$$;