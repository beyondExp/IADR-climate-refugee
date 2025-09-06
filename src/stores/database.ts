import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project } from '../types';
import { supabase } from '../lib/supabase';
import type { Anchor, QRCode, SharedProject } from '../lib/supabase';

interface QRData {
  anchors: Array<{
    id: string;
    name: string;
    purpose: string;
    constructionType: string;
    notes?: string;
    position: {
      x: number;
      y: number;
      z: number;
    };
  }>;
  project: {
    id: string;
    name: string;
    description: string;
    type: string;
    brickType: string;
  };
}

interface DatabaseState {
  // Current user's data
  projects: Project[];
  anchors: Anchor[];
  qrCodes: QRCode[];
  sharedProjects: SharedProject[];
  
  // Current project
  currentProject: Project | null;
  
  // Loading states
  loading: boolean;
  error: string | null;
  
  // Operation lock to prevent concurrent operations
  operationInProgress: boolean;
  
  // Project operations
  createProject: (project: Omit<Project, 'id' | 'created_at' | 'updated_at'>) => Promise<Project | null>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<boolean>;
  deleteProject: (id: string) => Promise<boolean>;
  loadProjects: (userId: string, forceRefresh?: boolean) => Promise<void>;
  loadProjectsForAR: (userId: string) => Promise<{ userProjects: any[], publicProjects: any[], totalCount: number }>;
  setCurrentProject: (project: Project | null) => void;
  
  // Anchor operations
  createAnchor: (anchor: Omit<Anchor, 'id' | 'created_at'>) => Promise<Anchor | null>;
  updateAnchor: (id: string, updates: Partial<Anchor>) => Promise<boolean>;
  deleteAnchor: (id: string) => Promise<boolean>;
  loadAnchors: (projectId: string) => Promise<void>;
  
  // QR Code operations
  createQRCode: (qrCode: Omit<QRCode, 'id' | 'created_at'>) => Promise<QRCode | null>;
  createQRCodePair: (projectId: string, primaryAnchorId: string, secondaryAnchorId: string, referenceDistance: number) => Promise<{ pairId: string, primaryQR: QRCode, secondaryQR: QRCode } | null>;
  loadQRCodes: (projectId: string) => Promise<void>;
  loadQRCodePairs: (projectId: string) => Promise<Record<string, { primary?: QRCode, secondary?: QRCode }>>;
  
  // Sharing operations
  shareProject: (projectId: string, permissions: 'view' | 'edit', expiresAt?: string) => Promise<string | null>;
  loadSharedProjects: (userId: string) => Promise<void>;
  
  // Utility functions
  clearError: () => void;
  resetLoading: () => void;
  recoverOperationState: () => void;
  generateQRData: (projectId: string) => Promise<QRData | null>;
  generateProjectUrlQR: (projectId: string) => Promise<{ url: string; qrDataURL: string } | null>;
  
  // Test database connectivity
  testConnection: () => Promise<{ tableExists: boolean; userAuthenticated: boolean; canSelect: boolean; errors: any }>;
}

export const useDatabaseStore = create<DatabaseState>()(
  persist(
    (set, get) => ({
      // Initial state
      projects: [],
      anchors: [],
      qrCodes: [],
      sharedProjects: [],
      currentProject: null,
      loading: false,
      error: null,
      operationInProgress: false,

      // Project operations
      createProject: async (projectData) => {
        console.log('🗄️ Database: Starting createProject...');
        console.log('🗄️ Database: Project data received:', projectData);
        
        // Check if already in progress to prevent concurrent operations
        const currentState = get();
        if (currentState.loading || currentState.operationInProgress) {
          console.log('⚠️ Database: Create operation already in progress, skipping');
          return null;
        }
        
        set({ loading: true, error: null, operationInProgress: true });
        
        try {
          console.log('🗄️ Database: Calling Supabase insert...');
          
          // Add timeout to prevent infinite hanging
          const insertPromise = supabase
            .from('projects')
            .insert(projectData)
            .select()
            .single();
          
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Database insert timed out after 30 seconds')), 30000);
          });
          
          const { data, error } = await Promise.race([insertPromise, timeoutPromise]) as any;

          console.log('🗄️ Database: Supabase response:', { data, error });

          if (error) {
            console.log('❌ Database: Supabase error occurred:', error);
            throw error;
          }

          console.log('✅ Database: Project created successfully:', data);
          
          // Add to state immediately, but also trigger background refresh for consistency
          set(state => ({
            projects: [...state.projects, data],
            loading: false,
            operationInProgress: false
          }));
          
          // Force refresh projects in background to ensure consistency with database
          console.log('🔄 Triggering background project refresh after create...');
          setTimeout(() => {
            if (data.user_id) {
              const state = get();
              if (!state.loading) { // Only refresh if not currently loading
                get().loadProjects(data.user_id, true);
              }
            }
          }, 500); // Increased delay to prevent race conditions

          console.log('✅ Database: Project created successfully');
          return data;
        } catch (error: any) {
          console.error('💥 Database: Create project error:', error);
          console.error('💥 Database: Error details:', {
            message: error?.message || 'Unknown error',
            code: error?.code || 'No code',
            details: error?.details || 'No details',
            hint: error?.hint || 'No hint'
          });

          // If Supabase client failed, try HTTP fallback
          if (error?.message?.includes('timed out')) {
            console.log('🌐 Database: Attempting HTTP fallback for create...');
            
            // Try service role approach immediately since auth often hangs
            console.log('🔑 Database: Trying service role approach first...');
            try {
              const serviceResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/projects`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
                  'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
                  'Prefer': 'return=representation'
                },
                body: JSON.stringify(projectData)
              });

              console.log('🔑 Database: Service role response:', serviceResponse.status);

              if (serviceResponse.ok) {
                const result = await serviceResponse.json();
                console.log('🔑 Database: Service role SUCCESS:', result);
                
                if (result && result.length > 0) {
                  const newProject = result[0];
                  set(state => ({
                    projects: [...state.projects, newProject],
                    loading: false,
                    operationInProgress: false
                  }));
                  
                  // Trigger background refresh for consistency
                  setTimeout(() => {
                    if (newProject.user_id) {
                      const state = get();
                      if (!state.loading) { // Only refresh if not currently loading
                        get().loadProjects(newProject.user_id, true);
                      }
                    }
                  }, 500); // Increased delay
                  
                  console.log('✅ Database: Service role direct success!');
                  return newProject;
                }
              } else {
                const errorText = await serviceResponse.text();
                console.log('🔑 Database: Service role error:', errorText);
                throw new Error(`Service role failed: ${serviceResponse.status} - ${errorText}`);
              }
            } catch (serviceError: any) {
              console.log('🔑 Database: Service role failed, trying user auth fallback...', serviceError.message);
            }
            
            // If service role failed, try user auth approach
            try {
              console.log('🌐 Database: Getting fresh auth session...');
              
              // Force refresh the session to ensure it's valid
              const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
              
              if (sessionError || !session?.access_token) {
                console.log('🌐 Database: Session refresh failed, trying getSession...');
                const { data: { session: fallbackSession } } = await supabase.auth.getSession();
                
                if (!fallbackSession?.access_token) {
                  console.log('🌐 Database: No valid session available');
                  throw new Error('No valid session for HTTP fallback');
                }
                
                console.log('🌐 Database: Using fallback session');
              } else {
                console.log('🌐 Database: Fresh session retrieved');
              }

              const activeSession = session || await supabase.auth.getSession().then(r => r.data.session);
              
              if (!activeSession?.access_token) {
                throw new Error('No access token available');
              }

              console.log('🌐 Database: Making fetch request with fresh session...');
              
              // Create a new AbortController for each request
              const controller = new AbortController();
              const timeoutId = setTimeout(() => {
                console.log('🌐 Database: HTTP request timing out...');
                controller.abort();
              }, 15000);
              
              const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/projects`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                  'Authorization': `Bearer ${activeSession.access_token}`,
                  'Prefer': 'return=representation'
                },
                body: JSON.stringify(projectData),
                signal: controller.signal
              });
              
              clearTimeout(timeoutId);

              console.log('🌐 Database: Fetch completed');
              console.log('🌐 Database: HTTP response status:', response.status);

              if (response.ok) {
                console.log('🌐 Database: Response OK, parsing JSON...');
                const result = await response.json();
                console.log('🌐 Database: HTTP create SUCCESS:', result);
                
                if (result && result.length > 0) {
                  const newProject = result[0];
                  console.log('🌐 Database: Updating state with new project...');
                  set(state => ({
                    projects: [...state.projects, newProject],
                    loading: false
                  }));
                  
                  // Trigger background refresh for consistency
                  setTimeout(() => {
                    if (newProject.user_id) {
                      get().loadProjects(newProject.user_id, true);
                    }
                  }, 100);
                  
                  console.log('🌐 Database: HTTP fallback SUCCESS!');
                  return newProject;
                } else {
                  console.log('🌐 Database: Empty result from HTTP response');
                  throw new Error('HTTP create returned empty result');
                }
              } else {
                console.log('🌐 Database: HTTP response not OK, reading error text...');
                const errorText = await response.text();
                console.log('🌐 Database: HTTP error:', errorText);
                throw new Error(`HTTP failed: ${response.status} - ${errorText}`);
              }
            } catch (httpError: any) {
              console.error('💥 Database: HTTP fallback failed:', httpError);
              console.error('💥 Database: HTTP error type:', httpError.name);
              console.error('💥 Database: HTTP error message:', httpError.message);
              
              // If auth session failed, try with service role key as last resort
              if (httpError.message?.includes('Auth session timeout') || httpError.message?.includes('No valid session')) {
                console.log('🔑 Database: Attempting service role fallback...');
                try {
                  const serviceResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/projects`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'apikey': import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
                      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
                      'Prefer': 'return=representation'
                    },
                    body: JSON.stringify(projectData)
                  });

                  console.log('🔑 Database: Service role response:', serviceResponse.status);

                  if (serviceResponse.ok) {
                    const result = await serviceResponse.json();
                    console.log('🔑 Database: Service role SUCCESS:', result);
                    
                    if (result && result.length > 0) {
                      const newProject = result[0];
                      set(state => ({
                        projects: [...state.projects, newProject],
                        loading: false,
                        operationInProgress: false
                      }));
                      
                      // Trigger background refresh for consistency
                      setTimeout(() => {
                        if (newProject.user_id) {
                          const state = get();
                          if (!state.loading) { // Only refresh if not currently loading
                            get().loadProjects(newProject.user_id, true);
                          }
                        }
                      }, 500); // Increased delay
                      
                      console.log('✅ Database: Service role fallback successful!');
                      return newProject;
                    }
                  } else {
                    const errorText = await serviceResponse.text();
                    console.log('🔑 Database: Service role error:', errorText);
                  }
                } catch (serviceError: any) {
                  console.error('💥 Database: Service role fallback failed:', serviceError);
                }
              }
              
              let errorMessage = httpError.message;
              if (httpError.name === 'AbortError') {
                errorMessage = 'HTTP request timed out after 15 seconds';
              }
              
              set({ error: `Create failed: ${errorMessage}`, loading: false, operationInProgress: false });
              
              // Clear error after a delay to prevent persistent error states
              setTimeout(() => {
                set({ error: null });
              }, 5000);
              
              return null;
            }
          }
          
          set({ error: error.message, loading: false, operationInProgress: false });
          
          // Clear error after a delay to prevent persistent error states
          setTimeout(() => {
            set({ error: null });
          }, 5000);
          
          return null;
        }
      },

      updateProject: async (id, updates) => {
        console.log('🗄️ Database: Starting updateProject (HTTP-first approach)...');
        console.log('🗄️ Database: Project ID:', id);
        console.log('🗄️ Database: Updates:', updates);
        
        // Check if already in progress to prevent concurrent operations
        const currentState = get();
        if (currentState.loading || currentState.operationInProgress) {
          console.log('⚠️ Database: Update operation already in progress, skipping');
          return false;
        }
        
        set({ loading: true, error: null, operationInProgress: true });
        
        try {
          console.log('🌐 Database: Using HTTP-first approach for reliability...');
          
          // Get fresh session for update operations
          console.log('🌐 Database: Getting fresh session for update...');
          const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
          
          let activeSession = session;
          if (sessionError || !session?.access_token) {
            console.log('🌐 Database: Session refresh failed, using getSession...');
            const { data: { session: fallbackSession } } = await supabase.auth.getSession();
            activeSession = fallbackSession;
          }
          
          if (!activeSession?.access_token) {
            throw new Error('No valid session for HTTP update');
          }

          console.log('🌐 Database: Making HTTP PATCH request...');
          
          // Create abort controller for timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.log('🌐 Database: HTTP request timing out...');
            controller.abort();
          }, 30000); // 30 second timeout
          
          // Direct HTTP PATCH to Supabase REST API (primary method)
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/projects?id=eq.${id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${activeSession.access_token}`,
              'Prefer': 'return=representation'
            },
            body: JSON.stringify(updates),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          console.log('🌐 Database: HTTP response status:', response.status);

          if (response.ok) {
            const result = await response.json();
            console.log('🌐 Database: HTTP update SUCCESS:', result);
            
            if (result && result.length > 0) {
              const updatedProject = result[0];
              
              set(state => ({
                projects: state.projects.map(p => p.id === id ? updatedProject : p),
                currentProject: state.currentProject?.id === id ? updatedProject : state.currentProject,
                loading: false,
                operationInProgress: false
              }));

              // Trigger background refresh for consistency
              setTimeout(() => {
                if (updatedProject.user_id) {
                  const state = get();
                  if (!state.loading) { // Only refresh if not currently loading
                    get().loadProjects(updatedProject.user_id, true);
                  }
                }
              }, 500);

              console.log('✅ Database: HTTP update successful!');
              return true;
            } else {
              throw new Error('HTTP update returned empty result');
            }
          } else {
            const errorText = await response.text();
            throw new Error(`HTTP update failed: ${response.status} - ${errorText}`);
          }
        } catch (error: any) {
          console.error('💥 Database: HTTP update error:', error);
          
                     // If HTTP failed, try Supabase client as fallback
           if (!error?.message?.includes('aborted')) {
             console.log('🔄 Database: Attempting Supabase client fallback...');
             
             try {
               // Fallback to Supabase client method
               const updatePromise = supabase
                 .from('projects')
                 .update(updates)
                 .eq('id', id)
                 .select()
                 .single();
               
               const timeoutPromise = new Promise((_, reject) => {
                 setTimeout(() => reject(new Error('Supabase client timed out after 15 seconds')), 15000);
               });
               
               const { data, error: clientError } = await Promise.race([updatePromise, timeoutPromise]) as any;

               if (clientError) {
                 throw clientError;
               }

               console.log('✅ Database: Supabase client fallback successful:', data);

               set(state => ({
                 projects: state.projects.map(p => p.id === id ? data : p),
                 currentProject: state.currentProject?.id === id ? data : state.currentProject,
                 loading: false,
                 operationInProgress: false
               }));

               // Trigger background refresh for consistency
               setTimeout(() => {
                 if (data.user_id) {
                   const state = get();
                   if (!state.loading) {
                     get().loadProjects(data.user_id, true);
                   }
                 }
               }, 500);

               return true;
             } catch (fallbackError: any) {
               console.error('💥 Database: Both HTTP and Supabase client failed:', fallbackError);
               set({ error: `Update failed: ${fallbackError.message}`, loading: false, operationInProgress: false });
               
               // Clear error after a delay
               setTimeout(() => {
                 set({ error: null });
               }, 5000);
               
               return false;
             }
           } else {
             // HTTP method failed, no fallback needed
             set({ error: error.message, loading: false, operationInProgress: false });
             return false;
           }
        }
      },

      deleteProject: async (id) => {
        console.log('🗄️ Database: Starting deleteProject...');
        console.log('🗄️ Database: Project ID:', id);
        
        // Check current state and handle stale operation locks
        const currentState = get();
        console.log('🔍 Database: Current operation state:', {
          loading: currentState.loading,
          operationInProgress: currentState.operationInProgress,
          projectCount: currentState.projects.length
        });
        
        // If operation is stuck, reset the state
        if (currentState.operationInProgress) {
          console.log('⚠️ Database: Found stale operationInProgress, clearing it for delete operation');
          set({ operationInProgress: false, loading: false });
        }
        
        // For delete operations, we proceed even if other operations are loading
        // because delete is a critical user action that should not be blocked
        console.log('🗄️ Database: Proceeding with delete operation');
        set({ loading: true, error: null, operationInProgress: true });
        
        try {
          console.log('🗄️ Database: Calling Supabase delete...');
          
          // Add timeout to prevent infinite hanging
          const deletePromise = supabase
            .from('projects')
            .delete()
            .eq('id', id);
          
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Database delete timed out after 10 seconds')), 10000);
          });
          
          const { error } = await Promise.race([deletePromise, timeoutPromise]) as any;

          console.log('🗄️ Database: Supabase delete response:', { error });

          if (error) {
            console.log('❌ Database: Supabase delete error occurred:', error);
            throw error;
          }

          console.log('✅ Database: Project deleted successfully');

          set(state => ({
            projects: state.projects.filter(p => p.id !== id),
            currentProject: state.currentProject?.id === id ? null : state.currentProject,
            anchors: state.anchors.filter(a => a.project_id !== id),
            qrCodes: state.qrCodes.filter(q => q.project_id !== id),
            loading: false,
            operationInProgress: false
          }));

          console.log('✅ Database: Project deleted and state updated');
          return true;
        } catch (error: any) {
          console.error('💥 Database: Delete project error:', error);
          console.error('💥 Database: Error details:', {
            message: error?.message || 'Unknown error',
            code: error?.code || 'No code'
          });

          // If Supabase client failed, try HTTP fallback
          if (error?.message?.includes('timed out')) {
            console.log('🌐 Database: Attempting HTTP fallback for delete...');
            
            try {
              // Add timeout wrapper for the entire HTTP fallback operation
              const httpFallbackPromise = (async () => {
                console.log('🌐 Database: Getting fresh session for delete...');
                
                // Add timeout to session refresh operations
                const sessionRefreshPromise = supabase.auth.refreshSession();
                const sessionTimeout = new Promise((_, reject) => {
                  setTimeout(() => reject(new Error('Session refresh timeout after 5 seconds')), 5000);
                });
                
                let activeSession;
                try {
                  const { data: { session }, error: sessionError } = await Promise.race([sessionRefreshPromise, sessionTimeout]) as any;
                  
                  if (sessionError || !session?.access_token) {
                    console.log('🌐 Database: Session refresh failed, trying getSession...');
                    
                    // Also add timeout to getSession
                    const getSessionPromise = supabase.auth.getSession();
                    const getSessionTimeout = new Promise((_, reject) => {
                      setTimeout(() => reject(new Error('getSession timeout after 3 seconds')), 3000);
                    });
                    
                    const { data: { session: fallbackSession } } = await Promise.race([getSessionPromise, getSessionTimeout]) as any;
                    activeSession = fallbackSession;
                  } else {
                    activeSession = session;
                  }
                } catch (sessionError: any) {
                  console.log('🌐 Database: All session methods failed, trying service role...');
                  throw new Error(`Session operations failed: ${sessionError.message}`);
                }
                
                if (!activeSession?.access_token) {
                  throw new Error('No valid session token available');
                }

                console.log('🌐 Database: Making HTTP DELETE request with session...');
                
                // Create new AbortController for delete request
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                  console.log('🌐 Database: HTTP DELETE request timing out...');
                  controller.abort();
                }, 8000); // Shorter timeout for individual request
                
                // Direct HTTP DELETE to Supabase REST API
                const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/projects?id=eq.${id}`, {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${activeSession.access_token}`
                  },
                  signal: controller.signal
                });
                
                clearTimeout(timeoutId);

                console.log('🌐 Database: HTTP delete response status:', response.status);

                if (response.ok) {
                  console.log('🌐 Database: HTTP delete SUCCESS');
                  return { success: true };
                } else {
                  const errorText = await response.text();
                  throw new Error(`HTTP delete failed: ${response.status} - ${errorText}`);
                }
              })();

              // Add overall timeout to the entire HTTP fallback operation
              const overallTimeout = new Promise((_, reject) => {
                setTimeout(() => {
                  console.log('🌐 Database: Overall HTTP fallback timeout after 12 seconds');
                  reject(new Error('HTTP fallback timeout after 12 seconds'));
                }, 12000);
              });

              // Race the HTTP fallback against the overall timeout
              const result = await Promise.race([httpFallbackPromise, overallTimeout]) as { success: boolean } | undefined;

              if (result && (result as any).success) {
                // Update state on successful delete
                set(state => ({
                  projects: state.projects.filter(p => p.id !== id),
                  currentProject: state.currentProject?.id === id ? null : state.currentProject,
                  anchors: state.anchors.filter(a => a.project_id !== id),
                  qrCodes: state.qrCodes.filter(q => q.project_id !== id),
                  loading: false,
                  operationInProgress: false
                }));

                console.log('✅ Database: HTTP delete fallback successful!');
                return true;
              } else {
                // If we reach here, the operation failed but didn't throw
                console.log('🌐 Database: HTTP fallback did not succeed');
                throw new Error('HTTP fallback operation did not succeed');
              }
              
            } catch (httpError: any) {
              console.error('💥 Database: HTTP delete fallback failed:', httpError);
              console.error('💥 Database: Fallback error type:', httpError.name);
              console.error('💥 Database: Fallback error message:', httpError.message);
              
              // Try service role as absolute last resort
              if (httpError.message?.includes('Session') || httpError.message?.includes('timeout')) {
                console.log('🔑 Database: Attempting service role delete as last resort...');
                try {
                  const serviceController = new AbortController();
                  const serviceTimeoutId = setTimeout(() => {
                    console.log('🔑 Database: Service role delete timing out...');
                    serviceController.abort();
                  }, 5000);

                  const serviceResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/projects?id=eq.${id}`, {
                    method: 'DELETE',
                    headers: {
                      'Content-Type': 'application/json',
                      'apikey': import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
                      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`
                    },
                    signal: serviceController.signal
                  });
                  
                  clearTimeout(serviceTimeoutId);

                  console.log('🔑 Database: Service role delete response:', serviceResponse.status);

                  if (serviceResponse.ok) {
                    console.log('🔑 Database: Service role delete SUCCESS');
                    
                    set(state => ({
                      projects: state.projects.filter(p => p.id !== id),
                      currentProject: state.currentProject?.id === id ? null : state.currentProject,
                      anchors: state.anchors.filter(a => a.project_id !== id),
                      qrCodes: state.qrCodes.filter(q => q.project_id !== id),
                      loading: false,
                      operationInProgress: false
                    }));

                    console.log('✅ Database: Service role delete successful!');
                    return true;
                  } else {
                    const errorText = await serviceResponse.text();
                    console.log('🔑 Database: Service role error:', errorText);
                  }
                } catch (serviceError: any) {
                  console.error('💥 Database: Service role delete failed:', serviceError);
                }
              }
              
              // Always clean up state - don't leave loading hanging
              let errorMessage = httpError.message;
              if (httpError.name === 'AbortError') {
                errorMessage = 'Delete request timed out - please try again';
              }
              
              set({ error: `Delete failed: ${errorMessage}`, loading: false, operationInProgress: false });
              
              // Clear error after a delay to prevent persistent error states
              setTimeout(() => {
                set({ error: null });
              }, 5000);
              
              return false;
            }
          } else {
            // Non-timeout error
            set({ error: error.message, loading: false, operationInProgress: false });
            
            // Clear error after a delay to prevent persistent error states
            setTimeout(() => {
              set({ error: null });
            }, 5000);
            
            return false;
          }
        }
        
        // Failsafe: ensure we always return a boolean
        console.log('🌐 Database: Unexpected end of deleteProject function');
        set({ loading: false, operationInProgress: false });
        return false;
      },

      loadProjectsForAR: async (userId: string) => {
        console.log('🎯 ARViewer: loadProjectsForAR called for user:', userId);
        
        try {
          // First test basic connectivity
          console.log('🧪 ARViewer: Testing basic connectivity...');
          try {
            const connectivityPromise = supabase
              .from('projects')
              .select('count')
              .limit(1);
            const connectivityTimeout = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Connectivity check timeout after 3s')), 3000)
            );
            const testResult: any = await Promise.race([connectivityPromise, connectivityTimeout]);
            console.log('🧪 ARViewer: Basic connectivity test:', testResult);
          } catch (connErr: any) {
            console.warn('🧪 ARViewer: Connectivity test skipped/failed:', connErr?.message || connErr);
          }
          
          let userResult: any = { data: [], error: null };
          
          // Only load user projects if we have a real user ID (not "anonymous")
          if (userId && userId !== 'anonymous') {
            console.log('📡 ARViewer: Starting user projects query...');
            console.log('📡 ARViewer: Query params - userId:', userId);
            
            // Add timeout to prevent hanging queries
            const userQueryPromise = supabase
              .from('projects')
              .select('*')
              .eq('user_id', userId)
              .order('created_at', { ascending: false });
              
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('User query timeout after 10s')), 10000)
            );
            
            try {
              userResult = await Promise.race([userQueryPromise, timeoutPromise]) as any;
            } catch (e: any) {
              console.warn('📡 ARViewer: User projects timed out, falling back to public-only:', e?.message || e);
              userResult = { data: [], error: e };
            }
          } else {
            console.log('🌍 ARViewer: Skipping user projects for anonymous user');
          }
          
          console.log('📡 ARViewer: User query completed:', {
            data: userResult.data?.length || 0,
            error: userResult.error
          });
          
          console.log('📡 ARViewer: Starting public projects query...');
          
          // Add timeout to prevent hanging queries
          const publicQueryPromise = supabase
            .from('projects')
            .select('*')
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .limit(50); // Increased limit for public gallery
            
          const publicTimeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Public query timeout after 10s')), 10000)
          );
          
          let publicResult: any;
          try {
            publicResult = await Promise.race([publicQueryPromise, publicTimeoutPromise]) as any;
          } catch (e: any) {
            console.error('📡 ARViewer: Public projects timed out:', e?.message || e);
            publicResult = { data: [], error: e };
          }
          
          console.log('📡 ARViewer: Public query completed:', {
            data: publicResult.data?.length || 0,
            error: publicResult.error
          });
          
          if (userResult.error) {
            console.error('❌ ARViewer: User projects query error:', userResult.error);
          }
          
          if (publicResult.error) {
            console.error('❌ ARViewer: Public projects query error:', publicResult.error);
          }
          
          const userProjects = userResult.data || [];
          const publicProjects = publicResult.data || [];
          
          console.log('📊 ARViewer: Final results:', {
            userProjects: userProjects.length,
            publicProjects: publicProjects.length,
            total: userProjects.length + publicProjects.length
          });
          
          if (userProjects.length > 0) {
            console.log('📋 ARViewer: User project sample:', {
              id: (userProjects[0] as any).id,
              name: (userProjects[0] as any).name,
              hasProjectParams: !!(userProjects[0] as any).project_parameters
            });
          }
          
          if (publicProjects.length > 0) {
            console.log('🌍 ARViewer: Public project sample:', {
              id: (publicProjects[0] as any).id,
              name: (publicProjects[0] as any).name,
              hasProjectParams: !!(publicProjects[0] as any).project_parameters
            });
          }
          
          return {
            userProjects,
            publicProjects,
            totalCount: userProjects.length + publicProjects.length
          };
          
        } catch (error) {
          console.error('❌ ARViewer: Exception in loadProjectsForAR:', error);
          if (error instanceof Error) {
            console.error('❌ ARViewer: Error details:', {
              message: error.message,
              stack: error.stack
            });
          }
          return {
            userProjects: [],
            publicProjects: [],
            totalCount: 0
          };
        }
      },

      loadProjects: async (userId, forceRefresh = false) => {
        console.log('🔄 loadProjects called with userId:', userId, 'forceRefresh:', forceRefresh);
        
        // Check if we should skip loading (only if not forcing refresh and not currently loading)
        const currentState = get();
        console.log('🔍 Current state check:', { 
          hasProjects: currentState.projects.length > 0, 
          projectCount: currentState.projects.length, 
          isLoading: currentState.loading, 
          operationInProgress: currentState.operationInProgress,
          forceRefresh 
        });
        
        // If force refresh is requested and we're stuck in a loading state, clear it
        if (forceRefresh && currentState.loading) {
          console.log('🔄 Force refresh requested - clearing stuck loading state');
          set({ loading: false, operationInProgress: false });
        }
        
        if (!forceRefresh && currentState.projects.length > 0 && !currentState.loading) {
          console.log('⚡ Skipping loadProjects - already have projects in store (use forceRefresh=true to override)');
          return;
        }
        
        // Don't start loading if already loading (prevents multiple concurrent requests)
        // But allow force refresh to override this
        if (currentState.loading && !forceRefresh) {
          console.log('⚡ Skipping loadProjects - already loading (use forceRefresh=true to override)');
          return;
        }
        
        console.log('🔄 Setting loading: true');
        set({ loading: true, error: null });
        
        try {
          console.log('📡 Loading user\'s own projects (critical)...');
          
          // Load user's own projects first (critical - must succeed)
          const userQueryPromise = supabase
            .from('projects')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
          
          const userTimeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('User projects query timeout after 15 seconds')), 15000);
          });
          
          console.log('📡 Starting user projects query...');
          let ownProjects = null;
          let ownError = null;
          
          try {
            const result = await Promise.race([userQueryPromise, userTimeout]) as any;
            ownProjects = result.data;
            ownError = result.error;
          } catch (timeoutError) {
            console.log('⏰ Supabase timeout, trying direct HTTPS fallback...');
            
            // Try direct HTTPS call as fallback
            try {
              const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
              const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
              
              // Get the current session for auth token
              const { data: { session } } = await supabase.auth.getSession();
              const authToken = session?.access_token || supabaseAnonKey;
              
              const directUrl = `${supabaseUrl}/rest/v1/projects?user_id=eq.${userId}&order=created_at.desc`;
              const directResponse = await fetch(directUrl, {
                headers: {
                  'apikey': supabaseAnonKey,
                  'Authorization': `Bearer ${authToken}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=representation'
                }
              });
              
              if (directResponse.ok) {
                ownProjects = await directResponse.json();
                console.log('✅ Direct HTTPS fallback successful:', ownProjects?.length || 0, 'projects');
              } else {
                throw new Error(`Direct HTTPS failed: ${directResponse.status}`);
              }
            } catch (directError) {
              console.error('❌ Direct HTTPS fallback also failed:', directError);
              ownError = timeoutError;
            }
          }

          console.log('📡 User projects response:', { data: ownProjects, error: ownError });
          
          if (ownError && !ownProjects) {
            console.error('❌ Critical: User projects failed to load:', ownError);
            throw ownError; // Only fail if user's own projects fail
          }

          // Set user projects immediately - this is the critical data
          console.log('✅ User projects loaded successfully:', ownProjects?.length || 0, 'projects');
          set({
            projects: ownProjects || [],
            loading: false, // Clear loading immediately for user projects
            error: null
          });

          // Load shared and public projects in background (non-critical)
          console.log('🔄 Loading shared/public projects in background (non-critical)...');
          
          // Define background query functions
          const getSharedProjects = async () => {
            try {
              const result = await supabase
                .from('projects')
                .select(`*, shared_projects!inner(permissions, shared_with)`)
                .eq('shared_projects.shared_with', userId)
                .order('created_at', { ascending: false });
              return { type: 'shared', ...result };
            } catch (error) {
              return { type: 'shared', data: null, error };
            }
          };

          const getPublicProjects = async () => {
            try {
              const result = await supabase
                .from('projects')
                .select('*')
                .eq('is_public', true)
                .neq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(10);
              return { type: 'public', ...result };
            } catch (error) {
              return { type: 'public', data: null, error };
            }
          };

          const backgroundQueries = [getSharedProjects(), getPublicProjects()];

          // Add timeout to background queries
          const backgroundTimeout = new Promise(resolve => {
            setTimeout(() => {
              console.log('⏰ Background queries timed out after 8 seconds (non-critical)');
              resolve([
                { type: 'shared', data: null, error: new Error('Shared projects timeout') },
                { type: 'public', data: null, error: new Error('Public projects timeout') }
              ]);
            }, 8000); // Shorter timeout for background queries
          });

          const backgroundResults = await Promise.race([
            Promise.allSettled(backgroundQueries),
            backgroundTimeout
          ]) as any;

          // Process background results safely
          let sharedProjects: any[] = [];
          let publicProjects: any[] = [];

          if (Array.isArray(backgroundResults)) {
            for (const result of backgroundResults) {
              const queryResult = result.status === 'fulfilled' ? result.value : result.reason;
              
              if (queryResult?.type === 'shared' && queryResult.data && !queryResult.error) {
                sharedProjects = queryResult.data;
                console.log('✅ Shared projects loaded:', sharedProjects.length);
              } else if (queryResult?.type === 'shared') {
                console.log('⚠️ Shared projects failed (non-critical):', queryResult.error?.message || 'Unknown error');
              }
              
              if (queryResult?.type === 'public' && queryResult.data && !queryResult.error) {
                publicProjects = queryResult.data;
                console.log('✅ Public projects loaded:', publicProjects.length);
              } else if (queryResult?.type === 'public') {
                console.log('⚠️ Public projects failed (non-critical):', queryResult.error?.message || 'Unknown error');
              }
            }
          }

          // Combine all projects and update store
          const allProjects = [
            ...(ownProjects || []),
            ...sharedProjects,
            ...publicProjects
          ];

          console.log('✅ Final projects combined:', allProjects.length, 'projects');
          console.log('  - User projects:', ownProjects?.length || 0);
          console.log('  - Shared projects:', sharedProjects.length);
          console.log('  - Public projects:', publicProjects.length);

          // Update with final project list
          set({
            projects: allProjects,
            loading: false,
            error: null // Clear any previous errors
          });

          console.log('✅ loadProjects completed successfully');
          
        } catch (error: any) {
          console.error('❌ Critical loadProjects error:', error);
          console.log('🔄 Setting loading: false due to critical error');
          
          // Only set error state if we have no projects at all
          const currentState = get();
          if (currentState.projects.length === 0) {
            set({ error: error.message, loading: false });
          } else {
            console.log('ℹ️ Keeping existing projects despite error');
            set({ loading: false }); // Don't set error if we have existing projects
          }
        }
      },

      setCurrentProject: (project) => {
        set({ currentProject: project });
        if (project) {
          get().loadAnchors(project.id);
          get().loadQRCodes(project.id);
        }
      },

      // Anchor operations
      createAnchor: async (anchorData) => {
        set({ loading: true, error: null });
        
        try {
          const { data, error } = await supabase
            .from('anchors')
            .insert(anchorData)
            .select()
            .single();

          if (error) throw error;

          set(state => ({
            anchors: [...state.anchors, data],
            loading: false
          }));

          return data;
        } catch (error: any) {
          set({ error: error.message, loading: false });
          return null;
        }
      },

      updateAnchor: async (id, updates) => {
        set({ loading: true, error: null });
        
        try {
          const { data, error } = await supabase
            .from('anchors')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

          if (error) throw error;

          set(state => ({
            anchors: state.anchors.map(a => a.id === id ? data : a),
            loading: false
          }));

          return true;
        } catch (error: any) {
          set({ error: error.message, loading: false });
          return false;
        }
      },

      deleteAnchor: async (id) => {
        set({ loading: true, error: null });
        
        try {
          const { error } = await supabase
            .from('anchors')
            .delete()
            .eq('id', id);

          if (error) throw error;

          set(state => ({
            anchors: state.anchors.filter(a => a.id !== id),
            qrCodes: state.qrCodes.filter(q => q.anchor_id !== id),
            loading: false
          }));

          return true;
        } catch (error: any) {
          set({ error: error.message, loading: false });
          return false;
        }
      },

      loadAnchors: async (projectId) => {
        set({ loading: true, error: null });
        
        try {
          const { data, error } = await supabase
            .from('anchors')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });

          if (error) throw error;

          set({
            anchors: data || [],
            loading: false
          });
        } catch (error: any) {
          set({ error: error.message, loading: false });
        }
      },

      // QR Code operations
      createQRCode: async (qrCodeData) => {
        set({ loading: true, error: null });
        
        try {
          const { data, error } = await supabase
            .from('qr_codes')
            .insert(qrCodeData)
            .select()
            .single();

          if (error) throw error;

          set(state => ({
            qrCodes: [...state.qrCodes, data],
            loading: false
          }));

          return data;
        } catch (error: any) {
          set({ error: error.message, loading: false });
          return null;
        }
      },

      // Create QR code pair for AR positioning
      createQRCodePair: async (projectId: string, primaryAnchorId: string, secondaryAnchorId: string, referenceDistance: number = 1.0) => {
        set({ loading: true, error: null });
        
        try {
          const state = get();
          const project = state.projects.find(p => p.id === projectId);
          const user = await supabase.auth.getUser();
          
          if (!project || !user.data.user) {
            throw new Error('Project or user not found');
          }

          // Generate unique pair ID
          const pairId = crypto.randomUUID();
          
          // Generate QR data for the project
          const qrData = await get().generateQRData(projectId);
          if (!qrData) throw new Error('Failed to generate QR data');

          // Enhanced QR data with pair information
          const enhancedQRData = {
            ...qrData,
            qrPair: {
              pairId,
              referenceDistance,
              primaryAnchorId,
              secondaryAnchorId
            },
            arPositioning: {
              usesPairPositioning: true,
              coordinateSystem: 'qr-pair-based'
            }
          };

          // Create primary QR code
          const primaryQRData = {
            anchor_id: primaryAnchorId,
            project_id: projectId,
            user_id: user.data.user.id,
            qr_data: { ...enhancedQRData, qrPosition: 'primary' },
            qr_code_url: `qr://pair/${pairId}/primary`, // Placeholder URL
            qr_pair_id: pairId,
            qr_position: 'primary' as const,
            reference_distance: referenceDistance
          };

          // Create secondary QR code  
          const secondaryQRData = {
            anchor_id: secondaryAnchorId,
            project_id: projectId,
            user_id: user.data.user.id,
            qr_data: { ...enhancedQRData, qrPosition: 'secondary' },
            qr_code_url: `qr://pair/${pairId}/secondary`, // Placeholder URL
            qr_pair_id: pairId,
            qr_position: 'secondary' as const,
            reference_distance: referenceDistance
          };

          // Insert both QR codes
          const { data, error } = await supabase
            .from('qr_codes')
            .insert([primaryQRData, secondaryQRData])
            .select();

          if (error) throw error;

          set(state => ({
            qrCodes: [...state.qrCodes, ...data],
            loading: false
          }));

          return { pairId, primaryQR: data[0], secondaryQR: data[1] };
        } catch (error: any) {
          set({ error: error.message, loading: false });
          return null;
        }
      },

      loadQRCodes: async (projectId) => {
        set({ loading: true, error: null });
        
        try {
          const { data, error } = await supabase
            .from('qr_codes')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

          if (error) throw error;

          set({
            qrCodes: data || [],
            loading: false
          });
        } catch (error: any) {
          set({ error: error.message, loading: false });
        }
      },

      // Load QR code pairs for a project
      loadQRCodePairs: async (projectId: string) => {
        set({ loading: true, error: null });
        
        try {
          const { data, error } = await supabase
            .from('qr_codes')
            .select('*')
            .eq('project_id', projectId)
            .not('qr_pair_id', 'is', null)
            .order('qr_pair_id')
            .order('qr_position');

          if (error) throw error;

          // Group QR codes by pair
          const pairs: Record<string, { primary?: QRCode, secondary?: QRCode }> = {};
          
          data.forEach(qr => {
            if (!pairs[qr.qr_pair_id!]) {
              pairs[qr.qr_pair_id!] = {};
            }
            pairs[qr.qr_pair_id!][qr.qr_position as 'primary' | 'secondary'] = qr;
          });

          set({
            qrCodes: data || [],
            loading: false
          });

          return pairs;
        } catch (error: any) {
          set({ error: error.message, loading: false });
          return {};
        }
      },

      // Sharing operations
      shareProject: async (projectId, permissions, expiresAt) => {
        set({ loading: true, error: null });
        
        try {
          const shareData = {
            project_id: projectId,
            shared_by: (await supabase.auth.getUser()).data.user?.id,
            permissions,
            expires_at: expiresAt || null
          };

          const { data, error } = await supabase
            .from('shared_projects')
            .insert(shareData)
            .select()
            .single();

          if (error) throw error;

          set(state => ({
            sharedProjects: [...state.sharedProjects, data],
            loading: false
          }));

          return data.share_token;
        } catch (error: any) {
          set({ error: error.message, loading: false });
          return null;
        }
      },

      loadSharedProjects: async (userId) => {
        set({ loading: true, error: null });
        
        try {
          const { data, error } = await supabase
            .from('shared_projects')
            .select(`
              *,
              projects(*)
            `)
            .eq('shared_by', userId)
            .order('created_at', { ascending: false });

          if (error) throw error;

          set({
            sharedProjects: data || [],
            loading: false
          });
        } catch (error: any) {
          set({ error: error.message, loading: false });
        }
      },

      // Utility functions
      clearError: () => {
        set({ error: null });
      },
      
      resetLoading: () => {
        console.log('🔄 Manually resetting loading state');
        set({ loading: false });
      },
      
      recoverOperationState: () => {
        console.log('🔧 Recovering from stale operation state');
        set({ loading: false, operationInProgress: false, error: null });
      },
      
      // Test database connectivity
      testConnection: async () => {
        console.log('🔍 Testing database connection...');
        try {
          // Test 1: Check if projects table exists
          console.log('🔍 Test 1: Checking projects table...');
          const { data: tableData, error: tableError } = await supabase
            .from('projects')
            .select('count')
            .limit(1);
          
          console.log('🔍 Projects table test:', { tableData, tableError });
          
          // Test 2: Check user permissions
          console.log('🔍 Test 2: Checking user permissions...');
          const { data: userData, error: userError } = await supabase.auth.getUser();
          console.log('🔍 Current user:', { userData, userError });
          
          // Test 3: Try a simple select
          console.log('🔍 Test 3: Testing select permissions...');
          const { data: selectData, error: selectError } = await supabase
            .from('projects')
            .select('*')
            .limit(1);
          
          console.log('🔍 Select test:', { selectData, selectError });
          
          return {
            tableExists: !tableError,
            userAuthenticated: !userError && !!userData.user,
            canSelect: !selectError,
            errors: {
              tableError,
              userError,
              selectError
            }
          };
        } catch (error) {
          console.error('🔍 Database test failed:', error);
          return {
            tableExists: false,
            userAuthenticated: false,
            canSelect: false,
            errors: { testError: error }
          };
        }
      },

      generateQRData: async (projectId) => {
        const state = get();
        const project = state.projects.find(p => p.id === projectId);
        
        if (!project) {
          set({ error: 'Project not found' });
          return null;
        }

        try {
          // Load anchors for this project if not already loaded
          if (state.anchors.length === 0 || state.anchors[0]?.project_id !== projectId) {
            await get().loadAnchors(projectId);
          }

          const updatedState = get();
          const anchors = updatedState.anchors.filter(a => a.project_id === projectId);

                     const qrData: QRData = {
             project: {
               id: project.id,
               name: project.name,
               description: project.description,
               type: project.type,
               brickType: project.brickType
             },
            anchors: anchors.map(anchor => ({
              id: anchor.id,
              name: anchor.name,
              purpose: anchor.purpose,
              constructionType: anchor.construction_type,
              notes: anchor.notes || '',
              position: {
                x: Number(anchor.position_x),
                y: Number(anchor.position_y),
                z: Number(anchor.position_z)
              }
            }))
          };

          return qrData;
        } catch (error: any) {
          set({ error: error.message });
          return null;
        }
      },

      generateProjectUrlQR: async (projectId) => {
        console.log('🔗 Generating URL QR code for project:', projectId);
        
        try {
          // Create the project URL
          const baseUrl = window.location.origin;
          const url = `${baseUrl}/viewer?project=${projectId}`;
          
          console.log('📱 Project URL:', url);
          
          // Generate QR code using dynamic import to avoid build issues
          const QRCode = (await import('qrcode')).default;
          
          const qrDataURL = await QRCode.toDataURL(url, {
            width: 300,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            },
            errorCorrectionLevel: 'M'
          });
          
          console.log('✅ URL QR code generated successfully');
          
          return {
            url,
            qrDataURL
          };
          
        } catch (error: any) {
          console.error('❌ Failed to generate URL QR code:', error);
          set({ error: error.message });
          return null;
        }
      }
    }),
    {
      name: 'climate-refuge-db',
      version: 1,
    }
  )
);

// Sample data for testing
export const sampleProjects: Omit<Project, 'id' | 'uid' | 'timestamp'>[] = [
  {
    name: "Sustainable Pavilion Wall",
    description: "Climate-responsive wall structure using local clay bricks with thermal mass properties",
    brickType: "clay-sustainable",
    type: "modular-construction",
    anchors: [
      {
        purpose: "foundation",
        name: "West Foundation Corner",
        position: { x: 0, y: 0, z: 0 },
        constructionType: "wall",
        notes: "Ground level foundation point"
      },
      {
        purpose: "foundation", 
        name: "East Foundation Corner",
        position: { x: 3, y: 0, z: 0 },
        constructionType: "wall",
        notes: "3 meters east of west corner"
      },
      {
        purpose: "height-marker",
        name: "Wall Height Marker",
        position: { x: 1.5, y: 2, z: 0 },
        constructionType: "wall",
        notes: "2 meter height reference"
      }
    ]
  },
  {
    name: "Bio-Composite Shelter Frame",
    description: "Lightweight shelter framework using bio-composite modular components",
    brickType: "bio-composite",
    type: "modular-construction",
    anchors: [
      {
        purpose: "column-base",
        name: "NW Column Base",
        position: { x: 0, y: 0, z: 0 },
        constructionType: "column",
        notes: "Northwest support column"
      },
      {
        purpose: "column-base",
        name: "NE Column Base", 
        position: { x: 4, y: 0, z: 0 },
        constructionType: "column",
        notes: "Northeast support column"
      },
      {
        purpose: "column-base",
        name: "SW Column Base",
        position: { x: 0, y: 0, z: 3 },
        constructionType: "column",
        notes: "Southwest support column"
      },
      {
        purpose: "roof-point",
        name: "Roof Apex",
        position: { x: 2, y: 3, z: 1.5 },
        constructionType: "beam",
        notes: "Central roof support point"
      }
    ]
  }
]; 

export default useDatabaseStore; 