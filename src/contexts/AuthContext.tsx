import React, { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase, auth } from '../lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signUp: (email: string, password: string, metadata?: any) => Promise<any>
  signIn: (email: string, password: string) => Promise<any>
  signOut: () => Promise<void>
  updateProfile: (updates: any) => Promise<any>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log('🔄 AuthProvider: Initializing authentication...');
    
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('🔍 AuthProvider: Initial session check:', {
        hasSession: !!session,
        userId: session?.user?.id,
        email: session?.user?.email,
        url: window.location.href
      });
      
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🎭 AuthProvider: Auth state change:', {
          event,
          hasSession: !!session,
          userId: session?.user?.id,
          email: session?.user?.email,
          url: window.location.href
        });
        
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)

        // Handle user profile creation
        if (event === 'SIGNED_IN' && session?.user) {
          console.log('👤 AuthProvider: Creating/checking user profile...');
          
          // Check if user profile exists, if not create one
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single()

          if (!profile) {
            console.log('📝 AuthProvider: Creating new user profile...');
            await supabase.from('users').insert({
              id: session.user.id,
              email: session.user.email || '',
              username: session.user.user_metadata?.username
            })
          } else {
            console.log('✅ AuthProvider: User profile already exists');
          }
        }
        
        if (event === 'SIGNED_OUT') {
          console.log('👋 AuthProvider: User signed out');
        }
        
        if (event === 'TOKEN_REFRESHED') {
          console.log('🔄 AuthProvider: Token refreshed');
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email: string, password: string, metadata?: any) => {
    const { data, error } = await auth.signUp(email, password, metadata)
    return { data, error }
  }

  const signIn = async (email: string, password: string) => {
    console.log('🔑 AuthContext: Starting signIn for:', email);
    
    try {
      const { data, error } = await auth.signIn(email, password)
      
      console.log('🔑 AuthContext: SignIn result:', {
        hasData: !!data,
        hasUser: !!data?.user,
        hasSession: !!data?.session,
        error: error?.message,
        userId: data?.user?.id,
        email: data?.user?.email
      });
      
      if (error) {
        console.log('❌ AuthContext: SignIn error:', error);
      } else if (data?.user) {
        console.log('✅ AuthContext: SignIn successful!');
      }
      
      return { data, error }
    } catch (exception) {
      console.error('💥 AuthContext: SignIn exception:', exception);
      throw exception;
    }
  }

  const signOut = async () => {
    const { error } = await auth.signOut()
    if (error) throw error
  }

  const updateProfile = async (updates: any) => {
    if (!user) throw new Error('No user found')
    
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()

    return { data, error }
  }

  const value: AuthContextType = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    updateProfile
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
} 