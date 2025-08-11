-- Step 2: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_brick_configurations_brick_id ON public.brick_configurations(brick_id);
CREATE INDEX IF NOT EXISTS idx_brick_configurations_brick_type ON public.brick_configurations(brick_type);
CREATE INDEX IF NOT EXISTS idx_brick_configurations_created_by ON public.brick_configurations(created_by);
CREATE INDEX IF NOT EXISTS idx_brick_configurations_active ON public.brick_configurations(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_brick_configurations_default ON public.brick_configurations(is_default) WHERE is_default = true;

-- Enable Row Level Security
ALTER TABLE public.brick_configurations ENABLE ROW LEVEL SECURITY;