-- Fix infinite recursion in group_members RLS policy

-- 1) Create helper function to check group membership without RLS recursion
create or replace function public.is_member_of_group(_group_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = _group_id
      and user_id = _user_id
  );
$$;

-- 2) Replace the recursive policy on group_members
DROP POLICY IF EXISTS "Members can see group memberships" ON public.group_members;

CREATE POLICY "Members can see group memberships"
ON public.group_members
FOR SELECT
USING (
  -- A user can see their own memberships
  user_id = auth.uid()
  OR
  -- Or any memberships in groups they belong to
  public.is_member_of_group(group_id, auth.uid())
);