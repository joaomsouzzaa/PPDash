
-- Drop the restrictive service-role-only INSERT policy
DROP POLICY "Insert via service role only" ON public.vendas;

-- Create two INSERT policies: one for service_role (webhooks) and one for anon (manual UI)
CREATE POLICY "Insert via service role" ON public.vendas FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Insert via anon" ON public.vendas FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Insert via authenticated" ON public.vendas FOR INSERT TO authenticated WITH CHECK (true);
