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
  
  // Project operations
  createProject: (project: Omit<Project, 'id' | 'created_at' | 'updated_at'>) => Promise<Project | null>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<boolean>;
  deleteProject: (id: string) => Promise<boolean>;
  loadProjects: (userId: string) => Promise<void>;
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
  generateQRData: (projectId: string) => Promise<QRData | null>;
  
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

      // Project operations
      createProject: async (projectData) => {
        console.log('🗄️ Database: Starting createProject...');
        console.log('🗄️ Database: Project data received:', projectData);
        
        set({ loading: true, error: null });
        
        try {
          console.log('🗄️ Database: Calling Supabase insert...');
          
          // Add timeout to prevent infinite hanging
          const insertPromise = supabase
            .from('projects')
            .insert(projectData)
            .select()
            .single();
          
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Database insert timed out after 10 seconds')), 10000);
          });
          
          const { data, error } = await Promise.race([insertPromise, timeoutPromise]) as any;

          console.log('🗄️ Database: Supabase response:', { data, error });

          if (error) {
            console.log('❌ Database: Supabase error occurred:', error);
            throw error;
          }

          console.log('✅ Database: Project created successfully:', data);
          
          set(state => ({
            projects: [...state.projects, data],
            loading: false
          }));

          console.log('✅ Database: State updated with new project');
          return data;
        } catch (error: any) {
          console.error('💥 Database: Create project error:', error);
          console.error('💥 Database: Error details:', {
            message: error?.message || 'Unknown error',
            code: error?.code || 'No code',
            details: error?.details || 'No details',
            hint: error?.hint || 'No hint'
          });
          set({ error: error.message, loading: false });
          return null;
        }
      },

      updateProject: async (id, updates) => {
        console.log('🗄️ Database: Starting updateProject...');
        console.log('🗄️ Database: Project ID:', id);
        console.log('🗄️ Database: Updates:', updates);
        
        set({ loading: true, error: null });
        
        try {
          console.log('🗄️ Database: Calling Supabase update...');
          const { data, error } = await supabase
            .from('projects')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

          console.log('🗄️ Database: Supabase response:', { data, error });

          if (error) {
            console.log('❌ Database: Supabase error occurred:', error);
            throw error;
          }

          console.log('✅ Database: Project updated successfully:', data);

          set(state => ({
            projects: state.projects.map(p => p.id === id ? data : p),
            currentProject: state.currentProject?.id === id ? data : state.currentProject,
            loading: false
          }));

          console.log('✅ Database: State updated with modified project');
          return true;
        } catch (error: any) {
          console.error('💥 Database: Update project error:', error);
          console.error('💥 Database: Error details:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
          });
          set({ error: error.message, loading: false });
          return false;
        }
      },

      deleteProject: async (id) => {
        set({ loading: true, error: null });
        
        try {
          const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', id);

          if (error) throw error;

          set(state => ({
            projects: state.projects.filter(p => p.id !== id),
            currentProject: state.currentProject?.id === id ? null : state.currentProject,
            anchors: state.anchors.filter(a => a.project_id !== id),
            qrCodes: state.qrCodes.filter(q => q.project_id !== id),
            loading: false
          }));

          return true;
        } catch (error: any) {
          set({ error: error.message, loading: false });
          return false;
        }
      },

      loadProjects: async (userId) => {
        set({ loading: true, error: null });
        
        try {
          // Load user's own projects
          const { data: ownProjects, error: ownError } = await supabase
            .from('projects')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

          if (ownError) throw ownError;

          // Load shared projects
          const { data: sharedProjects, error: sharedError } = await supabase
            .from('projects')
            .select(`
              *,
              shared_projects!inner(permissions, shared_with)
            `)
            .eq('shared_projects.shared_with', userId)
            .order('created_at', { ascending: false });

          if (sharedError && sharedError.code !== 'PGRST116') throw sharedError;

          // Load public projects
          const { data: publicProjects, error: publicError } = await supabase
            .from('projects')
            .select('*')
            .eq('is_public', true)
            .neq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(10);

          if (publicError) throw publicError;

          const allProjects = [
            ...(ownProjects || []),
            ...(sharedProjects || []),
            ...(publicProjects || [])
          ];

          set({
            projects: allProjects,
            loading: false
          });
        } catch (error: any) {
          set({ error: error.message, loading: false });
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