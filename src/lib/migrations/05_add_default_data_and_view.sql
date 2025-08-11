-- Step 5: Add default configuration and view

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