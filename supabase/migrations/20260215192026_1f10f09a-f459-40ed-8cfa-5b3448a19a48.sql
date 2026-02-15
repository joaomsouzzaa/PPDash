
CREATE OR REPLACE FUNCTION public.buscar_vendas(p_status text, p_start timestamp with time zone, p_end timestamp with time zone, p_city_slug text DEFAULT NULL::text)
 RETURNS SETOF vendas
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT *
  FROM vendas
  WHERE (p_status = 'all' OR status = p_status)
    AND data_venda >= p_start
    AND data_venda <= p_end
    AND (
      p_city_slug IS NULL
      OR replace(immutable_unaccent(lower(cidade)), ' ', '') ILIKE '%' || replace(immutable_unaccent(lower(p_city_slug)), ' ', '') || '%'
      OR replace(immutable_unaccent(lower(produto)), ' ', '') ILIKE '%' || replace(immutable_unaccent(lower(p_city_slug)), ' ', '') || '%'
    )
  ORDER BY data_venda ASC;
$$;
