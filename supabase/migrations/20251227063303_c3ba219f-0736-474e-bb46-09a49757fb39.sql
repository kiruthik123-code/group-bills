-- Adjust RLS on group_members so non-creators can join via invite codes

-- 1) Drop the over-broad ALL policy for creators
DROP POLICY IF EXISTS "Group creator can manage memberships" ON public.group_members;

-- 2) Recreate creator policies, but only for UPDATE and DELETE (not INSERT)

CREATE POLICY "Group creator can update memberships"
ON public.group_members
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = group_members.group_id
      AND g.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = group_members.group_id
      AND g.created_by = auth.uid()
  )
);

CREATE POLICY "Group creator can delete memberships"
ON public.group_members
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = group_members.group_id
      AND g.created_by = auth.uid()
  )
);
