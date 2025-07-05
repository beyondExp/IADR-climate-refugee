import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from './ui/button';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useDatabaseStore } from '../stores/database';
import QRCodeManager from './QRCodeManager';
import ProjectModal from './ProjectModal';
import QRCodePairGenerator from './QRCodePairGenerator';
import Viewport3D from './viewport/Viewport3D';
import type { Project } from '../types';
import type { User } from '@supabase/supabase-js';
import '../styles/enhanced-creator.css';

interface EnhancedCreatorInterfaceProps {
  onBack?: () => void;
}

interface SceneObject {
  id: string;
  name: string;
  type: 'brick' | 'anchor' | 'group';
  visible: boolean;
  locked: boolean;
  children?: SceneObject[];
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
}

interface ObjectProperties {
  id: string;
  name: string;
  type: 'brick' | 'anchor' | 'group';
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  visible: boolean;
  locked: boolean;
  material?: string;
  color?: string;
  opacity?: number;
  metadata?: Record<string, any>;
}

interface HistoryState {
  sceneObjects: SceneObject[];
  selectedObjects: string[];
  timestamp: number;
  action: string;
}

export default function EnhancedCreatorInterface({ onBack }: EnhancedCreatorInterfaceProps) {
  const { user } = useAuth();
  const { 
    projects, 
    createProject, 
    updateProject, 
    setCurrentProject,
    testConnection
  } = useDatabaseStore();

  console.log('🏗️ EnhancedCreatorInterface: Component loaded');
  console.log('👤 Current user:', user ? { id: user.id, email: user.email } : 'Not authenticated');
  console.log('📂 Projects in store:', projects.length);

  // Panel visibility state
  const [isOutlinerVisible, setIsOutlinerVisible] = useState(true);
  const [isPropertyVisible, setIsPropertyVisible] = useState(true);
  const [isMaterialVisible, setIsMaterialVisible] = useState(true);
  const [isQRVisible, setIsQRVisible] = useState(false);
  const [isQRManagerVisible, setIsQRManagerVisible] = useState(false);
  const [isProjectModalVisible, setIsProjectModalVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Viewport settings
  const [viewportSettings] = useState({
    gridVisible: true,
    snapEnabled: true,
    viewMode: 'solid' as 'wireframe' | 'solid' | 'textured'
  });

  // Selection state
  const [selectedObjects, setSelectedObjects] = useState<string[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState('clay-sustainable');

  // Scene state - Demo scene with some objects
  const [sceneObjects, setSceneObjects] = useState<SceneObject[]>([
    {
      id: 'brick-foundation-1',
      name: 'Foundation Brick 1',
      type: 'brick',
      visible: true,
      locked: false,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    },
    {
      id: 'brick-foundation-2', 
      name: 'Foundation Brick 2',
      type: 'brick',
      visible: true,
      locked: false,
      position: { x: 1, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    },
    {
      id: 'brick-foundation-3',
      name: 'Foundation Brick 3', 
      type: 'brick',
      visible: true,
      locked: false,
      position: { x: 2, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    },
    {
      id: 'brick-wall-1',
      name: 'Wall Brick 1',
      type: 'brick',
      visible: true,
      locked: false,
      position: { x: -1, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    },
    {
      id: 'anchor-foundation',
      name: 'Foundation Anchor',
      type: 'anchor',
      visible: true,
      locked: false,
      position: { x: 0, y: 0.5, z: 2 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    }
  ]);

  // History management for undo/redo
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isUndoRedoOperation, setIsUndoRedoOperation] = useState(false);

  // Initialize history with current state
  useEffect(() => {
    if (history.length === 0) {
      const initialState: HistoryState = {
        sceneObjects: sceneObjects,
        selectedObjects: selectedObjects,
        timestamp: Date.now(),
        action: 'Initial State'
      };
      setHistory([initialState]);
      setHistoryIndex(0);
    }
  }, []);

  // Add state to history (called after any significant change)
  const addToHistory = (action: string) => {
    if (isUndoRedoOperation) return; // Don't add undo/redo operations to history

    const newState: HistoryState = {
      sceneObjects: [...sceneObjects],
      selectedObjects: [...selectedObjects],
      timestamp: Date.now(),
      action
    };

    // Remove any history after current index (for when we make changes after undoing)
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newState);

    // Limit history to 50 states to prevent memory issues
    const limitedHistory = newHistory.slice(-50);
    
    setHistory(limitedHistory);
    setHistoryIndex(limitedHistory.length - 1);
  };

  // Undo function
  const undo = () => {
    if (historyIndex > 0) {
      setIsUndoRedoOperation(true);
      const previousState = history[historyIndex - 1];
      setSceneObjects(previousState.sceneObjects);
      setSelectedObjects(previousState.selectedObjects);
      setHistoryIndex(historyIndex - 1);
      setTimeout(() => setIsUndoRedoOperation(false), 0);
    }
  };

  // Redo function
  const redo = () => {
    if (historyIndex < history.length - 1) {
      setIsUndoRedoOperation(true);
      const nextState = history[historyIndex + 1];
      setSceneObjects(nextState.sceneObjects);
      setSelectedObjects(nextState.selectedObjects);
      setHistoryIndex(historyIndex + 1);
      setTimeout(() => setIsUndoRedoOperation(false), 0);
    }
  };

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Z for undo
      if (event.ctrlKey && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      // Ctrl+Y or Ctrl+Shift+Z for redo
      else if ((event.ctrlKey && event.key === 'y') || 
               (event.ctrlKey && event.shiftKey && event.key === 'z')) {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history]);

  // Property form state for editing
  const [propertyForm, setPropertyForm] = useState({
    name: '',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }
  });

  // Update property form when selection changes
  useEffect(() => {
    if (selectedObjects.length === 1) {
      const selectedObj = sceneObjects.find(obj => obj.id === selectedObjects[0]);
      if (selectedObj) {
        setPropertyForm({
          name: selectedObj.name,
          position: selectedObj.position || { x: 0, y: 0, z: 0 },
          rotation: selectedObj.rotation || { x: 0, y: 0, z: 0 },
          scale: selectedObj.scale || { x: 1, y: 1, z: 1 }
        });
      }
    }
  }, [selectedObjects, sceneObjects]);

  // Current selection properties
  const selectedObjectProperties: ObjectProperties | undefined = selectedObjects.length === 1 ? {
    id: selectedObjects[0],
    name: sceneObjects.find(obj => obj.id === selectedObjects[0])?.name || 'Unknown',
    type: sceneObjects.find(obj => obj.id === selectedObjects[0])?.type || 'brick',
    position: sceneObjects.find(obj => obj.id === selectedObjects[0])?.position || { x: 0, y: 0, z: 0 },
    rotation: sceneObjects.find(obj => obj.id === selectedObjects[0])?.rotation || { x: 0, y: 0, z: 0 },
    scale: sceneObjects.find(obj => obj.id === selectedObjects[0])?.scale || { x: 1, y: 1, z: 1 },
    visible: sceneObjects.find(obj => obj.id === selectedObjects[0])?.visible || true,
    locked: sceneObjects.find(obj => obj.id === selectedObjects[0])?.locked || false,
    material: selectedMaterial,
    color: '#8B4513',
    opacity: 1.0,
    metadata: {
      brickType: selectedMaterial,
      sustainability: 'High',
      thermalRating: '4/5'
    }
  } : undefined;

  const handleSelectionChange = (selection: string[]) => {
    setSelectedObjects(selection);
  };

  const handleObjectSelect = (objectId: string, multiSelect = false) => {
    if (multiSelect) {
      setSelectedObjects(prev => 
        prev.includes(objectId) 
          ? prev.filter(id => id !== objectId)
          : [...prev, objectId]
      );
    } else {
      setSelectedObjects([objectId]);
    }
  };

  const handleObjectToggleVisibility = (objectId: string) => {
    setSceneObjects(prev => 
      prev.map(obj => 
        obj.id === objectId ? { ...obj, visible: !obj.visible } : obj
      )
    );
    setTimeout(() => addToHistory('Toggle Visibility'), 0);
  };

  const handleObjectToggleLock = (objectId: string) => {
    setSceneObjects(prev => 
      prev.map(obj => 
        obj.id === objectId ? { ...obj, locked: !obj.locked } : obj
      )
    );
    setTimeout(() => addToHistory('Toggle Lock'), 0);
  };

  const handleObjectTransform = (objectId: string, transforms: { 
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
  }) => {
    setSceneObjects(prev => prev.map(obj => 
      obj.id === objectId 
        ? { 
            ...obj, 
            position: transforms.position || obj.position,
            rotation: transforms.rotation || obj.rotation,
            scale: transforms.scale || obj.scale
          }
        : obj
    ));

    // Update property form if this is the selected object
    if (selectedObjects.includes(objectId)) {
      setPropertyForm(prev => ({
        name: prev.name,
        position: transforms.position || prev.position,
        rotation: transforms.rotation || prev.rotation,
        scale: transforms.scale || prev.scale
      }));
    }

    // Add to history with a slight delay to capture final transform state
    setTimeout(() => addToHistory('Transform Object'), 100);
  };

  const handlePropertyApply = () => {
    if (selectedObjects.length === 1) {
      const objectId = selectedObjects[0];
      setSceneObjects(prev => 
        prev.map(obj => 
          obj.id === objectId ? { 
            ...obj, 
            name: propertyForm.name,
            position: propertyForm.position,
            rotation: propertyForm.rotation,
            scale: propertyForm.scale
          } : obj
        )
      );
      setTimeout(() => addToHistory('Apply Properties'), 0);
    }
  };

  const handlePropertyReset = () => {
    if (selectedObjects.length === 1) {
      const obj = sceneObjects.find(o => o.id === selectedObjects[0]);
      if (obj) {
        setPropertyForm({
          name: obj.name,
          position: obj.position || { x: 0, y: 0, z: 0 },
          rotation: obj.rotation || { x: 0, y: 0, z: 0 },
          scale: obj.scale || { x: 1, y: 1, z: 1 }
        });
      }
    }
  };

  const handleMaterialSelect = (materialId: string) => {
    setSelectedMaterial(materialId);
  };

  const addNewObject = () => {
    const brickCount = sceneObjects.filter(obj => obj.type === 'brick').length;
    const newObject: SceneObject = {
      id: `brick-${Date.now()}`, // Use timestamp for unique IDs
      name: `Sustainable Brick ${brickCount + 1}`,
      type: 'brick',
      visible: true,
      locked: false,
      position: { x: brickCount % 5, y: 0, z: Math.floor(brickCount / 5) * 0.5 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    };
    setSceneObjects(prev => [...prev, newObject]);
    setTimeout(() => addToHistory('Add Object'), 0);
  };

  const deleteSelectedObjects = () => {
    setSceneObjects(prev => prev.filter(obj => !selectedObjects.includes(obj.id)));
    setSelectedObjects([]);
    setTimeout(() => addToHistory('Delete Objects'), 0);
  };

  // Project management
  const handleSaveProject = async () => {
    console.log('🚀 Starting project save process...');
    
    if (!user) {
      console.log('❌ No user found, aborting save');
      alert('Please log in to save projects');
      return;
    }

    console.log('✅ User authenticated:', user.id);
    setIsSaving(true);
    
    try {
      console.log('📋 Current projects array:', projects);
      console.log('🎯 Current selected material:', selectedMaterial);
      
      const projectData = {
        user_id: user.id,
        name: projects[0]?.name || `Climate Refuge Project ${new Date().toLocaleDateString()}`,
        description: projects[0]?.description || 'Sustainable construction project',
        brick_type: selectedMaterial,
        type: 'modular-construction' as const,
        is_public: false
      };

      console.log('📦 Project data prepared:', projectData);

      let savedProject;
      if (projects[0]?.id) {
        console.log('🔄 Updating existing project with ID:', projects[0].id);
        console.log('📝 Update data:', projectData);
        
        const success = await updateProject(projects[0].id, projectData);
        console.log('✅ Update result:', success);
        
        if (success) {
          savedProject = { ...projects[0], ...projectData };
          console.log('✅ Saved project (update):', savedProject);
        } else {
          console.log('❌ Update failed');
        }
      } else {
        console.log('🆕 Creating new project...');
        console.log('📝 Create data:', projectData);
        
        const newProject = await createProject(projectData);
        console.log('✅ Create result:', newProject);
        
        if (newProject) {
          // Convert to local project format for state management
          const localProject = {
            ...newProject,
            uid: newProject.id,
            brickType: (newProject as any).brick_type,
            anchors: (newProject as any).anchors || [],
            timestamp: (newProject as any).created_at
          }
          console.log('🔄 Converted to local project format:', localProject);
          setCurrentProject(localProject as any)
          savedProject = localProject;
        } else {
          console.log('❌ Create project returned null');
        }
      }

      console.log('🎯 Final saved project result:', savedProject);

      if (savedProject) {
        console.log('✅ Project saved successfully!');
        alert('Project saved successfully!');
        
        // Create anchors from scene objects
        // TODO: Implement anchor creation from sceneObjects
        console.log('📐 Scene objects to convert to anchors:', sceneObjects);
        
      } else {
        console.log('❌ No saved project result');
        throw new Error('Failed to save project');
      }
    } catch (error: any) {
      console.error('💥 Save error:', error);
      console.error('💥 Error details:', {
        message: error?.message || 'Unknown error',
        stack: error?.stack || 'No stack trace',
        name: error?.name || 'Unknown error type'
      });
      alert('Failed to save project. Please try again.');
    } finally {
      console.log('🏁 Save process completed, setting isSaving to false');
      setIsSaving(false);
      
      // Reset status after delay
      setTimeout(() => {
        console.log('⏰ Post-save cleanup completed');
      }, 2000);
    }
  };

  const handleLoadProject = () => {
    setIsProjectModalVisible(true);
  };

  const handleNewProject = () => {
    setCurrentProject(null);
    setSceneObjects([]);
    setSelectedObjects([]);
    // Reset history
    setHistory([{
      sceneObjects: [],
      selectedObjects: [],
      timestamp: Date.now(),
      action: 'New Project'
    }]);
    setHistoryIndex(0);
    setIsProjectModalVisible(false);
    addToHistory('New Project Created');
  };

  const handleSelectProject = (project: Project) => {
    // Project is already in local format from ProjectModal
    setCurrentProject(project);
    
    // Load project data into scene if anchors exist
    const projectObjects: SceneObject[] = project.anchors ? project.anchors.map((anchor, index) => ({
      id: `anchor-${index}`,
      name: anchor.name,
      type: 'anchor' as const,
      visible: true,
      locked: false,
      position: { 
        x: anchor.position.x, 
        y: anchor.position.y, 
        z: anchor.position.z 
      },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    })) : [];
    
    setSceneObjects(projectObjects);
    setSelectedObjects([]);
    
    // Reset history with loaded project
    setHistory([{
      sceneObjects: projectObjects,
      selectedObjects: [],
      timestamp: Date.now(),
      action: 'Project Loaded'
    }]);
    setHistoryIndex(0);
    
    setIsProjectModalVisible(false);
    addToHistory('Project Loaded');
  };

  // Helper functions for undo/redo button states
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const currentHistoryAction = history[historyIndex]?.action || 'Unknown';
  const undoAction = canUndo ? history[historyIndex - 1]?.action : null;
  const redoAction = canRedo ? history[historyIndex + 1]?.action : null;

  // Test database connectivity
  const handleTestDatabase = async () => {
    console.log('🔍 Starting database connectivity test...');
    
    try {
      // Check environment variables first
      console.log('🔍 Checking environment variables...');
      console.log('VITE_SUPABASE_URL:', import.meta.env.VITE_SUPABASE_URL);
      console.log('VITE_SUPABASE_ANON_KEY exists:', !!import.meta.env.VITE_SUPABASE_ANON_KEY);
      console.log('VITE_SUPABASE_ANON_KEY length:', import.meta.env.VITE_SUPABASE_ANON_KEY?.length);
      
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        alert('❌ Environment variables missing! Check your .env file');
        return;
      }
      
      console.log('✅ Supabase client ready (using static import)');
      
      // Test 0: Basic auth connectivity test
      console.log('🔍 Test 0: Basic connectivity test...');
      try {
        const authTestPromise = supabase.auth.getSession();
        const authTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Auth test timed out')), 3000);
        });
        
        const authResult = await Promise.race([authTestPromise, authTimeoutPromise]);
        console.log('✅ Basic connectivity test passed:', !!authResult);
      } catch (authError) {
        console.log('❌ Basic connectivity test failed:', authError);
        alert('❌ Basic Supabase connectivity failed. Check your network connection.');
        return;
      }
      
      // Test 1: Simple select
      console.log('🔍 Test 1: Simple select...');
      console.log('🔍 Making request to projects table...');
      
      // Add timeout and more detailed logging
      const selectPromise = supabase
        .from('projects')
        .select('*')
        .limit(1);
      
      console.log('🔍 Query object created, executing...');
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Select query timed out after 5 seconds')), 5000);
      });
      
      const { data: selectData, error: selectError } = await Promise.race([
        selectPromise,
        timeoutPromise
      ]) as any;
      
      console.log('Select result:', { selectData, selectError });
      
      if (selectError) {
        console.log('❌ Select failed:', selectError);
        alert(`Select test failed: ${selectError.message}`);
        return;
      }
      
      // Test 2: Direct insert
      console.log('🔍 Test 2: Direct insert test...');
      const testProjectData = {
        user_id: user!.id,
        name: 'Direct Test Project',
        description: 'Testing direct insert',
        brick_type: 'clay-sustainable',
        type: 'modular-construction' as const,
        is_public: false
      };
      
      console.log('Insert data:', testProjectData);
      
      const { data: insertResult, error: insertError } = await supabase
        .from('projects')
        .insert(testProjectData)
        .select()
        .single();
      
      console.log('Insert result:', { insertResult, insertError });
      
      if (insertError) {
        console.log('❌ Insert failed:', insertError);
        alert(`Insert test failed: ${insertError.message} (Code: ${insertError.code})`);
        return;
      }
      
      // Test 3: Clean up
      if (insertResult) {
        console.log('🔍 Test 3: Cleaning up...');
        const { error: deleteError } = await supabase
          .from('projects')
          .delete()
          .eq('id', insertResult.id);
        
        console.log('Delete result:', deleteError);
      }
      
      console.log('✅ All database tests passed!');
      alert('✅ Database test successful! The issue might be with the store wrapper.');
      
    } catch (error: any) {
      console.error('💥 Database test error:', error);
      alert(`Database test error: ${error.message}`);
    }
  };

  // Direct save bypassing store (since store has issues)
  const handleDirectSave = async () => {
    console.log('🚀 Starting DIRECT save (bypassing store)...');
    
    if (!user) {
      alert('Please log in to save projects');
      return;
    }

    setIsSaving(true);
    
    try {
      const projectData = {
        user_id: user.id,
        name: `Climate Refuge Project ${new Date().toLocaleDateString()}`,
        description: 'Sustainable construction project',
        brick_type: selectedMaterial,
        type: 'modular-construction' as const,
        is_public: false
      };

      console.log('📦 Direct save data:', projectData);

      // Direct Supabase call (no store wrapper)
      const { data, error } = await supabase
        .from('projects')
        .insert(projectData)
        .select()
        .single();

      console.log('✅ Direct save result:', { data, error });

      if (error) {
        throw error;
      }

      if (data) {
        alert('✅ Direct save successful!');
        console.log('✅ Project saved directly:', data);
      }

    } catch (error: any) {
      console.error('💥 Direct save error:', error);
      alert(`Direct save failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestDatabaseDirect = async () => {
    console.log('🧪 Testing direct Supabase database operations...');
    
    if (!user) {
      console.log('❌ No user for direct test');
      return;
    }

    try {
      // Test 1: Check if we can select from projects table
      console.log('🔍 Test 1: Checking table access...');
      const { data: tableCheck, error: tableError } = await supabase
        .from('projects')
        .select('count(*)')
        .limit(1);
      
      console.log('📊 Table access result:', { tableCheck, tableError });

      // Test 2: Try direct insert with minimal data
      console.log('🔍 Test 2: Direct insert test...');
      const testProject = {
        user_id: user.id,
        name: 'Test Project ' + Date.now(),
        description: 'Direct test project',
        brick_type: 'clay-sustainable',
        type: 'modular-construction',
        is_public: false
      };

      console.log('📝 Test project data:', testProject);

      const { data: insertResult, error: insertError } = await supabase
        .from('projects')
        .insert(testProject)
        .select()
        .single();

      console.log('💾 Direct insert result:', { insertResult, insertError });

      if (insertResult) {
        console.log('✅ Direct insert SUCCESS! Project created:', insertResult.id);
        
        // Clean up test project
        console.log('🧹 Cleaning up test project...');
        await supabase
          .from('projects')
          .delete()
          .eq('id', insertResult.id);
        
        alert('✅ Direct database test PASSED! Issue is in the store wrapper.');
      } else {
        console.log('❌ Direct insert FAILED:', insertError);
        alert('❌ Direct database test FAILED: ' + (insertError?.message || 'Unknown error'));
      }

    } catch (exception) {
      console.error('💥 Direct test exception:', exception);
      alert('💥 Direct test exception: ' + exception);
    }
  };

  // Completely isolated save function with fresh client
  const handleIsolatedSave = async () => {
    console.log('🛡️ Starting ISOLATED save (fresh client)...');
    
    if (!user) {
      alert('Please log in to save projects');
      return;
    }

    setIsSaving(true);
    
    try {
      // Create completely fresh Supabase client
      const { createClient } = await import('@supabase/supabase-js');
      
      const freshClient = createClient(
        'https://znsrhgncvmvrpigljhlh.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpuc3JoZ25jdm12cnBpZ2xqaGxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2NjUzNjIsImV4cCI6MjA2NzI0MTM2Mn0.3RJJR6GcdRF_59YokwZDg4RXcWh9-4ND5CIL7AHJ9S4',
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
          }
        }
      );

      console.log('🆕 Fresh Supabase client created');

      const projectData = {
        user_id: user.id,
        name: `Isolated Test ${new Date().toLocaleTimeString()}`,
        description: 'Isolated save test',
        brick_type: selectedMaterial,
        type: 'modular-construction' as const,
        is_public: false
      };

      console.log('🆕 Isolated save data:', projectData);

      // Use fresh client for insert
      const { data, error } = await (freshClient as any)
        .from('projects')
        .insert(projectData)
        .select()
        .single();

      console.log('🆕 Isolated save result:', { data, error });

      if (error) {
        throw error;
      }

      if (data) {
        alert('🛡️ ISOLATED SAVE SUCCESSFUL! Fresh client works!');
        console.log('🛡️ Project saved with fresh client:', data);
      }

    } catch (error: any) {
      console.error('💥 Isolated save error:', error);
      alert(`Isolated save failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Pure HTTP save function (no Supabase client)
  const handleHttpSave = async () => {
    console.log('🌐 Starting HTTP save (pure fetch)...');
    
    if (!user) {
      alert('Please log in to save projects');
      return;
    }

    setIsSaving(true);
    
    try {
      // Get the current session to extract JWT token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        alert('No valid session found. Please log in again.');
        return;
      }

      console.log('🔑 Got JWT token:', session.access_token.substring(0, 20) + '...');

      const projectData = {
        user_id: user.id,
        name: `HTTP Test ${new Date().toLocaleTimeString()}`,
        description: 'Pure HTTP save test',
        brick_type: selectedMaterial,
        type: 'modular-construction',
        is_public: false
      };

      console.log('🌐 HTTP save data:', projectData);

      // Direct HTTP POST to Supabase REST API with JWT token
      const response = await fetch('https://znsrhgncvmvrpigljhlh.supabase.co/rest/v1/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpuc3JoZ25jdm12cnBpZ2xqaGxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2NjUzNjIsImV4cCI6MjA2NzI0MTM2Mn0.3RJJR6GcdRF_59YokwZDg4RXcWh9-4ND5CIL7AHJ9S4',
          'Authorization': `Bearer ${session.access_token}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(projectData)
      });

      console.log('🌐 HTTP response status:', response.status, response.statusText);

      if (response.ok) {
        const result = await response.json();
        console.log('🌐 HTTP save SUCCESS:', result);
        alert('🌐 HTTP SAVE SUCCESSFUL! Pure HTTP works!');
        
        // Update the store with the new project
        if (result && result.length > 0) {
          const savedProject = result[0];
          // Note: Project saved successfully via HTTP, bypassing the broken Supabase client
          console.log('✅ Project saved successfully, store update skipped due to type conflicts');
        }
      } else {
        const errorText = await response.text();
        console.log('🌐 HTTP save ERROR:', response.status, errorText);
        alert(`HTTP save failed: ${response.status} - ${errorText}`);
      }

    } catch (error: any) {
      console.error('💥 HTTP save error:', error);
      alert(`HTTP save failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="enhanced-creator" style={{ 
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh', 
      background: 'var(--bg-primary)', 
      color: 'var(--text-primary)',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      zIndex: 1,
      overflow: 'hidden'
    }}>
      {/* Professional Header */}
      <div style={{
        position: 'relative',
        zIndex: 100,
        background: 'var(--surface-elevated)',
        borderBottom: '1px solid var(--border-strong)',
        padding: '0.75rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        height: '60px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {onBack && (
            <Button 
              onClick={onBack}
              style={{
                background: 'transparent',
                border: '1px solid var(--accent-cyan)',
                color: 'var(--accent-cyan)',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                fontSize: '0.875rem',
                fontWeight: '500',
                zIndex: 101,
                pointerEvents: 'auto',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--accent-cyan)';
                e.currentTarget.style.color = 'var(--bg-primary)';
                e.currentTarget.style.boxShadow = 'var(--glow-cyan)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--accent-cyan)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              ← Back to Landing
            </Button>
          )}
          <h1 style={{ 
            fontSize: '1.5rem', 
            fontWeight: '700',
            background: 'var(--gradient-primary)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            AR Construction Creator
          </h1>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Climate Refuge Prototype
          </span>
          <div style={{ 
            width: '8px', 
            height: '8px', 
            background: 'var(--accent-cyan)', 
            borderRadius: '50%',
            boxShadow: 'var(--glow-cyan)'
          }}></div>
        </div>
      </div>

      {/* Quick Actions Bar - Fixed Horizontal Layout */}
      <div style={{
        position: 'relative',
        zIndex: 99,
        background: 'var(--surface-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '0.75rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        flexShrink: 0,
        height: '60px',
        flexWrap: 'nowrap'
      }}>
        {/* Left Side Actions */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.75rem',
          flexShrink: 0
        }}>
          <Button
            onClick={addNewObject}
            style={{
              background: 'var(--gradient-primary)',
              border: 'none',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              transition: 'all 0.3s ease',
              zIndex: 101,
              pointerEvents: 'auto',
              position: 'relative',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = 'var(--glow-cyan)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            + Add Brick
          </Button>
          
          <Button
            onClick={deleteSelectedObjects}
            disabled={selectedObjects.length === 0}
            style={{
              background: selectedObjects.length > 0 ? 'var(--accent-red)' : 'var(--surface-glass)',
              border: '1px solid var(--border-subtle)',
              color: selectedObjects.length > 0 ? 'white' : 'var(--text-muted)',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: selectedObjects.length > 0 ? 'pointer' : 'not-allowed',
              fontSize: '0.875rem',
              fontWeight: '500',
              transition: 'all 0.3s ease',
              zIndex: 101,
              pointerEvents: 'auto',
              position: 'relative',
              whiteSpace: 'nowrap'
            }}
          >
            🗑️ Delete ({selectedObjects.length})
          </Button>

          {/* Separator */}
          <div style={{
            width: '1px',
            height: '24px',
            background: 'var(--border-subtle)',
            margin: '0 0.5rem'
          }}></div>

          {/* Undo/Redo Controls */}
          <Button
            onClick={undo}
            disabled={!canUndo}
            title={undoAction ? `Undo: ${undoAction} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
            style={{
              background: canUndo ? 'var(--surface-elevated)' : 'var(--surface-glass)',
              border: '1px solid var(--border-subtle)',
              color: canUndo ? 'var(--text-primary)' : 'var(--text-muted)',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              cursor: canUndo ? 'pointer' : 'not-allowed',
              fontSize: '0.875rem',
              fontWeight: '500',
              transition: 'all 0.3s ease',
              zIndex: 101,
              pointerEvents: 'auto',
              position: 'relative',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
            onMouseEnter={(e) => {
              if (canUndo) {
                e.currentTarget.style.background = 'var(--accent-cyan)';
                e.currentTarget.style.color = '#000';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (canUndo) {
                e.currentTarget.style.background = 'var(--surface-elevated)';
                e.currentTarget.style.color = 'var(--text-primary)';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            ↶ Undo
          </Button>

          <Button
            onClick={redo}
            disabled={!canRedo}
            title={redoAction ? `Redo: ${redoAction} (Ctrl+Y)` : 'Redo (Ctrl+Y)'}
            style={{
              background: canRedo ? 'var(--surface-elevated)' : 'var(--surface-glass)',
              border: '1px solid var(--border-subtle)',
              color: canRedo ? 'var(--text-primary)' : 'var(--text-muted)',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              cursor: canRedo ? 'pointer' : 'not-allowed',
              fontSize: '0.875rem',
              fontWeight: '500',
              transition: 'all 0.3s ease',
              zIndex: 101,
              pointerEvents: 'auto',
              position: 'relative',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
            onMouseEnter={(e) => {
              if (canRedo) {
                e.currentTarget.style.background = 'var(--accent-cyan)';
                e.currentTarget.style.color = '#000';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (canRedo) {
                e.currentTarget.style.background = 'var(--surface-elevated)';
                e.currentTarget.style.color = 'var(--text-primary)';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            ↷ Redo
          </Button>
        </div>

        {/* Center - History Status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          color: 'var(--text-secondary)',
          fontSize: '0.75rem',
          flexShrink: 0
        }}>
          <span>History: {historyIndex + 1}/{history.length}</span>
          {currentHistoryAction && (
            <span style={{ 
              color: 'var(--accent-cyan)',
              background: 'var(--surface-glass)',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)'
            }}>
              {currentHistoryAction}
            </span>
          )}
        </div>

        {/* Right Side Panel Toggles */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem',
          flexShrink: 0
        }}>
          <Button
            onClick={() => setIsOutlinerVisible(!isOutlinerVisible)}
            style={{
              background: isOutlinerVisible ? 'var(--accent-blue)' : 'var(--surface-glass)',
              border: '1px solid var(--border-subtle)',
              color: isOutlinerVisible ? 'white' : 'var(--text-secondary)',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              zIndex: 101,
              pointerEvents: 'auto',
              position: 'relative',
              whiteSpace: 'nowrap'
            }}
          >
            📋 Outliner
          </Button>
          
          <Button
            onClick={() => setIsPropertyVisible(!isPropertyVisible)}
            style={{
              background: isPropertyVisible ? 'var(--accent-blue)' : 'var(--surface-glass)',
              border: '1px solid var(--border-subtle)',
              color: isPropertyVisible ? 'white' : 'var(--text-secondary)',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              zIndex: 101,
              pointerEvents: 'auto',
              position: 'relative',
              whiteSpace: 'nowrap'
            }}
          >
            ⚙️ Properties
          </Button>
          
          <Button
            onClick={() => setIsMaterialVisible(!isMaterialVisible)}
            style={{
              background: isMaterialVisible ? 'var(--accent-blue)' : 'var(--surface-glass)',
              border: '1px solid var(--border-subtle)',
              color: isMaterialVisible ? 'white' : 'var(--text-secondary)',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              zIndex: 101,
              pointerEvents: 'auto',
              position: 'relative',
              whiteSpace: 'nowrap'
            }}
          >
            🧱 Materials
          </Button>
          
          <Button
            onClick={handleSaveProject}
            disabled={isSaving}
            style={{
              background: isSaving ? 'var(--surface-glass)' : 'var(--gradient-primary)',
              border: 'none',
              color: isSaving ? 'var(--text-muted)' : 'white',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '0.75rem',
              fontWeight: '600',
              zIndex: 101,
              pointerEvents: 'auto',
              position: 'relative',
              whiteSpace: 'nowrap',
              boxShadow: isSaving ? 'none' : 'var(--glow-cyan)'
            }}
            onMouseEnter={(e) => {
              if (!isSaving) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = 'var(--glow-cyan-strong)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSaving) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--glow-cyan)';
              }
            }}
          >
            {isSaving ? '💾 Saving...' : '💾 Save Project'}
          </Button>
          
          <Button
            onClick={handleTestDatabase}
            style={{
              background: 'var(--surface-glass)',
              border: '1px solid var(--accent-orange)',
              color: 'var(--accent-orange)',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: '600',
              zIndex: 101,
              pointerEvents: 'auto',
              position: 'relative',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent-orange)';
              e.currentTarget.style.color = 'white';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--surface-glass)';
              e.currentTarget.style.color = 'var(--accent-orange)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            🔍 Test DB
          </Button>
          
          <Button
            onClick={handleLoadProject}
            style={{
              background: 'var(--surface-glass)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: '600',
              zIndex: 101,
              pointerEvents: 'auto',
              position: 'relative',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent-blue)';
              e.currentTarget.style.color = 'white';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--surface-glass)';
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            📂 Load Project
          </Button>
          
          <Button
            onClick={() => setIsQRManagerVisible(true)}
            disabled={!projects[0]}
            style={{
              background: !projects[0] ? 'var(--surface-glass)' : 'var(--surface-glass)',
              border: '1px solid var(--border-subtle)',
              color: !projects[0] ? 'var(--text-muted)' : 'var(--text-primary)',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              cursor: !projects[0] ? 'not-allowed' : 'pointer',
              fontSize: '0.75rem',
              fontWeight: '600',
              zIndex: 101,
              pointerEvents: 'auto',
              position: 'relative',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => {
              if (projects[0]) {
                e.currentTarget.style.background = 'var(--accent-purple)';
                e.currentTarget.style.color = 'white';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (projects[0]) {
                e.currentTarget.style.background = 'var(--surface-glass)';
                e.currentTarget.style.color = 'var(--text-primary)';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            📱 QR Manager
          </Button>

          <Button
            onClick={handleIsolatedSave}
            disabled={isSaving}
            style={{
              background: isSaving ? 'var(--surface-glass)' : 'var(--gradient-green)',
              border: 'none',
              color: isSaving ? 'var(--text-muted)' : 'white',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '0.75rem',
              fontWeight: '600',
              zIndex: 101,
              pointerEvents: 'auto',
              position: 'relative',
              whiteSpace: 'nowrap',
              boxShadow: isSaving ? 'none' : '0 0 20px rgba(0, 255, 0, 0.3)'
            }}
            onMouseEnter={(e) => {
              if (!isSaving) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 0 30px rgba(0, 255, 0, 0.5)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSaving) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.3)';
              }
            }}
          >
            ⚡ Direct Save
          </Button>

          <Button
            onClick={handleHttpSave}
            disabled={isSaving}
            style={{
              background: isSaving ? 'var(--surface-glass)' : 'var(--gradient-purple)',
              border: 'none',
              color: isSaving ? 'var(--text-muted)' : 'white',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '0.75rem',
              fontWeight: '600',
              zIndex: 101,
              pointerEvents: 'auto',
              position: 'relative',
              whiteSpace: 'nowrap',
              boxShadow: isSaving ? 'none' : '0 0 20px rgba(128, 0, 255, 0.3)'
            }}
            onMouseEnter={(e) => {
              if (!isSaving) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 0 30px rgba(128, 0, 255, 0.5)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSaving) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(128, 0, 255, 0.3)';
              }
            }}
          >
            🌐 HTTP Save
          </Button>
        </div>
      </div>

      {/* Main Interface - Fixed Layout */}
      <div style={{ 
        display: 'flex', 
        flex: 1,
        position: 'relative',
        zIndex: 1,
        height: 'calc(100vh - 160px)',
        overflow: 'hidden',
        minHeight: 0
      }}>
        
        {/* Left Panel - Scene Outliner */}
        {isOutlinerVisible && (
          <div style={{ 
            width: '320px', 
            background: 'var(--surface-secondary)',
            borderRight: '1px solid var(--border-strong)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 50,
            position: 'relative',
            flexShrink: 0,
            overflow: 'hidden'
          }}>
            {/* Outliner Header */}
            <div style={{
              padding: '1rem',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--surface-elevated)',
              flexShrink: 0
            }}>
              <h3 style={{ 
                margin: 0, 
                fontSize: '0.875rem', 
                fontWeight: '600',
                color: 'var(--text-primary)'
              }}>
                Scene Outliner
              </h3>
            </div>
            
            {/* Outliner Content - Scrollable */}
            <div style={{ 
              flex: 1, 
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '1rem'
              }}>
                {/* Search */}
                <div style={{ marginBottom: '1rem' }}>
                  <input
                    type="text"
                    placeholder="Search objects..."
                    style={{
                      width: '100%',
                      background: 'var(--surface-elevated)',
                      border: '1px solid var(--border-strong)',
                      color: 'var(--text-primary)',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>

                {/* Objects List */}
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                  {sceneObjects.length} objects • {selectedObjects.length} selected
                </div>
                
                {sceneObjects.map(obj => (
                  <div 
                    key={obj.id}
                    style={{ 
                      padding: '0.75rem', 
                      background: selectedObjects.includes(obj.id) ? 'var(--accent-blue)' : 'var(--surface-glass)', 
                      borderRadius: '6px',
                      cursor: 'pointer',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      transition: 'all 0.2s ease',
                      border: '1px solid var(--border-subtle)'
                    }}
                    onClick={() => handleObjectSelect(obj.id)}
                  >
                    <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                      {obj.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleObjectToggleVisibility(obj.id);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: obj.visible ? 'var(--accent-cyan)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '0.25rem',
                        fontSize: '0.75rem'
                      }}
                    >
                      {obj.visible ? '👁️' : '🙈'}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleObjectToggleLock(obj.id);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: obj.locked ? 'var(--accent-orange)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '0.25rem',
                        fontSize: '0.75rem'
                      }}
                    >
                      {obj.locked ? '🔒' : '🔓'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Center - 3D Viewport */}
        <div style={{ 
          flex: 1, 
          position: 'relative', 
          background: 'var(--bg-primary)',
          zIndex: 10,
          overflow: 'hidden',
          minWidth: 0
        }}>
          <Viewport3D
            onSelectionChange={handleSelectionChange}
            onObjectTransform={handleObjectTransform}
            gridVisible={viewportSettings.gridVisible}
            snapEnabled={viewportSettings.snapEnabled}
            viewMode={viewportSettings.viewMode}
            sceneObjects={sceneObjects}
            selectedObjects={selectedObjects}
          />
        </div>

        {/* Right Panels - Fixed to Prevent Overlap */}
        <div style={{ 
          width: '380px', 
          background: 'var(--surface-secondary)',
          borderLeft: '1px solid var(--border-strong)',
          display: 'flex', 
          flexDirection: 'column',
          zIndex: 50,
          position: 'relative',
          flexShrink: 0,
          overflow: 'hidden'
        }}>
          
          {/* Property Inspector */}
          {isPropertyVisible && (
            <div style={{ 
              height: isMaterialVisible ? '50%' : '100%',
              borderBottom: isMaterialVisible ? '1px solid var(--border-strong)' : 'none',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}>
              {/* Properties Header */}
              <div style={{
                padding: '1rem',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--surface-elevated)',
                flexShrink: 0
              }}>
                <h3 style={{ 
                  margin: 0, 
                  fontSize: '0.875rem', 
                  fontWeight: '600',
                  color: 'var(--text-primary)'
                }}>
                  Properties
                </h3>
              </div>

              {/* Properties Content */}
              <div style={{ 
                flex: 1, 
                overflowY: 'auto',
                padding: '1rem'
              }}>
                {selectedObjectProperties ? (
                  <div>
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Name
                      </label>
                      <input
                        type="text"
                        value={propertyForm.name}
                        onChange={(e) => setPropertyForm(prev => ({ ...prev, name: e.target.value }))}
                        style={{
                          width: '100%',
                          background: 'var(--surface-elevated)',
                          border: '1px solid var(--border-strong)',
                          color: 'var(--text-primary)',
                          padding: '0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Position
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="X"
                          value={propertyForm.position.x}
                          onChange={(e) => setPropertyForm(prev => ({ ...prev, position: { ...prev.position, x: parseFloat(e.target.value) || 0 } }))}
                          style={{
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--border-strong)',
                            color: 'var(--text-primary)',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem'
                          }}
                        />
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Y"
                          value={propertyForm.position.y}
                          onChange={(e) => setPropertyForm(prev => ({ ...prev, position: { ...prev.position, y: parseFloat(e.target.value) || 0 } }))}
                          style={{
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--border-strong)',
                            color: 'var(--text-primary)',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem'
                          }}
                        />
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Z"
                          value={propertyForm.position.z}
                          onChange={(e) => setPropertyForm(prev => ({ ...prev, position: { ...prev.position, z: parseFloat(e.target.value) || 0 } }))}
                          style={{
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--border-strong)',
                            color: 'var(--text-primary)',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem'
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Rotation
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="X"
                          value={propertyForm.rotation.x}
                          onChange={(e) => setPropertyForm(prev => ({ ...prev, rotation: { ...prev.rotation, x: parseFloat(e.target.value) || 0 } }))}
                          style={{
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--border-strong)',
                            color: 'var(--text-primary)',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem'
                          }}
                        />
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Y"
                          value={propertyForm.rotation.y}
                          onChange={(e) => setPropertyForm(prev => ({ ...prev, rotation: { ...prev.rotation, y: parseFloat(e.target.value) || 0 } }))}
                          style={{
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--border-strong)',
                            color: 'var(--text-primary)',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem'
                          }}
                        />
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Z"
                          value={propertyForm.rotation.z}
                          onChange={(e) => setPropertyForm(prev => ({ ...prev, rotation: { ...prev.rotation, z: parseFloat(e.target.value) || 0 } }))}
                          style={{
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--border-strong)',
                            color: 'var(--text-primary)',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem'
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Scale
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                        <input
                          type="number"
                          step="0.1"
                          placeholder="X"
                          value={propertyForm.scale.x}
                          onChange={(e) => setPropertyForm(prev => ({ ...prev, scale: { ...prev.scale, x: parseFloat(e.target.value) || 0 } }))}
                          style={{
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--border-strong)',
                            color: 'var(--text-primary)',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem'
                          }}
                        />
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Y"
                          value={propertyForm.scale.y}
                          onChange={(e) => setPropertyForm(prev => ({ ...prev, scale: { ...prev.scale, y: parseFloat(e.target.value) || 0 } }))}
                          style={{
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--border-strong)',
                            color: 'var(--text-primary)',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem'
                          }}
                        />
                        <input
                          type="number"
                          step="0.1"
                          placeholder="Z"
                          value={propertyForm.scale.z}
                          onChange={(e) => setPropertyForm(prev => ({ ...prev, scale: { ...prev.scale, z: parseFloat(e.target.value) || 0 } }))}
                          style={{
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--border-strong)',
                            color: 'var(--text-primary)',
                            padding: '0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem'
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Button 
                        onClick={handlePropertyApply}
                        style={{
                          flex: 1,
                          background: 'var(--accent-cyan)',
                          color: 'white',
                          border: 'none',
                          padding: '0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          cursor: 'pointer'
                        }}
                      >
                        Apply
                      </Button>
                      <Button 
                        onClick={handlePropertyReset}
                        style={{
                          flex: 1,
                          background: 'var(--surface-glass)',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border-subtle)',
                          padding: '0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          cursor: 'pointer'
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎯</div>
                    <p style={{ fontSize: '0.875rem' }}>Select an object to edit properties</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Material Library */}
          {isMaterialVisible && (
            <div style={{ 
              height: isPropertyVisible ? '50%' : '100%',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}>
              {/* Materials Header */}
              <div style={{
                padding: '1rem',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--surface-elevated)',
                flexShrink: 0
              }}>
                <h3 style={{ 
                  margin: 0, 
                  fontSize: '0.875rem', 
                  fontWeight: '600',
                  color: 'var(--text-primary)'
                }}>
                  Materials
                </h3>
              </div>

              {/* Materials Content */}
              <div style={{ 
                flex: 1, 
                overflowY: 'auto',
                padding: '1rem'
              }}>
                {['clay-sustainable', 'hemp-crete', 'bamboo-composite', 'recycled-plastic'].map(material => (
                  <div 
                    key={material}
                    style={{ 
                      padding: '1rem', 
                      background: selectedMaterial === material ? 'var(--accent-cyan)' : 'var(--surface-glass)', 
                      borderRadius: '8px',
                      cursor: 'pointer',
                      marginBottom: '0.75rem',
                      transition: 'all 0.2s ease',
                      border: '1px solid var(--border-subtle)'
                    }}
                    onClick={() => handleMaterialSelect(material)}
                  >
                    <div style={{ fontWeight: '600', fontSize: '0.875rem', marginBottom: '0.25rem', color: selectedMaterial === material ? 'white' : 'var(--text-primary)' }}>
                      {material.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: selectedMaterial === material ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)' }}>
                      Sustainable • High Rating
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* QR Code Generator */}
          {isQRVisible && (
            <div style={{ 
              height: isMaterialVisible ? '50%' : '100%',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderTop: isMaterialVisible ? '1px solid var(--border-subtle)' : 'none'
            }}>
              {/* QR Header */}
              <div style={{
                padding: '1rem',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--surface-elevated)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <h3 style={{ 
                  margin: 0, 
                  fontSize: '0.875rem', 
                  fontWeight: '600',
                  color: 'var(--text-primary)'
                }}>
                  📱 QR Code Generator
                </h3>
                <Button
                  onClick={() => setIsQRVisible(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '0.25rem',
                    fontSize: '1rem'
                  }}
                >
                  ✕
                </Button>
              </div>

              {/* QR Content */}
              <div style={{ 
                flex: 1, 
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}>
                {projects[0] ? (
                  <QRCodePairGenerator 
                    projectId={projects[0].id}
                    onClose={() => setIsQRVisible(false)}
                  />
                ) : (
                  <div style={{ 
                    padding: '2rem', 
                    textAlign: 'center', 
                    color: 'var(--text-muted)' 
                  }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📝</div>
                    <p style={{ fontSize: '0.875rem' }}>
                      Please save your project first to generate QR codes
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div style={{
        position: 'relative',
        zIndex: 99,
        background: 'var(--surface-elevated)',
        borderTop: '1px solid var(--border-strong)',
        padding: '0.5rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.75rem',
        color: 'var(--text-secondary)',
        flexShrink: 0,
        height: '40px'
      }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <span>Objects: {sceneObjects.length}</span>
          <span>Selected: {selectedObjects.length}</span>
          <span>Material: {selectedMaterial}</span>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <span>Grid: {viewportSettings.gridVisible ? 'On' : 'Off'}</span>
          <span>Snap: {viewportSettings.snapEnabled ? 'On' : 'Off'}</span>
          <span style={{ color: 'var(--accent-cyan)' }}>Ready</span>
        </div>
      </div>

      {/* Project Modal */}
      {user && (
        <ProjectModal
          isVisible={isProjectModalVisible}
          onClose={() => setIsProjectModalVisible(false)}
          onSelectProject={handleSelectProject}
          onNewProject={handleNewProject}
          user={user}
        />
      )}

      {/* QR Code Manager */}
      {projects[0] && (
        <QRCodeManager
          isVisible={isQRManagerVisible}
          onClose={() => setIsQRManagerVisible(false)}
          projectId={projects[0].id}
        />
      )}
    </div>
  );
} 