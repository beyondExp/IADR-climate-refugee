-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE project_type AS ENUM ('modular-construction', 'emergency-shelter', 'sustainable-housing', 'temporary-structure');
CREATE TYPE anchor_purpose AS ENUM ('foundation', 'structural', 'decorative', 'utility', 'connection');
CREATE TYPE construction_type AS ENUM ('foundation', 'wall', 'roof', 'beam', 'column', 'connection');
CREATE TYPE share_permission AS ENUM ('view', 'edit');

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    username TEXT UNIQUE,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Projects table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    brick_type TEXT NOT NULL DEFAULT 'clay-sustainable',
    type project_type DEFAULT 'modular-construction',
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Anchors table
CREATE TABLE IF NOT EXISTS public.anchors (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    purpose anchor_purpose NOT NULL,
    construction_type construction_type NOT NULL,
    notes TEXT,
    position_x DECIMAL(10,3) DEFAULT 0,
    position_y DECIMAL(10,3) DEFAULT 0,
    position_z DECIMAL(10,3) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- QR Codes table (Updated for paired QR codes)
CREATE TABLE IF NOT EXISTS public.qr_codes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    anchor_id UUID REFERENCES public.anchors(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    qr_data JSONB NOT NULL,
    qr_code_url TEXT NOT NULL,
    -- QR Pair fields for AR positioning
    qr_pair_id UUID, -- Links two QR codes together (both codes share same pair_id)
    qr_position TEXT CHECK (qr_position IN ('primary', 'secondary')) NOT NULL DEFAULT 'primary',
    reference_distance DECIMAL(10,3) NOT NULL DEFAULT 1.0, -- Distance between QR codes in meters
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shared Projects table for collaboration
CREATE TABLE IF NOT EXISTS public.shared_projects (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    shared_by UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    shared_with UUID REFERENCES public.users(id) ON DELETE CASCADE,
    share_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    permissions share_permission DEFAULT 'view',
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_is_public ON public.projects(is_public);
CREATE INDEX IF NOT EXISTS idx_anchors_project_id ON public.anchors(project_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_project_id ON public.qr_codes(project_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_anchor_id ON public.qr_codes(anchor_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_pair_id ON public.qr_codes(qr_pair_id);
CREATE INDEX IF NOT EXISTS idx_shared_projects_project_id ON public.shared_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_shared_projects_shared_with ON public.shared_projects(shared_with);
CREATE INDEX IF NOT EXISTS idx_shared_projects_share_token ON public.shared_projects(share_token);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_projects ENABLE ROW LEVEL SECURITY;

-- Users can only see and edit their own profile
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- Projects policies
CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view public projects" ON public.projects FOR SELECT USING (is_public = true);
CREATE POLICY "Users can view shared projects" ON public.projects FOR SELECT USING (
    id IN (
        SELECT project_id FROM public.shared_projects 
        WHERE shared_with = auth.uid() OR (shared_with IS NULL AND expires_at > NOW())
    )
);
CREATE POLICY "Users can insert own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

-- Anchors policies (follow project permissions)
CREATE POLICY "Users can view anchors of accessible projects" ON public.anchors FOR SELECT USING (
    project_id IN (
        SELECT id FROM public.projects 
        WHERE user_id = auth.uid() 
        OR is_public = true 
        OR id IN (
            SELECT project_id FROM public.shared_projects 
            WHERE shared_with = auth.uid() OR (shared_with IS NULL AND expires_at > NOW())
        )
    )
);
CREATE POLICY "Users can insert anchors to own projects" ON public.anchors FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update anchors in own projects" ON public.anchors FOR UPDATE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
);
CREATE POLICY "Users can delete anchors from own projects" ON public.anchors FOR DELETE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
);

-- QR Codes policies
CREATE POLICY "Users can view QR codes of accessible projects" ON public.qr_codes FOR SELECT USING (
    project_id IN (
        SELECT id FROM public.projects 
        WHERE user_id = auth.uid() 
        OR is_public = true 
        OR id IN (
            SELECT project_id FROM public.shared_projects 
            WHERE shared_with = auth.uid() OR (shared_with IS NULL AND expires_at > NOW())
        )
    )
);
CREATE POLICY "Users can insert QR codes to own projects" ON public.qr_codes FOR INSERT WITH CHECK (
    user_id = auth.uid() AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update own QR codes" ON public.qr_codes FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own QR codes" ON public.qr_codes FOR DELETE USING (user_id = auth.uid());

-- Shared Projects policies
CREATE POLICY "Users can view projects they shared" ON public.shared_projects FOR SELECT USING (shared_by = auth.uid());
CREATE POLICY "Users can view projects shared with them" ON public.shared_projects FOR SELECT USING (shared_with = auth.uid());
CREATE POLICY "Users can create shares for own projects" ON public.shared_projects FOR INSERT WITH CHECK (
    shared_by = auth.uid() AND project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update own shares" ON public.shared_projects FOR UPDATE USING (shared_by = auth.uid());
CREATE POLICY "Users can delete own shares" ON public.shared_projects FOR DELETE USING (shared_by = auth.uid());

-- Create function to handle user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, username)
    VALUES (new.id, new.email, new.raw_user_meta_data->>'username');
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated; 