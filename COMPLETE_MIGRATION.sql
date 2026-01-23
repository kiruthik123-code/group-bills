-- ============================================
-- COMPLETE SPLITSTER DATABASE MIGRATION
-- Run this in your NEW Supabase SQL Editor
-- Project: uwovulrvpaladefofqsc
-- ============================================

-- ============================================
-- 1. PROFILES TABLE (extends auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    avatar_url TEXT,
    phone_number TEXT,
    upi_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- ============================================
-- 2. GROUPS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    invite_code TEXT UNIQUE,
    invite_link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Groups are viewable by members" ON public.groups;
DROP POLICY IF EXISTS "Authenticated users can create groups" ON public.groups;

CREATE POLICY "Groups are viewable by members" ON public.groups FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.group_members 
        WHERE group_members.group_id = groups.id 
        AND group_members.user_id = auth.uid()
    )
);

CREATE POLICY "Authenticated users can create groups" ON public.groups FOR INSERT WITH CHECK (auth.uid() = created_by);

-- ============================================
-- 3. GROUP MEMBERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.group_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Group members are viewable by group members" ON public.group_members;
DROP POLICY IF EXISTS "Users can join groups" ON public.group_members;

CREATE POLICY "Group members are viewable by group members" ON public.group_members FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.group_members gm 
        WHERE gm.group_id = group_members.group_id 
        AND gm.user_id = auth.uid()
    )
);

CREATE POLICY "Users can join groups" ON public.group_members FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 4. EXPENSES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    paid_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    category_icon TEXT DEFAULT 'shopping_bag',
    notes TEXT,
    expense_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Expenses are viewable by group members" ON public.expenses;
DROP POLICY IF EXISTS "Group members can create expenses" ON public.expenses;
DROP POLICY IF EXISTS "Expense creator can delete" ON public.expenses;

CREATE POLICY "Expenses are viewable by group members" ON public.expenses FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.group_members 
        WHERE group_members.group_id = expenses.group_id 
        AND group_members.user_id = auth.uid()
    )
);

CREATE POLICY "Group members can create expenses" ON public.expenses FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.group_members 
        WHERE group_members.group_id = expenses.group_id 
        AND group_members.user_id = auth.uid()
    )
);

CREATE POLICY "Expense creator can delete" ON public.expenses FOR DELETE USING (auth.uid() = paid_by);

-- ============================================
-- 5. EXPENSE SPLITS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.expense_splits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    share_amount DECIMAL(10,2) NOT NULL
);

ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Expense splits are viewable by group members" ON public.expense_splits;
DROP POLICY IF EXISTS "Group members can create expense splits" ON public.expense_splits;

CREATE POLICY "Expense splits are viewable by group members" ON public.expense_splits FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.expenses e
        JOIN public.group_members gm ON gm.group_id = e.group_id
        WHERE e.id = expense_splits.expense_id 
        AND gm.user_id = auth.uid()
    )
);

CREATE POLICY "Group members can create expense splits" ON public.expense_splits FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.expenses e
        JOIN public.group_members gm ON gm.group_id = e.group_id
        WHERE e.id = expense_splits.expense_id 
        AND gm.user_id = auth.uid()
    )
);

-- ============================================
-- 6. SETTLEMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.settlements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
    payer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    receiver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'settled')),
    settled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Settlements are viewable by group members" ON public.settlements;
DROP POLICY IF EXISTS "Group members can create settlements" ON public.settlements;
DROP POLICY IF EXISTS "Payer can update settlement" ON public.settlements;

CREATE POLICY "Settlements are viewable by group members" ON public.settlements FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.group_members 
        WHERE group_members.group_id = settlements.group_id 
        AND group_members.user_id = auth.uid()
    )
);

CREATE POLICY "Group members can create settlements" ON public.settlements FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.group_members 
        WHERE group_members.group_id = settlements.group_id 
        AND group_members.user_id = auth.uid()
    )
);

CREATE POLICY "Payer can update settlement" ON public.settlements FOR UPDATE USING (auth.uid() = payer_id);

-- ============================================
-- 7. INDIVIDUAL EXPENSES TABLE (Personal Tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS public.individual_expenses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    category TEXT DEFAULT 'Other' NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.individual_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own individual expenses" ON public.individual_expenses;
DROP POLICY IF EXISTS "Users can insert their own individual expenses" ON public.individual_expenses;
DROP POLICY IF EXISTS "Users can update their own individual expenses" ON public.individual_expenses;
DROP POLICY IF EXISTS "Users can delete their own individual expenses" ON public.individual_expenses;

CREATE POLICY "Users can view their own individual expenses" ON public.individual_expenses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own individual expenses" ON public.individual_expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own individual expenses" ON public.individual_expenses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own individual expenses" ON public.individual_expenses FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 8. CHAT MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Chat messages are viewable by group members" ON public.chat_messages;
DROP POLICY IF EXISTS "Group members can send messages" ON public.chat_messages;

CREATE POLICY "Chat messages are viewable by group members" ON public.chat_messages FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.group_members 
        WHERE group_members.group_id = chat_messages.group_id 
        AND group_members.user_id = auth.uid()
    )
);

CREATE POLICY "Group members can send messages" ON public.chat_messages FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.group_members 
        WHERE group_members.group_id = chat_messages.group_id 
        AND group_members.user_id = auth.uid()
    ) AND auth.uid() = user_id
);

-- ============================================
-- 9. CONTACTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    contact_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, contact_user_id)
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can add contacts" ON public.contacts;

CREATE POLICY "Users can view their own contacts" ON public.contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can add contacts" ON public.contacts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 10. INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members (group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members (user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_group_id ON public.expenses (group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON public.expenses (paid_by);
CREATE INDEX IF NOT EXISTS idx_expense_splits_expense_id ON public.expense_splits (expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_user_id ON public.expense_splits (user_id);
CREATE INDEX IF NOT EXISTS idx_settlements_group_id ON public.settlements (group_id);
CREATE INDEX IF NOT EXISTS idx_individual_expenses_user_id ON public.individual_expenses (user_id);
CREATE INDEX IF NOT EXISTS idx_individual_expenses_date ON public.individual_expenses (date);
CREATE INDEX IF NOT EXISTS idx_chat_messages_group_id ON public.chat_messages (group_id);

-- ============================================
-- 11. HELPER FUNCTIONS
-- ============================================

-- Function to check if user is member of group
CREATE OR REPLACE FUNCTION public.is_member_of_group(_group_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.group_members 
        WHERE group_id = _group_id AND user_id = _user_id
    );
END;
$$;

-- Function to lookup group by invite code
CREATE OR REPLACE FUNCTION public.lookup_group_by_invite(invite_code_param TEXT)
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT g.id, g.name
    FROM public.groups g
    WHERE g.invite_code = invite_code_param;
END;
$$;

-- ============================================
-- 12. TRIGGER TO AUTO-CREATE PROFILE
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'Migration completed successfully! All tables created.' AS status;
