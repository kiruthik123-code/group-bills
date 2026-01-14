-- Tighten RLS on expenses to prevent unauthorized deletions

-- Drop the overly permissive policy if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'expenses'
      AND policyname = 'Group members can manage expenses in their groups'
  ) THEN
    DROP POLICY "Group members can manage expenses in their groups" ON public.expenses;
  END IF;
END $$;

-- Allow all group members to view expenses
CREATE POLICY "Group members can view expenses"
ON public.expenses
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = expenses.group_id
      AND gm.user_id = auth.uid()
  )
);

-- Allow all group members to insert expenses
CREATE POLICY "Group members can insert expenses"
ON public.expenses
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = expenses.group_id
      AND gm.user_id = auth.uid()
  )
);

-- Only expense payer or group creator can update expenses
CREATE POLICY "Expense payer or group creator can modify expenses"
ON public.expenses
FOR UPDATE
USING (
  paid_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = expenses.group_id
      AND g.created_by = auth.uid()
  )
)
WITH CHECK (
  paid_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = expenses.group_id
      AND g.created_by = auth.uid()
  )
);

-- Only expense payer or group creator can delete expenses
CREATE POLICY "Expense payer or group creator can delete expenses"
ON public.expenses
FOR DELETE
USING (
  paid_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = expenses.group_id
      AND g.created_by = auth.uid()
  )
);