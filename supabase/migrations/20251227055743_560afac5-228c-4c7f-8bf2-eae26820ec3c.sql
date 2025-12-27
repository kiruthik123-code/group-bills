-- SplitStuff initial schema (reordered to avoid missing relations)

-- 1) Helper function to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 2) Profiles table (linked to auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id);

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Groups table (no cross-table policies yet)
CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  invite_code text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- 4) Group members table
CREATE TABLE IF NOT EXISTS public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- 5) Expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  title text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- 6) Expense splits table (per-user share for each expense)
CREATE TABLE IF NOT EXISTS public.expense_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_amount numeric(12,2) NOT NULL CHECK (share_amount >= 0)
);

ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;

-- 7) Settlement transactions table between users within a group
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_status') THEN
    CREATE TYPE public.transaction_status AS ENUM ('pending', 'settled');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status public.transaction_status NOT NULL DEFAULT 'pending',
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

-- 8) RLS policies that reference other tables (now safe)

-- Groups: creator can fully manage
CREATE POLICY "Group creators can manage their groups"
ON public.groups
FOR ALL
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- Groups: members can view
CREATE POLICY "Group members can view groups"
ON public.groups
FOR SELECT
TO authenticated
USING (
  auth.uid() = created_by OR
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = id AND gm.user_id = auth.uid()
  )
);

-- Group members: users can see memberships for groups they belong to
CREATE POLICY "Members can see group memberships"
ON public.group_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.group_members gm2
    WHERE gm2.group_id = group_id AND gm2.user_id = auth.uid()
  )
);

-- Group members: allow users to join a group for themselves
CREATE POLICY "Users can join groups for themselves"
ON public.group_members
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Group members: allow group creator to manage memberships
CREATE POLICY "Group creator can manage memberships"
ON public.group_members
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = group_id AND g.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = group_id AND g.created_by = auth.uid()
  )
);

-- Expenses: group members can manage expenses in their groups
CREATE POLICY "Group members can manage expenses in their groups"
ON public.expenses
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_id AND gm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_id AND gm.user_id = auth.uid()
  )
);

-- Expense splits: group members can manage splits in their groups
CREATE POLICY "Group members can manage splits in their groups"
ON public.expense_splits
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.expenses e
    JOIN public.group_members gm ON gm.group_id = e.group_id
    WHERE e.id = expense_id AND gm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.expenses e
    JOIN public.group_members gm ON gm.group_id = e.group_id
    WHERE e.id = expense_id AND gm.user_id = auth.uid()
  )
);

-- Settlements: group members can manage settlements in their groups
CREATE POLICY "Group members can manage settlements in their groups"
ON public.settlements
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_id AND gm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = group_id AND gm.user_id = auth.uid()
  )
);
