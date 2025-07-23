-- Add project_structure column to projects table
-- This column will store the 3D scene data as JSON
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_structure JSONB;

-- Add index for better performance when querying project structure
CREATE INDEX IF NOT EXISTS idx_projects_project_structure ON public.projects USING GIN (project_structure);

-- Add a comment to document the column
COMMENT ON COLUMN public.projects.project_structure IS 'JSON structure containing 3D scene data including objects, materials, and metadata'; 