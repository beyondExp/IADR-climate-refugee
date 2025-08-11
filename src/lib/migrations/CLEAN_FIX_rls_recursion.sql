-- CLEAN FIX for RLS infinite recursion
-- This script completely resets all policies and rebuilds them properly

-- Step 1: DROP ALL existing policies (including any we might have missed)
DO $$ 
DECLARE 
    pol_name text;
BEGIN
    -- Get all policy names for brick_configurations table
    FOR pol_name IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'brick_configurations'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.brick_configurations', pol_name);
        RAISE NOTICE 'Dropped policy: %', pol_name;
    END LOOP;
END $$;

-- Step 2: DROP existing functions and triggers
DROP TRIGGER IF EXISTS set_brick_config_user_id_trigger ON public.brick_configurations;
DROP FUNCTION IF EXISTS public.set_brick_config_user_id();

-- Step 3: Verify table structure (using SQL instead of psql command)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'brick_configurations'
ORDER BY ordinal_position;

-- Step 4: Create the trigger function FIRST (before policies)
CREATE OR REPLACE FUNCTION public.set_brick_config_user_id()
RETURNS TRIGGER AS $$
BEGIN
    -- Set the user ID automatically
    NEW.created_by = auth.uid();
    NEW.updated_at = CURRENT_TIMESTAMP;
    
    -- Log for debugging
    RAISE NOTICE 'Trigger fired: created_by set to %', NEW.created_by;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create the trigger
CREATE TRIGGER set_brick_config_user_id_trigger
    BEFORE INSERT OR UPDATE ON public.brick_configurations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_brick_config_user_id();

-- Step 6: Create SIMPLE policies without recursion
-- Insert policy - let trigger handle user assignment
CREATE POLICY "simple_insert_policy" 
ON public.brick_configurations 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Select policy - only see your own records
CREATE POLICY "simple_select_policy" 
ON public.brick_configurations 
FOR SELECT 
TO authenticated 
USING (created_by = auth.uid());

-- Update policy - only update your own records  
CREATE POLICY "simple_update_policy" 
ON public.brick_configurations 
FOR UPDATE 
TO authenticated 
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- Delete policy - only delete your own records
CREATE POLICY "simple_delete_policy" 
ON public.brick_configurations 
FOR DELETE 
TO authenticated 
USING (created_by = auth.uid());

-- Step 7: Verify RLS is enabled
ALTER TABLE public.brick_configurations ENABLE ROW LEVEL SECURITY;

-- Step 8: Test the policies work
DO $$
BEGIN
    RAISE NOTICE 'Testing policies - attempting test query...';
    PERFORM count(*) FROM public.brick_configurations WHERE brick_id = 'test-brick';
    RAISE NOTICE 'Policy test passed - no recursion detected';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Policy test failed: %', SQLERRM;
END $$;

-- Step 9: Show final policy list
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'brick_configurations'
ORDER BY policyname;