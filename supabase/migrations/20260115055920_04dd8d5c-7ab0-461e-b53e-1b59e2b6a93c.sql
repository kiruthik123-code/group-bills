-- 1) Protect sensitive fields in profiles by restricting full-row access
-- Drop existing group-member-wide SELECT policy if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Users can view profiles of group members'
  ) THEN
    DROP POLICY "Users can view profiles of group members" ON public.profiles;
  END IF;
END$$;

-- Ensure users can still view their own full profile (including phone_number and upi_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Users can view their own profile'
  ) THEN
    CREATE POLICY "Users can view their own profile"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (id = auth.uid());
  END IF;
END$$;

-- 2) Create a safe view for non-sensitive profile fields used in group contexts
CREATE OR REPLACE VIEW public.safe_profiles AS
SELECT 
  id,
  full_name,
  avatar_url,
  created_at,
  updated_at
FROM public.profiles;

GRANT SELECT ON public.safe_profiles TO authenticated;

-- 3) Add DELETE policy so senders can remove their own direct messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'direct_messages'
      AND policyname = 'Senders can delete their own messages'
  ) THEN
    CREATE POLICY "Senders can delete their own messages"
    ON public.direct_messages
    FOR DELETE
    TO authenticated
    USING (sender_id = auth.uid());
  END IF;
END$$;

-- 4) Harden validate_expense_splits function with explicit search_path
CREATE OR REPLACE FUNCTION public.validate_expense_splits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense_id uuid;
  v_total NUMERIC;
  v_amount NUMERIC;
BEGIN
  -- Determine which row to use
  IF TG_OP = 'DELETE' THEN
    v_expense_id := OLD.expense_id;
  ELSE
    v_expense_id := NEW.expense_id;
  END IF;

  -- Get expense amount
  SELECT amount INTO v_amount
  FROM public.expenses
  WHERE id = v_expense_id;

  -- Sum all splits
  SELECT COALESCE(SUM(share_amount), 0) INTO v_total
  FROM public.expense_splits
  WHERE expense_id = v_expense_id;

  -- Validate
  IF v_total < 0 THEN
    RAISE EXCEPTION 'Total split amount cannot be negative';
  END IF;

  IF ABS(v_total - v_amount) > 0.01 THEN
    RAISE EXCEPTION 'Sum of splits must equal expense total';
  END IF;

  RETURN NEW;
END;
$$;