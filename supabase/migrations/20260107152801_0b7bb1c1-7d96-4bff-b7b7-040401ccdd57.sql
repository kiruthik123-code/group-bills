-- 1) Fix overly permissive groups SELECT policy and add secure invite lookup

DROP POLICY IF EXISTS "Authenticated users can view groups by invite" ON public.groups;

CREATE OR REPLACE FUNCTION public.lookup_group_by_invite(invite_code_param text)
RETURNS TABLE(id uuid, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT g.id, g.name
  FROM public.groups g
  WHERE g.invite_code = invite_code_param
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_group_by_invite TO authenticated;

-- 2) Add validation constraints for group names

ALTER TABLE public.groups
  ADD CONSTRAINT groups_name_length CHECK (char_length(name) BETWEEN 1 AND 100),
  ADD CONSTRAINT groups_name_not_blank CHECK (btrim(name) <> '');
