import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Button } from './ui/button';
import ContextMenu, { type ContextMenuOption } from './ui/ContextMenu';
import { useAuth } from '../contexts/AuthContext';
import { useDatabaseStore } from '../stores/database';
import QRCodeManager from './QRCodeManager';
import ProjectModal from './ProjectModal';
import QRCodePairGenerator from './QRCodePairGenerator';
import Viewport3D from './viewport/Viewport3D';
import { ModelExporter, type ExportProgress } from '../utils/modelExporter';
import type { ObjectInstanceData } from '../utils/geometryOptimizer';
import type { Project } from '../types';
import { 
  formCreator, 
  type FormDefinition, 
  type FormParameters 
} from '../utils/formCreator';
import { 
  BuildingGenerator, 
  BuildingStyles, 
  type ArchitecturalHierarchy,
  DefaultFloorParameters,
  DefaultWindowParameters
} from '../utils/buildingGenerator';
import { BrickConnectionLoader } from '../utils/brickConnectionLoader';
import '../styles/enhanced-creator.css';

interface EnhancedCreatorInterfaceProps {
  onBack?: () => void;
}

interface SceneObject {
  id: string;
  name: string;
  type: 'brick' | 'anchor' | 'group' | 'form';
  visible: boolean;
  locked: boolean;
  children?: SceneObject[];
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  brickType?: string; // Material/brick type for 'brick' objects
  connectionPoints?: any[]; // Connection points for brick objects
  
  // Form properties
  formId?: string; // For form objects (cube, sphere, cylinder)
  formParameters?: FormParameters; // Form parameters (size, hollow, etc.)
  isHollow?: boolean; // Whether the form is hollow
}

interface ObjectProperties {
  id: string;
  name: string;
  type: 'brick' | 'anchor' | 'group' | 'form';
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
    setCurrentProject,
    currentProject
  } = useDatabaseStore();

  // Check for offline projects on load
  const offlineProjects = JSON.parse(localStorage.getItem('offline_projects') || '[]');

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

  // Form creator state
  const [creationMode, setCreationMode] = useState<'bricks' | 'forms' | 'building'>('bricks');
  // const [selectedForm, setSelectedForm] = useState<FormDefinition | null>(null);
  const [isHollowMode, setIsHollowMode] = useState(false);

  // Building generator state
  const [buildingGenerator, setBuildingGenerator] = useState<BuildingGenerator | null>(null);
  const [selectedBuildingStyle, setSelectedBuildingStyle] = useState<keyof typeof BuildingStyles>('ModernSkyscraper');
  const [buildingParameters, setBuildingParameters] = useState({
    floors: { ...DefaultFloorParameters },
    windows: { ...DefaultWindowParameters },
    style: { ...BuildingStyles.ModernSkyscraper }
  });
  const [isGeneratingBuilding, setIsGeneratingBuilding] = useState(false);
  
  // Voxel editing state
  const [voxelEditMode, setVoxelEditMode] = useState(false);
  const [currentVoxelHierarchy, setCurrentVoxelHierarchy] = useState<ArchitecturalHierarchy | null>(null);
  const [selectedFormForVoxelEdit, setSelectedFormForVoxelEdit] = useState<SceneObject | null>(null);
  
  // Voxel editing tools
  const [voxelEditTool, setVoxelEditTool] = useState<'add' | 'remove' | 'paint'>('add');
  const [selectedVoxelRole, setSelectedVoxelRole] = useState<'mass' | 'facade' | 'floor' | 'component'>('mass');
  const [voxelBrushSize, setVoxelBrushSize] = useState(1);
  const [recentlyEditedVoxels, setRecentlyEditedVoxels] = useState<Array<{x: number, y: number, z: number, timestamp: number}>>([]);
  const [hoveredVoxel, setHoveredVoxel] = useState<{x: number, y: number, z: number} | null>(null);
  const [voxelPlacementMode, setVoxelPlacementMode] = useState<'direct' | 'adjacent'>('direct');

  // Context menu state
  const [outlinerContextMenu, setOutlinerContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    targetObject: SceneObject | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    targetObject: null
  });

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
      position: { x: 3, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    },
    {
      id: 'brick-foundation-3',
      name: 'Foundation Brick 3', 
      type: 'brick',
      visible: true,
      locked: false,
      position: { x: 6, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    },
    {
      id: 'brick-wall-1',
      name: 'Wall Brick 1',
      type: 'brick',
      visible: true,
      locked: false,
      position: { x: 9, y: 0, z: 0 },
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

  // Initialize building generator
  useEffect(() => {
    if (!buildingGenerator) {
      const generator = new BuildingGenerator();
      setBuildingGenerator(generator);
    }
  }, [buildingGenerator]);

  // Initialize brick connection configurations
  useEffect(() => {
    const initializeConnections = async () => {
      try {
        console.log('🔗 Initializing brick connection configurations...');
        await BrickConnectionLoader.preloadConnections();
        console.log('✅ Brick connection configurations initialized');
      } catch (error) {
        console.error('❌ Failed to initialize brick connections:', error);
      }
    };
    
    initializeConnections();
  }, []);

  // Update building parameters when style changes
  useEffect(() => {
    setBuildingParameters(prev => ({
      ...prev,
      style: { ...BuildingStyles[selectedBuildingStyle] }
    }));
  }, [selectedBuildingStyle]);

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

  const addNewObject = async () => {
    const brickCount = sceneObjects.filter(obj => obj.type === 'brick').length;
    const brickId = `brick-${Date.now()}`;
    const brickType = 'octa2'; // Use the consistent brick type
    
    console.log(`🧱 Creating new brick: ${brickId} of type: ${brickType}`);
    
    // Create brick without waiting for connection points (they can load async)
    const newObject: SceneObject = {
      id: brickId,
      name: `Sustainable Brick ${brickCount + 1}`,
      type: 'brick',
      visible: true,
      locked: false,
      // Space bricks properly based on their actual size (about 5 units wide when unscaled)
      position: { x: (brickCount % 5) * 5, y: 0, z: Math.floor(brickCount / 5) * 5 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      brickType: brickType,
      connectionPoints: [] // Will be populated async
    };
    
    setSceneObjects(prev => [...prev, newObject]);
    setTimeout(() => addToHistory('Add Object'), 0);
    
    // Load connection points asynchronously (non-blocking)
    BrickConnectionLoader.getConnectionsForBrick(brickId, brickType)
      .then(connectionPoints => {
        console.log(`✅ Loaded ${connectionPoints.length} connection points for ${brickId}`);
        setSceneObjects(prev => prev.map(obj => 
          obj.id === brickId ? { ...obj, connectionPoints } : obj
        ));
      })
      .catch(error => {
        console.warn(`⚠️ Failed to load connection points for ${brickId}:`, error);
      });
  };

  // Form creation function
  const addNewForm = (formId: string) => {
    const formCount = sceneObjects.filter(obj => obj.type === 'form').length;
    const formDefinition = formCreator.getForm(formId);
    if (!formDefinition) {
      console.error(`❌ Form "${formId}" not found`);
      return;
    }

    const newForm: SceneObject = {
      id: `form-${Date.now()}`,
      name: `${formDefinition.name} ${formCount + 1}`,
      type: 'form',
      visible: true,
      locked: false,
      position: { x: formCount % 3, y: 1, z: Math.floor(formCount / 3) * 2 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      formId: formId,
      formParameters: { ...formDefinition.defaultParameters, isHollow: isHollowMode },
      isHollow: isHollowMode
    };
    
    setSceneObjects(prev => [...prev, newForm]);
    setTimeout(() => addToHistory('Add Form'), 0);
    console.log(`🏗️ Added ${formDefinition.name} form:`, newForm);
  };

  // CSG Operations between forms
  const performCSGOnSelectedForms = async (operation: 'union' | 'subtract' | 'intersect') => {
    if (selectedObjects.length !== 2) {
      alert('Please select exactly 2 forms to perform CSG operations');
      return;
    }

    // Get selected forms in SELECTION ORDER (not spawn order)
    const selectedFormObjects = selectedObjects
      .map(selectedId => sceneObjects.find(obj => obj.id === selectedId))
      .filter(obj => obj && obj.type === 'form') as SceneObject[];

    if (selectedFormObjects.length !== 2) {
      alert('Please select exactly 2 forms (not bricks or other objects)');
      return;
    }

    // formA = FIRST selected (base), formB = SECOND selected (cutter)
    const [formA, formB] = selectedFormObjects;
    
    console.log(`🔧 Starting CSG ${operation}:`);
    console.log(`  📦 Base (first selected): ${formA.name || formA.id}`);
    console.log(`  ✂️ ${operation === 'subtract' ? 'Cutter' : 'Operand'} (second selected): ${formB.name || formB.id}`);

    try {
      // Get geometries from form creator
      const geometryA = formCreator.createFormGeometry(formA.formId!, formA.formParameters!);
      const geometryB = formCreator.createFormGeometry(formB.formId!, formB.formParameters!);

      if (!geometryA || !geometryB) {
        alert('Failed to get form geometries for CSG operation');
        return;
      }

      // Apply transforms to geometries
      const transformedGeomA = geometryA.clone();
      const transformedGeomB = geometryB.clone();

      // Apply position, rotation, scale transformations
      if (formA.position) {
        transformedGeomA.translate(formA.position.x, formA.position.y, formA.position.z);
      }
      if (formA.rotation) {
        transformedGeomA.rotateX(formA.rotation.x);
        transformedGeomA.rotateY(formA.rotation.y);
        transformedGeomA.rotateZ(formA.rotation.z);
      }
      if (formA.scale) {
        transformedGeomA.scale(formA.scale.x, formA.scale.y, formA.scale.z);
      }

      if (formB.position) {
        transformedGeomB.translate(formB.position.x, formB.position.y, formB.position.z);
      }
      if (formB.rotation) {
        transformedGeomB.rotateX(formB.rotation.x);
        transformedGeomB.rotateY(formB.rotation.y);
        transformedGeomB.rotateZ(formB.rotation.z);
      }
      if (formB.scale) {
        transformedGeomB.scale(formB.scale.x, formB.scale.y, formB.scale.z);
      }

      // Perform CSG operation
      const resultGeometry = formCreator.performCSGOperation(transformedGeomA, transformedGeomB, operation);

      if (!resultGeometry) {
        alert(`CSG ${operation} operation failed. Please try again.`);
        return;
      }

      // Create new combined form object
      const combinedForm: SceneObject = {
        id: `csg-${operation}-${Date.now()}`,
        name: `${formA.name} ${operation} ${formB.name}`,
        type: 'form',
        visible: true,
        locked: false,
        position: { x: 0, y: 0, z: 0 }, // Result is already positioned
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        formId: 'custom-csg', // Special ID for CSG results
        formParameters: { customGeometry: resultGeometry },
        isHollow: false // CSG results are typically solid
      };

      // Remove original forms and add the combined form
      setSceneObjects(prev => {
        const filtered = prev.filter(obj => !selectedObjects.includes(obj.id));
        return [...filtered, combinedForm];
      });

      // Clear selection
      setSelectedObjects([]);

      // Add to history
      setTimeout(() => addToHistory(`CSG ${operation.charAt(0).toUpperCase() + operation.slice(1)}`), 0);

      console.log(`✅ CSG ${operation} completed successfully`);
      alert(`✅ CSG ${operation} operation completed! Combined form created.`);

      // Clean up
      geometryA.dispose();
      geometryB.dispose();
      transformedGeomA.dispose();
      transformedGeomB.dispose();

    } catch (error) {
      console.error(`❌ CSG ${operation} operation failed:`, error);
      alert(`❌ CSG ${operation} operation failed. See console for details.`);
    }
  };

  // Handle voxel editing operations
  const handleVoxelEdit = (voxelX: number, voxelY: number, voxelZ: number, event?: any) => {
    console.log(`🎨 handleVoxelEdit called:`, {
      voxelCoords: { x: voxelX, y: voxelY, z: voxelZ },
      tool: voxelEditTool,
      role: selectedVoxelRole,
      brushSize: voxelBrushSize,
      hasHierarchy: !!currentVoxelHierarchy,
      hasGenerator: !!buildingGenerator
    });
    
    if (!currentVoxelHierarchy || !buildingGenerator) {
      console.warn('❌ No voxel hierarchy or building generator available');
      return;
    }

    console.log(`🎨 Voxel edit: ${voxelEditTool} at (${voxelX}, ${voxelY}, ${voxelZ}) with role: ${selectedVoxelRole}`);
    console.log(`⛏️ Minecraft Mode: Attempting to ${voxelEditTool} voxel at (${voxelX}, ${voxelY}, ${voxelZ}) - should place in empty space`);

    // Apply brush size - edit multiple voxels around the clicked position
    const updatedHierarchy = { ...currentVoxelHierarchy };
    let editCount = 0;

    for (let dx = -Math.floor(voxelBrushSize / 2); dx <= Math.floor(voxelBrushSize / 2); dx++) {
      for (let dy = -Math.floor(voxelBrushSize / 2); dy <= Math.floor(voxelBrushSize / 2); dy++) {
        for (let dz = -Math.floor(voxelBrushSize / 2); dz <= Math.floor(voxelBrushSize / 2); dz++) {
          const targetX = voxelX + dx;
          const targetY = voxelY + dy;
          const targetZ = voxelZ + dz;

          switch (voxelEditTool) {
            case 'add':
              const addResult = buildingGenerator.addVoxelToHierarchy(updatedHierarchy, targetX, targetY, targetZ, selectedVoxelRole);
              console.log(`🔨 Add voxel at (${targetX}, ${targetY}, ${targetZ}): ${addResult}`);
              if (addResult) {
                editCount++;
                // Track recently edited voxel for highlighting
                setRecentlyEditedVoxels(prev => [...prev, { x: targetX, y: targetY, z: targetZ, timestamp: Date.now() }]);
              }
              break;
            case 'remove':
              const removeResult = buildingGenerator.removeVoxelFromHierarchy(updatedHierarchy, targetX, targetY, targetZ);
              console.log(`🗑️ Remove voxel at (${targetX}, ${targetY}, ${targetZ}): ${removeResult}`);
              if (removeResult) {
                editCount++;
                // Track recently edited voxel for highlighting (removal)
                setRecentlyEditedVoxels(prev => [...prev, { x: targetX, y: targetY, z: targetZ, timestamp: Date.now() }]);
              }
              break;
            case 'paint':
              const paintResult = buildingGenerator.paintVoxelInHierarchy(updatedHierarchy, targetX, targetY, targetZ, selectedVoxelRole);
              console.log(`🎨 Paint voxel at (${targetX}, ${targetY}, ${targetZ}) to ${selectedVoxelRole}: ${paintResult}`);
              if (paintResult) {
                editCount++;
                // Track recently edited voxel for highlighting
                setRecentlyEditedVoxels(prev => [...prev, { x: targetX, y: targetY, z: targetZ, timestamp: Date.now() }]);
              }
              break;
          }
        }
      }
    }

    if (editCount > 0) {
      // Update the hierarchy
      setCurrentVoxelHierarchy(updatedHierarchy);
      
      // Debug: Log hierarchy state after modification
      const componentVoxels = updatedHierarchy.components && updatedHierarchy.components instanceof Map ? 
        Array.from(updatedHierarchy.components.values()).reduce((sum, c) => sum + (c.voxels?.length || 0), 0) : 0;
      
      const totalVoxels = (updatedHierarchy.mass.voxels?.length || 0) +
                         (updatedHierarchy.facades?.reduce((sum, f) => sum + (f.voxels?.length || 0), 0) || 0) +
                         (updatedHierarchy.floors?.reduce((sum, f) => sum + (f.voxels?.length || 0), 0) || 0) +
                         componentVoxels;
      
      console.log(`🎨 Hierarchy after edit: ${totalVoxels} total voxels (mass: ${updatedHierarchy.mass.voxels?.length || 0}, facades: ${updatedHierarchy.facades?.reduce((sum, f) => sum + (f.voxels?.length || 0), 0) || 0}, floors: ${updatedHierarchy.floors?.reduce((sum, f) => sum + (f.voxels?.length || 0), 0) || 0}, components: ${componentVoxels})`);

      // Regenerate visualization
      refreshVoxelVisualization(updatedHierarchy);
      
      console.log(`✅ Modified ${editCount} voxels`);
      
      // Clean up old recently edited voxels (older than 10 seconds)
      setTimeout(() => {
        const cutoffTime = Date.now() - 10000; // 10 seconds ago
        setRecentlyEditedVoxels(prev => prev.filter(v => v.timestamp > cutoffTime));
      }, 100);
      
    } else {
      console.warn(`❌ No voxels were modified during ${voxelEditTool} operation`);
    }
  };

  // Handle voxel hover for preview
  const handleVoxelHover = (voxelX: number, voxelY: number, voxelZ: number) => {
    if (!currentVoxelHierarchy) return;
    
    setHoveredVoxel({ x: voxelX, y: voxelY, z: voxelZ });
    console.log(`👀 Hovering over voxel: (${voxelX}, ${voxelY}, ${voxelZ})`);
  };

  // Clear hover when mouse leaves
  const handleVoxelHoverEnd = () => {
    setHoveredVoxel(null);
    console.log(`👀 Hover ended`);
  };

  // Register voxel handlers globally so viewport can access them
  useEffect(() => {
    if (currentVoxelHierarchy) {
      (window as any).handleVoxelEdit = handleVoxelEdit;
      (window as any).handleVoxelHover = handleVoxelHover;
      (window as any).handleVoxelHoverEnd = handleVoxelHoverEnd;
      (window as any).voxelPlacementMode = voxelPlacementMode;
    } else {
      delete (window as any).handleVoxelEdit;
      delete (window as any).handleVoxelHover;
      delete (window as any).handleVoxelHoverEnd;
      delete (window as any).voxelPlacementMode;
    }

    return () => {
      delete (window as any).handleVoxelEdit;
      delete (window as any).handleVoxelHover;
      delete (window as any).handleVoxelHoverEnd;
    };
  }, [currentVoxelHierarchy, voxelEditTool, selectedVoxelRole, voxelBrushSize, voxelPlacementMode, buildingGenerator]);

  // Refresh visualization when hover changes
  useEffect(() => {
    if (currentVoxelHierarchy) {
      refreshVoxelVisualization(currentVoxelHierarchy);
    }
  }, [hoveredVoxel]);

  // Refresh the voxel visualization after editing
  const refreshVoxelVisualization = (hierarchy: ArchitecturalHierarchy) => {
    if (!buildingGenerator || !selectedFormForVoxelEdit) {
      console.warn('❌ Cannot refresh visualization: missing generator or selected form');
      return;
    }

    try {
      console.log('🔄 Refreshing voxel visualization...');
      
      // Create new voxel visualization mesh with recently edited voxels highlighted and hover preview
      const voxelVisualizationMesh = buildingGenerator.createVoxelVisualizationMesh(hierarchy, recentlyEditedVoxels, hoveredVoxel);
      console.log('✅ Created new voxel visualization mesh');

      // Update the scene object with new visualization, preserving voxel parameters
      setSceneObjects(prev => {
        const updated = prev.map(obj => {
          if (obj.id === selectedFormForVoxelEdit.id) {
            const updatedObj = {
              ...obj,
              formParameters: {
                customGeometry: voxelVisualizationMesh,
                isVoxelMesh: true, // Preserve voxel mesh flag
                voxelResolution: buildingGenerator.getVoxelResolution(hierarchy),
                voxelBounds: hierarchy.mass.voxelBounds,
                _voxelUpdateKey: Date.now() // Add update key to formParameters too
              },
              // Force React to re-render by changing a unique identifier
              _voxelUpdateKey: Date.now()
            };
            console.log('🔄 Updated scene object with new visualization, key:', updatedObj._voxelUpdateKey);
            return updatedObj;
          }
          return obj;
        });
        return updated;
      });
      
      console.log('✅ Voxel visualization refreshed successfully');
    } catch (error) {
      console.error('❌ Failed to refresh voxel visualization:', error);
    }
  };

  // Convert voxel hierarchy to final mesh
  const convertVoxelsToMesh = async () => {
    if (!buildingGenerator || !currentVoxelHierarchy || !selectedFormForVoxelEdit) {
      alert('No voxel data available for conversion');
      return;
    }

    setIsGeneratingBuilding(true);

    try {
      console.log('✨ Converting voxel hierarchy to final mesh...');

      // Convert voxels to mesh
      const buildingGeometry = buildingGenerator.convertHierarchyToMesh(
        currentVoxelHierarchy, 
        buildingParameters.style
      );

      // Update the existing form object to be the building
      setSceneObjects(prev => prev.map(obj => {
        if (obj.id === selectedFormForVoxelEdit.id) {
          return {
            ...obj,
            name: `${obj.name} → Building (${selectedBuildingStyle})`,
            formId: 'custom-csg',
            formParameters: {
              customGeometry: buildingGeometry
            },
            isHollow: false
            // Keep original position, rotation, scale
          };
        }
        return obj;
      }));

      // Clear voxel editing state
      setCurrentVoxelHierarchy(null);
      setSelectedFormForVoxelEdit(null);
      setVoxelEditMode(false);

      // Add to history
      setTimeout(() => addToHistory('Convert Voxels to Building'), 0);

      console.log('✅ Voxels converted to building mesh successfully');
      alert(`✅ Voxels converted to building!\n\nYour edited voxels have been converted into a final ${selectedBuildingStyle} building.\n\nThe geometry has been optimized for a clean, manifold result.`);

    } catch (error) {
      console.error('❌ Voxel to mesh conversion failed:', error);
      alert(`❌ Voxel conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGeneratingBuilding(false);
    }
  };

  // Building generation function - Transform existing form into building
  const generateBuildingFromSelectedForms = async () => {
    if (!buildingGenerator) {
      alert('Building generator not initialized');
      return;
    }

    if (selectedObjects.length !== 1) {
      alert('Please select exactly one form to transform into a building');
      return;
    }

    // Get the selected form to transform
    const selectedForm = sceneObjects.find(obj => 
      selectedObjects.includes(obj.id) && obj.type === 'form'
    );

    if (!selectedForm || !selectedForm.formId) {
      alert('Please select a form object to transform into a building');
      return;
    }

    setIsGeneratingBuilding(true);

    try {
      console.log('🏗️ Transforming form into building:', selectedForm.name);

      // Get the original form geometry (without transforms)
      const baseGeometry = formCreator.createFormGeometry(
        selectedForm.formId,
        selectedForm.formParameters || {}
      );

      if (!baseGeometry) {
        throw new Error('Failed to get base form geometry');
      }

      // Generate building from the base form (with voxel editing mode)
      const buildingResult = await buildingGenerator.generateBuilding(
        baseGeometry,
        buildingParameters.style,
        buildingParameters.floors,
        buildingParameters.windows,
        voxelEditMode
      );

      if (voxelEditMode) {
        // Store voxel hierarchy for editing
        const hierarchy = buildingResult as ArchitecturalHierarchy;
        setCurrentVoxelHierarchy(hierarchy);
        setSelectedFormForVoxelEdit(selectedForm);
        
        console.log('🎨 Voxel editing mode: Creating voxel visualization...');
        
                  // Create voxel visualization mesh to show the voxels in the scene
          const voxelVisualizationMesh = buildingGenerator.createVoxelVisualizationMesh(hierarchy);
          
          // Replace the original form with the voxel visualization
          setSceneObjects(prev => prev.map(obj => {
            if (obj.id === selectedForm.id) {
              return {
                ...obj,
                name: `${obj.name} → Voxels (${selectedBuildingStyle})`,
                formId: 'custom-csg',
                formParameters: {
                  customGeometry: voxelVisualizationMesh,
                  isVoxelMesh: true, // Flag to identify voxel meshes
                  voxelResolution: buildingGenerator.getVoxelResolution(hierarchy),
                  voxelBounds: hierarchy.mass.voxelBounds
                },
                isHollow: false
                // Keep original position, rotation, scale
              };
            }
            return obj;
          }));
        
        // Add to history
        setTimeout(() => addToHistory('Create Architectural Building with Simple Floor Slabs'), 0);

        console.log('🎨 Voxel editing mode: Building voxels ready for editing');
        const voxelCount = hierarchy.mass.voxels?.length || 0;
        alert(`🏗️ ARCHITECTURAL VOXEL BUILDING\n\nComplete architectural voxels from your ${selectedForm.name}!\n\n📦 Generated ${voxelCount} voxels with proper building structure\n🏢 Foundation + SIMPLE Floor Slabs + Walls + Roof included\n🎯 Architectural color coding:\n   🟤 Brown = Foundation (bottom 10%)\n   🟢 Green = Floor Slabs (1 voxel thick, direct detection)\n   🔵 Blue = Walls (exterior surfaces)\n   🔴 Red = Roof (top 10%)\n\n✨ SIMPLE floor detection - should work now!\n🔧 Check console for detailed floor slab creation logs`);
      } else {
        // Standard building generation - convert to mesh immediately
        const buildingGeometry = buildingResult as THREE.BufferGeometry;

        // Update the existing form object to be the building
        setSceneObjects(prev => prev.map(obj => {
          if (obj.id === selectedForm.id) {
            return {
              ...obj,
              name: `${obj.name} → Building (${selectedBuildingStyle})`,
              formId: 'custom-csg',
              formParameters: {
                customGeometry: buildingGeometry
              },
              isHollow: false
              // Keep original position, rotation, scale
            };
          }
          return obj;
        }));

        // Add to history
        setTimeout(() => addToHistory('Transform to Building'), 0);

        console.log('✅ Form transformed into building successfully');
        alert(`✅ Form transformed into building!\n\nThe ${selectedForm.name} has been extended into a ${selectedBuildingStyle} building while preserving its original shape and proportions.\n\nThe geometry has been carefully welded and optimized for a clean, manifold result.`);
      }

      // Clean up
      baseGeometry.dispose();

    } catch (error) {
      console.error('❌ Building transformation failed:', error);
      alert('❌ Building transformation failed. See console for details.');
    } finally {
      setIsGeneratingBuilding(false);
    }
  };

  // Context menu functions
  const closeOutlinerContextMenu = () => {
    setOutlinerContextMenu(prev => ({ ...prev, visible: false }));
  };

  const duplicateObjects = (objectIds: string[]) => {
    const objectsToDuplicate = sceneObjects.filter(obj => objectIds.includes(obj.id));
    const duplicatedObjects = objectsToDuplicate.map(obj => ({
      ...obj,
      id: `${obj.id}-copy-${Date.now()}`,
      name: `${obj.name} Copy`,
      position: {
        x: (obj.position?.x || 0) + 2,
        y: obj.position?.y || 0,
        z: obj.position?.z || 0
      }
    }));
    
    setSceneObjects(prev => [...prev, ...duplicatedObjects]);
    setSelectedObjects(duplicatedObjects.map(obj => obj.id));
    setTimeout(() => addToHistory('Duplicate Objects'), 0);
    console.log(`📋 Duplicated ${duplicatedObjects.length} objects`);
  };

  const deleteObjects = (objectIds: string[]) => {
    setSceneObjects(prev => prev.filter(obj => !objectIds.includes(obj.id)));
    setSelectedObjects(prev => prev.filter(id => !objectIds.includes(id)));
    setTimeout(() => addToHistory('Delete Objects'), 0);
    console.log(`🗑️ Deleted ${objectIds.length} objects`);
  };

  const toggleObjectsVisibility = (objectIds: string[]) => {
    setSceneObjects(prev => 
      prev.map(obj => 
        objectIds.includes(obj.id) ? { ...obj, visible: !obj.visible } : obj
      )
    );
    setTimeout(() => addToHistory('Toggle Visibility'), 0);
    console.log(`👁️ Toggled visibility for ${objectIds.length} objects`);
  };

  const selectAllObjects = () => {
    setSelectedObjects(sceneObjects.map(obj => obj.id));
    console.log(`⊡ Selected all ${sceneObjects.length} objects`);
  };

  const deselectAllObjects = () => {
    setSelectedObjects([]);
    console.log('⊟ Deselected all objects');
  };

  const getOutlinerContextMenuOptions = (targetObject: SceneObject | null): ContextMenuOption[] => {
    const hasSelection = selectedObjects.length > 0;
    const hasTarget = !!targetObject;
    const isTargetSelected = targetObject ? selectedObjects.includes(targetObject.id) : false;

    return [
      // Selection actions
      {
        id: 'select-all',
        label: 'Select All',
        icon: '⊡',
        shortcut: 'Ctrl+A',
        disabled: sceneObjects.length === 0,
        action: selectAllObjects
      },
      {
        id: 'deselect-all',
        label: 'Deselect All',
        icon: '⊟',
        shortcut: 'Alt+A',
        disabled: !hasSelection,
        action: deselectAllObjects
      },
      {
        id: 'separator-1',
        label: '',
        separator: true
      },
      // Object actions
      {
        id: 'duplicate',
        label: hasTarget ? `Duplicate ${targetObject.name}` : 'Duplicate Selected',
        icon: '⧉',
        shortcut: 'Shift+D',
        disabled: !hasSelection && !hasTarget,
        action: () => {
          if (hasTarget && !isTargetSelected) {
            duplicateObjects([targetObject.id]);
          } else {
            duplicateObjects(selectedObjects);
          }
        }
      },
      {
        id: 'delete',
        label: hasTarget ? `Delete ${targetObject.name}` : 'Delete Selected',
        icon: '🗑️',
        shortcut: 'Delete',
        disabled: !hasSelection && !hasTarget,
        action: () => {
          if (hasTarget && !isTargetSelected) {
            deleteObjects([targetObject.id]);
          } else {
            deleteObjects(selectedObjects);
          }
        }
      },
      {
        id: 'separator-2',
        label: '',
        separator: true
      },
      // Visibility actions
      {
        id: 'toggle-visibility',
        label: hasTarget ? 
          (targetObject.visible ? `Hide ${targetObject.name}` : `Show ${targetObject.name}`) : 
          'Toggle Visibility',
        icon: hasTarget ? (targetObject.visible ? '👁️' : '🙈') : '👁️',
        shortcut: 'H',
        disabled: !hasSelection && !hasTarget,
        action: () => {
          if (hasTarget && !isTargetSelected) {
            toggleObjectsVisibility([targetObject.id]);
          } else {
            toggleObjectsVisibility(selectedObjects);
          }
        }
      },
      {
        id: 'separator-3',
        label: '',
        separator: true
      },
      // Properties
      {
        id: 'properties',
        label: hasTarget ? `Properties of ${targetObject.name}` : 'Properties',
        icon: '⚙️',
        shortcut: 'F9',
        disabled: !hasTarget,
        action: () => {
          // TODO: Implement properties panel
          console.log('Show properties for:', targetObject?.name);
        }
      },
      {
        id: 'separator-4',
        label: '',
        separator: true
      },
      // View actions
      {
        id: 'focus',
        label: hasTarget ? `Focus on ${targetObject.name}` : 'Focus on Selected',
        icon: '🎯',
        shortcut: 'NumPad .',
        disabled: !hasSelection && !hasTarget,
        action: () => {
          // Focus in viewport by triggering through the viewport's context menu
          // For now, just log the intent - in a real implementation, we'd pass this to the viewport
          if (hasTarget && !isTargetSelected) {
            console.log('🎯 Request focus on:', targetObject.name);
          } else {
            console.log('🎯 Request focus on selected objects:', selectedObjects.length, 'objects');
          }
          // TODO: Integrate with viewport focus functionality
        }
      }
    ];
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
    
    // Smart timeout based on project complexity  
    const objectCount = sceneObjects.length;
    // Adaptive timeout based on file size estimate
    // With 114k vertices per brick, each brick is ~4.5MB
    const estimatedSizeMB = (sceneObjects.filter(obj => obj.type === 'brick').length * 4.5) + 
                           (sceneObjects.filter(obj => obj.type === 'form').length * 1);
    
    // Allow 20 seconds per MB for upload, minimum 60 seconds
    // This accounts for network latency and Supabase processing time
    const overallTimeoutMs = Math.max(60000, estimatedSizeMB * 20000);
    
    console.log(`⏰ Setting save timeout to ${overallTimeoutMs / 1000} seconds (estimated ${Math.round(estimatedSizeMB)}MB file)`);
    
    const saveTimeout = setTimeout(() => {
      console.log(`⏰ Save operation timed out after ${overallTimeoutMs / 1000} seconds`);
      setIsSaving(false);
      setIsExporting(false);
      alert(`Save operation timed out after ${overallTimeoutMs / 1000} seconds. This may be due to network issues or large file size.`);
      
      // Clear operation state
      const { recoverOperationState } = useDatabaseStore.getState();
      recoverOperationState();
    }, overallTimeoutMs);
    
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
        name: currentProject?.name || `Climate Refuge Project ${new Date().toLocaleString()}`,
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
        
        // Check if we should export optimized model - now includes both bricks and forms
        const exportableObjects = sceneObjects.filter(obj => obj.type === 'brick' || obj.type === 'form');
        const brickObjects = exportableObjects.filter(obj => obj.type === 'brick');
        const formObjects = exportableObjects.filter(obj => obj.type === 'form');
        
        console.log('🔍 Scene objects for export:', {
          total: exportableObjects.length,
          bricks: brickObjects.length,
          forms: formObjects.length,
          objects: exportableObjects.map(obj => ({
            id: obj.id,
            type: obj.type,
            brickType: obj.brickType,
            formId: obj.formId,
            position: obj.position
          }))
        });
        
        const shouldExport = modelExporterRef.current?.shouldExportProject(exportableObjects.length);
        
        // Always export if we have any objects (even single objects get GLB files)
        if (shouldExport && exportableObjects.length > 0) {
          console.log('🚀 Starting model export process...');
          setIsExporting(true);
          
          try {
            // Convert scene objects to mixed object instance data
            const objectInstanceData: ObjectInstanceData[] = exportableObjects.map(obj => {
              const baseData = {
                id: obj.id,
                type: obj.type as 'brick' | 'form',
                position: obj.position || { x: 0, y: 0, z: 0 },
                rotation: obj.rotation || { x: 0, y: 0, z: 0 },
                scale: obj.scale || { x: 1, y: 1, z: 1 },
                pathId: undefined
              };
              
              if (obj.type === 'brick') {
                return {
                  ...baseData,
                  brickType: (obj.brickType || selectedMaterial || 'clay-sustainable') as any
                };
              } else if (obj.type === 'form') {
                return {
                  ...baseData,
                  formId: obj.formId || 'cube',
                  formParameters: obj.formParameters || {},
                  isHollow: obj.isHollow || false
                };
              }
              return baseData;
            });
            
            console.log('🔍 Mixed object instance data for export:', objectInstanceData.map(obj => ({
              id: obj.id,
              type: obj.type,
              brickType: obj.brickType,
              formId: obj.formId,
              position: obj.position
            })));
            
            // Validate that all objects have valid positions
            const uniquePositions = new Set(objectInstanceData.map(obj => 
              `${obj.position.x},${obj.position.y},${obj.position.z}`
            ));
            console.log('🔍 Unique object positions:', uniquePositions.size);
            if (uniquePositions.size < objectInstanceData.length) {
              console.warn('⚠️ Some objects have identical positions!');
            }
            
            // Ensure we have a valid project ID for export
            if (!savedProject.id) {
              throw new Error('No project ID available for model export');
            }
            
            // Export and upload optimized model (mixed objects)
            const exportResult = await modelExporterRef.current!.exportAndUploadProjectObjects(
              savedProject.id,
              objectInstanceData,
              brickObjects.length > 0 ? brickGLTFRef.current : undefined, // Only pass GLTF if we have bricks
              (progress) => {
                setExportProgress(progress);
                console.log(`📊 Export progress: ${progress.stage} (${progress.progress}%)`);
              }
            );
            
            if (exportResult.success) {
              console.log('✅ Model exported successfully:', exportResult.modelUrl);
              const objectCount = exportableObjects.length;
              const sizeKB = Math.round((exportResult.fileSize || 0) / 1024);
              const meshType = objectCount === 1 ? 'Single object GLB' : 'CSG optimized model';
              alert(`✅ Project saved and ${meshType} uploaded! Saved ${sceneObjects.length} objects (${brickObjects.length} bricks, ${formObjects.length} forms). Model size: ${sizeKB}KB. Using smart upload with fast retries.`);
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
          const reason = exportableObjects.length === 0 ? 'No exportable objects found' : 'ModelExporter not initialized';
          console.log(`ℹ️ Skipping model export: ${reason}`);
          console.log(`📊 Object breakdown: ${brickObjects.length} bricks, ${formObjects.length} forms`);
          alert(`✅ Project saved successfully! Saved ${sceneObjects.length} objects to the database. (${reason})`);
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
            name: currentProject?.name || `Climate Refuge Project ${new Date().toLocaleString()}`,
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
      const { error } = await Promise.race([
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
          {/* Admin Access Button */}
          {user && (user.role === 'admin' || process.env.NODE_ENV === 'development') && (
            <Button 
              onClick={() => {
                // Navigate to admin mode using your existing navigation
                const adminEvent = new CustomEvent('navigateToAdmin');
                window.dispatchEvent(adminEvent);
              }}
              style={{
                background: 'transparent',
                border: '1px solid #ef4444',
                color: '#ef4444',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                fontSize: '0.75rem',
                fontWeight: '500',
                zIndex: 101,
                pointerEvents: 'auto',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#ef4444';
                e.currentTarget.style.color = 'white';
                e.currentTarget.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#ef4444';
                e.currentTarget.style.boxShadow = 'none';
              }}
              title="Access admin tools for brick connection system"
            >
              🔧 Admin Tools
            </Button>
          )}
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

      {/* Responsive Toolbar - Tablet-Friendly */}
      <div style={{
        position: 'relative',
        zIndex: 99,
        background: 'var(--surface-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '0.5rem min(1rem, 2vw)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        flexShrink: 0,
        minHeight: '60px',
        maxHeight: window.innerWidth < 768 ? '140px' : '120px' // Extra height for mobile
      }}>
        {/* Top Row: Essential Actions + Mode Toggle */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          gap: '0.5rem',
          flexWrap: 'wrap',
          minHeight: '40px'
        }}>
          {/* Left: Essential Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button
              onClick={addNewObject}
              style={{
                background: 'var(--gradient-primary)',
                border: 'none',
                color: 'white',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: '500',
                transition: 'all 0.3s ease',
                whiteSpace: 'nowrap'
              }}
            >
              + Add
            </Button>
            
            <Button
              onClick={deleteSelectedObjects}
              disabled={selectedObjects.length === 0}
              style={{
                background: selectedObjects.length > 0 ? 'var(--accent-red)' : 'var(--surface-glass)',
                border: '1px solid var(--border-subtle)',
                color: selectedObjects.length > 0 ? 'white' : 'var(--text-muted)',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                cursor: selectedObjects.length > 0 ? 'pointer' : 'not-allowed',
                fontSize: '0.8rem',
                fontWeight: '500',
                transition: 'all 0.3s ease',
                whiteSpace: 'nowrap'
              }}
            >
              🗑️ ({selectedObjects.length})
            </Button>

            {/* Undo/Redo - Always visible */}
            <Button
              onClick={undo}
              disabled={!canUndo}
              title={undoAction ? `Undo: ${undoAction} (Ctrl+Z)` : 'Undo (Ctrl+Z)'}
              style={{
                background: canUndo ? 'var(--surface-elevated)' : 'var(--surface-glass)',
                border: '1px solid var(--border-subtle)',
                color: canUndo ? 'var(--text-primary)' : 'var(--text-muted)',
                padding: '0.4rem 0.6rem',
                borderRadius: '6px',
                cursor: canUndo ? 'pointer' : 'not-allowed',
                fontSize: '0.8rem',
                fontWeight: '500',
                transition: 'all 0.3s ease'
              }}
            >
              ↶
            </Button>

            <Button
              onClick={redo}
              disabled={!canRedo}
              title={redoAction ? `Redo: ${redoAction} (Ctrl+Y)` : 'Redo (Ctrl+Y)'}
              style={{
                background: canRedo ? 'var(--surface-elevated)' : 'var(--surface-glass)',
                border: '1px solid var(--border-subtle)',
                color: canRedo ? 'var(--text-primary)' : 'var(--text-muted)',
                padding: '0.4rem 0.6rem',
                borderRadius: '6px',
                cursor: canRedo ? 'pointer' : 'not-allowed',
                fontSize: '0.8rem',
                fontWeight: '500',
                transition: 'all 0.3s ease'
              }}
            >
              ↷
            </Button>
          </div>

          {/* Center: Mode Toggle */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            background: 'var(--surface-glass)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '0.2rem'
          }}>
            <button
              onClick={() => setCreationMode('bricks')}
              style={{
                background: creationMode === 'bricks' ? 'var(--gradient-primary)' : 'transparent',
                border: 'none',
                color: creationMode === 'bricks' ? 'white' : 'var(--text-muted)',
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: '500',
                transition: 'all 0.2s ease'
              }}
            >
              🧱
            </button>
            <button
              onClick={() => setCreationMode('forms')}
              style={{
                background: creationMode === 'forms' ? 'var(--gradient-primary)' : 'transparent',
                border: 'none',
                color: creationMode === 'forms' ? 'white' : 'var(--text-muted)',
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: '500',
                transition: 'all 0.2s ease'
              }}
            >
              📐
            </button>
            <button
              onClick={() => setCreationMode('building')}
              style={{
                background: creationMode === 'building' ? 'var(--gradient-primary)' : 'transparent',
                border: 'none',
                color: creationMode === 'building' ? 'white' : 'var(--text-muted)',
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: '500',
                transition: 'all 0.2s ease'
              }}
            >
              🏢
            </button>
          </div>

          {/* Right: Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              background: 'var(--surface-glass)',
              border: '1px solid var(--border-subtle)',
              padding: '0.35rem 0.6rem', borderRadius: '6px',
              color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 600
            }}>
              <input
                type="checkbox"
                checked={isProjectPublic}
                onChange={(e) => setIsProjectPublic(e.target.checked)}
                style={{ width: '14px', height: '14px' }}
              />
              Public
            </label>

            <Button
              onClick={handleNewProject}
              style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-primary)',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: '600',
                whiteSpace: 'nowrap'
              }}
              title="Create a new project"
            >
              📄 New
            </Button>

            <Button
              onClick={handleSaveProject}
              disabled={isSaving || isExporting}
              style={{
                background: (isSaving || isExporting) ? 'var(--surface-glass)' : 'var(--gradient-primary)',
                border: 'none',
                color: (isSaving || isExporting) ? 'var(--text-muted)' : 'white',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                fontSize: '0.8rem',
                fontWeight: '600',
                whiteSpace: 'nowrap'
              }}
            >
              {isSaving ? '💾' : '💾 Save'}
            </Button>

            <Button
              onClick={handleLoadProject}
              style={{
                background: 'var(--surface-glass)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: '600',
                whiteSpace: 'nowrap'
              }}
            >
              📂 Load
            </Button>
          </div>
        </div>

        {/* Bottom Row: Mode-Specific Controls (Collapsible) */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem',
          flexWrap: 'wrap',
          minHeight: '40px'
        }}>
          {/* CSG Operations - show when 2 forms selected */}
          {selectedObjects.length === 2 && 
           sceneObjects.filter(obj => selectedObjects.includes(obj.id) && obj.type === 'form').length === 2 && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              background: 'var(--surface-glass)',
              border: '1px solid var(--accent-blue)',
              borderRadius: '8px',
              padding: '0.3rem 0.5rem'
            }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                CSG:
              </span>
              <Button
                onClick={() => performCSGOnSelectedForms('union')}
                title="Union"
                style={{
                  background: 'var(--accent-green)',
                  border: 'none',
                  color: 'white',
                  padding: '0.2rem 0.4rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontWeight: '500'
                }}
              >
                ∪
              </Button>
              <Button
                onClick={() => performCSGOnSelectedForms('subtract')}
                title="Subtract"
                style={{
                  background: 'var(--accent-orange)',
                  border: 'none',
                  color: 'white',
                  padding: '0.2rem 0.4rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontWeight: '500'
                }}
              >
                −
              </Button>
              <Button
                onClick={() => performCSGOnSelectedForms('intersect')}
                title="Intersect"
                style={{
                  background: 'var(--accent-purple)',
                  border: 'none',
                  color: 'white',
                  padding: '0.2rem 0.4rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontWeight: '500'
                }}
              >
                ∩
              </Button>
            </div>
          )}

          {/* Forms Mode Controls */}
          {creationMode === 'forms' && (
            <>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.3rem',
                background: 'var(--surface-glass)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '0.3rem'
              }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <input
                    type="checkbox"
                    checked={isHollowMode}
                    onChange={(e) => setIsHollowMode(e.target.checked)}
                    style={{ width: '12px', height: '12px' }}
                  />
                  Hollow
                </label>
              </div>
              
              {formCreator.getAllForms().map((form) => (
                <Button
                  key={form.id}
                  onClick={() => addNewForm(form.id)}
                  style={{
                    background: 'var(--gradient-secondary)',
                    border: 'none',
                    color: 'white',
                    padding: '0.3rem 0.6rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    transition: 'all 0.3s ease',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {form.icon}
                </Button>
              ))}
            </>
          )}

          {/* Building Mode Controls */}
          {creationMode === 'building' && (
            <>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.3rem',
                background: 'var(--surface-glass)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '0.3rem'
              }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', minWidth: '30px' }}>
                  Style:
                </label>
                <select
                  value={selectedBuildingStyle}
                  onChange={(e) => setSelectedBuildingStyle(e.target.value as keyof typeof BuildingStyles)}
                  style={{
                    background: 'var(--dark-surface)',
                    color: 'white',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    padding: '0.2rem 0.4rem',
                    fontSize: '0.7rem',
                    minWidth: '120px'
                  }}
                >
                  <option value="ModernSkyscraper">🏗️ Modern</option>
                  <option value="EcoTower">🌿 Eco</option>
                  <option value="OrganicResidential">🏡 Organic</option>
                  <option value="FutureOffice">🚀 Future</option>
                </select>
              </div>

              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.3rem',
                background: 'var(--surface-glass)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '0.3rem'
              }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Floors:</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={buildingParameters.floors.floorCount}
                  onChange={(e) => setBuildingParameters(prev => ({
                    ...prev,
                    floors: { ...prev.floors, floorCount: parseInt(e.target.value) || 1 }
                  }))}
                  style={{
                    background: 'var(--dark-surface)',
                    color: 'white',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '4px',
                    padding: '0.2rem',
                    fontSize: '0.7rem',
                    width: '50px'
                  }}
                />
              </div>

              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.3rem',
                fontSize: '0.7rem',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                background: voxelEditMode ? 'var(--accent-cyan)' : 'var(--surface-glass)',
                padding: '0.3rem 0.5rem',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)'
              }}>
                <input
                  type="checkbox"
                  checked={voxelEditMode}
                  onChange={(e) => setVoxelEditMode(e.target.checked)}
                  style={{ width: '12px', height: '12px' }}
                />
                🎨 Voxel
              </label>



              {!currentVoxelHierarchy ? (
                <Button
                  onClick={generateBuildingFromSelectedForms}
                  disabled={isGeneratingBuilding || selectedObjects.length !== 1}
                  style={{
                    background: selectedObjects.length === 1 && !isGeneratingBuilding 
                      ? 'var(--gradient-primary)' : 'var(--surface-disabled)',
                    border: 'none',
                    color: selectedObjects.length === 1 && !isGeneratingBuilding ? 'white' : 'var(--text-muted)',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '6px',
                    cursor: selectedObjects.length === 1 && !isGeneratingBuilding ? 'pointer' : 'not-allowed',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {isGeneratingBuilding ? '⏳' : (voxelEditMode ? '🏗️ Voxels' : '🏗️ Build')}
                </Button>
              ) : (
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  <Button
                    onClick={convertVoxelsToMesh}
                    disabled={isGeneratingBuilding}
                    style={{
                      background: !isGeneratingBuilding ? 'var(--gradient-success)' : 'var(--surface-disabled)',
                      border: 'none',
                      color: !isGeneratingBuilding ? 'white' : 'var(--text-muted)',
                      padding: '0.4rem 0.6rem',
                      borderRadius: '6px',
                      fontSize: '0.7rem',
                      fontWeight: '600'
                    }}
                  >
                    ✨ Convert
                  </Button>
                  <Button
                    onClick={() => {
                      setCurrentVoxelHierarchy(null);
                      setSelectedFormForVoxelEdit(null);
                      setVoxelEditMode(false);
                    }}
                    style={{
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                      padding: '0.4rem 0.6rem',
                      borderRadius: '6px',
                      fontSize: '0.7rem'
                    }}
                  >
                    ❌
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Interface - Fixed Layout */}
      <div style={{ 
        display: 'flex', 
        flex: 1,
        position: 'relative',
        zIndex: 1,
        height: window.innerWidth < 768 ? 'calc(100vh - 200px)' : 'calc(100vh - 180px)', // Responsive height
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
                  {selectedObjects.length === 2 && 
                   sceneObjects.filter(obj => selectedObjects.includes(obj.id) && obj.type === 'form').length === 2 && (
                    <div style={{ 
                      marginTop: '0.5rem', 
                      padding: '0.5rem', 
                      background: 'var(--accent-blue)', 
                      borderRadius: '4px', 
                      fontSize: '0.7rem',
                      color: 'white'
                    }}>
                      🔧 CSG operations available! 🟢 Green = Base form, 🔴 Red = Cutter form
                    </div>
                  )}
                </div>
                
                {sceneObjects.map(obj => (
                  <div 
                    key={obj.id}
                    style={{ 
                      padding: '0.75rem', 
                      background: (() => {
                        const selectionIndex = selectedObjects.indexOf(obj.id);
                        if (selectionIndex === 0) return '#00ff8822'; // First selected - green tint
                        if (selectionIndex === 1) return '#ff444422'; // Second selected - red tint
                        if (selectedObjects.includes(obj.id)) return 'var(--accent-blue)'; // Other selections
                        return 'var(--surface-glass)'; // Not selected
                      })(),
                      borderRadius: '6px',
                      cursor: 'pointer',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      transition: 'all 0.2s ease',
                      border: (() => {
                        const selectionIndex = selectedObjects.indexOf(obj.id);
                        if (selectionIndex === 0) return '2px solid #00ff88'; // First selected - green border
                        if (selectionIndex === 1) return '2px solid #ff4444'; // Second selected - red border
                        return '1px solid var(--border-subtle)'; // Default border
                      })()
                    }}
                    onClick={() => handleObjectSelect(obj.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setOutlinerContextMenu({
                        visible: true,
                        x: event.clientX,
                        y: event.clientY,
                        targetObject: obj
                      });
                    }}
                  >
                    <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1rem' }}>
                        {obj.type === 'brick' && '🧱'}
                        {obj.type === 'form' && (
                          obj.formId === 'custom-csg' ? '🔧' :
                          obj.formId === 'cube' ? '🧊' : 
                          obj.formId === 'sphere' ? '⚫' : 
                          obj.formId === 'cylinder' ? '🥫' : '📐'
                        )}
                        {obj.type === 'anchor' && '⚓'}
                        {obj.type === 'group' && '📁'}
                      </span>
                      {obj.name}
                      {(() => {
                        const selectionIndex = selectedObjects.indexOf(obj.id);
                        if (selectionIndex === 0) {
                          return <span style={{ fontSize: '0.7rem', color: '#00ff88', fontWeight: 'bold', marginLeft: '0.25rem' }}>1st (Base)</span>;
                        }
                        if (selectionIndex === 1) {
                          return <span style={{ fontSize: '0.7rem', color: '#ff4444', fontWeight: 'bold', marginLeft: '0.25rem' }}>2nd (Cutter)</span>;
                        }
                        return null;
                      })()}
                      {obj.type === 'form' && obj.isHollow && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          (hollow)
                        </span>
                      )}
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
            onDuplicateObjects={duplicateObjects}
            onDeleteObjects={deleteObjects}
            onToggleVisibility={toggleObjectsVisibility}
            onSelectAll={selectAllObjects}
            onDeselectAll={deselectAllObjects}
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
                  {currentVoxelHierarchy ? '🎨 Voxel Editor' : 'Properties'}
                </h3>
              </div>

              {/* Properties Content */}
              <div style={{ 
                flex: 1, 
                overflowY: 'auto',
                padding: '1rem'
              }}>
                {/* Voxel Editor Panel */}
                {currentVoxelHierarchy ? (
                  <div>
                    {/* Tool Selection */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        Editing Tool
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                        {[
                          { tool: 'add', icon: '➕', label: 'Add' },
                          { tool: 'remove', icon: '➖', label: 'Remove' },
                          { tool: 'paint', icon: '🎨', label: 'Paint' }
                        ].map(({ tool, icon, label }) => (
                          <button
                            key={tool}
                            onClick={() => setVoxelEditTool(tool as any)}
                            style={{
                              padding: '0.75rem 0.5rem',
                              fontSize: '0.75rem',
                              border: '1px solid var(--border-strong)',
                              borderRadius: '4px',
                              background: voxelEditTool === tool ? 'var(--accent-cyan)' : 'var(--surface-elevated)',
                              color: voxelEditTool === tool ? 'var(--surface-primary)' : 'var(--text-primary)',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                          >
                            <span style={{ fontSize: '1rem' }}>{icon}</span>
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Voxel Role Selection */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        Voxel Type
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        {[
                          { role: 'mass', icon: '🟫', label: 'Mass', color: '#8B4513' },
                          { role: 'facade', icon: '🔵', label: 'Wall', color: '#4169E1' },
                          { role: 'floor', icon: '🟢', label: 'Floor', color: '#32CD32' },
                          { role: 'component', icon: '🔴', label: 'Roof', color: '#DC143C' }
                        ].map(({ role, icon, label, color }) => (
                          <button
                            key={role}
                            onClick={() => setSelectedVoxelRole(role as any)}
                            style={{
                              padding: '0.75rem 0.5rem',
                              fontSize: '0.75rem',
                              border: `2px solid ${selectedVoxelRole === role ? color : 'var(--border-strong)'}`,
                              borderRadius: '4px',
                              background: selectedVoxelRole === role ? `${color}20` : 'var(--surface-elevated)',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                          >
                            <span style={{ fontSize: '1rem' }}>{icon}</span>
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Brush Size */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        Brush Size: {voxelBrushSize}×{voxelBrushSize}×{voxelBrushSize}
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        value={voxelBrushSize}
                        onChange={(e) => setVoxelBrushSize(parseInt(e.target.value))}
                        style={{ 
                          width: '100%',
                          marginBottom: '0.5rem'
                        }}
                      />
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        fontSize: '0.7rem', 
                        color: 'var(--text-secondary)' 
                      }}>
                        <span>1×1×1</span>
                        <span>5×5×5</span>
                      </div>
                    </div>

                    {/* Placement Mode */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        Placement Mode
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <button
                          onClick={() => setVoxelPlacementMode('direct')}
                          style={{
                            padding: '0.75rem 0.5rem',
                            fontSize: '0.75rem',
                            border: `2px solid ${voxelPlacementMode === 'direct' ? 'var(--accent-cyan)' : 'var(--border-strong)'}`,
                            borderRadius: '4px',
                            background: voxelPlacementMode === 'direct' ? 'var(--accent-cyan)20' : 'var(--surface-elevated)',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                        >
                          <span style={{ fontSize: '1rem' }}>🎯</span>
                          <span>Direct</span>
                        </button>
                        <button
                          onClick={() => setVoxelPlacementMode('adjacent')}
                          style={{
                            padding: '0.75rem 0.5rem',
                            fontSize: '0.75rem',
                            border: `2px solid ${voxelPlacementMode === 'adjacent' ? 'var(--accent-cyan)' : 'var(--border-strong)'}`,
                            borderRadius: '4px',
                            background: voxelPlacementMode === 'adjacent' ? 'var(--accent-cyan)20' : 'var(--surface-elevated)',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                        >
                          <span style={{ fontSize: '1rem' }}>🧩</span>
                          <span>Adjacent</span>
                        </button>
                      </div>
                    </div>

                    {/* Instructions */}
                    <div style={{
                      background: 'var(--surface-primary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '1rem',
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.4
                    }}>
                      <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: 'var(--accent-cyan)' }}>
                        🎯 How to Edit:
                      </div>
                      <div style={{ marginBottom: '0.5rem' }}>
                        1. Select a tool (Add/Remove/Paint)
                      </div>
                      <div style={{ marginBottom: '0.5rem' }}>
                        2. Choose voxel type (Mass/Wall/Floor/Roof)
                      </div>
                      <div style={{ marginBottom: '0.5rem' }}>
                        3. Select placement mode (Direct/Adjacent)
                      </div>
                      <div style={{ marginBottom: '0.5rem' }}>
                        4. Adjust brush size if needed
                      </div>
                      <div>
                        5. Click on the building to edit voxels
                      </div>
                      
                      <div style={{ marginTop: '0.75rem', fontSize: '0.7rem', fontStyle: 'italic' }}>
                        <strong>Direct:</strong> Places voxels exactly where you click<br/>
                        <strong>Adjacent:</strong> Places voxels next to existing ones (Minecraft-style)
                      </div>
                    </div>
                  </div>
                ) : selectedObjectProperties ? (
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

      {/* Outliner Context Menu */}
      <ContextMenu
        visible={outlinerContextMenu.visible}
        x={outlinerContextMenu.x}
        y={outlinerContextMenu.y}
        options={getOutlinerContextMenuOptions(outlinerContextMenu.targetObject)}
        onClose={closeOutlinerContextMenu}
      />
    </div>
  );
} 