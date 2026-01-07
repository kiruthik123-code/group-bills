-- Server-side validation for expense_splits to ensure integrity with expenses.amount

-- 1) Ensure non-negative split amounts at the column level
ALTER TABLE public.expense_splits
ADD CONSTRAINT expense_splits_share_amount_non_negative
CHECK (share_amount >= 0);

-- 2) Create validation function to enforce that per-expense splits sum to the expense amount
CREATE OR REPLACE FUNCTION public.validate_expense_splits()
RETURNS trigger AS $$
DECLARE
  v_expense_id uuid;
  v_total NUMERIC;
  v_amount NUMERIC;
BEGIN
  -- Determine which row image to use based on operation
  IF TG_OP = 'DELETE' THEN
    v_expense_id := OLD.expense_id;
  ELSE
    v_expense_id := NEW.expense_id;
  END IF;

  -- Get the expense amount; if no matching expense, skip validation
  SELECT amount INTO v_amount
  FROM public.expenses
  WHERE id = v_expense_id;

  IF v_amount IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  -- Sum all split amounts for this expense after the change
  SELECT COALESCE(SUM(share_amount), 0) INTO v_total
  FROM public.expense_splits
  WHERE expense_id = v_expense_id;

  -- Basic sanity: total cannot be negative
  IF v_total < 0 THEN
    RAISE EXCEPTION 'Total split amount cannot be negative for expense %', v_expense_id;
  END IF;

  -- Ensure total of splits matches expense amount within a small tolerance
  IF ABS(v_total - v_amount) > 0.01 THEN
    RAISE EXCEPTION 'Sum of split amounts (%) must equal expense total (%) for expense %', v_total, v_amount, v_expense_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 3) Create a constraint trigger that runs after changes to expense_splits
--    Deferred so that bulk inserts (e.g., all splits for a new expense) are validated together
DROP TRIGGER IF EXISTS expense_splits_validate_sum ON public.expense_splits;

CREATE CONSTRAINT TRIGGER expense_splits_validate_sum
AFTER INSERT OR UPDATE OR DELETE ON public.expense_splits
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.validate_expense_splits();