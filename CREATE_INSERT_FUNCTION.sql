-- ============================================
-- CREATE RPC FUNCTION TO INSERT INDIVIDUAL EXPENSES
-- Run this in your Supabase SQL Editor
-- ============================================

-- Create the function to insert individual expenses
CREATE OR REPLACE FUNCTION public.insert_individual_expense(
    p_user_id UUID,
    p_title TEXT,
    p_amount DECIMAL,
    p_date DATE,
    p_category TEXT,
    p_description TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    title TEXT,
    amount DECIMAL,
    date DATE,
    category TEXT,
    description TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    INSERT INTO public.individual_expenses (
        user_id,
        title,
        amount,
        date,
        category,
        description
    ) VALUES (
        p_user_id,
        p_title,
        p_amount,
        p_date,
        p_category,
        p_description
    )
    RETURNING 
        individual_expenses.id,
        individual_expenses.user_id,
        individual_expenses.title,
        individual_expenses.amount,
        individual_expenses.date,
        individual_expenses.category,
        individual_expenses.description,
        individual_expenses.created_at,
        individual_expenses.updated_at;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.insert_individual_expense TO authenticated;

-- Verify the function was created
SELECT 'Function created successfully!' AS status;
