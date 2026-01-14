-- Fix function search_path to satisfy linter and improve security
-- Recreate helper functions with an explicit search_path set to public

CREATE OR REPLACE FUNCTION public.is_member_of_group(
  _group_id uuid,
  _user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = _group_id
      AND gm.user_id = _user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_group_by_invite(
  invite_code_param text
)
RETURNS TABLE (
  id uuid,
  name text
)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT g.id, g.name
  FROM public.groups g
  WHERE g.invite_code = invite_code_param;
END;
$$;