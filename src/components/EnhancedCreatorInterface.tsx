import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';
import { useDatabaseStore } from '../stores/database';
import QRCodeManager from './QRCodeManager';
import ProjectModal from './ProjectModal';
import QRCodePairGenerator from './QRCodePairGenerator';
import Viewport3D from './viewport/Viewport3D';
import { ModelExporter, type ExportProgress } from '../utils/modelExporter';
import type { BrickInstanceData } from '../utils/geometryOptimizer';
import type { Project } from '../types';
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
  brickType?: string; // Material/brick type for 'brick' objects
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
    currentProject
  } = useDatabaseStore();

  console.log('🏗️ EnhancedCreatorInterface: Component loaded');
  console.log('👤 Current user:', user ? { id: user.id, email: user.email } : 'Not authenticated');
  console.log('📂 Projects in store:', projects.length);
  console.log('🎯 Current project:', currentProject ? { id: currentProject.id, name: (currentProject as any).name } : 'None (new project)');
  
  // Check for offline projects on load
  const offlineProjects = JSON.parse(localStorage.getItem('offline_projects') || '[]');
  if (offlineProjects.length > 0) {
    console.log(`📱 Found ${offlineProjects.length} offline projects:`, offlineProjects);
  }

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
  const [isProjectPublic, setIsProjectPublic] = useState(false);

  // Model export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const modelExporterRef = useRef<ModelExporter | null>(null);
  const brickGLTFRef = useRef<any>(null); // Store GLTF model for export

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

  // Debug: Log when component reloads during save
  useEffect(() => {
    if (isSaving || isExporting) {
      console.log('⚠️ Component reloaded during save operation - this may cause issues');
      console.log('📊 Save state:', { isSaving, isExporting });
    }
  }, [isSaving, isExporting]);

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

  // Initialize ModelExporter and load GLTF model
  useEffect(() => {
    // Initialize ModelExporter
    modelExporterRef.current = new ModelExporter();
    
    // Load GLTF model for export (same model as AR viewer uses)
    const loadGLTF = async () => {
      try {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const loader = new GLTFLoader();
        
        loader.load('/Octa2.glb', (gltf) => {
          brickGLTFRef.current = gltf;
          console.log('✅ GLTF model loaded for export');
        }, undefined, (error) => {
          console.error('❌ Failed to load GLTF model for export:', error);
        });
      } catch (error) {
        console.error('❌ Failed to import GLTFLoader:', error);
      }
    };
    
    loadGLTF();
    
    // Cleanup on unmount
    return () => {
      if (modelExporterRef.current) {
        modelExporterRef.current.dispose();
        modelExporterRef.current = null;
      }
    };
  }, []);

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
      scale: { x: 1, y: 1, z: 1 },
      brickType: selectedMaterial // Store the current selected material
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

    if (isSaving || isExporting) {
      console.log('⚠️ Save already in progress, skipping duplicate save attempt');
      return;
    }

    // In development, warn about hot reload interference
    if (import.meta.env.DEV) {
      console.log('⚠️ Development mode detected - avoiding file changes during save to prevent hot reload interference');
    }

    console.log('✅ User authenticated:', user.id);
    
    // Clear any stuck operation states before starting
    const { recoverOperationState } = useDatabaseStore.getState();
    recoverOperationState();

          // Using pure HTTP approach - completely bypasses database store
    console.log('🌐 Using PURE HTTP approach - completely bypassing database store...');
    console.log('ℹ️ Note: Save will use direct HTTP API calls (bypasses all Supabase client issues)');
    console.log('🚀 This should be fast and reliable!');
    
    setIsSaving(true);
    
    // Add timeout to prevent infinite hanging (longer for large file uploads)
    const saveTimeout = setTimeout(() => {
      console.log('⏰ Save operation timed out after 480 seconds');
      setIsSaving(false);
      setIsExporting(false);
      alert('Save operation timed out after 8 minutes. Large model uploads can take time. Please check your connection and try again.');
      
      // Clear operation state
      const { recoverOperationState } = useDatabaseStore.getState();
      recoverOperationState();
            }, 480000); // 480 second timeout (8 minutes) for large GLB file uploads
    
    try {
      console.log('📋 Current projects array:', projects);
      console.log('🎯 Current selected material:', selectedMaterial);
      console.log('🏗️ Current scene objects:', sceneObjects);
      
      // Prepare project structure with complete scene data
      const projectStructure = {
        sceneObjects: sceneObjects.map(obj => ({
          id: obj.id,
          name: obj.name,
          type: obj.type,
          visible: obj.visible,
          locked: obj.locked || false,
          position: obj.position || { x: 0, y: 0, z: 0 },
          rotation: obj.rotation || { x: 0, y: 0, z: 0 },
          scale: obj.scale || { x: 1, y: 1, z: 1 }
        })),
        selectedMaterial: selectedMaterial,
        metadata: {
          version: '1.0',
          lastModified: new Date().toISOString(),
          objectCount: sceneObjects.length
        }
      };

      // For updates, don't include user_id (it shouldn't change)
      // For creates, include user_id
      const baseProjectData = {
        name: currentProject?.name || `Climate Refuge Project ${new Date().toLocaleDateString()}`,
        description: currentProject?.description || 'Sustainable construction project',
        brick_type: selectedMaterial,
        type: 'modular-construction' as const,
        is_public: isProjectPublic,
        project_structure: projectStructure
      };

      const projectData = currentProject?.id 
        ? baseProjectData  // For updates, exclude user_id
        : { ...baseProjectData, user_id: user.id };  // For creates, include user_id

      console.log('📦 Project data prepared:', projectData);
      console.log('📏 Project data size:', JSON.stringify(projectData).length, 'characters');
      console.log('📏 Project structure size:', JSON.stringify(projectStructure).length, 'characters');

      let savedProject;
      
      // Use pure HTTP save instead of database store
      try {
        const httpResult = await saveProjectViaHTTP(currentProject?.id || null, projectData);
        console.log('✅ HTTP save result:', httpResult);
        
        if (httpResult) {
          // Convert to local project format for state management
          const localProject = {
            ...httpResult,
            uid: httpResult.id,
            brickType: httpResult.brick_type,
            anchors: httpResult.anchors || [],
            timestamp: httpResult.created_at || httpResult.updated_at,
            project_structure: httpResult.project_structure
          };
          
          console.log('🔄 Converted to local project format:', localProject);
          setCurrentProject(localProject as any);
          savedProject = localProject;
          
          // Update the store manually to keep UI in sync
          const { projects } = useDatabaseStore.getState();
          const updatedProjects = currentProject?.id 
            ? projects.map(p => p.id === currentProject.id ? httpResult : p)
            : [...projects, httpResult];
          
          // Update store state manually
          useDatabaseStore.setState(state => ({
            ...state,
            projects: updatedProjects,
            currentProject: httpResult
          }));
          
          console.log('✅ Project saved via HTTP and store updated');
        } else {
          throw new Error('HTTP save returned null');
        }
      } catch (httpError: any) {
        console.error('❌ HTTP save failed:', httpError);
        throw httpError;
      }

      console.log('🎯 Final saved project result:', savedProject);
      console.log('🎯 Saved project ID for export:', savedProject?.id);
      console.log('🎯 Current project state:', currentProject);

      if (savedProject && savedProject.id) {
        console.log('✅ Project saved successfully!');
        console.log('🏗️ Saved scene objects:', sceneObjects.length, 'objects');
        
        // Check if we should export optimized model
        const brickObjects = sceneObjects.filter(obj => obj.type === 'brick');
        console.log('🔍 Scene brick objects for export:', brickObjects.map(obj => ({
          id: obj.id,
          type: obj.type,
          brickType: obj.brickType,
          position: obj.position
        })));
        const shouldExport = modelExporterRef.current?.shouldExportProject(brickObjects.length) && brickGLTFRef.current;
        
        if (shouldExport) {
          console.log('🚀 Starting model export process...');
          setIsExporting(true);
          
          try {
            // Convert scene objects to brick instance data
            const brickInstanceData: BrickInstanceData[] = brickObjects.map(obj => ({
              id: obj.id,
              brickType: (obj.brickType || selectedMaterial || 'clay-sustainable') as any, // Use object's brick type or fallback to selected material or default
              position: obj.position || { x: 0, y: 0, z: 0 },
              rotation: obj.rotation || { x: 0, y: 0, z: 0 },
              pathId: undefined
            }));
            
            console.log('🔍 Brick instance data for export:', brickInstanceData.map(brick => ({
              id: brick.id,
              brickType: brick.brickType,
              position: brick.position
            })));
            
            // Validate that all bricks have valid positions (different positions indicate multiple bricks)
            const uniquePositions = new Set(brickInstanceData.map(brick => 
              `${brick.position.x},${brick.position.y},${brick.position.z}`
            ));
            console.log('🔍 Unique brick positions:', uniquePositions.size);
            if (uniquePositions.size < brickInstanceData.length) {
              console.warn('⚠️ Some bricks have identical positions!');
            }
            
            // Ensure we have a valid project ID for export
            if (!savedProject.id) {
              throw new Error('No project ID available for model export');
            }
            
            // Export and upload optimized model
            const exportResult = await modelExporterRef.current!.exportAndUploadProject(
              savedProject.id,
              brickInstanceData,
              brickGLTFRef.current,
              (progress) => {
                setExportProgress(progress);
                console.log(`📊 Export progress: ${progress.stage} (${progress.progress}%)`);
              }
            );
            
            if (exportResult.success) {
              console.log('✅ Model exported successfully:', exportResult.modelUrl);
              alert(`✅ Project saved and CSG optimized model created! Saved ${sceneObjects.length} objects. Model size: ${Math.round((exportResult.fileSize || 0) / 1024)}KB. Using Boolean union operations for proper overlapping geometry handling.`);
            } else {
              console.warn('⚠️ Model export failed:', exportResult.error);
              if (exportResult.error?.includes('saved locally')) {
                alert(`✅ Project saved successfully! Saved ${sceneObjects.length} objects to the database. Model optimization completed but upload failed - saved locally for offline access.`);
              } else {
                alert(`✅ Project saved successfully! Saved ${sceneObjects.length} objects to the database. (Model optimization failed: ${exportResult.error})`);
              }
            }
          } catch (exportError: any) {
            console.error('❌ Export error:', exportError);
            alert(`✅ Project saved successfully! Saved ${sceneObjects.length} objects to the database. (Model optimization failed)`);
          } finally {
            setIsExporting(false);
            setExportProgress(null);
          }
        } else {
          const reason = !brickGLTFRef.current ? 'GLTF model not loaded' : `Only ${brickObjects.length} bricks (need 3+ for optimization)`;
          console.log(`ℹ️ Skipping model export: ${reason}`);
          alert(`✅ Project saved successfully! Saved ${sceneObjects.length} objects to the database.`);
        }
        
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
      
      // If database save failed, offer offline save option
      const useOffline = confirm(
        '❌ Database save failed!\n\n' +
        'Would you like to save your project offline instead?\n\n' +
        '• Your work will be preserved locally\n' +
        '• You can sync to database later when connection is restored\n' +
        '• Click OK to save offline, Cancel to lose changes'
      );
      
      if (useOffline) {
        try {
          // Reconstruct the project data for offline save
          const projectStructure = {
            sceneObjects: sceneObjects.map(obj => ({
              id: obj.id,
              name: obj.name,
              type: obj.type,
              visible: obj.visible,
              locked: obj.locked || false,
              position: obj.position || { x: 0, y: 0, z: 0 },
              rotation: obj.rotation || { x: 0, y: 0, z: 0 },
              scale: obj.scale || { x: 1, y: 1, z: 1 }
            })),
            selectedMaterial: selectedMaterial,
            metadata: {
              version: '1.0',
              lastModified: new Date().toISOString(),
              objectCount: sceneObjects.length
            }
          };

          const baseProjectData = {
            name: currentProject?.name || `Climate Refuge Project ${new Date().toLocaleDateString()}`,
            description: currentProject?.description || 'Sustainable construction project',
            brick_type: selectedMaterial,
            type: 'modular-construction' as const,
            is_public: isProjectPublic,
            user_id: user.id
          };
          
          const offlineProject = saveProjectOffline(baseProjectData, projectStructure);
          
          if (offlineProject) {
            // Update current project state
            setCurrentProject(offlineProject as any);
            alert(`✅ Project saved offline!\n\n• Saved ${sceneObjects.length} objects locally\n• Project ID: ${offlineProject.id}\n• Use "🔗 Test DB" to check connection\n• Will sync to database when online`);
          } else {
            alert('❌ Offline save also failed. Please try again.');
          }
        } catch (offlineError) {
          console.error('❌ Offline save error:', offlineError);
          alert('❌ Both online and offline save failed. Please check console for details.');
        }
      } else {
        alert('Save cancelled. Your changes were not saved.');
      }
    } finally {
      // Clear the timeout
      clearTimeout(saveTimeout);
      
      console.log('🏁 Save process completed, setting isSaving to false');
      setIsSaving(false);
      setIsExporting(false);
      
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

  // Debug helper function
  const debugDatabaseState = () => {
    const state = useDatabaseStore.getState();
    console.log('🔍 Database Store State:', {
      loading: state.loading,
      operationInProgress: state.operationInProgress,
      error: state.error,
      projectCount: state.projects.length,
      currentProject: state.currentProject?.id || 'none'
    });
    
    if (state.loading || state.operationInProgress) {
      console.log('🔧 Clearing stuck database state...');
      state.recoverOperationState();
      alert('Database state cleared. You can try saving again.');
    } else {
      alert('Database state is clean - no stuck operations detected.');
    }
  };

  // Offline fallback save function
  const saveProjectOffline = (projectData: any, projectStructure: any) => {
    try {
      const offlineProject = {
        id: currentProject?.id || `offline-${Date.now()}`,
        ...projectData,
        project_structure: projectStructure,
        saved_offline: true,
        offline_timestamp: new Date().toISOString()
      };
      
      // Save to localStorage
      const offlineKey = `offline_project_${offlineProject.id}`;
      localStorage.setItem(offlineKey, JSON.stringify(offlineProject));
      
      // Keep track of offline projects
      const offlineProjects = JSON.parse(localStorage.getItem('offline_projects') || '[]');
      if (!offlineProjects.includes(offlineProject.id)) {
        offlineProjects.push(offlineProject.id);
        localStorage.setItem('offline_projects', JSON.stringify(offlineProjects));
      }
      
      console.log('💾 Project saved offline:', offlineProject.id);
      return offlineProject;
    } catch (error) {
      console.error('❌ Offline save failed:', error);
      return null;
    }
  };

  // Pure HTTP save function - bypasses Supabase client entirely
  const saveProjectViaHTTP = async (projectId: string | null, projectData: any) => {
    try {
      console.log('🌐 Using pure HTTP save (bypassing Supabase client)...');
      
      // Get authentication token
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
      }

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
      
      // Try getting session from Supabase auth state
      if (!accessToken) {
        console.log('🔑 Attempting to get user session...');
        try {
          // Import supabase only for getting the session
          const { supabase } = await import('../lib/supabase');
          const { data: { session } } = await supabase.auth.getSession();
          
          if (session?.access_token) {
            accessToken = session.access_token;
            console.log('🔑 Got token from Supabase session');
          }
        } catch (sessionError) {
          console.log('⚠️ Could not get session from Supabase auth');
        }
      }
      
      // Fall back to using user ID with anon key
      if (!accessToken) {
        console.log('🔑 Using anon key as fallback');
        accessToken = supabaseKey;
      }

      // Prepare the HTTP request
      const isUpdate = !!projectId;
      const method = isUpdate ? 'PATCH' : 'POST';
      const url = isUpdate 
        ? `${supabaseUrl}/rest/v1/projects?id=eq.${projectId}`
        : `${supabaseUrl}/rest/v1/projects`;
      
      const headers = {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${accessToken}`,
        'Prefer': 'return=representation'
      };

      console.log(`🌐 Making ${method} request to:`, url);
      console.log('🌐 Request headers:', { ...headers, Authorization: 'Bearer [hidden]' });
      console.log('🌐 Request body:', projectData);

      // Make the HTTP request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('⏰ HTTP request timeout - aborting...');
        controller.abort();
      }, 15000); // 15 second timeout
      
      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(projectData),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      console.log('🌐 HTTP response status:', response.status);
      console.log('🌐 HTTP response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ HTTP response error:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ HTTP save successful:', result);

      // Return the saved project data
      return Array.isArray(result) ? result[0] : result;
      
    } catch (error: any) {
      console.error('❌ Pure HTTP save error:', error);
      throw error;
    }
  };

  // Sync offline projects to database
  const syncOfflineProjects = async () => {
    try {
      const offlineProjects = JSON.parse(localStorage.getItem('offline_projects') || '[]');
      
      console.log(`🔄 Syncing ${offlineProjects.length} offline projects via HTTP...`);
      
      for (const projectId of offlineProjects) {
        try {
          const offlineData = localStorage.getItem(`offline_project_${projectId}`);
          if (!offlineData) continue;
          
          const project = JSON.parse(offlineData);
          console.log(`🔄 Syncing project: ${project.name}`);
          
          // Remove offline-specific fields
          const cleanProject = { ...project };
          delete cleanProject.saved_offline;
          delete cleanProject.offline_timestamp;
          
          // Try to sync to database using HTTP
          const syncProjectId = projectId.startsWith('offline-') ? null : projectId;
          const result = await saveProjectViaHTTP(syncProjectId, cleanProject);
          
          if (result) {
            console.log(`✅ Synced project to database: ${result.id}`);
            // Remove from offline storage
            localStorage.removeItem(`offline_project_${projectId}`);
          }
        } catch (syncError) {
          console.error(`❌ Failed to sync project ${projectId}:`, syncError);
        }
      }
      
      // Clear offline projects list
      localStorage.removeItem('offline_projects');
      
      alert(`✅ Offline projects synced via HTTP!\nRefresh the page to see updated projects.`);
      
    } catch (error) {
      console.error('❌ Sync failed:', error);
      alert(`❌ Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Test database connection manually
  const testDatabaseConnection = async () => {
    console.log('🔍 Manual database connection test...');
    
    // Step 1: Environment variables check
    console.log('🔍 Step 1: Checking environment variables...');
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    console.log('Environment check:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey,
      urlStart: supabaseUrl?.substring(0, 30) + '...',
      keyStart: supabaseKey?.substring(0, 20) + '...'
    });
    
    if (!supabaseUrl || !supabaseKey) {
      alert('❌ Missing environment variables!\nVITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not found.\nCheck your .env file.');
      return;
    }
    
    // Step 2: Basic HTTP connectivity test
    console.log('🔍 Step 2: Testing basic HTTP connectivity...');
    try {
      const start = Date.now();
      const response = await Promise.race([
        fetch(`${supabaseUrl}/rest/v1/`, {
          method: 'GET',
          headers: {
            'apikey': supabaseKey,
            'Content-Type': 'application/json'
          }
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('HTTP timeout')), 5000))
      ]) as Response;
      const httpDuration = Date.now() - start;
      
      console.log('HTTP test result:', {
        status: response.status,
        ok: response.ok,
        duration: httpDuration + 'ms'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      console.log('✅ HTTP connectivity successful');
    } catch (httpError: any) {
      console.error('❌ HTTP connectivity failed:', httpError);
      alert(`❌ Basic HTTP connectivity failed!\nError: ${httpError.message}\nThis suggests network or Supabase service issues.\n\nTroubleshooting:\n• Check internet connection\n• Verify Supabase URL\n• Check if Supabase service is down`);
      return;
    }
    
    // Step 3: Supabase client test
    console.log('🔍 Step 3: Testing Supabase client...');
    try {
      const { supabase } = await import('../lib/supabase');
      
      const start = Date.now();
      const { data, error } = await Promise.race([
        supabase.from('projects').select('id').limit(1),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase client timeout')), 8000))
      ]) as any;
      const duration = Date.now() - start;
      
      if (error) {
        console.error('❌ Supabase client test failed:', error);
        throw error;
      }
      
      // Step 4: Auth check
      console.log('🔍 Step 4: Testing authentication...');
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        console.error('❌ Auth test failed:', authError);
        alert(`❌ Authentication failed!\nError: ${authError.message}\nPlease try logging out and back in.`);
        return;
      }
      
      console.log('✅ All connection tests passed!');
      
      // Check for offline projects to sync
      const offlineProjects = JSON.parse(localStorage.getItem('offline_projects') || '[]');
      let connectionMessage = `✅ Database connection successful!\n• HTTP connectivity: ✅\n• Supabase client: ✅ (${duration}ms)\n• Authentication: ✅\n• User ID: ${user?.id?.substring(0, 8)}...\n• Ready for save operations`;
      
      if (offlineProjects.length > 0) {
        connectionMessage += `\n\n📱 Found ${offlineProjects.length} offline project(s)\nWould you like to sync them to the database?`;
        
        if (confirm(connectionMessage)) {
          // Sync offline projects
          syncOfflineProjects();
        } else {
          alert(connectionMessage);
        }
      } else {
        alert(connectionMessage);
      }
      
    } catch (error: any) {
      console.error('❌ Connection test error:', error);
      
      // If Supabase client failed but HTTP worked, offer HTTP-only mode
      if (error.message.includes('Supabase client timeout')) {
        const useHttpOnly = confirm(
          `⚠️ Supabase client timeout, but HTTP API works fine!\n\n` +
          `• HTTP connectivity: ✅ (working)\n` +
          `• Supabase client: ❌ (timeout)\n\n` +
          `Good news: The HTTP-first save system we implemented will work!\n\n` +
          `Would you like to:\n` +
          `• Click OK: Continue with HTTP-only mode (recommended)\n` +
          `• Click Cancel: See troubleshooting options`
        );
        
        if (useHttpOnly) {
          alert(`✅ HTTP-only mode enabled!\n\n• Save operations will use HTTP API directly\n• This bypasses Supabase client issues\n• Your project saves should work reliably\n• No action needed - just save normally!`);
        } else {
          alert(`🔧 Troubleshooting Supabase client issues:\n\n• Try refreshing the page\n• Clear browser cache and cookies\n• Disable browser extensions temporarily\n• Check if VPN/firewall blocks WebSocket connections\n• Try in incognito/private browsing mode\n\nNote: HTTP API works, so saves should still work with our HTTP-first system!`);
        }
      } else {
        alert(`❌ Connection test failed!\nError: ${error.message}\n\nPossible solutions:\n• Check internet connection\n• Verify .env file exists with correct variables\n• Try refreshing the page\n• Check browser network tab for blocked requests\n• Verify Supabase project status`);
      }
    }
  };

  const handleSelectProject = (project: Project) => {
    console.log('📂 Loading project:', project);
    console.log('🏗️ Project structure data:', (project as any).project_structure);
    
    // Project is already in local format from ProjectModal
    setCurrentProject(project);
    
    let projectObjects: SceneObject[] = [];
    
    // Try to load from project_structure first (new format)
    if ((project as any).project_structure?.sceneObjects) {
      console.log('✅ Loading from project_structure (new format)');
      
      // Ensure all objects have complete transform data with proper defaults
      projectObjects = (project as any).project_structure.sceneObjects.map((obj: any) => ({
        id: obj.id,
        name: obj.name,
        type: obj.type,
        visible: obj.visible !== undefined ? obj.visible : true,
        locked: obj.locked !== undefined ? obj.locked : false,
        position: obj.position || { x: 0, y: 0, z: 0 },
        rotation: obj.rotation || { x: 0, y: 0, z: 0 },
        scale: obj.scale || { x: 1, y: 1, z: 1 }
      }));
      
      // Restore selected material if available
      if ((project as any).project_structure.selectedMaterial) {
        setSelectedMaterial((project as any).project_structure.selectedMaterial);
      }
      
      console.log('🏗️ Loaded scene objects:', projectObjects.length, 'objects with complete transform data');
    } 
    // Fallback to old anchors format for backwards compatibility
    else if (project.anchors && project.anchors.length > 0) {
      console.log('⚠️ Loading from legacy anchors format');
      projectObjects = project.anchors.map((anchor, index) => ({
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
      }));
    } else {
      console.log('📭 No scene data found, starting with empty scene');
      projectObjects = [];
    }
    
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
    
    console.log('✅ Project loaded successfully with', projectObjects.length, 'objects');
  };

  // Helper functions for undo/redo button states
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const currentHistoryAction = history[historyIndex]?.action || 'Unknown';
  const undoAction = canUndo ? history[historyIndex - 1]?.action : null;
  const redoAction = canRedo ? history[historyIndex + 1]?.action : null;

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
          {(currentProject as any)?.saved_offline && (
            <span style={{ 
              color: '#fbbf24', 
              fontSize: '0.75rem',
              background: 'rgba(251, 191, 36, 0.1)',
              padding: '0.25rem 0.5rem',
              borderRadius: '4px',
              border: '1px solid rgba(251, 191, 36, 0.3)'
            }}>
              📱 Offline
            </span>
          )}
          <span style={{ 
            color: '#10b981', 
            fontSize: '0.75rem',
            background: 'rgba(16, 185, 129, 0.1)',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            border: '1px solid rgba(16, 185, 129, 0.3)'
          }}>
            🌐 HTTP Ready
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
          
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.75rem',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                userSelect: 'none'
              }}
            >
              <input
                type="checkbox"
                checked={isProjectPublic}
                onChange={(e) => setIsProjectPublic(e.target.checked)}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              />
              <span>🌍 Make Public</span>
            </label>
            
            <Button
              onClick={handleSaveProject}
              disabled={isSaving || isExporting}
              style={{
                background: (isSaving || isExporting) ? 'var(--surface-glass)' : 'var(--gradient-primary)',
                border: 'none',
                color: (isSaving || isExporting) ? 'var(--text-muted)' : 'white',
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
              {isExporting 
                ? `🚀 ${exportProgress?.stage || 'Optimizing'}... ${exportProgress?.progress || 0}%`
                : isSaving 
                  ? '💾 Saving...' 
                  : (() => {
                      const offlineProjects = JSON.parse(localStorage.getItem('offline_projects') || '[]');
                      const baseText = offlineProjects.length > 0 
                        ? `Save (${offlineProjects.length} offline)` 
                        : 'Save Project';
                      return `🌐 HTTP ${baseText}`;
                    })()
              }
            </Button>
          </div>
          
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

          {/* Debug Button - temporary for fixing stuck states */}
          <Button
            onClick={debugDatabaseState}
            style={{
              background: 'var(--surface-glass)',
              border: '1px solid #ff6b6b',
              color: '#ff6b6b',
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
              e.currentTarget.style.background = '#ff6b6b';
              e.currentTarget.style.color = 'white';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--surface-glass)';
              e.currentTarget.style.color = '#ff6b6b';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            🔧 Debug DB
          </Button>

          {/* Connection Test Button */}
          <Button
            onClick={testDatabaseConnection}
            style={{
              background: 'var(--surface-glass)',
              border: '1px solid #4ade80',
              color: '#4ade80',
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
              e.currentTarget.style.background = '#4ade80';
              e.currentTarget.style.color = 'white';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--surface-glass)';
              e.currentTarget.style.color = '#4ade80';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {(() => {
              const offlineProjects = JSON.parse(localStorage.getItem('offline_projects') || '[]');
              return offlineProjects.length > 0 
                ? `🔗 Test DB (${offlineProjects.length} to sync)` 
                : '🔗 Test DB';
            })()}
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