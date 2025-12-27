-- Fix RLS policies for groups, expenses, and settlements to avoid recursion and ensure correct access

-- 1) Update policy on groups to avoid infinite recursion and use helper function
DROP POLICY IF EXISTS "Group members can view groups" ON public.groups;

CREATE POLICY "Group members can view groups"
ON public.groups
FOR SELECT
USING (
  -- Creator can always see their groups
  auth.uid() = created_by
  OR
  -- Any member of the group can see it
  public.is_member_of_group(id, auth.uid())
);

-- 2) Fix expenses RLS to correctly tie group_members to the expense's group
DROP POLICY IF EXISTS "Group members can manage expenses in their groups" ON public.expenses;

CREATE POLICY "Group members can manage expenses in their groups"
ON public.expenses
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = expenses.group_id
      AND gm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = expenses.group_id
      AND gm.user_id = auth.uid()
  )
);

-- 3) Fix settlements RLS similarly
DROP POLICY IF EXISTS "Group members can manage settlements in their groups" ON public.settlements;

CREATE POLICY "Group members can manage settlements in their groups"
ON public.settlements
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = settlements.group_id
      AND gm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = settlements.group_id
      AND gm.user_id = auth.uid()
  )
);