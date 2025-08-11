-- Step 3: Add Row Level Security policies

-- Policy: Users can view public configurations and their own configurations
CREATE POLICY "Users can view accessible brick configurations" ON public.brick_configurations
  FOR SELECT USING (
    visibility = 'public' OR 
    created_by = auth.uid() OR
    (visibility = 'team' AND EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND organization_id = brick_configurations.organization_id
    ))
  );

-- Policy: Users can create their own configurations
CREATE POLICY "Users can create brick configurations" ON public.brick_configurations
  FOR INSERT WITH CHECK (created_by = auth.uid());

-- Policy: Users can update their own configurations
CREATE POLICY "Users can update own brick configurations" ON public.brick_configurations
  FOR UPDATE USING (created_by = auth.uid());

-- Policy: Users can delete their own configurations (not default ones)
CREATE POLICY "Users can delete own brick configurations" ON public.brick_configurations
  FOR DELETE USING (created_by = auth.uid() AND is_default = false);

-- Policy: Admins can manage all configurations
CREATE POLICY "Admins can manage all brick configurations" ON public.brick_configurations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );