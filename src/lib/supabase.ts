import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('🔗 Supabase Configuration Check:');
console.log('  URL:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'NOT SET');
console.log('  Anon Key:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : 'NOT SET');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('  Make sure you have VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
  throw new Error('Missing Supabase environment variables')
}

// Database schema types
export interface User {
  id: string
  email: string
  username?: string
  avatar_url?: string
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  user_id: string
  name: string
  description: string
  brick_type: string
  type: string
  is_public: boolean
  created_at: string
  updated_at: string
  anchors?: Anchor[]
}

export interface Anchor {
  id: string
  project_id: string
  name: string
  purpose: string
  construction_type: string
  notes?: string
  position_x: number
  position_y: number
  position_z: number
  created_at: string
}

export interface QRCode {
  id: string
  anchor_id: string
  project_id: string
  user_id: string
  qr_data: any
  qr_code_url: string
  qr_pair_id?: string
  qr_position: 'primary' | 'secondary'
  reference_distance: number
  created_at: string
}

export interface SharedProject {
  id: string
  project_id: string
  shared_by: string
  shared_with?: string
  share_token: string
  permissions: 'view' | 'edit'
  expires_at?: string
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: User
        Insert: Omit<User, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<User, 'id' | 'created_at'>>
      }
      projects: {
        Row: Project
        Insert: Omit<Project, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Project, 'id' | 'created_at'>>
      }
      anchors: {
        Row: Anchor
        Insert: Omit<Anchor, 'id' | 'created_at'>
        Update: Partial<Omit<Anchor, 'id' | 'created_at'>>
      }
      qr_codes: {
        Row: QRCode
        Insert: Omit<QRCode, 'id' | 'created_at'>
        Update: Partial<Omit<QRCode, 'id' | 'created_at'>>
      }
      shared_projects: {
        Row: SharedProject
        Insert: Omit<SharedProject, 'id' | 'created_at'>
        Update: Partial<Omit<SharedProject, 'id' | 'created_at'>>
      }
    }
  }
}

// Create Supabase client
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

console.log('✅ Supabase client created successfully');
console.log('🔗 Client status:', {
  url: supabase.supabaseUrl,
  key: supabase.supabaseKey.substring(0, 20) + '...',
  connected: 'Ready for operations'
});

// Auth helper functions
export const auth = {
  signUp: async (email: string, password: string, metadata?: any) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata
      }
    })
    return { data, error }
  },

  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    return { data, error }
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  getCurrentUser: async () => {
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
  },

  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    return supabase.auth.onAuthStateChange(callback)
  }
}

export default supabase 