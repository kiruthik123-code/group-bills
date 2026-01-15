-- Ensure group invite lookup bypasses RLS but remains safe
CREATE OR REPLACE FUNCTION public.lookup_group_by_invite(
  invite_code_param text
)
RETURNS TABLE (
  id uuid,
  name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Lookup group by exact invite code; codes remain valid until the group row is deleted (e.g., on dissolve)
  RETURN QUERY
  SELECT g.id, g.name
  FROM public.groups g
  WHERE g.invite_code = invite_code_param;
END;
$$;