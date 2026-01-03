-- Add created_by_user_id column to expenses table
ALTER TABLE public.expenses ADD COLUMN created_by_user_id uuid;

-- Set existing expenses to be owned by the paid_by user
UPDATE public.expenses SET created_by_user_id = paid_by;

-- Make the column required and add foreign key constraint
ALTER TABLE public.expenses ALTER COLUMN created_by_user_id SET NOT NULL;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- Update RLS policy to enforce ownership rules
DROP POLICY IF EXISTS "Group members can manage expenses in their groups" ON public.expenses;

-- New policy: Group members can view expenses, but only creator can delete
CREATE POLICY "Group members can view expenses in their groups"
ON public.expenses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = expenses.group_id
      AND gm.user_id = auth.uid()
  )
);

-- Policy for inserting: only group members can add expenses
CREATE POLICY "Group members can add expenses in their groups"
ON public.expenses
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = expenses.group_id
      AND gm.user_id = auth.uid()
  )
);

-- Policy for updating: only the creator can update expenses
CREATE POLICY "Expense creator can update expenses"
ON public.expenses
FOR UPDATE
TO authenticated
USING (
  created_by_user_id = auth.uid()
);

-- Policy for deleting: only the creator can delete expenses
CREATE POLICY "Expense creator can delete expenses"
ON public.expenses
FOR DELETE
TO authenticated
USING (
  created_by_user_id = auth.uid()
);
