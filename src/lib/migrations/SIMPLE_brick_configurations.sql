-- SIMPLE VERSION: Brick Configurations Migration
-- Copy and paste this entire block into Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.brick_configurations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brick_id TEXT NOT NULL,
  brick_type TEXT NOT NULL DEFAULT 'octa2',
  name TEXT,
  description TEXT,
  connections JSONB NOT NULL DEFAULT '[]'::jsonb,
  version TEXT NOT NULL DEFAULT '1.0',
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  organization_id UUID,
  visibility TEXT CHECK (visibility IN ('private', 'team', 'public')) DEFAULT 'private',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brick_configurations_brick_id ON public.brick_configurations(brick_id);
CREATE INDEX IF NOT EXISTS idx_brick_configurations_brick_type ON public.brick_configurations(brick_type);
CREATE INDEX IF NOT EXISTS idx_brick_configurations_created_by ON public.brick_configurations(created_by);

ALTER TABLE public.brick_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brick_configurations_select" ON public.brick_configurations
  FOR SELECT USING (
    visibility = 'public' OR 
    created_by = auth.uid()
  );

CREATE POLICY "brick_configurations_insert" ON public.brick_configurations
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "brick_configurations_update" ON public.brick_configurations
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "brick_configurations_delete" ON public.brick_configurations
  FOR DELETE USING (created_by = auth.uid() AND is_default = false);