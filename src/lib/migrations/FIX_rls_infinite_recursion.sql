-- Fix infinite recursion in RLS policies for brick_configurations
-- This removes the circular dependency that was causing the 42P17 error

-- Step 1: Drop existing problematic policies
DROP POLICY IF EXISTS "Users can manage own brick configurations" ON public.brick_configurations;
DROP POLICY IF EXISTS "Users can view own brick configurations" ON public.brick_configurations;

-- Step 2: Create simplified policies without circular dependencies
-- Allow authenticated users to insert their own configurations
CREATE POLICY "authenticated_users_can_insert_brick_configs" 
ON public.brick_configurations FOR INSERT 
TO authenticated 
WITH CHECK (true);  -- Simple check, user ownership handled by created_by trigger

-- Allow users to view configurations (RLS will filter by user automatically)
CREATE POLICY "authenticated_users_can_view_brick_configs" 
ON public.brick_configurations FOR SELECT 
TO authenticated 
USING (created_by = auth.uid());

-- Allow users to update their own configurations
CREATE POLICY "authenticated_users_can_update_own_brick_configs" 
ON public.brick_configurations FOR UPDATE 
TO authenticated 
USING (created_by = auth.uid()) 
WITH CHECK (created_by = auth.uid());

-- Allow users to delete their own configurations
CREATE POLICY "authenticated_users_can_delete_own_brick_configs" 
ON public.brick_configurations FOR DELETE 
TO authenticated 
USING (created_by = auth.uid());

-- Step 3: Ensure the trigger sets created_by automatically (avoids manual user handling)
CREATE OR REPLACE FUNCTION public.set_brick_config_user_id()
RETURNS TRIGGER AS $$
BEGIN
    NEW.created_by = auth.uid();
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger to ensure it's working
DROP TRIGGER IF EXISTS set_brick_config_user_id_trigger ON public.brick_configurations;
CREATE TRIGGER set_brick_config_user_id_trigger
    BEFORE INSERT OR UPDATE ON public.brick_configurations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_brick_config_user_id();

-- Step 4: Test query to verify no recursion
-- SELECT id, brick_id, name FROM public.brick_configurations WHERE brick_id = 'test';