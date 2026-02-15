
-- Restringir INSERT apenas para service_role (edge function)
DROP POLICY "Insert via service role" ON public.vendas;
CREATE POLICY "Insert via service role only" ON public.vendas
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
