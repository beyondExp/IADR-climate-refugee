-- Step 1: Create the basic table structure
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
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_connections CHECK (jsonb_typeof(connections) = 'array'),
  CONSTRAINT unique_default_per_type EXCLUDE (brick_type WITH =) WHERE (is_default = true)
);