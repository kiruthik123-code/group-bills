-- Fix function search_path mutability by explicitly setting search_path for is_member_of_group
CREATE OR REPLACE FUNCTION public.is_member_of_group(
  _group_id uuid,
  _user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the given user is a member of the given group
  RETURN EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = _group_id
      AND gm.user_id = _user_id
  );
END;
$$;