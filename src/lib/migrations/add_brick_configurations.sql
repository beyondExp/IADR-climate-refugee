-- Create brick_configurations table for storing connection point configurations
CREATE TABLE IF NOT EXISTS public.brick_configurations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brick_id TEXT NOT NULL,
  brick_type TEXT NOT NULL DEFAULT 'octa2',
  name TEXT,
  description TEXT,
  
  -- Connection configuration data (JSONB for flexibility)
  connections JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Metadata
  version TEXT NOT NULL DEFAULT '1.0',
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Ownership and permissions
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  organization_id UUID, -- For multi-tenant support
  visibility TEXT CHECK (visibility IN ('private', 'team', 'public')) DEFAULT 'private',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_connections CHECK (jsonb_typeof(connections) = 'array'),
  CONSTRAINT unique_default_per_type EXCLUDE (brick_type WITH =) WHERE (is_default = true)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_brick_configurations_brick_id ON public.brick_configurations(brick_id);
CREATE INDEX IF NOT EXISTS idx_brick_configurations_brick_type ON public.brick_configurations(brick_type);
CREATE INDEX IF NOT EXISTS idx_brick_configurations_created_by ON public.brick_configurations(created_by);
CREATE INDEX IF NOT EXISTS idx_brick_configurations_active ON public.brick_configurations(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_brick_configurations_default ON public.brick_configurations(is_default) WHERE is_default = true;

-- Add RLS (Row Level Security) policies
ALTER TABLE public.brick_configurations ENABLE ROW LEVEL SECURITY;

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

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_brick_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_brick_configurations_updated_at
  BEFORE UPDATE ON public.brick_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_brick_configurations_updated_at();

-- Insert default configuration for Octa2 brick
INSERT INTO public.brick_configurations (
  brick_id,
  brick_type,
  name,
  description,
  connections,
  is_default,
  visibility
) VALUES (
  'default_octa2',
  'octa2',
  'Default Octa2 Configuration',
  'Standard connection layout for Octa2 climate shelter bricks',
  '[
    {
      "id": "default_male_1",
      "type": "male",
      "axis": "x",
      "localPosition": {"x": 0.15, "y": 0, "z": 0},
      "localRotation": {"x": 0, "y": 0, "z": 0},
      "strength": 1.0,
      "isConnected": false
    },
    {
      "id": "default_female_1", 
      "type": "female",
      "axis": "x",
      "localPosition": {"x": -0.15, "y": 0, "z": 0},
      "localRotation": {"x": 0, "y": 0, "z": 0},
      "strength": 1.0,
      "isConnected": false
    },
    {
      "id": "default_male_2",
      "type": "male", 
      "axis": "y",
      "localPosition": {"x": 0, "y": 0.1, "z": 0},
      "localRotation": {"x": 0, "y": 0, "z": 0},
      "strength": 1.0,
      "isConnected": false
    },
    {
      "id": "default_female_2",
      "type": "female",
      "axis": "y", 
      "localPosition": {"x": 0, "y": -0.1, "z": 0},
      "localRotation": {"x": 0, "y": 0, "z": 0},
      "strength": 1.0,
      "isConnected": false
    },
    {
      "id": "default_neutral_1",
      "type": "neutral",
      "axis": "z",
      "localPosition": {"x": 0, "y": 0, "z": 0.1},
      "localRotation": {"x": 0, "y": 0, "z": 0},
      "strength": 0.8,
      "isConnected": false
    },
    {
      "id": "default_neutral_2",
      "type": "neutral",
      "axis": "z",
      "localPosition": {"x": 0, "y": 0, "z": -0.1},
      "localRotation": {"x": 0, "y": 0, "z": 0},
      "strength": 0.8,
      "isConnected": false
    }
  ]'::jsonb,
  true,
  'public'
) ON CONFLICT DO NOTHING;

-- Create view for easier querying of active configurations
CREATE OR REPLACE VIEW public.active_brick_configurations AS
SELECT 
  bc.id,
  bc.brick_id,
  bc.brick_type,
  bc.name,
  bc.description,
  bc.connections,
  bc.version,
  bc.is_default,
  bc.visibility,
  bc.created_by,
  u.email as creator_email,
  u.role as creator_role,
  bc.created_at,
  bc.updated_at
FROM public.brick_configurations bc
LEFT JOIN public.users u ON bc.created_by = u.id
WHERE bc.is_active = true;

-- Add helpful comments
COMMENT ON TABLE public.brick_configurations IS 'Stores connection point configurations for different brick types in the climate shelter system';
COMMENT ON COLUMN public.brick_configurations.connections IS 'JSONB array of connection point objects with id, type, axis, localPosition, localRotation, strength, and isConnected properties';
COMMENT ON COLUMN public.brick_configurations.visibility IS 'Determines who can access this configuration: private (creator only), team (organization members), public (everyone)';
COMMENT ON COLUMN public.brick_configurations.is_default IS 'Marks the default configuration for each brick_type (only one allowed per type)';