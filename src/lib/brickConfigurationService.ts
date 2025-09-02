import { supabase } from './supabase';
import * as THREE from 'three';
import type { ConnectionPoint } from '../utils/brickConnectionSystem';

export interface BrickConfiguration {
  id: string;
  brick_id: string;
  brick_type: string;
  name?: string;
  description?: string;
  connections: ConnectionPoint[];
  version: string;
  is_default: boolean;
  is_active: boolean;
  created_by?: string;
  organization_id?: string;
  visibility: 'private' | 'team' | 'public';
  created_at: string;
  updated_at: string;
}

export interface CreateBrickConfigurationData {
  brick_id: string;
  brick_type: string;
  name?: string;
  description?: string;
  connections: ConnectionPoint[];
  visibility?: 'private' | 'team' | 'public';
}

export interface UpdateBrickConfigurationData {
  name?: string;
  description?: string;
  connections?: ConnectionPoint[];
  visibility?: 'private' | 'team' | 'public';
}

export class BrickConfigurationService {
  /**
   * Save configuration via pure HTTP (bypassing Supabase client) - Creator Interface Method
   */
  static async saveConfigurationViaHTTP(brickId: string, connections: ConnectionPoint[]): Promise<any> {
    console.log('🌐 Using pure HTTP save (bypassing Supabase client) - Creator Method...');
    
    const startTime = performance.now();
    
    try {
      // Get environment variables
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
      }

      console.log('🔑 Getting authentication token...');
      
      // Get user token from localStorage (Supabase stores it there)
      let accessToken = null;
      
      // Try multiple localStorage keys that Supabase might use
      const possibleKeys = [
        'sb-znsrhgncvmvrpigljhlh-auth-token',
        `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`,
        'supabase.auth.token'
      ];
      
      for (const key of possibleKeys) {
        const authData = localStorage.getItem(key);
        if (authData) {
          try {
            const parsed = JSON.parse(authData);
            if (parsed?.access_token) {
              accessToken = parsed.access_token;
              console.log(`🔑 Found auth token in localStorage: ${key}`);
              break;
            }
          } catch (e) {
            console.log(`⚠️ Could not parse auth data from ${key}`);
          }
        }
      }
      
      // Try getting session from Supabase auth state if no token found
      if (!accessToken) {
        console.log('🔑 Attempting to get user session...');
        try {
          const { data: { session } } = await supabase.auth.getSession();
          
          if (session?.access_token) {
            accessToken = session.access_token;
            console.log('🔑 Got token from Supabase session');
          }
        } catch (sessionError) {
          console.log('⚠️ Could not get session from Supabase auth:', sessionError);
        }
      }
      
      // Fall back to using anon key
      if (!accessToken) {
        console.log('🔑 Using anon key as fallback');
        accessToken = supabaseKey;
      }

      // First, check if configuration already exists (avoid auth.uid() to prevent RLS recursion)
      console.log('🔍 Checking for existing configuration...');
      const checkUrl = `${supabaseUrl}/rest/v1/brick_configurations?brick_id=eq.${brickId}&select=id`;
      
      const checkHeaders = {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${accessToken}`
      };

      const checkController = new AbortController();
      const checkTimeoutId = setTimeout(() => {
        console.log('⏰ Check request timeout - aborting...');
        checkController.abort();
      }, 5000); // 5 second timeout for check
      
      const checkResponse = await fetch(checkUrl, {
        method: 'GET',
        headers: checkHeaders,
        signal: checkController.signal
      });
      
      clearTimeout(checkTimeoutId);
      
      let existingConfigId = null;
      if (checkResponse.ok) {
        const existing = await checkResponse.json();
        if (existing && existing.length > 0) {
          existingConfigId = existing[0].id;
          console.log('✅ Found existing configuration:', existingConfigId);
        }
      } else {
        console.log('⚠️ Check request failed, will attempt to create new:', checkResponse.status);
      }

      // Prepare configuration data
      const configData = {
        brick_id: brickId,
        brick_type: 'octa2',
        name: `My ${brickId} Configuration`,
        description: `Custom connection layout for ${brickId}`,
        connections: connections,
        visibility: 'private'
      };

      // Determine if update or create
      const isUpdate = !!existingConfigId;
      const method = isUpdate ? 'PATCH' : 'POST';
      const url = isUpdate 
        ? `${supabaseUrl}/rest/v1/brick_configurations?id=eq.${existingConfigId}`
        : `${supabaseUrl}/rest/v1/brick_configurations`;
      
      const headers = {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${accessToken}`,
        'Prefer': 'return=representation'
      };

      console.log(`🌐 Making ${method} request to brick_configurations table...`);
      console.log('🌐 URL:', url);
      console.log('🌐 Headers:', { ...headers, Authorization: 'Bearer [hidden]' });
      console.log('🌐 Data:', configData);

      // Make the HTTP request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('⏰ HTTP request timeout - aborting...');
        controller.abort();
      }, 15000); // 15 second timeout
      
      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(configData),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      const totalTime = performance.now() - startTime;
      console.log(`🌐 HTTP response status: ${response.status} in ${totalTime.toFixed(2)}ms`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ HTTP request failed:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log(`🎉 HTTP brick configuration save successful in ${totalTime.toFixed(2)}ms:`, result);
      
      return result;
      
    } catch (error: any) {
      const totalTime = performance.now() - startTime;
      console.error(`❌ HTTP save failed after ${totalTime.toFixed(2)}ms:`, error);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout - server took too long to respond');
      }
      
      throw error;
    }
  }

  /**
   * Test database connection and table accessibility
   */
  static async testDatabaseConnection(): Promise<void> {
    console.log('🔍 Testing database connection and table accessibility...');
    
    try {
      console.log('🔐 Testing authentication...');
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        console.error('❌ Auth error:', authError);
        return;
      }
      
      console.log('✅ User authenticated:', { userId: user?.id, email: user?.email });
      
      console.log('🏗️ Testing table access...');
      const { data, error, count } = await supabase
        .from('brick_configurations')
        .select('id', { count: 'exact', head: true });
        
      if (error) {
        console.error('❌ Table access error:', error);
        console.error('📄 Error details:', { code: error.code, message: error.message, details: error.details, hint: error.hint });
        
        if (error.code === '42P01') {
          console.error('🚨 TABLE DOES NOT EXIST! You need to run the database migration first.');
        } else if (error.code === '42501') {
          console.error('🚨 PERMISSION DENIED! Check RLS policies.');
        }
        return;
      }
      
      console.log('✅ Table accessible, record count:', count);
      
    } catch (error) {
      console.error('❌ Database connection test failed:', error);
    }
  }

  /**
   * Get all accessible brick configurations for the current user
   */
  static async getBrickConfigurations(brickType?: string): Promise<BrickConfiguration[]> {
    try {
      let query = supabase
        .from('brick_configurations')
        .select('*')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('updated_at', { ascending: false });

      if (brickType) {
        query = query.eq('brick_type', brickType);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching brick configurations:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to fetch brick configurations:', error);
      return [];
    }
  }

  /**
   * Get a specific brick configuration by ID
   */
  static async getBrickConfiguration(id: string): Promise<BrickConfiguration | null> {
    try {
      const { data, error } = await supabase
        .from('brick_configurations')
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .single();

      if (error) {
        console.error('Error fetching brick configuration:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Failed to fetch brick configuration:', error);
      return null;
    }
  }

  /**
   * Get the default configuration for a brick type
   */
  static async getDefaultConfiguration(brickType: string): Promise<BrickConfiguration | null> {
    try {
      const { data, error } = await supabase
        .from('brick_configurations')
        .select('*')
        .eq('brick_type', brickType)
        .eq('is_default', true)
        .eq('is_active', true)
        .single();

      if (error) {
        console.error('Error fetching default configuration:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Failed to fetch default configuration:', error);
      return null;
    }
  }

  /**
   * Get user's saved configuration for a specific brick
   */
  static async getUserConfiguration(brickId: string, userId?: string): Promise<BrickConfiguration | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const targetUserId = userId || user?.id;

      if (!targetUserId) {
        return null;
      }

      const { data, error } = await supabase
        .from('brick_configurations')
        .select('*')
        .eq('brick_id', brickId)
        .eq('created_by', targetUserId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        // If no user configuration found, that's normal - not an error
        if (error.code === 'PGRST116') {
          return null;
        }
        console.error('Error fetching user configuration:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Failed to fetch user configuration:', error);
      return null;
    }
  }

  /**
   * Create a new brick configuration
   */
  static async createBrickConfiguration(configData: CreateBrickConfigurationData): Promise<BrickConfiguration | null> {
    console.log('➕ createBrickConfiguration() - START');
    console.log('📊 Input data:', configData);
    
    const startTime = performance.now();
    
    try {
      console.log('🔐 Getting authenticated user for create...');
      const authStart = performance.now();
      
      const { data: { user } } = await supabase.auth.getUser();
      
      const authTime = performance.now() - authStart;
      console.log(`✅ Auth check for create completed in ${authTime.toFixed(2)}ms:`, { userId: user?.id });

      if (!user) {
        throw new Error('User must be authenticated to create configurations');
      }

      const insertData = {
        ...configData,
        created_by: user.id,
        visibility: configData.visibility || 'private'
      };
      
      console.log('📝 Prepared insert data:', insertData);
      console.log('🔄 Executing Supabase INSERT...');
      const dbStart = performance.now();

      const { data, error } = await supabase
        .from('brick_configurations')
        .insert(insertData)
        .select()
        .single();

      const dbTime = performance.now() - dbStart;
      console.log(`⏱️ Database INSERT completed in ${dbTime.toFixed(2)}ms`);

      if (error) {
        console.error('❌ Supabase INSERT error:', error);
        console.error('📄 Error details:', { code: error.code, message: error.message, details: error.details });
        throw error;
      }

      const totalTime = performance.now() - startTime;
      console.log(`🎉 createBrickConfiguration() - SUCCESS in ${totalTime.toFixed(2)}ms:`, data);
      
      return data;
    } catch (error) {
      const totalTime = performance.now() - startTime;
      console.error(`❌ createBrickConfiguration() - FAILED after ${totalTime.toFixed(2)}ms:`, error);
      return null;
    }
  }

  /**
   * Update an existing brick configuration
   */
  static async updateBrickConfiguration(id: string, updates: UpdateBrickConfigurationData): Promise<BrickConfiguration | null> {
    console.log('🔄 updateBrickConfiguration() - START');
    console.log('📊 Input:', { id, updates });
    
    const startTime = performance.now();
    
    try {
      console.log('🔄 Executing Supabase UPDATE...');
      const dbStart = performance.now();

      const { data, error } = await supabase
        .from('brick_configurations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      const dbTime = performance.now() - dbStart;
      console.log(`⏱️ Database UPDATE completed in ${dbTime.toFixed(2)}ms`);

      if (error) {
        console.error('❌ Supabase UPDATE error:', error);
        console.error('📄 Error details:', { code: error.code, message: error.message, details: error.details });
        throw error;
      }

      const totalTime = performance.now() - startTime;
      console.log(`🎉 updateBrickConfiguration() - SUCCESS in ${totalTime.toFixed(2)}ms:`, data);
      
      return data;
    } catch (error) {
      const totalTime = performance.now() - startTime;
      console.error(`❌ updateBrickConfiguration() - FAILED after ${totalTime.toFixed(2)}ms:`, error);
      return null;
    }
  }

  /**
   * Save or update user's configuration for a specific brick
   */
  static async saveUserConfiguration(
    brickId: string, 
    connections: ConnectionPoint[], 
    name?: string,
    description?: string
  ): Promise<BrickConfiguration | null> {
    console.log('🔐 saveUserConfiguration() - START');
    console.log(`📊 Input:`, { brickId, connectionCount: connections.length, name, description });
    
    const startTime = performance.now();
    
    try {
      console.log('🔐 Step 1: Getting authenticated user...');
      const authStart = performance.now();
      
      const { data: { user } } = await supabase.auth.getUser();
      
      const authTime = performance.now() - authStart;
      console.log(`✅ Auth check completed in ${authTime.toFixed(2)}ms:`, { userId: user?.id, email: user?.email });

      if (!user) {
        console.warn('❌ User not authenticated, skipping database save');
        return null;
      }

      console.log('🔍 Step 2: Checking for existing configuration...');
      const existingStart = performance.now();
      
      // Check if user already has a configuration for this brick
      const existing = await this.getUserConfiguration(brickId);
      
      const existingTime = performance.now() - existingStart;
      console.log(`✅ Existing config check completed in ${existingTime.toFixed(2)}ms:`, { hasExisting: !!existing, existingId: existing?.id });

      const configData = {
        connections,
        name: name || `My ${brickId} Configuration`,
        description: description || `Custom connection layout for ${brickId}`,
      };
      
      console.log('📝 Configuration data prepared:', configData);

      let result;
      if (existing) {
        console.log('🔄 Step 3: Updating existing configuration...');
        const updateStart = performance.now();
        
        // Update existing configuration
        result = await this.updateBrickConfiguration(existing.id, configData);
        
        const updateTime = performance.now() - updateStart;
        console.log(`✅ Update completed in ${updateTime.toFixed(2)}ms:`, result);
      } else {
        console.log('➕ Step 3: Creating new configuration...');
        const createStart = performance.now();
        
        // Create new configuration
        result = await this.createBrickConfiguration({
          brick_id: brickId,
          brick_type: 'octa2', // Default to octa2, could be parameterized
          ...configData,
          visibility: 'private'
        });
        
        const createTime = performance.now() - createStart;
        console.log(`✅ Create completed in ${createTime.toFixed(2)}ms:`, result);
      }
      
      const totalTime = performance.now() - startTime;
      console.log(`🎉 saveUserConfiguration() - SUCCESS in ${totalTime.toFixed(2)}ms`);
      
      return result;
    } catch (error) {
      const totalTime = performance.now() - startTime;
      console.error(`❌ saveUserConfiguration() - FAILED after ${totalTime.toFixed(2)}ms:`, error);
      return null;
    }
  }

  /**
   * Delete a brick configuration
   */
  static async deleteBrickConfiguration(id: string): Promise<boolean> {
    try {
      // Soft delete by setting is_active to false
      const { error } = await supabase
        .from('brick_configurations')
        .update({ is_active: false })
        .eq('id', id);

      if (error) {
        console.error('Error deleting brick configuration:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to delete brick configuration:', error);
      return false;
    }
  }

  /**
   * Load configuration from database or fallback to localStorage
   */
  static async loadConfiguration(brickId: string): Promise<ConnectionPoint[] | null> {
    try {
      // First try to load user configuration from database
      const dbConfig = await this.getUserConfiguration(brickId);
      if (dbConfig?.connections && Array.isArray(dbConfig.connections)) {
        // Validate database connections
        const validConnections = dbConfig.connections.filter(conn => 
          conn && 
          typeof conn.id === 'string' && 
          typeof conn.type === 'string' &&
          conn.localPosition &&
          typeof conn.localPosition.x === 'number'
        );
        
        if (validConnections.length > 0) {
          return validConnections;
        }
      }
      
      // Try to load default configuration if no user config
      console.log('🔍 No user config found, checking for default configuration...');
      const { data: defaultConfig, error } = await supabase
        .from('brick_configurations')
        .select('*')
        .eq('brick_id', brickId)
        .eq('is_default', true)
        .eq('visibility', 'public')
        .single();
        
      if (!error && defaultConfig?.connections) {
        console.log('✅ Found default configuration for', brickId);
        // Parse connections if it's a string
        const connections = typeof defaultConfig.connections === 'string' 
          ? JSON.parse(defaultConfig.connections) 
          : defaultConfig.connections;
          
        if (Array.isArray(connections)) {
          return connections;
        }
      }

      // Fallback to localStorage if no database config
      const localData = localStorage.getItem(`brick-connections-${brickId}`);
      if (localData) {
        const parsed = JSON.parse(localData);
        if (parsed.connections && Array.isArray(parsed.connections)) {
          return parsed.connections.map((conn: any) => {
            // Validate and ensure proper structure
            if (!conn.id || !conn.type || !conn.localPosition) {
              return null;
            }
            
            return {
              id: conn.id,
              type: conn.type,
              axis: conn.axis || 'y',
              localPosition: new THREE.Vector3(
                conn.localPosition.x || 0,
                conn.localPosition.y || 0,
                conn.localPosition.z || 0
              ),
              localRotation: new THREE.Euler(
                conn.localRotation?.x || 0,
                conn.localRotation?.y || 0,
                conn.localRotation?.z || 0
              ),
              strength: conn.strength || 1.0,
              isConnected: conn.isConnected || false
            };
          }).filter(Boolean); // Remove null entries
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to load configuration:', error);
      // Clear corrupted localStorage data
      try {
        localStorage.removeItem(`brick-connections-${brickId}`);
      } catch (e) {
        console.error('Failed to clear corrupted localStorage:', e);
      }
      return null;
    }
  }

  /**
   * Save configuration to both database and localStorage for redundancy
   */
  static async saveConfiguration(brickId: string, connections: ConnectionPoint[]): Promise<void> {
    console.log('💾 BrickConfigurationService.saveConfiguration() - START');
    console.log(`📊 Input data:`, { brickId, connectionCount: connections.length, connections });
    
    const startTime = performance.now();
    
    try {
      console.log('🎯 Step 1: Attempting HTTP database save (Creator Method)...');
      const dbSaveStart = performance.now();
      
      // Save to database using HTTP method (bypasses Supabase client auth issues)
      const dbResult = await this.saveConfigurationViaHTTP(brickId, connections);
      
      const dbSaveTime = performance.now() - dbSaveStart;
      console.log(`✅ HTTP database save completed in ${dbSaveTime.toFixed(2)}ms:`, dbResult);

      console.log('🎯 Step 2: Saving to localStorage as backup...');
      const localSaveStart = performance.now();

      // Also save to localStorage as backup
      const serializedConnections = connections.map(conn => ({
        id: conn.id,
        type: conn.type,
        axis: conn.axis,
        localPosition: {
          x: conn.localPosition.x,
          y: conn.localPosition.y,
          z: conn.localPosition.z
        },
        localRotation: {
          x: conn.localRotation.x,
          y: conn.localRotation.y,
          z: conn.localRotation.z
        },
        strength: conn.strength,
        isConnected: conn.isConnected
      }));

      localStorage.setItem(`brick-connections-${brickId}`, JSON.stringify({
        connections: serializedConnections,
        savedAt: new Date().toISOString(),
        version: '1.0'
      }));

      const localSaveTime = performance.now() - localSaveStart;
      console.log(`✅ localStorage save completed in ${localSaveTime.toFixed(2)}ms`);
      
      const totalTime = performance.now() - startTime;
      console.log(`🎉 BrickConfigurationService.saveConfiguration() - SUCCESS in ${totalTime.toFixed(2)}ms`);

    } catch (error) {
      const totalTime = performance.now() - startTime;
      console.error(`❌ BrickConfigurationService.saveConfiguration() - FAILED after ${totalTime.toFixed(2)}ms:`, error);
      
      // Try to save only to localStorage as fallback
      try {
        console.log('🔄 Attempting localStorage-only fallback...');
        const serializedConnections = connections.map(conn => ({
          id: conn.id,
          type: conn.type,
          axis: conn.axis,
          localPosition: {
            x: conn.localPosition.x,
            y: conn.localPosition.y,
            z: conn.localPosition.z
          },
          localRotation: {
            x: conn.localRotation.x,
            y: conn.localRotation.y,
            z: conn.localRotation.z
          },
          strength: conn.strength,
          isConnected: conn.isConnected
        }));

        localStorage.setItem(`brick-connections-${brickId}`, JSON.stringify({
          connections: serializedConnections,
          savedAt: new Date().toISOString(),
          version: '1.0',
          fallbackSave: true
        }));
        
        console.log('✅ Fallback localStorage save successful');
      } catch (fallbackError) {
        console.error('❌ Even fallback localStorage save failed:', fallbackError);
      }
      
      throw error;
    }
  }
}