-- Migration: Add optimized model columns to projects table
-- Run this on your Supabase database to add the new columns

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS optimized_model_url TEXT,
ADD COLUMN IF NOT EXISTS model_file_size INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN public.projects.optimized_model_url IS 'URL to the pre-optimized .glb file in Supabase storage bucket';
COMMENT ON COLUMN public.projects.model_file_size IS 'File size in bytes for loading progress indication';

-- Create storage bucket for optimized models (run this in Supabase SQL editor)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('project-models', 'project-models', true)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policy for the storage bucket
CREATE POLICY "Project models are viewable by everyone" ON storage.objects FOR SELECT USING (bucket_id = 'project-models');
CREATE POLICY "Users can upload their own project models" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'project-models' AND auth.uid() IS NOT NULL);
CREATE POLICY "Users can update their own project models" ON storage.objects FOR UPDATE USING (bucket_id = 'project-models' AND auth.uid() IS NOT NULL);
CREATE POLICY "Users can delete their own project models" ON storage.objects FOR DELETE USING (bucket_id = 'project-models' AND auth.uid() IS NOT NULL); 