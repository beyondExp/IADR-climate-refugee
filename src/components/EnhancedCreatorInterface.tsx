import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Button } from './ui/button';
import ContextMenu, { type ContextMenuOption } from './ui/ContextMenu';
import { useAuth } from '../contexts/AuthContext';
import { useDatabaseStore } from '../stores/database';
import ProjectModal from './ProjectModal';
import SimpleQRGenerator from './SimpleQRGenerator';
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
  type: 'brick' | 'anchor' | 'group' | 'form' | 'vine';
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
  
  // Vine properties
  vineType?: 'vine1' | 'vine2';
  modelPath?: string;
}

interface ObjectProperties {
  id: string;
  name: string;
  type: 'brick' | 'anchor' | 'group' | 'form' | 'vine';
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
    currentProject,
    updateProject
  } = useDatabaseStore();
  
  // Check for offline projects on load
  const offlineProjects = JSON.parse(localStorage.getItem('offline_projects') || '[]');

  // Panel visibility state
  const [isOutlinerVisible, setIsOutlinerVisible] = useState(true);
  const [isPropertyVisible, setIsPropertyVisible] = useState(true);
  const [isMaterialVisible, setIsMaterialVisible] = useState(true);
  const [isQRVisible, setIsQRVisible] = useState(false);
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
  const [selectedObjectType, setSelectedObjectType] = useState<'brick' | 'vine1' | 'vine2'>('brick');
  const [isProjectPublic, setIsProjectPublic] = useState(false);

  // Form creator state
  const [creationMode, setCreationMode] = useState<'bricks' | 'forms' | 'building' | 'annotations'>('bricks');
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

  // Annotation interface
  interface Annotation {
    id: string;
    position: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    text: string;
    title?: string;
    color?: string;
    type?: 'info' | 'warning' | 'construction' | 'measurement';
    visible?: boolean;
    createdAt?: string;
  }

  // Annotation mode state
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  const [isPlacingAnnotation, setIsPlacingAnnotation] = useState(false);
  const [pendingAnnotation, setPendingAnnotation] = useState<Omit<Annotation, 'id'> | null>(null);
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const [selectedAnnotationType, setSelectedAnnotationType] = useState<'info' | 'warning' | 'construction' | 'measurement'>('info');

  // Connection system state
  const [connectionMode, setConnectionMode] = useState(true);
  const [connectionConfigs, setConnectionConfigs] = useState<Record<string, any>>({});
  
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

  // Load connection configurations
  
  // Helper function to validate connection angle between two bricks
  const isValidConnectionAngle = (
    brick1Pos: { x: number, y: number, z: number },
    brick1Rotation: { x: number, y: number, z: number },
    connector1Pos: { x: number, y: number, z: number },
    brick2Pos: { x: number, y: number, z: number },
    brick2Rotation: { x: number, y: number, z: number },
    connector2Pos: { x: number, y: number, z: number },
    maxAngleDegrees: number = 5,
    logDetails: boolean = true
  ): boolean => {
    // Convert rotation to rotation matrices
    const rotMatrix1 = new THREE.Euler(brick1Rotation.x, brick1Rotation.y, brick1Rotation.z);
    const rotMatrix2 = new THREE.Euler(brick2Rotation.x, brick2Rotation.y, brick2Rotation.z);
    
    // Transform local connector positions to world space
    const worldConnector1 = new THREE.Vector3(connector1Pos.x, connector1Pos.y, connector1Pos.z);
    worldConnector1.applyEuler(rotMatrix1);
    worldConnector1.add(new THREE.Vector3(brick1Pos.x, brick1Pos.y, brick1Pos.z));
    
    const worldConnector2 = new THREE.Vector3(connector2Pos.x, connector2Pos.y, connector2Pos.z);
    worldConnector2.applyEuler(rotMatrix2);
    worldConnector2.add(new THREE.Vector3(brick2Pos.x, brick2Pos.y, brick2Pos.z));
    
    // Calculate vectors from brick centers to connectors
    const centerToConnector1 = new THREE.Vector3();
    centerToConnector1.subVectors(worldConnector1, new THREE.Vector3(brick1Pos.x, brick1Pos.y, brick1Pos.z));
    centerToConnector1.normalize();
    
    const centerToConnector2 = new THREE.Vector3();
    centerToConnector2.subVectors(worldConnector2, new THREE.Vector3(brick2Pos.x, brick2Pos.y, brick2Pos.z));
    centerToConnector2.normalize();
    
    // For valid connection, vectors should point toward each other (180° apart)
    // So their dot product should be close to -1
    const dotProduct = centerToConnector1.dot(centerToConnector2);
    const angleBetween = Math.acos(Math.max(-1, Math.min(1, dotProduct))) * (180 / Math.PI);
    
    // Check if vectors are pointing toward each other (should be ~180° apart)
    const idealAngle = 180;
    const angleDeviation = Math.abs(angleBetween - idealAngle);
    
    if (logDetails) {
      console.log(`🔍 Connection angle check: ${angleDeviation.toFixed(2)}° deviation (max allowed: ${maxAngleDegrees}°)`);
    }
    
    return angleDeviation <= maxAngleDegrees;
  };
  
  // Get visual color for connection validity
  const getConnectionValidityColor = (canConnect: boolean): string => {
    return canConnect ? '#4CAF50' : '#F44336'; // Green for valid, red for invalid
  };

  // Helper function to check if two bricks can connect
  const canBricksConnect = (
    brick1: SceneObject, 
    brick2: SceneObject, 
    config: any,
    maxAngleDegrees: number = 5
  ): { canConnect: boolean; bestAngleDeviation: number } => {
    if (!brick1.position || !brick2.position || !brick1.rotation || !brick2.rotation || !config.connections) {
      return { canConnect: false, bestAngleDeviation: 180 };
    }
    
    const maleConnectors = config.connections.filter((c: any) => c.type === 'male');
    const femaleConnectors = config.connections.filter((c: any) => c.type === 'female');
    
    let bestAngleDeviation = 180;
    let canConnect = false;
    
    // Check all male-female combinations
    for (const male of maleConnectors) {
      for (const female of femaleConnectors) {
        // Check brick1 male to brick2 female
        if (isValidConnectionAngle(
          brick1.position, brick1.rotation, male.localPosition,
          brick2.position, brick2.rotation, female.localPosition,
          maxAngleDegrees,
          false // Disable logging for bulk checks
        )) {
          canConnect = true;
          bestAngleDeviation = 0; // Within tolerance means effectively 0
          break;
        }
        
        // Check brick2 male to brick1 female
        if (isValidConnectionAngle(
          brick2.position, brick2.rotation, male.localPosition,
          brick1.position, brick1.rotation, female.localPosition,
          maxAngleDegrees,
          false // Disable logging for bulk checks
        )) {
          canConnect = true;
          bestAngleDeviation = 0; // Within tolerance means effectively 0
          break;
        }
      }
      if (canConnect) break;
    }
    
    return { canConnect, bestAngleDeviation };
  };

  // Analyze connection alignment for debugging
  const analyzeConnectionAlignment = (bricks: SceneObject[], config: any, dimensions: { brickWidth: number, brickHeight: number, brickDepth: number }) => {
    const analysis = {
      gridAlignment: {
        alignedCount: 0,
        misalignedCount: 0,
        misalignedExamples: [] as any[]
      },
      nearbyBricks: {
        pairsFound: 0,
        averageDistance: 0,
        closestPair: null as any,
        validAngleNeighbors: [] as any[],
        invalidAngleNeighbors: [] as any[]
      },
      connectionPotential: {
        theoreticalConnections: 0,
        viableConnections: 0,
        angleValidConnections: 0,
        angleInvalidConnections: 0
      },
      intersections: {
        totalIntersecting: 0,
        intersectingPairs: [] as any[],
        percentageIntersecting: '0%' as string
      }
    };
    
    // Check grid alignment
    bricks.forEach((brick, i) => {
      if (!brick.position) return;
      
      const gridX = Math.round(brick.position.x / dimensions.brickWidth) * dimensions.brickWidth;
      const gridY = Math.round(brick.position.y / dimensions.brickHeight) * dimensions.brickHeight;
      const gridZ = Math.round(brick.position.z / dimensions.brickDepth) * dimensions.brickDepth;
      
      const isAligned = 
        Math.abs(brick.position.x - gridX) < 0.002 &&
        Math.abs(brick.position.y - gridY) < 0.002 &&
        Math.abs(brick.position.z - gridZ) < 0.002;
      
      if (isAligned) {
        analysis.gridAlignment.alignedCount++;
      } else {
        analysis.gridAlignment.misalignedCount++;
        if (analysis.gridAlignment.misalignedExamples.length < 3) {
          analysis.gridAlignment.misalignedExamples.push({
            brick: brick.id,
            actual: brick.position,
            expected: { x: gridX, y: gridY, z: gridZ },
            offset: {
              x: brick.position.x - gridX,
              y: brick.position.y - gridY,
              z: brick.position.z - gridZ
            }
          });
        }
      }
    });
    
    // Find nearby brick pairs and check connection angles
    let minDistance = Infinity;
    let closestPair = null;
    let totalDistance = 0;
    let pairCount = 0;
    
    // Get connection points from config
    const maleConnectors = config.connections.filter((c: any) => c.type === 'male');
    const femaleConnectors = config.connections.filter((c: any) => c.type === 'female');
    
    for (let i = 0; i < Math.min(bricks.length, 20); i++) {
      for (let j = i + 1; j < Math.min(bricks.length, 20); j++) {
        const brick1 = bricks[i];
        const brick2 = bricks[j];
        const pos1 = brick1.position;
        const pos2 = brick2.position;
        const rot1 = brick1.rotation || { x: 0, y: 0, z: 0 };
        const rot2 = brick2.rotation || { x: 0, y: 0, z: 0 };
        
        if (!pos1 || !pos2) continue;
        
        const dist = Math.sqrt(
          Math.pow(pos1.x - pos2.x, 2) +
          Math.pow(pos1.y - pos2.y, 2) +
          Math.pow(pos1.z - pos2.z, 2)
        );
        
        if (dist < minDistance) {
          minDistance = dist;
          closestPair = {
            brick1: brick1.id,
            brick2: brick2.id,
            distance: dist,
            positions: {
              brick1: pos1,
              brick2: pos2
            },
            rotations: {
              brick1: rot1,
              brick2: rot2
            }
          };
        }
        
        // Count pairs that are close enough to potentially connect
        if (dist < dimensions.brickWidth * 1.5) {
          pairCount++;
          totalDistance += dist;
          analysis.connectionPotential.theoreticalConnections++;
          
          // Check if bricks can connect with valid angle
          const connectionResult = canBricksConnect(brick1, brick2, config, 5);
          
          if (connectionResult.canConnect) {
            analysis.connectionPotential.angleValidConnections++;
            if (analysis.nearbyBricks.validAngleNeighbors.length < 5) {
              analysis.nearbyBricks.validAngleNeighbors.push({
                brick1: brick1.id,
                brick2: brick2.id,
                distance: dist,
                angle: 'Valid (< 5°)'
              });
            }
          } else {
            analysis.connectionPotential.angleInvalidConnections++;
            if (analysis.nearbyBricks.invalidAngleNeighbors.length < 5) {
              analysis.nearbyBricks.invalidAngleNeighbors.push({
                brick1: brick1.id,
                brick2: brick2.id,
                distance: dist,
                angle: 'Invalid (> 5°)'
              });
            }
          }
        }
      }
    }
    
    analysis.nearbyBricks.pairsFound = pairCount;
    analysis.nearbyBricks.averageDistance = pairCount > 0 ? totalDistance / pairCount : 0;
    analysis.nearbyBricks.closestPair = closestPair;
    analysis.connectionPotential.viableConnections = analysis.connectionPotential.angleValidConnections;
    
    // Check for intersecting bricks
    const intersectionThreshold = Math.min(dimensions.brickWidth, dimensions.brickHeight, dimensions.brickDepth) * 0.9;
    let intersectingCount = 0;
    
    for (let i = 0; i < bricks.length; i++) {
      for (let j = i + 1; j < bricks.length; j++) {
        const pos1 = bricks[i].position;
        const pos2 = bricks[j].position;
        if (!pos1 || !pos2) continue;
        
        // Check if bricks are overlapping (center-to-center distance less than brick size)
        const dx = Math.abs(pos1.x - pos2.x);
        const dy = Math.abs(pos1.y - pos2.y);
        const dz = Math.abs(pos1.z - pos2.z);
        
        // Bricks intersect if they overlap in all three dimensions
        const overlapX = dx < dimensions.brickWidth * 0.9;
        const overlapY = dy < dimensions.brickHeight * 0.9;
        const overlapZ = dz < dimensions.brickDepth * 0.9;
        
        if (overlapX && overlapY && overlapZ) {
          intersectingCount++;
          if (analysis.intersections.intersectingPairs.length < 10) {
            analysis.intersections.intersectingPairs.push({
              brick1: bricks[i].id,
              brick2: bricks[j].id,
              positions: {
                brick1: pos1,
                brick2: pos2
              },
              overlap: {
                x: dimensions.brickWidth - dx,
                y: dimensions.brickHeight - dy,
                z: dimensions.brickDepth - dz
              },
              rotations: {
                brick1: bricks[i].rotation || { x: 0, y: 0, z: 0 },
                brick2: bricks[j].rotation || { x: 0, y: 0, z: 0 }
              }
            });
          }
        }
      }
    }
    
    analysis.intersections.totalIntersecting = intersectingCount;
    analysis.intersections.percentageIntersecting = bricks.length > 0 ? 
      (intersectingCount * 2 / bricks.length * 100).toFixed(1) + '%' : '0%';
    
    return analysis;
  };

  const loadConnectionConfigs = async () => {
    try {
      console.log('🔄 Loading brick connection configurations...');
      
      // Add timeout to prevent hanging
      const loadWithTimeout = async (brickId: string, brickType: string) => {
        return Promise.race([
          BrickConnectionLoader.getConnectionsForBrick(brickId, brickType),
          new Promise<null>((resolve) => setTimeout(() => {
            console.log(`⏱️ Timeout loading ${brickId}`);
            resolve(null);
          }, 3000))
        ]);
      };
      
      // Try loading default_octa2 first, then fall back to octa2
      let octa2Config = await loadWithTimeout('default_octa2', 'octa2');
      
      if (!octa2Config || octa2Config.length === 0) {
        console.log('📦 Trying fallback to octa2...');
        octa2Config = await loadWithTimeout('octa2', 'octa2');
      }
      
      console.log('📦 Octa2 config loaded:', octa2Config);
      
      // Parse the connection config to get dimensions
      if (octa2Config && octa2Config.length > 0) {
        // Calculate dimensions from connection points
        const bounds = {
          minX: Infinity, maxX: -Infinity,
          minY: Infinity, maxY: -Infinity,
          minZ: Infinity, maxZ: -Infinity
        };
        
        octa2Config.forEach(conn => {
          if (conn.localPosition) {
            bounds.minX = Math.min(bounds.minX, conn.localPosition.x);
            bounds.maxX = Math.max(bounds.maxX, conn.localPosition.x);
            bounds.minY = Math.min(bounds.minY, conn.localPosition.y);
            bounds.maxY = Math.max(bounds.maxY, conn.localPosition.y);
            bounds.minZ = Math.min(bounds.minZ, conn.localPosition.z);
            bounds.maxZ = Math.max(bounds.maxZ, conn.localPosition.z);
          }
        });
        
        const configWithDimensions = {
          connections: octa2Config,
          dimensions: {
            width: Math.max(bounds.maxX - bounds.minX, 0.3) * 2, // Double the connector spacing
            height: Math.max(bounds.maxY - bounds.minY, 0.2) * 2,
            depth: Math.max(bounds.maxZ - bounds.minZ, 0.2) * 2
          }
        };
        
        setConnectionConfigs(prev => ({
          ...prev,
          octa2: configWithDimensions,
          'clay-sustainable': configWithDimensions // Map clay-sustainable to octa2 config
        }));
        
        console.log('✅ Loaded connection configs with dimensions:', configWithDimensions);
      }
    } catch (error) {
      console.error('❌ Failed to load connection configs:', error);
    }
  };

  

  // Initialize brick connection configurations
  useEffect(() => {
    console.log('🚀 Component mounted, loading connection configs...');
    loadConnectionConfigs();
    
    const initializeConnections = async () => {
      try {
        console.log('🔗 Initializing brick connection configurations...');
        await BrickConnectionLoader.preloadConnections();
        console.log('✅ Brick connection configurations initialized');
        
        // Try loading configs again after preload
        await loadConnectionConfigs();
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

  // Load current project on mount if it exists
  useEffect(() => {
    if (currentProject) {
      console.log('🔄 Restoring current project on mount:', currentProject.name);
      
      // Check if this is just the initial demo scene
      const isInitialDemoScene = sceneObjects.length === 5 && 
        sceneObjects.some(obj => obj.id === 'brick-foundation-1') &&
        sceneObjects.some(obj => obj.id === 'anchor-foundation');
      
      const projectHasData = (currentProject as any).project_structure?.sceneObjects;
      
      if (projectHasData) {
        if (isInitialDemoScene) {
          console.log('📦 Loading project scene objects (replacing demo scene)...');
          handleSelectProject(currentProject);
        } else {
          console.log('✅ Project scene already loaded:', sceneObjects.length, 'objects');
        }
      } else {
        console.log('⚠️ Current project has no saved scene data');
      }
    }
  }, []); // Only run on mount

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
    scale: { x: 0.002, y: 0.002, z: 0.002 }
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
        
        // Update selected material to match the selected brick's material
        if (selectedObj.type === 'brick' && selectedObj.brickType) {
          setSelectedMaterial(selectedObj.brickType);
        }
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
    material: sceneObjects.find(obj => obj.id === selectedObjects[0])?.brickType || selectedMaterial,
    color: '#8B4513',
    opacity: 1.0,
    metadata: {
      brickType: sceneObjects.find(obj => obj.id === selectedObjects[0])?.brickType || selectedMaterial,
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
    
    // Update material for all selected bricks
    if (selectedObjects.length > 0) {
      setSceneObjects(prev => prev.map(obj => {
        if (selectedObjects.includes(obj.id) && obj.type === 'brick') {
          console.log(`🎨 Updating brick ${obj.id} material from ${obj.brickType || 'default'} to ${materialId}`);
          return { ...obj, brickType: materialId };
        }
        return obj;
      }));
      
      // Add to history
      setTimeout(() => addToHistory('Change Material'), 0);
    }
  };

  const addNewObject = async () => {
    if (selectedObjectType === 'brick') {
      // Original brick creation logic
      const existingBricks = sceneObjects.filter(obj => obj.type === 'brick');
      const brickCount = existingBricks.length;
      const brickId = `brick-${Date.now()}`;
      const brickType = selectedMaterial; // Use the selected material as brick type
      
      console.log(`🧱 Creating new brick: ${brickId} of type: ${brickType}`);
      
      // Smart positioning: place next to the most recent brick
      let newPosition = { x: 0, y: 0, z: 0 }; // Default position for first brick
      
      if (existingBricks.length > 0) {
        // Find the most recently added brick (last in array)
        const lastBrick = existingBricks[existingBricks.length - 1];
        if (lastBrick.position) {
          // Place new brick adjacent to the last one
          // Try different positions: right, forward, left, back
          const brickSpacing = 1.2; // Distance between brick centers
          const candidatePositions = [
            { x: lastBrick.position.x + brickSpacing, y: lastBrick.position.y, z: lastBrick.position.z }, // Right
            { x: lastBrick.position.x, y: lastBrick.position.y, z: lastBrick.position.z + brickSpacing }, // Forward
            { x: lastBrick.position.x - brickSpacing, y: lastBrick.position.y, z: lastBrick.position.z }, // Left
            { x: lastBrick.position.x, y: lastBrick.position.y, z: lastBrick.position.z - brickSpacing }, // Back
            { x: lastBrick.position.x, y: lastBrick.position.y + brickSpacing, z: lastBrick.position.z }  // Above
          ];
          
          // Find the first position that doesn't collide with existing bricks
          const minDistance = 0.8; // Minimum distance to avoid overlap
          for (const candidate of candidatePositions) {
            let hasCollision = false;
            for (const existingBrick of existingBricks) {
              if (existingBrick.position) {
                const dx = Math.abs(existingBrick.position.x - candidate.x);
                const dy = Math.abs(existingBrick.position.y - candidate.y);
                const dz = Math.abs(existingBrick.position.z - candidate.z);
                if (dx < minDistance && dy < minDistance && dz < minDistance) {
                  hasCollision = true;
                  break;
                }
              }
            }
            if (!hasCollision) {
              newPosition = candidate;
              break;
            }
          }
          
          // If all positions have collisions, use the first candidate anyway
          if (newPosition.x === 0 && newPosition.y === 0 && newPosition.z === 0) {
            newPosition = candidatePositions[0];
          }
        }
      }
      
      const newObject: SceneObject = {
        id: brickId,
        name: `Sustainable Brick ${brickCount + 1}`,
        type: 'brick',
        visible: true,
        locked: false,
        position: newPosition,
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
          console.error('❌ Failed to load connection points for brick:', error);
        });
    } else {
      // Create vine object  
      const existingVines = sceneObjects.filter(obj => obj.type === 'vine');
      const vineCount = existingVines.length;
      const vineId = `vine-${Date.now()}`;
      
      console.log(`🌿 Creating new ${selectedObjectType}: ${vineId}`);
      
      // Smart positioning for vines too
      let newPosition = { x: 0, y: 0, z: 0 }; // Default position for first vine
      
      if (existingVines.length > 0) {
        // Find the most recently added vine
        const lastVine = existingVines[existingVines.length - 1];
        if (lastVine.position) {
          // Place new vine adjacent to the last one (vines need more space)
          const vineSpacing = 2.5; // Distance between vine centers
          const candidatePositions = [
            { x: lastVine.position.x + vineSpacing, y: lastVine.position.y, z: lastVine.position.z }, // Right
            { x: lastVine.position.x, y: lastVine.position.y, z: lastVine.position.z + vineSpacing }, // Forward
            { x: lastVine.position.x - vineSpacing, y: lastVine.position.y, z: lastVine.position.z }, // Left
            { x: lastVine.position.x, y: lastVine.position.y, z: lastVine.position.z - vineSpacing }  // Back
          ];
          
          // Find the first position that doesn't collide with existing vines/objects
          const minDistance = 2.0; // Minimum distance to avoid overlap
          for (const candidate of candidatePositions) {
            let hasCollision = false;
            for (const existingObj of sceneObjects) {
              if (existingObj.position) {
                const dx = Math.abs(existingObj.position.x - candidate.x);
                const dy = Math.abs(existingObj.position.y - candidate.y);
                const dz = Math.abs(existingObj.position.z - candidate.z);
                if (dx < minDistance && dy < minDistance && dz < minDistance) {
                  hasCollision = true;
                  break;
                }
              }
            }
            if (!hasCollision) {
              newPosition = candidate;
              break;
            }
          }
          
          // If all positions have collisions, use the first candidate anyway
          if (newPosition.x === 0 && newPosition.y === 0 && newPosition.z === 0) {
            newPosition = candidatePositions[0];
          }
        }
      }
      
      const newObject: SceneObject = {
        id: vineId,
        name: `${selectedObjectType === 'vine1' ? 'Vine 1' : 'Vine 2'} ${vineCount + 1}`,
        type: 'vine', // Add vine as valid type
        visible: true,
        locked: false,
        position: newPosition,
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        vineType: selectedObjectType, // Store which vine GLB to use
        modelPath: `/${selectedObjectType}.glb` // Path to the GLB file
      };
      
      setSceneObjects(prev => [...prev, newObject]);
      setTimeout(() => addToHistory('Add Object'), 0);
    }
  };

  // Form creation function
  const addNewForm = (formId: string) => {
    const existingForms = sceneObjects.filter(obj => obj.type === 'form');
    const formCount = existingForms.length;
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
      position: (() => {
        // Smart positioning for forms
        let newPosition = { x: 0, y: 1, z: 0 }; // Default position (slightly elevated)
        
        if (existingForms.length > 0) {
          // Find the most recently added form
          const lastForm = existingForms[existingForms.length - 1];
          if (lastForm.position) {
            // Place new form adjacent to the last one
            const formSpacing = 3.0; // Distance between form centers
            const candidatePositions = [
              { x: lastForm.position.x + formSpacing, y: lastForm.position.y, z: lastForm.position.z }, // Right
              { x: lastForm.position.x, y: lastForm.position.y, z: lastForm.position.z + formSpacing }, // Forward
              { x: lastForm.position.x - formSpacing, y: lastForm.position.y, z: lastForm.position.z }, // Left
              { x: lastForm.position.x, y: lastForm.position.y, z: lastForm.position.z - formSpacing }  // Back
            ];
            
            // Find the first position that doesn't collide with existing objects
            const minDistance = 2.5; // Minimum distance to avoid overlap
            const existingForms = sceneObjects.filter(obj => obj.type === 'form');
            for (const candidate of candidatePositions) {
              let hasCollision = false;
              for (const existingObj of sceneObjects) {
                if (existingObj.position) {
                  const dx = Math.abs(existingObj.position.x - candidate.x);
                  const dy = Math.abs(existingObj.position.y - candidate.y);
                  const dz = Math.abs(existingObj.position.z - candidate.z);
                  if (dx < minDistance && dy < minDistance && dz < minDistance) {
                    hasCollision = true;
                    break;
                  }
                }
              }
              if (!hasCollision) {
                newPosition = candidate;
                break;
              }
            }
            
            // If all positions have collisions, use the first candidate anyway
            if (newPosition.x === 0 && newPosition.y === 1 && newPosition.z === 0) {
              newPosition = candidatePositions[0];
            }
          }
        }
        return newPosition;
      })(),
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

  // Brick building generation - Create brick structure from form
  const generateBrickBuildingFromForm = async () => {
    // Variables for debug info
    let brickHeightForDebug = 0.4;
    let brickWidthForDebug = 0.8;
    let brickDepthForDebug = 0.8;
    
    if (selectedObjects.length !== 1) {
      alert('Please select exactly one form to transform into a brick building');
      return;
    }

    const selectedForm = sceneObjects.find(obj => 
      selectedObjects.includes(obj.id) && obj.type === 'form'
    );

    if (!selectedForm || !selectedForm.formId) {
      alert('Please select a form object to transform into a brick building');
      return;
    }

    console.log('🏗️ Starting brick building generation from form:', selectedForm);
    setIsGeneratingBuilding(true);

    try {
      // Get form geometry
      const baseGeometry = formCreator.createFormGeometry(
        selectedForm.formId,
        selectedForm.formParameters || {}
      );

      if (!baseGeometry) {
        throw new Error('Failed to create form geometry');
      }

      const formPos = selectedForm.position || { x: 0, y: 0, z: 0 };
      const formScale = selectedForm.scale || { x: 1, y: 1, z: 1 };

      // Calculate bounds
      baseGeometry.computeBoundingBox();
      const bounds = baseGeometry.boundingBox!;
      const width = (bounds.max.x - bounds.min.x) * formScale.x;
      const height = (bounds.max.y - bounds.min.y) * formScale.y;
      const depth = (bounds.max.z - bounds.min.z) * formScale.z;

      console.log(`📏 Form dimensions: ${width.toFixed(2)} x ${height.toFixed(2)} x ${depth.toFixed(2)}`);

      const newBricks: SceneObject[] = [];
      const currentBrickCount = sceneObjects.filter(obj => obj.type === 'brick').length;
      let brickIndex = currentBrickCount;

      // Get connection config for the selected brick type
      console.log('🔍 Looking for connection config:', selectedMaterial);
      console.log('📋 Connection configs state:', connectionConfigs);
      console.log('📋 Available config keys:', Object.keys(connectionConfigs));
      
      // If configs not loaded yet, try loading them now (with timeout)
      if (Object.keys(connectionConfigs).length === 0) {
        console.log('⚠️ No configs loaded, attempting to load now...');
        try {
          await Promise.race([
            loadConnectionConfigs(),
            new Promise((resolve) => setTimeout(() => {
              console.log('⏱️ Config loading timeout, using defaults');
              resolve(null);
            }, 2000))
          ]);
        } catch (error) {
          console.error('❌ Failed to load configs:', error);
        }
      }
      
      let brickConfig = connectionConfigs[selectedMaterial || 'octa2'] || connectionConfigs['octa2'];
      
      // Fallback to default config if none loaded
      if (!brickConfig) {
        console.log('📦 Using hardcoded default config...');
        brickConfig = {
          connections: [
            // Using actual octa2 connection data
            { id: 'octa2_male_1', axis: 'y', type: 'male', strength: 1.0, isConnected: false, localPosition: { x: 0.3, y: 0, z: 0.265 }, localRotation: { x: 0, y: 0, z: 0 } },
            { id: 'octa2_male_2', axis: 'y', type: 'male', strength: 1.0, isConnected: false, localPosition: { x: -0.167, y: -0.3, z: 0.233 }, localRotation: { x: 0, y: 0, z: 0 } },
            { id: 'octa2_male_3', axis: 'y', type: 'male', strength: 1.0, isConnected: false, localPosition: { x: -0.180, y: 0.3, z: 0.238 }, localRotation: { x: 0, y: 0, z: 0 } },
            { id: 'octa2_female_1', axis: 'y', type: 'female', strength: 1.0, isConnected: false, localPosition: { x: -0.249, y: 0, z: -0.167 }, localRotation: { x: 0, y: 0, z: 0 } },
            { id: 'octa2_female_2', axis: 'y', type: 'female', strength: 1.0, isConnected: false, localPosition: { x: 0.124, y: 0.183, z: -0.164 }, localRotation: { x: 0, y: 0, z: 0 } },
            { id: 'octa2_female_3', axis: 'y', type: 'female', strength: 1.0, isConnected: false, localPosition: { x: 0.101, y: -0.189, z: -0.116 }, localRotation: { x: 0, y: 0, z: 0 } }
          ],
          dimensions: {
            width: 0.6,  
            height: 0.4, 
            depth: 0.4
          }
        };
      }
      
      console.log('📦 Brick config found:', !!brickConfig);
      if (brickConfig) {
        console.log('📦 Brick config details:', {
          hasDimensions: !!brickConfig.dimensions,
          dimensions: brickConfig.dimensions,
          hasConnections: !!brickConfig.connections,
          connectionCount: brickConfig.connections?.length || 0
        });
      }
      
      // Always use mesh surface sampling for proper form following
      {
        console.log('🔗 Using direct mesh surface sampling for accurate form following');
        
        // Analyze brick dimensions - use config dimensions if available
        let brickWidth = brickConfig?.dimensions?.width || 0.8;
        let brickHeight = brickConfig?.dimensions?.height || 0.4;
        let brickDepth = brickConfig?.dimensions?.depth || 0.8;
        
        if (brickConfig && brickConfig.connections && !brickConfig.dimensions) {
          // Only calculate from connections if dimensions not provided
          const connectorBounds = {
            minX: Infinity, maxX: -Infinity,
            minY: Infinity, maxY: -Infinity,
            minZ: Infinity, maxZ: -Infinity
          };
          
          // Find the bounds of all connectors
          for (const conn of brickConfig.connections) {
            if (conn.localPosition) {
              connectorBounds.minX = Math.min(connectorBounds.minX, conn.localPosition.x);
              connectorBounds.maxX = Math.max(connectorBounds.maxX, conn.localPosition.x);
              connectorBounds.minY = Math.min(connectorBounds.minY, conn.localPosition.y);
              connectorBounds.maxY = Math.max(connectorBounds.maxY, conn.localPosition.y);
              connectorBounds.minZ = Math.min(connectorBounds.minZ, conn.localPosition.z);
              connectorBounds.maxZ = Math.max(connectorBounds.maxZ, conn.localPosition.z);
            }
          }
          
          // Use connector-based dimensions if available
          if (connectorBounds.maxX !== -Infinity) {
            brickWidth = Math.max(connectorBounds.maxX - connectorBounds.minX, 0.8);
            brickHeight = Math.max(connectorBounds.maxY - connectorBounds.minY, 0.4);
            brickDepth = Math.max(connectorBounds.maxZ - connectorBounds.minZ, 0.8);
          }
        }
        
        console.log(`📐 Brick dimensions: ${brickWidth.toFixed(2)} x ${brickHeight.toFixed(2)} x ${brickDepth.toFixed(2)}`);
        
        // Debug connection points if available
        if (brickConfig && brickConfig.connections) {
          console.log('🔗 Connection points analysis:');
          const connectionInfo = {
            totalConnections: brickConfig.connections.length,
            maleConnections: brickConfig.connections.filter((c: any) => c.type === 'male').length,
            femaleConnections: brickConfig.connections.filter((c: any) => c.type === 'female').length,
            connections: brickConfig.connections.map((c: any) => ({
              id: c.id,
              type: c.type,
              position: c.localPosition,
              axis: c.axis
            }))
          };
          console.log('📋 Connection details:', JSON.stringify(connectionInfo, null, 2));
        }
        
        // Create a scaled geometry for surface sampling
        const scaledGeometry = baseGeometry.clone();
        scaledGeometry.applyMatrix4(new THREE.Matrix4().makeScale(formScale.x, formScale.y, formScale.z));
        scaledGeometry.computeBoundingBox();
        
        // HYBRID APPROACH: DIRECT SURFACE SAMPLING + VOXEL SCANNING
        console.log('🔍 Starting hybrid surface detection (direct sampling + voxel scanning)...');
        
        // Create a mesh for raycasting
        const tempMesh = new THREE.Mesh(scaledGeometry, new THREE.MeshBasicMaterial());
        tempMesh.position.set(formPos.x, formPos.y, formPos.z);
        tempMesh.updateMatrixWorld(true);
        
        const raycaster = new THREE.Raycaster();
        let surfacePoints: THREE.Vector3[] = [];
        
        // STEP 1: Direct triangle sampling for guaranteed surface coverage
        console.log('📐 Step 1: Direct triangle sampling...');
        const positions = scaledGeometry.attributes.position;
        const indices = scaledGeometry.index;
        
        // Helper to get vertex
        const getVertex = (index: number): THREE.Vector3 => {
          return new THREE.Vector3(
            positions.getX(index),
            positions.getY(index),
            positions.getZ(index)
          );
        };
        
        // Get bounds first for debugging
        const bbox = scaledGeometry.boundingBox!;
        
        // Sample points on triangles
        const triangleSamples: THREE.Vector3[] = [];
        // Reduce density to avoid overcrowding - one sample per brick area
        const sampleDensity = 1.0 / (brickWidth * brickDepth);
        
        if (indices) {
          for (let i = 0; i < indices.count; i += 3) {
            const a = getVertex(indices.getX(i));
            const b = getVertex(indices.getX(i + 1));
            const c = getVertex(indices.getX(i + 2));
            
            // Calculate triangle area
            const ab = b.clone().sub(a);
            const ac = c.clone().sub(a);
            const area = ab.cross(ac).length() * 0.5;
            
            // Sample based on area
            const numSamples = Math.max(1, Math.ceil(area * sampleDensity));
            
            for (let j = 0; j < numSamples; j++) {
              let u = Math.random();
              let v = Math.random();
              if (u + v > 1) {
                u = 1 - u;
                v = 1 - v;
              }
              const w = 1 - u - v;
              
              const point = new THREE.Vector3();
              point.addScaledVector(a, u);
              point.addScaledVector(b, v);
              point.addScaledVector(c, w);
              
              // Transform to world space
              point.add(new THREE.Vector3(formPos.x, formPos.y, formPos.z));
              triangleSamples.push(point);
            }
          }
        } else {
          for (let i = 0; i < positions.count; i += 3) {
            const a = getVertex(i);
            const b = getVertex(i + 1);
            const c = getVertex(i + 2);
            
            // Calculate triangle area
            const ab = b.clone().sub(a);
            const ac = c.clone().sub(a);
            const area = ab.cross(ac).length() * 0.5;
            
            // Sample based on area
            const numSamples = Math.max(1, Math.ceil(area * sampleDensity));
            
            for (let j = 0; j < numSamples; j++) {
              let u = Math.random();
              let v = Math.random();
              if (u + v > 1) {
                u = 1 - u;
                v = 1 - v;
              }
              const w = 1 - u - v;
              
              const point = new THREE.Vector3();
              point.addScaledVector(a, u);
              point.addScaledVector(b, v);
              point.addScaledVector(c, w);
              
              // Transform to world space
              point.add(new THREE.Vector3(formPos.x, formPos.y, formPos.z));
              triangleSamples.push(point);
            }
          }
        }
        
        console.log(`✅ Sampled ${triangleSamples.length} points directly from triangles`);
        surfacePoints = [...triangleSamples];
        
        // DEBUG ALERT 1: Triangle sampling results
        const triangleDebug = {
          totalTriangles: indices ? indices.count / 3 : positions.count / 3,
          samplesGenerated: triangleSamples.length,
          sampleDensity: sampleDensity,
          averageSamplesPerTriangle: triangleSamples.length / (indices ? indices.count / 3 : positions.count / 3),
          boundingBox: {
            min: bbox.min,
            max: bbox.max,
            size: {
              x: bbox.max.x - bbox.min.x,
              y: bbox.max.y - bbox.min.y,
              z: bbox.max.z - bbox.min.z
            }
          },
          sampleBounds: {
            minX: Math.min(...triangleSamples.map(p => p.x)),
            maxX: Math.max(...triangleSamples.map(p => p.x)),
            minY: Math.min(...triangleSamples.map(p => p.y)),
            maxY: Math.max(...triangleSamples.map(p => p.y)),
            minZ: Math.min(...triangleSamples.map(p => p.z)),
            maxZ: Math.max(...triangleSamples.map(p => p.z))
          }
        };
        
        console.log('🔍 DEBUG 1 - Triangle Sampling Results:', triangleDebug);
        alert(`🔍 DEBUG 1 - Triangle Sampling Results:\n\n${JSON.stringify(triangleDebug, null, 2)}\n\nClick OK to continue to voxel scanning...`);
        const scanBounds = {
          minX: bbox.min.x + formPos.x,
          maxX: bbox.max.x + formPos.x,
          minY: bbox.min.y + formPos.y,
          maxY: bbox.max.y + formPos.y,
          minZ: bbox.min.z + formPos.z,
          maxZ: bbox.max.z + formPos.z
        };
        
        // Calculate scanning resolution based on brick dimensions
        const voxelSize = Math.min(brickWidth, brickHeight, brickDepth) * 0.3; // Finer resolution
        
        // STEP 2: Simple voxel grid approach - create a grid and test each voxel
        console.log('🔲 Step 2: Voxel grid scanning to ensure complete coverage...');
        
        // Create voxel grid and test each point
        for (let y = scanBounds.minY; y <= scanBounds.maxY; y += voxelSize) {
          for (let x = scanBounds.minX; x <= scanBounds.maxX; x += voxelSize) {
            for (let z = scanBounds.minZ; z <= scanBounds.maxZ; z += voxelSize) {
              const testPoint = new THREE.Vector3(x, y, z);
              
              // Simple inside/outside test using ray casting
              raycaster.set(new THREE.Vector3(scanBounds.minX - 10, y, z), new THREE.Vector3(1, 0, 0));
              const intersections = raycaster.intersectObject(tempMesh);
              
              // Count how many times we cross the mesh boundary
              let crossings = 0;
              for (const hit of intersections) {
                if (hit.point.x < x) crossings++;
              }
              
              // If odd number of crossings, we're inside the mesh
              const isInside = (crossings % 2 === 1);
              
              // Check if we're near the surface by measuring distance to nearest triangle
              let minDist = Infinity;
              
              // Cast rays in all 6 directions to find nearest surface
              const directions = [
                new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
                new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
                new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)
              ];
              
              for (const dir of directions) {
                raycaster.set(testPoint, dir);
                const hits = raycaster.intersectObject(tempMesh);
                if (hits.length > 0) {
                  minDist = Math.min(minDist, hits[0].distance);
                }
              }
              
              // Place bricks if:
              // 1. Inside mesh and near surface OR
              // 2. Outside mesh but VERY close to surface (catches thin walls)
              if ((isInside && minDist < voxelSize * 1.2) || (!isInside && minDist < voxelSize * 0.5)) {
                surfacePoints.push(testPoint);
              }
            }
          }
        }
        
        console.log(`🎯 Total points after voxel scanning: ${surfacePoints.length}`);
        
        // DEBUG ALERT 2: Voxel scanning results
        const voxelDebug = {
          voxelSize: voxelSize,
          scanBounds: scanBounds,
          gridDimensions: {
            x: Math.ceil((scanBounds.maxX - scanBounds.minX) / voxelSize),
            y: Math.ceil((scanBounds.maxY - scanBounds.minY) / voxelSize),
            z: Math.ceil((scanBounds.maxZ - scanBounds.minZ) / voxelSize)
          },
          totalVoxelsTested: Math.ceil((scanBounds.maxX - scanBounds.minX) / voxelSize) * 
                             Math.ceil((scanBounds.maxY - scanBounds.minY) / voxelSize) * 
                             Math.ceil((scanBounds.maxZ - scanBounds.minZ) / voxelSize),
          pointsFromTriangles: triangleSamples.length,
          pointsAfterVoxelScan: surfacePoints.length,
          newPointsAdded: surfacePoints.length - triangleSamples.length,
          surfaceThresholdInside: voxelSize * 1.2,
          surfaceThresholdOutside: voxelSize * 0.5
        };
        
        console.log('🔍 DEBUG 2 - Voxel Scanning Results:', voxelDebug);
        alert(`🔍 DEBUG 2 - Voxel Scanning Results:\n\n${JSON.stringify(voxelDebug, null, 2)}\n\nClick OK to continue to grid snapping...`);
        
        // Clean up temp mesh
        tempMesh.geometry.dispose();
        (tempMesh.material as THREE.Material).dispose();
        
        // Step 3: Remove duplicates by snapping to grid first
        console.log('🎛️ Step 3: Removing duplicates by grid snapping...');
        const uniqueGridPositions = new Map<string, THREE.Vector3>();
        
        for (const point of surfacePoints) {
          // Snap to brick grid
          const snappedX = Math.round(point.x / brickWidth) * brickWidth;
          const snappedY = Math.round(point.y / brickHeight) * brickHeight;
          const snappedZ = Math.round(point.z / brickDepth) * brickDepth;
          
          const key = `${snappedX.toFixed(2)},${snappedY.toFixed(2)},${snappedZ.toFixed(2)}`;
          
          if (!uniqueGridPositions.has(key)) {
            uniqueGridPositions.set(key, new THREE.Vector3(snappedX, snappedY, snappedZ));
          }
        }
        
        const filteredPoints = Array.from(uniqueGridPositions.values());
        console.log(`🎛️ Reduced from ${surfacePoints.length} to ${filteredPoints.length} unique grid positions`);
        
        // DEBUG ALERT 3: Grid snapping results
        const gridDebug = {
          brickDimensions: {
            width: brickWidth,
            height: brickHeight,
            depth: brickDepth
          },
          pointsBeforeSnapping: surfacePoints.length,
          uniqueGridPositions: filteredPoints.length,
          duplicatesRemoved: surfacePoints.length - filteredPoints.length,
          gridCoverage: {
            minX: Math.min(...filteredPoints.map(p => p.x)),
            maxX: Math.max(...filteredPoints.map(p => p.x)),
            minY: Math.min(...filteredPoints.map(p => p.y)),
            maxY: Math.max(...filteredPoints.map(p => p.y)),
            minZ: Math.min(...filteredPoints.map(p => p.z)),
            maxZ: Math.max(...filteredPoints.map(p => p.z))
          },
          layerAnalysis: (() => {
            const layers = new Map<number, number>();
            filteredPoints.forEach(p => {
              const layer = Math.round(p.y / brickHeight);
              layers.set(layer, (layers.get(layer) || 0) + 1);
            });
            return Array.from(layers.entries()).map(([layer, count]) => ({
              layerIndex: layer,
              yPosition: layer * brickHeight,
              brickCount: count
            })).sort((a, b) => a.layerIndex - b.layerIndex);
          })()
        };
        
        console.log('🔍 DEBUG 3 - Grid Snapping Results:', gridDebug);
        alert(`🔍 DEBUG 3 - Grid Snapping Results:\n\n${JSON.stringify(gridDebug, null, 2)}\n\nClick OK to create bricks...`);
        
        // Step 3: Convert surface points to bricks
        // Use a Set to avoid duplicate brick positions
        const placedPositions = new Set<string>();
        
        for (const point of filteredPoints) {
          // Points are already snapped to grid from Step 3
          const brickX = point.x;
          const brickY = point.y;
          const brickZ = point.z;
          
          // Check if this position would intersect with any existing brick
          let wouldIntersect = false;
          for (const existingBrick of newBricks) {
            if (!existingBrick.position) continue;
            
            const dx = Math.abs(existingBrick.position.x - brickX);
            const dy = Math.abs(existingBrick.position.y - brickY);
            const dz = Math.abs(existingBrick.position.z - brickZ);
            
            // Check if bricks would overlap
            if (dx < brickWidth * 0.9 && dy < brickHeight * 0.9 && dz < brickDepth * 0.9) {
              wouldIntersect = true;
              break;
            }
          }
          
          // Skip this position if it would create an intersection
          if (wouldIntersect) {
            console.log(`⚠️ Skipping intersecting brick at (${brickX.toFixed(2)}, ${brickY.toFixed(2)}, ${brickZ.toFixed(2)})`);
            continue;
          }
          
          // Determine brick rotation based on position and neighbors
          let rotation = { x: 0, y: 0, z: 0 };
          
          // For walls, rotate bricks to align connectors
          if (brickConfig && brickConfig.connections) {
            // Get male and female connectors on X and Z axes
            const maleX = brickConfig.connections.find((c: any) => c.type === 'male' && c.axis === 'x');
            const femaleX = brickConfig.connections.find((c: any) => c.type === 'female' && c.axis === 'x');
            const maleZ = brickConfig.connections.find((c: any) => c.type === 'male' && c.axis === 'z');
            const femaleZ = brickConfig.connections.find((c: any) => c.type === 'female' && c.axis === 'z');
            
            // Determine primary axis based on position in the structure
            const gridX = Math.round(brickX / brickWidth);
            const gridY = Math.round(brickY / brickHeight);
            const gridZ = Math.round(brickZ / brickDepth);
            
            // Check if this is an edge brick
            const isXEdge = Math.abs(brickX - scanBounds.minX) < brickWidth * 0.5 || 
                           Math.abs(brickX - scanBounds.maxX) < brickWidth * 0.5;
            const isZEdge = Math.abs(brickZ - scanBounds.minZ) < brickDepth * 0.5 || 
                           Math.abs(brickZ - scanBounds.maxZ) < brickDepth * 0.5;
            
            // Smart rotation based on brick position and layer
            // Goal: Ensure male connectors face female connectors
            if (isXEdge && !isZEdge) {
              // Brick is on X edge (east/west wall)
              // Male should face inward/outward alternating by row
              if (gridZ % 2 === 0) {
                rotation.y = 0; // Male X faces +X
              } else {
                rotation.y = Math.PI; // Male X faces -X
              }
              
              // Alternate by layer for vertical interlocking
              if (gridY % 2 === 1) {
                rotation.y += Math.PI;
              }
            } else if (isZEdge && !isXEdge) {
              // Brick is on Z edge (north/south wall)
              // Rotate 90° so X connectors align along Z axis
              if (gridX % 2 === 0) {
                rotation.y = Math.PI / 2; // Male X faces +Z
              } else {
                rotation.y = -Math.PI / 2; // Male X faces -Z
              }
              
              // Alternate by layer for vertical interlocking
              if (gridY % 2 === 1) {
                rotation.y += Math.PI;
              }
            } else if (isXEdge && isZEdge) {
              // Corner brick - use standard 90° rotations only
              // Determine corner quadrant
              const isMinX = Math.abs(brickX - scanBounds.minX) < brickWidth * 0.5;
              const isMinZ = Math.abs(brickZ - scanBounds.minZ) < brickDepth * 0.5;
              
              if (isMinX && isMinZ) {
                rotation.y = 0; // SW corner
              } else if (!isMinX && isMinZ) {
                rotation.y = Math.PI / 2; // SE corner
              } else if (!isMinX && !isMinZ) {
                rotation.y = Math.PI; // NE corner
              } else {
                rotation.y = -Math.PI / 2; // NW corner
              }
              
              // Alternate by layer
              if (gridY % 2 === 1) {
                rotation.y += Math.PI;
              }
            } else {
              // Interior brick - create checkerboard pattern
              const checkerboard = (gridX + gridZ) % 2 === 0;
              if (checkerboard) {
                rotation.y = 0;
              } else {
                rotation.y = Math.PI / 2;
              }
              
              // Alternate by layer
              if (gridY % 2 === 1) {
                rotation.y += Math.PI;
              }
            }
          }
          
          const brick: SceneObject = {
            id: `brick-building-${Date.now()}-${brickIndex++}`,
            name: `Building Brick ${brickIndex}`,
            type: 'brick',
            brickType: selectedMaterial || 'octa2',
            position: {
              x: brickX,
              y: brickY,
              z: brickZ
            },
            rotation: rotation,
            scale: { x: 1, y: 1, z: 1 },
            visible: true,
            locked: false
          };

          newBricks.push(brick);
        }
        
        console.log(`✅ Created ${newBricks.length} bricks from ${surfacePoints.length} surface samples`);
        
        // Debug connections - output detailed connection analysis
        if (newBricks.length > 0 && brickConfig) {
          console.log('🔍 CONNECTION DEBUG INFO:');
          const debugInfo = {
            brickType: selectedMaterial || 'octa2',
            brickDimensions: { width: brickWidth, height: brickHeight, depth: brickDepth },
            connectionConfig: brickConfig,
            totalBricks: newBricks.length,
            sampleBricks: newBricks.slice(0, 5).map(brick => ({
              id: brick.id,
              position: brick.position,
              gridSnapped: brick.position ? {
                x: Math.round(brick.position.x / brickWidth) * brickWidth,
                y: Math.round(brick.position.y / brickHeight) * brickHeight,
                z: Math.round(brick.position.z / brickDepth) * brickDepth
              } : null
            })),
            connectionAnalysis: analyzeConnectionAlignment(newBricks, brickConfig, { brickWidth, brickHeight, brickDepth })
          };
          
          console.log('📋 Full Connection Debug:', JSON.stringify(debugInfo, null, 2));
        }
        
        // Update brick dimensions for debug alert
        brickHeightForDebug = brickHeight;
        brickWidthForDebug = brickWidth;
        brickDepthForDebug = brickDepth;
        
        // Clean up
        scaledGeometry.dispose();
      }

      // Add all bricks to scene
      setSceneObjects(prev => [...prev, ...newBricks]);
      setSelectedObjects(newBricks.map(b => b.id));

      // Add to history
      setTimeout(() => addToHistory('Generate Brick Building'), 0);

      console.log(`✅ Created brick building with ${newBricks.length} bricks`);
      
      if (newBricks.length === 0) {
        alert(`⚠️ No bricks were placed!\n\nThis might happen if:\n- The form is too small for the brick size\n- The form has no solid surface\n- The form is completely hollow\n\nTry scaling up the form or using a different shape.`);
      } else {
        // DEBUG ALERT 4: Final summary
        const finalDebug = {
          totalBricksCreated: newBricks.length,
          brickDistribution: {
            byLayer: (() => {
              const layers = new Map<number, number>();
              newBricks.forEach(brick => {
                if (brick.position) {
                  const layer = Math.round(brick.position.y / brickHeightForDebug);
                  layers.set(layer, (layers.get(layer) || 0) + 1);
                }
              });
              return Array.from(layers.entries()).map(([layer, count]) => ({
                layer: layer,
                yPos: layer * brickHeightForDebug,
                bricks: count
              })).sort((a, b) => a.layer - b.layer);
            })()
          },
          connectionConfig: brickConfig ? {
            type: selectedMaterial,
            hasConnections: !!brickConfig.connections,
            connectionCount: brickConfig.connections?.length || 0
          } : null,
          processingSteps: {
            triangleSamples: 'See DEBUG 1',
            afterVoxelScan: 'See DEBUG 2',
            afterGridSnap: 'See DEBUG 3',
            finalBricks: newBricks.length
          }
        };
        
        console.log('🔍 DEBUG 4 - Final Summary:', finalDebug);
        
        // Additional connection debugging
        if (newBricks.length > 0) {
          const connectionDebug = {
            connectionConfigLoaded: !!brickConfig,
            materialType: selectedMaterial || 'default',
            rotationPatterns: (() => {
              const rotationCounts = new Map<string, number>();
              newBricks.forEach(brick => {
                if (brick.rotation) {
                  const rotKey = `Y:${(brick.rotation.y * 180 / Math.PI).toFixed(0)}°`;
                  rotationCounts.set(rotKey, (rotationCounts.get(rotKey) || 0) + 1);
                }
              });
              return Array.from(rotationCounts.entries()).map(([rot, count]) => ({
                rotation: rot,
                count: count,
                percentage: ((count / newBricks.length) * 100).toFixed(1) + '%'
              })).sort((a, b) => b.count - a.count);
            })(),
            intersectionAnalysis: analyzeConnectionAlignment(newBricks, brickConfig || {}, 
              { brickWidth: brickWidthForDebug, brickHeight: brickHeightForDebug, brickDepth: brickDepthForDebug }).intersections,
            sampleBrickAnalysis: (() => {
              const sampleBricks = newBricks.slice(0, 5);
              return sampleBricks.map((brick, idx) => {
                // Find potential neighbors and check angle validity
                const neighbors = newBricks.filter(other => {
                  if (other.id === brick.id || !brick.position || !other.position) return false;
                  const dx = Math.abs(other.position.x - brick.position.x);
                  const dy = Math.abs(other.position.y - brick.position.y);
                  const dz = Math.abs(other.position.z - brick.position.z);
                  
                  // Check if neighbor in any direction
                  return (
                    (dx < 0.1 && dy < 0.1 && Math.abs(dz - brickDepthForDebug) < 0.1) || // Z neighbors
                    (dx < 0.1 && Math.abs(dy - brickHeightForDebug) < 0.1 && dz < 0.1) || // Y neighbors
                    (Math.abs(dx - brickWidthForDebug) < 0.1 && dy < 0.1 && dz < 0.1)    // X neighbors
                  );
                });
                
                // Check angle validity for each neighbor
                let validAngleNeighbors = 0;
                let angleDeviations: number[] = [];
                if (brickConfig && brickConfig.connections) {
                  for (const neighbor of neighbors) {
                    const connectionResult = canBricksConnect(brick, neighbor, brickConfig, 5);
                    if (connectionResult.canConnect) {
                      validAngleNeighbors++;
                    }
                  }
                }
                
                return {
                  brickId: brick.id,
                  position: brick.position,
                  rotation: brick.rotation ? {
                    degrees: {
                      x: (brick.rotation.x * 180 / Math.PI).toFixed(0),
                      y: (brick.rotation.y * 180 / Math.PI).toFixed(0),
                      z: (brick.rotation.z * 180 / Math.PI).toFixed(0)
                    }
                  } : null,
                  gridPosition: brick.position ? {
                    x: Math.round(brick.position.x / brickWidthForDebug),
                    y: Math.round(brick.position.y / brickHeightForDebug),
                    z: Math.round(brick.position.z / brickDepthForDebug)
                  } : null,
                  potentialNeighbors: neighbors.length,
                  validAngleNeighbors: validAngleNeighbors,
                  invalidAngleNeighbors: neighbors.length - validAngleNeighbors
                };
              });
            })(),
            gridAlignment: {
              expectedSpacing: {
                x: brickWidthForDebug,
                y: brickHeightForDebug,
                z: brickDepthForDebug
              },
              note: brickConfig ? 'Using connection-based dimensions' : 'Using default brick dimensions'
            }
          };
          
          console.log('🔗 DEBUG 5 - Connection Analysis:', connectionDebug);
          alert(`🔗 DEBUG 5 - Connection & Rotation Analysis:\n\n${JSON.stringify(connectionDebug, null, 2)}\n\nCheck console for full details.`);
        }
        
        alert(`🔍 DEBUG 4 - Final Summary:\n\n${JSON.stringify(finalDebug, null, 2)}\n\n✅ Brick building created successfully!\n\nCheck console for connection analysis.`);
      }

    } catch (error) {
      console.error('❌ Brick building generation failed:', error);
      alert(`❌ Building generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGeneratingBuilding(false);
    }
  };

  // Test brick generation - Create simple wall
  const generateBrickWall = async () => {
    console.log('🧱 Generating test brick wall...');
    setIsGeneratingBuilding(true);
    
    try {
      // Load connection config if not already loaded
      if (Object.keys(connectionConfigs).length === 0) {
        await loadConnectionConfigs();
      }
      
      // Get brick config
      const brickConfig = connectionConfigs[selectedMaterial || 'octa2'] || connectionConfigs['default_octa2'];
      
      // Calculate brick dimensions from config or use defaults
      let brickWidth = 0.8;
      let brickHeight = 0.4;
      let brickDepth = 0.8;
      
      if (brickConfig && brickConfig.connections) {
        // Calculate dimensions from connection points
        const bounds = {
          minX: Infinity, maxX: -Infinity,
          minY: Infinity, maxY: -Infinity,
          minZ: Infinity, maxZ: -Infinity
        };
        
        brickConfig.connections.forEach((conn: any) => {
          bounds.minX = Math.min(bounds.minX, conn.localPosition.x);
          bounds.maxX = Math.max(bounds.maxX, conn.localPosition.x);
          bounds.minY = Math.min(bounds.minY, conn.localPosition.y);
          bounds.maxY = Math.max(bounds.maxY, conn.localPosition.y);
          bounds.minZ = Math.min(bounds.minZ, conn.localPosition.z);
          bounds.maxZ = Math.max(bounds.maxZ, conn.localPosition.z);
        });
        
        const width = Math.max(0.4, (bounds.maxX - bounds.minX) * 2);
        const height = Math.max(0.2, (bounds.maxY - bounds.minY) * 2);
        const depth = Math.max(0.4, (bounds.maxZ - bounds.minZ) * 2);
        
        if (width > 0.1) brickWidth = width;
        if (height > 0.1) brickHeight = height;
        if (depth > 0.1) brickDepth = depth;
      }
      
      console.log(`📏 Brick dimensions: ${brickWidth} x ${brickHeight} x ${brickDepth}`);
      
      // Wall parameters
      const wallWidth = 10; // 10 bricks wide
      const wallHeight = 8; // 8 bricks tall
      // Use Blender-derived spacing for consistency
      const brickSpacingX = 0.816;
      const brickSpacingY = 0.8;
      const startX = -wallWidth * brickSpacingX / 2;
      const startY = 0;
      const startZ = 0;
      
      const newBricks: SceneObject[] = [];
      let brickIndex = 0;
      
      // Generate wall layer by layer
      for (let layer = 0; layer < wallHeight; layer++) {
        for (let col = 0; col < wallWidth; col++) {
          const brickX = startX + col * brickSpacingX;
          // Add Y offset for alternating layers (like in offset pattern)
          const yOffset = (layer % 2 === 1) ? 0.06 : 0;
          const brickY = startY + layer * brickSpacingY + yOffset;
          const brickZ = startZ;
          
          // Stagger pattern for better interlocking
          const staggerOffset = (layer % 2 === 1) ? brickSpacingX / 2 : 0;
          const adjustedX = brickX + staggerOffset;
          
          // Skip bricks that would extend beyond wall bounds when staggered
          if (layer % 2 === 1 && col === wallWidth - 1) continue;
          
          // Determine rotation - alternate every layer for male/female alignment
          let rotation = { x: 0, y: 0, z: 0 };
          if (layer % 2 === 1) {
            rotation.y = Math.PI; // 180 degrees
          }
          
          const brick: SceneObject = {
            id: `test-wall-brick-${Date.now()}-${brickIndex++}`,
            name: `Wall Brick ${brickIndex}`,
            type: 'brick',
            brickType: selectedMaterial || 'octa2',
            position: {
              x: adjustedX,
              y: brickY,
              z: brickZ
            },
            rotation: rotation,
            scale: { x: 1, y: 1, z: 1 },
            visible: true,
            locked: false
          };
          
          newBricks.push(brick);
        }
      }
      
      // Add all bricks to scene
      setSceneObjects(prev => [...prev, ...newBricks]);
      setSelectedObjects(newBricks.map(b => b.id));
      
      // Add to history
      setTimeout(() => addToHistory('Generate Test Wall'), 0);
      
      console.log(`✅ Created test wall with ${newBricks.length} bricks`);
      alert(`✅ Test wall created!\n\nGenerated ${newBricks.length} bricks in a ${wallWidth}x${wallHeight} wall pattern.\n\nBricks are staggered and rotated for proper interlocking.`);
      
    } catch (error) {
      console.error('❌ Test wall generation failed:', error);
      alert(`❌ Test wall generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGeneratingBuilding(false);
    }
  };

  // Test brick generation - Create simple floor
  const generateBrickFloor = async () => {
    console.log('🧱 Generating test brick floor...');
    setIsGeneratingBuilding(true);
    
    try {
      // Load connection config if not already loaded
      if (Object.keys(connectionConfigs).length === 0) {
        await loadConnectionConfigs();
      }
      
      // Get brick config
      const brickConfig = connectionConfigs[selectedMaterial || 'octa2'] || connectionConfigs['default_octa2'];
      
      // Calculate brick dimensions
      let brickWidth = 0.8;
      let brickHeight = 0.4;
      let brickDepth = 0.8;
      
      if (brickConfig && brickConfig.connections) {
        const bounds = {
          minX: Infinity, maxX: -Infinity,
          minY: Infinity, maxY: -Infinity,
          minZ: Infinity, maxZ: -Infinity
        };
        
        brickConfig.connections.forEach((conn: any) => {
          bounds.minX = Math.min(bounds.minX, conn.localPosition.x);
          bounds.maxX = Math.max(bounds.maxX, conn.localPosition.x);
          bounds.minY = Math.min(bounds.minY, conn.localPosition.y);
          bounds.maxY = Math.max(bounds.maxY, conn.localPosition.y);
          bounds.minZ = Math.min(bounds.minZ, conn.localPosition.z);
          bounds.maxZ = Math.max(bounds.maxZ, conn.localPosition.z);
        });
        
        const width = Math.max(0.4, (bounds.maxX - bounds.minX) * 2);
        const height = Math.max(0.2, (bounds.maxY - bounds.minY) * 2);
        const depth = Math.max(0.4, (bounds.maxZ - bounds.minZ) * 2);
        
        if (width > 0.1) brickWidth = width;
        if (height > 0.1) brickHeight = height;
        if (depth > 0.1) brickDepth = depth;
      }
      
      console.log(`📏 Brick dimensions: ${brickWidth} x ${brickHeight} x ${brickDepth}`);
      
      // Floor parameters
      const floorWidth = 8; // 8 bricks wide
      const floorDepth = 8; // 8 bricks deep
      // Use Blender-derived spacing
      const brickSpacingX = 0.816;
      const brickSpacingZ = 0.66;
      const startX = -floorWidth * brickSpacingX / 2;
      const startY = 0;
      const startZ = -floorDepth * brickSpacingZ / 2;
      
      const newBricks: SceneObject[] = [];
      let brickIndex = 0;
      
      // Generate floor with offset pattern
      for (let row = 0; row < floorDepth; row++) {
        for (let col = 0; col < floorWidth; col++) {
          // Apply offset pattern - every other row is offset by half a brick
          const xOffset = (row % 2 === 1) ? brickSpacingX / 2 : 0;
          const brickX = startX + col * brickSpacingX + xOffset;
          const brickY = startY;
          const brickZ = startZ + row * brickSpacingZ;
          
          // Checkerboard rotation pattern
          let rotation = { x: 0, y: 0, z: 0 };
          const isCheckerboard = (row + col) % 2 === 0;
          if (isCheckerboard) {
            rotation.y = Math.PI / 2; // 90 degrees
          }
          
          const brick: SceneObject = {
            id: `test-floor-brick-${Date.now()}-${brickIndex++}`,
            name: `Floor Brick ${brickIndex}`,
            type: 'brick',
            brickType: selectedMaterial || 'octa2',
            position: {
              x: brickX,
              y: brickY,
              z: brickZ
            },
            rotation: rotation,
            scale: { x: 1, y: 1, z: 1 },
            visible: true,
            locked: false
          };
          
          newBricks.push(brick);
        }
      }
      
      // Add all bricks to scene
      setSceneObjects(prev => [...prev, ...newBricks]);
      setSelectedObjects(newBricks.map(b => b.id));
      
      // Add to history
      setTimeout(() => addToHistory('Generate Test Floor'), 0);
      
      console.log(`✅ Created test floor with ${newBricks.length} bricks`);
      alert(`✅ Test floor created!\n\nGenerated ${newBricks.length} bricks in a ${floorWidth}x${floorDepth} floor pattern.\n\nBricks use a checkerboard rotation pattern for interlocking.`);
      
    } catch (error) {
      console.error('❌ Test floor generation failed:', error);
      alert(`❌ Test floor generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGeneratingBuilding(false);
    }
  };

  // Test brick generation - Create corner
  const generateBrickCorner = async () => {
    console.log('🧱 Generating test brick corner...');
    setIsGeneratingBuilding(true);
    
    try {
      // Load connection config if not already loaded
      if (Object.keys(connectionConfigs).length === 0) {
        await loadConnectionConfigs();
      }
      
      // Get brick config
      const brickConfig = connectionConfigs[selectedMaterial || 'octa2'] || connectionConfigs['default_octa2'];
      
      // Calculate brick dimensions
      let brickWidth = 0.8;
      let brickHeight = 0.4;
      let brickDepth = 0.8;
      
      if (brickConfig && brickConfig.connections) {
        const bounds = {
          minX: Infinity, maxX: -Infinity,
          minY: Infinity, maxY: -Infinity,
          minZ: Infinity, maxZ: -Infinity
        };
        
        brickConfig.connections.forEach((conn: any) => {
          bounds.minX = Math.min(bounds.minX, conn.localPosition.x);
          bounds.maxX = Math.max(bounds.maxX, conn.localPosition.x);
          bounds.minY = Math.min(bounds.minY, conn.localPosition.y);
          bounds.maxY = Math.max(bounds.maxY, conn.localPosition.y);
          bounds.minZ = Math.min(bounds.minZ, conn.localPosition.z);
          bounds.maxZ = Math.max(bounds.maxZ, conn.localPosition.z);
        });
        
        const width = Math.max(0.4, (bounds.maxX - bounds.minX) * 2);
        const height = Math.max(0.2, (bounds.maxY - bounds.minY) * 2);
        const depth = Math.max(0.4, (bounds.maxZ - bounds.minZ) * 2);
        
        if (width > 0.1) brickWidth = width;
        if (height > 0.1) brickHeight = height;
        if (depth > 0.1) brickDepth = depth;
      }
      
      console.log(`📏 Brick dimensions: ${brickWidth} x ${brickHeight} x ${brickDepth}`);
      
      // Corner parameters
      const wallLength = 6; // 6 bricks per wall
      const wallHeight = 6; // 6 bricks tall
      // Use Blender-derived spacing
      const brickSpacingX = 0.816;
      const brickSpacingY = 0.8;
      const brickSpacingZ = 0.66;
      const startX = 0;
      const startY = 0;
      const startZ = 0;
      
      const newBricks: SceneObject[] = [];
      let brickIndex = 0;
      
      // Generate corner with two walls meeting at 90 degrees
      for (let layer = 0; layer < wallHeight; layer++) {
        // Wall along X axis
        for (let col = 0; col < wallLength; col++) {
          const brickX = startX + col * brickSpacingX;
          // Add Y offset for alternating layers
          const yOffset = (layer % 2 === 1) ? 0.06 : 0;
          const brickY = startY + layer * brickSpacingY + yOffset;
          const brickZ = startZ;
          
          // Stagger pattern
          const staggerOffset = (layer % 2 === 1) ? brickSpacingX / 2 : 0;
          const adjustedX = brickX + staggerOffset;
          
          // Skip if extends beyond bounds
          if (layer % 2 === 1 && col === wallLength - 1) continue;
          
          // Rotation for X wall
          let rotation = { x: 0, y: 0, z: 0 };
          if (layer % 2 === 1) {
            rotation.y = Math.PI; // 180 degrees
          }
          
          const brick: SceneObject = {
            id: `test-corner-brick-${Date.now()}-${brickIndex++}`,
            name: `Corner Brick X${brickIndex}`,
            type: 'brick',
            brickType: selectedMaterial || 'octa2',
            position: {
              x: adjustedX,
              y: brickY,
              z: brickZ
            },
            rotation: rotation,
            scale: { x: 1, y: 1, z: 1 },
            visible: true,
            locked: false
          };
          
          newBricks.push(brick);
        }
        
        // Wall along Z axis (skip first brick to avoid overlap at corner)
        for (let col = 1; col < wallLength; col++) {
          const brickX = startX;
          // Add Y offset for alternating layers
          const yOffset = (layer % 2 === 1) ? 0.06 : 0;
          const brickY = startY + layer * brickSpacingY + yOffset;
          const brickZ = startZ + col * brickSpacingZ;
          
          // Stagger pattern
          const staggerOffset = (layer % 2 === 1) ? brickSpacingZ / 2 : 0;
          const adjustedZ = brickZ + staggerOffset;
          
          // Skip if extends beyond bounds
          if (layer % 2 === 1 && col === wallLength - 1) continue;
          
          // Rotation for Z wall - 90 degrees from X wall
          let rotation = { x: 0, y: Math.PI / 2, z: 0 };
          if (layer % 2 === 1) {
            rotation.y = -Math.PI / 2; // -90 degrees for alternating
          }
          
          const brick: SceneObject = {
            id: `test-corner-brick-${Date.now()}-${brickIndex++}`,
            name: `Corner Brick Z${brickIndex}`,
            type: 'brick',
            brickType: selectedMaterial || 'octa2',
            position: {
              x: brickX,
              y: brickY,
              z: adjustedZ
            },
            rotation: rotation,
            scale: { x: 1, y: 1, z: 1 },
            visible: true,
            locked: false
          };
          
          newBricks.push(brick);
        }
      }
      
      // Add all bricks to scene
      setSceneObjects(prev => [...prev, ...newBricks]);
      setSelectedObjects(newBricks.map(b => b.id));
      
      // Add to history
      setTimeout(() => addToHistory('Generate Test Corner'), 0);
      
      console.log(`✅ Created test corner with ${newBricks.length} bricks`);
      alert(`✅ Test corner created!\n\nGenerated ${newBricks.length} bricks in a ${wallLength}x${wallHeight} L-shaped corner.\n\nBricks are properly oriented for each wall direction.`);
      
    } catch (error) {
      console.error('❌ Test corner generation failed:', error);
      alert(`❌ Test corner generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGeneratingBuilding(false);
    }
  };

  // Test brick generation - Create sloped wall
  const generateBrickSlopeWall = async () => {
    console.log('🧱 Generating test sloped wall...');
    setIsGeneratingBuilding(true);
    
    try {
      // Load connection config if not already loaded
      if (Object.keys(connectionConfigs).length === 0) {
        await loadConnectionConfigs();
      }
      
      // Get brick config
      const brickConfig = connectionConfigs[selectedMaterial || 'octa2'] || connectionConfigs['default_octa2'];
      
      // Calculate brick dimensions
      let brickWidth = 0.8;
      let brickHeight = 0.4;
      let brickDepth = 0.8;
      
      if (brickConfig && brickConfig.connections) {
        const bounds = {
          minX: Infinity, maxX: -Infinity,
          minY: Infinity, maxY: -Infinity,
          minZ: Infinity, maxZ: -Infinity
        };
        
        brickConfig.connections.forEach((conn: any) => {
          bounds.minX = Math.min(bounds.minX, conn.localPosition.x);
          bounds.maxX = Math.max(bounds.maxX, conn.localPosition.x);
          bounds.minY = Math.min(bounds.minY, conn.localPosition.y);
          bounds.maxY = Math.max(bounds.maxY, conn.localPosition.y);
          bounds.minZ = Math.min(bounds.minZ, conn.localPosition.z);
          bounds.maxZ = Math.max(bounds.maxZ, conn.localPosition.z);
        });
        
        const width = Math.max(0.4, (bounds.maxX - bounds.minX) * 2);
        const height = Math.max(0.2, (bounds.maxY - bounds.minY) * 2);
        const depth = Math.max(0.4, (bounds.maxZ - bounds.minZ) * 2);
        
        if (width > 0.1) brickWidth = width;
        if (height > 0.1) brickHeight = height;
        if (depth > 0.1) brickDepth = depth;
      }
      
      console.log(`📏 Brick dimensions: ${brickWidth} x ${brickHeight} x ${brickDepth}`);
      
      // Sloped wall parameters
      const wallWidth = 8; // 8 bricks wide
      const wallHeight = 8; // 8 layers tall
      const slopeAngle = 30; // 30 degree slope
      const slopeRadians = slopeAngle * Math.PI / 180;
      // Use Blender-derived spacing
      const brickSpacingX = 0.816;
      const brickSpacingY = 0.8;
      const brickSpacingZ = 0.66;
      const startX = -wallWidth * brickSpacingX / 2;
      const startY = 0;
      const startZ = 0;
      
      const newBricks: SceneObject[] = [];
      let brickIndex = 0;
      
      // Generate sloped wall layer by layer
      for (let layer = 0; layer < wallHeight; layer++) {
        // Calculate Z offset for slope
        const zOffset = layer * brickHeight * Math.tan(slopeRadians);
        
        for (let col = 0; col < wallWidth; col++) {
          // Apply offset pattern - every other row is offset by half a brick
          const xOffset = (layer % 2 === 1) ? brickSpacingX / 2 : 0;
          const brickX = startX + col * brickSpacingX + xOffset;
          // Add Y offset for alternating layers
          const yOffset = (layer % 2 === 1) ? 0.06 : 0;
          const brickY = startY + layer * brickSpacingY + yOffset;
          const brickZ = startZ + zOffset;
          
          // Skip bricks that would extend beyond bounds
          if (layer % 2 === 1 && col === wallWidth - 1) continue;
          
          // Rotation - tilt bricks to match slope
          let rotation = { x: -slopeRadians, y: 0, z: 0 };
          if (layer % 2 === 1) {
            rotation.y = Math.PI; // 180 degrees for alternating layers
          }
          
          const brick: SceneObject = {
            id: `test-slope-brick-${Date.now()}-${brickIndex++}`,
            name: `Slope Brick ${brickIndex}`,
            type: 'brick',
            brickType: selectedMaterial || 'octa2',
            position: {
              x: brickX,
              y: brickY,
              z: brickZ
            },
            rotation: rotation,
            scale: { x: 1, y: 1, z: 1 },
            visible: true,
            locked: false
          };
          
          newBricks.push(brick);
        }
      }
      
      // Add all bricks to scene
      setSceneObjects(prev => [...prev, ...newBricks]);
      setSelectedObjects(newBricks.map(b => b.id));
      
      // Add to history
      setTimeout(() => addToHistory('Generate Test Slope'), 0);
      
      console.log(`✅ Created test sloped wall with ${newBricks.length} bricks`);
      alert(`✅ Test sloped wall created!\n\nGenerated ${newBricks.length} bricks in a ${wallWidth}x${wallHeight} pattern.\n\nWall has a ${slopeAngle}° slope with bricks tilted to match.`);
      
    } catch (error) {
      console.error('❌ Test slope generation failed:', error);
      alert(`❌ Test slope generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGeneratingBuilding(false);
    }
  };

  // Test brick generation - Create arch
  const generateBrickArch = async () => {
    console.log('🧱 Generating test brick arch...');
    setIsGeneratingBuilding(true);
    
    try {
      // Load connection config if not already loaded
      if (Object.keys(connectionConfigs).length === 0) {
        await loadConnectionConfigs();
      }
      
      // Get brick config with hardcoded fallback
      let brickConfig = connectionConfigs[selectedMaterial || 'octa2'] || connectionConfigs['default_octa2'];
      
      // Hardcoded fallback if config not loaded
      if (!brickConfig || !brickConfig.connections) {
        console.log('⚠️ Using hardcoded fallback config for arch test');
        brickConfig = {
          connections: [
            // Using actual octa2 connection data from user
            {
              id: 'octa2_male_1',
              axis: 'y',
              type: 'male',
              strength: 1.0,
              isConnected: false,
              localPosition: { x: 0.3, y: 0, z: 0.265 },
              localRotation: { x: 0, y: 0, z: 0 }
            },
            {
              id: 'octa2_male_2',
              axis: 'y',
              type: 'male',
              strength: 1.0,
              isConnected: false,
              localPosition: { x: -0.167, y: -0.3, z: 0.233 },
              localRotation: { x: 0, y: 0, z: 0 }
            },
            {
              id: 'octa2_male_3',
              axis: 'y',
              type: 'male',
              strength: 1.0,
              isConnected: false,
              localPosition: { x: -0.180, y: 0.3, z: 0.238 },
              localRotation: { x: 0, y: 0, z: 0 }
            },
            {
              id: 'octa2_female_1',
              axis: 'y',
              type: 'female',
              strength: 1.0,
              isConnected: false,
              localPosition: { x: -0.249, y: 0, z: -0.167 },
              localRotation: { x: 0, y: 0, z: 0 }
            },
            {
              id: 'octa2_female_2',
              axis: 'y',
              type: 'female',
              strength: 1.0,
              isConnected: false,
              localPosition: { x: 0.124, y: 0.183, z: -0.164 },
              localRotation: { x: 0, y: 0, z: 0 }
            },
            {
              id: 'octa2_female_3',
              axis: 'y',
              type: 'female',
              strength: 1.0,
              isConnected: false,
              localPosition: { x: 0.101, y: -0.189, z: -0.116 },
              localRotation: { x: 0, y: 0, z: 0 }
            }
          ],
          dimensions: { width: 0.6, height: 0.4, depth: 0.4 }
        };
      }
      
      // Calculate brick dimensions
      let brickWidth = 0.8;
      let brickHeight = 0.4;
      let brickDepth = 0.8;
      
      if (brickConfig && brickConfig.connections) {
        const bounds = {
          minX: Infinity, maxX: -Infinity,
          minY: Infinity, maxY: -Infinity,
          minZ: Infinity, maxZ: -Infinity
        };
        
        brickConfig.connections.forEach((conn: any) => {
          bounds.minX = Math.min(bounds.minX, conn.localPosition.x);
          bounds.maxX = Math.max(bounds.maxX, conn.localPosition.x);
          bounds.minY = Math.min(bounds.minY, conn.localPosition.y);
          bounds.maxY = Math.max(bounds.maxY, conn.localPosition.y);
          bounds.minZ = Math.min(bounds.minZ, conn.localPosition.z);
          bounds.maxZ = Math.max(bounds.maxZ, conn.localPosition.z);
        });
        
        const width = Math.max(0.4, (bounds.maxX - bounds.minX) * 2);
        const height = Math.max(0.2, (bounds.maxY - bounds.minY) * 2);
        const depth = Math.max(0.4, (bounds.maxZ - bounds.minZ) * 2);
        
        if (width > 0.1) brickWidth = width;
        if (height > 0.1) brickHeight = height;
        if (depth > 0.1) brickDepth = depth;
      }
      
      console.log(`📏 Brick dimensions: ${brickWidth} x ${brickHeight} x ${brickDepth}`);
      
      // Log the actual connector positions to understand spacing needs
      if (brickConfig && brickConfig.connections) {
        const maxX = Math.max(...brickConfig.connections.map((c: any) => Math.abs(c.localPosition.x)));
        const maxY = Math.max(...brickConfig.connections.map((c: any) => Math.abs(c.localPosition.y)));
        const maxZ = Math.max(...brickConfig.connections.map((c: any) => Math.abs(c.localPosition.z)));
        console.log(`🔗 Max connector extents: X:±${maxX.toFixed(3)}, Y:±${maxY.toFixed(3)}, Z:±${maxZ.toFixed(3)}`);
      }
      
      // Arch parameters
      const archRadius = 4; // Radius of the arch (restored to original)
      const archThickness = 2; // Two rows in depth
      const pillarHeight = 4; // Height of supporting pillars
      const pillarWidth = 2; // Width of pillars in bricks
      // Use Blender-derived spacing
      const brickSpacingY = 0.8; // From Blender analysis (Y group spacing)
      const brickSpacingX = 0.816; // From Blender analysis (most common X spacing)
      const brickSpacingZ = 0.66;  // From Blender analysis
      
      const newBricks: SceneObject[] = [];
      let brickIndex = 0;
      
      // Generate left pillar
      for (let layer = 0; layer < pillarHeight; layer++) {
        for (let depth = 0; depth < archThickness; depth++) {
          for (let width = 0; width < pillarWidth; width++) {
            // Apply offset pattern
            const xOffset = (layer % 2 === 1) ? brickSpacingX / 2 : 0;
            const yOffset = (layer % 2 === 1) ? 0.06 : 0;
            const zOffset = (depth % 2 === 1) ? brickSpacingZ / 2 : 0;
            
            const brick: SceneObject = {
              id: `test-arch-brick-${Date.now()}-${brickIndex++}`,
              name: `Arch Pillar L${brickIndex}`,
              type: 'brick',
              brickType: selectedMaterial || 'octa2',
              position: {
                x: -archRadius + (pillarWidth - 1 - width) * brickSpacingX + xOffset,
                y: layer * brickSpacingY + yOffset,
                z: depth * brickSpacingZ + zOffset
              },
              rotation: { x: 0, y: layer % 2 === 1 ? Math.PI : 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              visible: true,
              locked: false
            };
            newBricks.push(brick);
          }
        }
      }
      
      // Generate right pillar
      for (let layer = 0; layer < pillarHeight; layer++) {
        for (let depth = 0; depth < archThickness; depth++) {
          for (let width = 0; width < pillarWidth; width++) {
            // Apply offset pattern
            const xOffset = (layer % 2 === 1) ? -brickSpacingX / 2 : 0; // Negative offset for right pillar
            const yOffset = (layer % 2 === 1) ? 0.06 : 0;
            const zOffset = (depth % 2 === 1) ? brickSpacingZ / 2 : 0;
            
            const brick: SceneObject = {
              id: `test-arch-brick-${Date.now()}-${brickIndex++}`,
              name: `Arch Pillar R${brickIndex}`,
              type: 'brick',
              brickType: selectedMaterial || 'octa2',
              position: {
                x: archRadius - width * brickSpacingX + xOffset,
                y: layer * brickSpacingY + yOffset,
                z: depth * brickSpacingZ + zOffset
              },
              rotation: { x: 0, y: layer % 2 === 1 ? Math.PI : 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
              visible: true,
              locked: false
            };
            newBricks.push(brick);
          }
        }
      }
      
      // Generate middle support between pillars (to connect them)
      for (let layer = 0; layer < pillarHeight; layer++) {
        for (let depth = 0; depth < archThickness; depth++) {
          // Add a connecting brick in the middle
          const brick: SceneObject = {
            id: `test-arch-brick-${Date.now()}-${brickIndex++}`,
            name: `Arch Support ${brickIndex}`,
            type: 'brick',
            brickType: selectedMaterial || 'octa2',
            position: {
              x: 0, // Center between pillars
              y: layer * brickSpacingY,
              z: depth * brickSpacingZ
            },
            rotation: { x: 0, y: layer % 2 === 1 ? Math.PI : 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            visible: true,
            locked: false
          };
          newBricks.push(brick);
        }
      }
      
      // Generate arch curve
      const startAngle = 0;
      const endAngle = Math.PI; // 180 degrees for a semi-circle
      
      // Calculate the arc length and adjust brick count for proper spacing
      const arcLength = archRadius * Math.PI; // Half circumference
      // For overlapping bricks that connect properly, use less than brick height
      const brickArcLength = brickHeight * 0.6; // 40% overlap for very tight connection
      const actualArchBricks = Math.ceil(arcLength / brickArcLength); // Use ceil to ensure full coverage
      const angleStep = endAngle / (actualArchBricks - 1); // -1 to ensure endpoints at 0 and PI
      
      console.log(`🏗️ Arch params: radius=${archRadius}, arcLength=${arcLength.toFixed(2)}, brickCount=${actualArchBricks}`);
      console.log(`📏 Brick spacing: ${brickArcLength.toFixed(3)} units (height: ${brickHeight}, 40% overlap)`);
      console.log(`📐 Angle step: ${(angleStep * 180 / Math.PI).toFixed(2)}° between bricks`);
      
      // Log connector types for debugging
      const connectorAxes = brickConfig.connections.reduce((acc: Record<string, number>, conn: any) => {
        acc[conn.axis] = (acc[conn.axis] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log('📐 Connector distribution by axis:', connectorAxes);
      
      // Generate arch with special rotation for Y-axis connectors
      for (let i = 0; i < actualArchBricks; i++) {
        const angle = startAngle + i * angleStep;
        const x = archRadius * Math.cos(angle);
        // Adjust Y to ensure arch starts at pillar top
        const archBaseY = pillarHeight * brickSpacingY;
        const y = archBaseY + archRadius * Math.sin(angle);
        
        for (let depth = 0; depth < archThickness; depth++) {
          // Special rotation strategy for octa2 bricks with Y-axis connectors:
          // Since all connectors are on Y-axis (up/down), we need to rotate
          // the bricks so Y-axis points along the arch curve for side-by-side connection
          
          let rotation = { x: 0, y: 0, z: 0 };
          
          // First, rotate around X-axis by 90° to make Y-connectors point horizontally
          rotation.x = Math.PI / 2;
          
          // Then rotate around Y-axis to follow the curve
          // This makes the connectors face along the arch circumference
          rotation.y = angle;
          
          // For alternating pattern (male faces female)
          if (i % 2 === 1) {
            rotation.y += Math.PI; // 180° flip for odd bricks
          }
          
          // For second depth layer, add Z rotation
          if (depth === 1) {
            rotation.z = Math.PI;
          }
          
          const brick: SceneObject = {
            id: `test-arch-brick-${Date.now()}-${brickIndex++}`,
            name: `Arch Curve ${brickIndex}`,
            type: 'brick',
            brickType: selectedMaterial || 'octa2',
            position: {
              x: x,
              y: y,
              z: depth * brickSpacingZ
            },
            rotation: rotation,
            scale: { x: 1, y: 1, z: 1 },
            visible: true,
            locked: false
          };
          newBricks.push(brick);
        }
      }
      
      // Add all bricks to scene
      setSceneObjects(prev => [...prev, ...newBricks]);
      setSelectedObjects(newBricks.map(b => b.id));
      
      // Add to history
      setTimeout(() => addToHistory('Generate Test Arch'), 0);
      
      // Debug connection points for arch bricks
      if (brickConfig && brickConfig.connections) {
        console.log('🔍 ARCH DEBUG - Connection Analysis:');
        
        // Analyze a few arch curve bricks
        const archCurveBricks = newBricks.filter(b => b.name.includes('Arch Curve'));
        const sampleBricks = archCurveBricks.slice(0, 5);
        
        const debugInfo = {
          brickDimensions: { width: brickWidth, height: brickHeight, depth: brickDepth },
          mortarGap: 0,
          archRadius: archRadius,
          connectionPoints: brickConfig.connections.map((conn: any) => ({
            id: conn.id,
            type: conn.type,
            localPosition: conn.localPosition,
            axis: conn.axis
          })),
          sampleArchBricks: sampleBricks.map((brick, idx) => {
            // Calculate world positions of connection points
            const rotation = brick.rotation || { x: 0, y: 0, z: 0 };
            const position = brick.position || { x: 0, y: 0, z: 0 };
            
            // Create rotation matrix
            const euler = new THREE.Euler(rotation.x, rotation.y, rotation.z);
            
            // Transform each connection point to world space
            const worldConnections = brickConfig.connections.map((conn: any) => {
              const localPos = new THREE.Vector3(
                conn.localPosition.x,
                conn.localPosition.y,
                conn.localPosition.z
              );
              
              // Apply rotation
              localPos.applyEuler(euler);
              
              // Add brick position
              const worldPos = {
                x: position.x + localPos.x,
                y: position.y + localPos.y,
                z: position.z + localPos.z
              };
              
              return {
                type: conn.type,
                localPos: conn.localPosition,
                worldPos: worldPos
              };
            });
            
            return {
              id: brick.id,
              name: brick.name,
              position: position,
              rotation: {
                local: rotation,
                degrees: {
                  x: (rotation.x * 180 / Math.PI).toFixed(1),
                  y: (rotation.y * 180 / Math.PI).toFixed(1),
                  z: (rotation.z * 180 / Math.PI).toFixed(1)
                }
              },
              connections: worldConnections,
              // Find potential neighbors
              neighbors: archCurveBricks
                .filter(other => other.id !== brick.id)
                .filter(other => {
                  if (!other.position || !brick.position) return false;
                  const dist = Math.sqrt(
                    Math.pow(other.position.x - brick.position.x, 2) +
                    Math.pow(other.position.y - brick.position.y, 2) +
                    Math.pow(other.position.z - brick.position.z, 2)
                  );
                  return dist < (brickWidth + 0.05) * 1.5;
                })
                .map(neighbor => ({
                  name: neighbor.name,
                  distance: Math.sqrt(
                    Math.pow(neighbor.position!.x - brick.position!.x, 2) +
                    Math.pow(neighbor.position!.y - brick.position!.y, 2) +
                    Math.pow(neighbor.position!.z - brick.position!.z, 2)
                  ).toFixed(3),
                  canConnect: canBricksConnect(brick, neighbor, brickConfig, 5).canConnect
                }))
            };
          })
        };
        
        console.log('📋 Arch Connection Debug:', JSON.stringify(debugInfo, null, 2));
        
        // Also output a connection matrix showing which bricks can connect
        console.log('\n🔗 Connection Matrix (first 5 arch bricks):');
        const connectionMatrix: any = {};
        sampleBricks.forEach((brick1, i) => {
          connectionMatrix[`Brick ${i}`] = {};
          sampleBricks.forEach((brick2, j) => {
            if (i !== j) {
              const result = canBricksConnect(brick1, brick2, brickConfig, 5);
              connectionMatrix[`Brick ${i}`][`Brick ${j}`] = result.canConnect ? '✅' : '❌';
            }
          });
        });
        console.table(connectionMatrix);
      }
      
      console.log(`✅ Created test arch with ${newBricks.length} bricks`);
      alert(`✅ Test arch created!\n\nGenerated ${newBricks.length} bricks forming an arch with supporting pillars.\n\nBricks are rotated to follow the curve.\n\nCheck console for detailed connection debug info.`);
      
    } catch (error) {
      console.error('❌ Test arch generation failed:', error);
      alert(`❌ Test arch generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGeneratingBuilding(false);
    }
  };

  // Create bricks from Blender arrangement
  const createBricksFromBlender = (blenderData: any[]) => {
    const newBricks: SceneObject[] = [];
    
    blenderData.forEach((brick: any, index: number) => {
      // Use quaternion if available for more accurate rotation
      let rotation;
      if (brick.rotation_quaternion) {
        const q = new THREE.Quaternion(
          brick.rotation_quaternion[1], // x
          brick.rotation_quaternion[2], // y
          brick.rotation_quaternion[3], // z
          brick.rotation_quaternion[0]  // w (Blender puts w first, Three.js expects it last)
        );
        rotation = new THREE.Euler().setFromQuaternion(q);
      } else {
        // Fall back to Euler angles
        rotation = new THREE.Euler(
          THREE.MathUtils.degToRad(brick.rotation[0]),
          THREE.MathUtils.degToRad(brick.rotation[1]),
          THREE.MathUtils.degToRad(brick.rotation[2])
        );
      }
      
      const brickObject: SceneObject = {
        id: `blender-brick-${index}`,
        name: `Blender Brick ${index + 1}`,
        type: 'brick',
        position: new THREE.Vector3(
          brick.position[0],
          brick.position[1],
          brick.position[2]
        ),
        rotation: rotation,
        scale: new THREE.Vector3(1, 1, 1), // Use original scale for Octa2.glb
        brickType: selectedMaterial || 'octa2',
        visible: true,
        locked: false
      };
      newBricks.push(brickObject);
    });
    
    setSceneObjects(prev => [...prev, ...newBricks]);
    console.log(`✅ Created ${newBricks.length} bricks from Blender arrangement`);
    
    // Report if any bricks had non-zero rotation
    const rotatedBricks = blenderData.filter(brick => {
      if (brick.rotation_quaternion) {
        // Check if quaternion is not identity [1, 0, 0, 0]
        return brick.rotation_quaternion[0] !== 1 || 
               brick.rotation_quaternion[1] !== 0 || 
               brick.rotation_quaternion[2] !== 0 || 
               brick.rotation_quaternion[3] !== 0;
      }
      return brick.rotation[0] !== 0 || brick.rotation[1] !== 0 || brick.rotation[2] !== 0;
    });
    
    if (rotatedBricks.length > 0) {
      console.log(`🔄 ${rotatedBricks.length} bricks have rotation applied`);
    }
  };

  // Analyze Blender brick arrangement data
  const analyzeBlenderArrangement = () => {
    const blenderData = [
      { "name": "Retopo_object_0_brick-foundation-1.002", "position": [0.0, 0.0, 0.0], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.003", "position": [0.816, 0.0, 0.0], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.004", "position": [0.868, -4.401, 0.622], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.005", "position": [0.0, -4.401, 0.0], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.006", "position": [-0.824, 0.0, 0.0], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.007", "position": [-1.626, 0.0, 0.0], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.008", "position": [-1.304, 0.757, 0.0], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.009", "position": [-0.502, 0.757, 0.0], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.010", "position": [1.138, 0.757, 0.0], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.011", "position": [0.322, 0.757, 0.0], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.012", "position": [-0.993, -4.401, -0.659], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.013", "position": [-0.659, -5.067, -0.383], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.014", "position": [0.334, -5.067, 0.276], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.015", "position": [1.202, -5.067, 0.899], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.016", "position": [0.322, 2.782, 0.0], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.017", "position": [1.138, 2.782, 0.0], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.018", "position": [-0.502, 2.782, 0.0], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.019", "position": [-1.304, 2.782, 0.0], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.020", "position": [0.322, 2.842, 0.66], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.021", "position": [1.138, 2.842, 0.66], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.022", "position": [-0.502, 2.842, 0.66], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] },
      { "name": "Retopo_object_0_brick-foundation-1.023", "position": [-1.428, -3.534, 0.002], "rotation": [0.0, 0.0, 0.0], "scale": [0.002, 0.002, 0.002] }
    ];

    // Analyze spacing patterns and rotations
    const analysis: {
      groups: any[];
      spacingPatterns: {
        x: Set<string> | string[];
        y: Set<string> | string[];
        z: Set<string> | string[];
      };
      rotations: {
        unique: Set<string> | string[];
        byBrick: Record<string, number[]>;
      };
    } = {
      groups: [],
      spacingPatterns: {
        x: new Set(),
        y: new Set(),
        z: new Set()
      },
      rotations: {
        unique: new Set(),
        byBrick: {}
      }
    };

    // Analyze rotations
    blenderData.forEach(brick => {
      const rotKey = `${brick.rotation[0]}_${brick.rotation[1]}_${brick.rotation[2]}`;
      if (analysis.rotations.unique instanceof Set) {
        analysis.rotations.unique.add(rotKey);
      }
      analysis.rotations.byBrick[brick.name] = brick.rotation;
    });

    // Find groups based on Y positions
    const yGroups: Record<string, any[]> = {};
    blenderData.forEach(brick => {
      const yKey = brick.position[1].toFixed(1);
      if (!yGroups[yKey]) yGroups[yKey] = [];
      yGroups[yKey].push(brick);
    });

    // Analyze each group
    Object.entries(yGroups).forEach(([y, bricks]) => {
      if (bricks.length > 1) {
        // Sort by X position
        bricks.sort((a, b) => a.position[0] - b.position[0]);
        
        const spacings = [];
        for (let i = 1; i < bricks.length; i++) {
          const spacing = bricks[i].position[0] - bricks[i-1].position[0];
          if (spacing > 0.1) { // Ignore tiny differences
            spacings.push(spacing);
            if (analysis.spacingPatterns.x instanceof Set) {
              analysis.spacingPatterns.x.add(spacing.toFixed(3));
            }
          }
        }

        analysis.groups.push({
          yPosition: parseFloat(y),
          brickCount: bricks.length,
          xSpacings: spacings,
          description: `Group at Y=${y}`
        });
      }
    });

    // Analyze Z spacing
    const zGroups: Record<string, any[]> = {};
    blenderData.forEach(brick => {
      const key = `${brick.position[0].toFixed(1)}_${brick.position[1].toFixed(1)}`;
      if (!zGroups[key]) zGroups[key] = [];
      zGroups[key].push(brick);
    });

    Object.values(zGroups).forEach(bricks => {
      if (bricks.length > 1) {
        bricks.sort((a, b) => a.position[2] - b.position[2]);
        for (let i = 1; i < bricks.length; i++) {
          const spacing = bricks[i].position[2] - bricks[i-1].position[2];
          if (spacing > 0.1) {
            if (analysis.spacingPatterns.z instanceof Set) {
              analysis.spacingPatterns.z.add(spacing.toFixed(3));
            }
          }
        }
      }
    });

    // Convert sets to arrays
    analysis.spacingPatterns.x = Array.from(analysis.spacingPatterns.x);
    analysis.spacingPatterns.y = Array.from(analysis.spacingPatterns.y);
    analysis.spacingPatterns.z = Array.from(analysis.spacingPatterns.z);
    analysis.rotations.unique = Array.from(analysis.rotations.unique);

    console.log('🧱 Blender Arrangement Analysis:', analysis);
    
    // Update our spacing based on findings
    console.log('📏 Recommended spacing from Blender:');
    console.log('X spacing:', analysis.spacingPatterns.x);
    console.log('Y spacing:', analysis.spacingPatterns.y);
    console.log('Z spacing:', analysis.spacingPatterns.z);
    console.log('🔄 Unique rotations:', analysis.rotations.unique);
    
    // If we have non-zero rotations, show examples
    const nonZeroRotations = Object.entries(analysis.rotations.byBrick)
      .filter(([name, rot]) => rot[0] !== 0 || rot[1] !== 0 || rot[2] !== 0);
    if (nonZeroRotations.length > 0) {
      console.log('🔄 Bricks with rotation:');
      nonZeroRotations.forEach(([name, rot]: [string, any]) => {
        console.log(`  ${name}: [${rot[0]}°, ${rot[1]}°, ${rot[2]}°]`);
      });
    }

    // Ask if user wants to create the bricks
    const shouldCreate = window.confirm('Would you like to create these bricks in the scene?');
    if (shouldCreate) {
      // Support both old format (without quaternions) and new format
      const processedData = blenderData.map((brick: any) => {
        // If it's the new format with rotation_quaternion, use as-is
        if ('rotation_quaternion' in brick) {
          return brick;
        }
        // Otherwise, add a default identity quaternion
        return {
          ...brick,
          rotation_quaternion: [1, 0, 0, 0]
        };
      });
      createBricksFromBlender(processedData);
    }

    return analysis;
  };

  // Analyze brick model and export JSON info
  const analyzeBrickModel = async () => {
    console.log('🔍 Analyzing brick model...');
    
    try {
      // Find a brick in the scene
      const existingBrick = sceneObjects.find(obj => obj.type === 'brick');
      if (!existingBrick) {
        // Create a temporary brick to analyze
        const tempBrick: SceneObject = {
          id: 'temp-analysis-brick',
          name: 'Analysis Brick',
          type: 'brick',
          brickType: selectedMaterial || 'octa2',
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          visible: true,
          locked: false
        };
        
        // Wait a moment for the brick to load in the scene
        setSceneObjects([...sceneObjects, tempBrick]);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Load connection config if needed
      if (Object.keys(connectionConfigs).length === 0) {
        await loadConnectionConfigs();
      }
      
      const brickConfig = connectionConfigs[selectedMaterial || 'octa2'];
      
      // Use the octa2 data you provided
      const octa2ConnectionData = [
        { id: "octa2_male_1", axis: "y", type: "male", strength: 1, localPosition: { x: 0.3, y: 0, z: 0.265 } },
        { id: "octa2_male_2", axis: "y", type: "male", strength: 1, localPosition: { x: -0.167, y: -0.3, z: 0.233 } },
        { id: "octa2_male_3", axis: "y", type: "male", strength: 1, localPosition: { x: -0.180, y: 0.3, z: 0.238 } },
        { id: "octa2_female_1", axis: "y", type: "female", strength: 1, localPosition: { x: -0.249, y: 0, z: -0.167 } },
        { id: "octa2_female_2", axis: "y", type: "female", strength: 1, localPosition: { x: 0.124, y: 0.183, z: -0.164 } },
        { id: "octa2_female_3", axis: "y", type: "female", strength: 1, localPosition: { x: 0.101, y: -0.189, z: -0.116 } }
      ];
      
      // Calculate actual bounds from connection points
      const connectorBounds = {
        minX: Math.min(...octa2ConnectionData.map(c => c.localPosition.x)),
        maxX: Math.max(...octa2ConnectionData.map(c => c.localPosition.x)),
        minY: Math.min(...octa2ConnectionData.map(c => c.localPosition.y)),
        maxY: Math.max(...octa2ConnectionData.map(c => c.localPosition.y)),
        minZ: Math.min(...octa2ConnectionData.map(c => c.localPosition.z)),
        maxZ: Math.max(...octa2ConnectionData.map(c => c.localPosition.z))
      };
      
      const analysis = {
        modelInfo: {
          type: 'brick',
          material: selectedMaterial || 'octa2',
          nominalDimensions: {
            width: 0.6,
            height: 0.4,
            depth: 0.4
          }
        },
        connectionPoints: {
          data: octa2ConnectionData,
          bounds: connectorBounds,
          extents: {
            x: connectorBounds.maxX - connectorBounds.minX,
            y: connectorBounds.maxY - connectorBounds.minY,
            z: connectorBounds.maxZ - connectorBounds.minZ
          }
        },
        analysis: {
          connectorReach: {
            xMin: connectorBounds.minX,
            xMax: connectorBounds.maxX,
            yMin: connectorBounds.minY,
            yMax: connectorBounds.maxY,
            zMin: connectorBounds.minZ,
            zMax: connectorBounds.maxZ
          },
          effectiveBounds: {
            description: "Brick bounds including connectors",
            width: 0.6 + Math.abs(connectorBounds.minX) + connectorBounds.maxX,
            height: 0.4 + Math.abs(connectorBounds.minY) + connectorBounds.maxY,
            depth: 0.4 + Math.abs(connectorBounds.minZ) + connectorBounds.maxZ
          },
          recommendedSpacing: {
            x: 0.6 + 0.3 + 0.249 + 0.05, // nominal + max positive + max negative + gap
            y: 0.4 + 0.3 + 0.3 + 0.05,
            z: 0.4 + 0.265 + 0.167 + 0.05
          },
          connectionStrategy: {
            axis: "Y-axis only",
            maleCount: 3,
            femaleCount: 3,
            note: "All connectors on Y-axis means bricks connect vertically"
          }
        }
      };
      
      // Log the analysis
      console.log('📊 Brick Model Analysis:', analysis);
      
      // Create downloadable JSON
      const jsonStr = JSON.stringify(analysis, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `brick-analysis-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      
      console.log('✅ Analysis complete and downloaded');
      
      // Clean up temp brick if created
      if (existingBrick === undefined) {
        setSceneObjects(sceneObjects.filter(obj => obj.id !== 'temp-analysis-brick'));
      }
      
    } catch (error) {
      console.error('❌ Brick analysis failed:', error);
    }
  };

  // Generate connection pattern based on Blender arrangements
  const generateConnectionPattern = async (patternType: 'male-female' | 'neutral-side' | 'neutral-stacked') => {
    console.log(`🔗 Generating ${patternType} connection pattern...`);
    
    // Log pattern description
    switch (patternType) {
      case 'male-female':
        console.log('📋 Pattern: Irregular placement for vertical interlocking');
        console.log('   - Y spacing: 0.666 units');
        console.log('   - Scattered X/Z positions to align male/female connectors');
        console.log('   - Alternating layer rotation');
        break;
      case 'neutral-side':
        console.log('📋 Pattern: Side-by-side rows with offset');
        console.log('   - Y spacing: 0.757 units');
        console.log('   - X spacing: ~0.814 units within rows');
        console.log('   - Row 2 offset by 0.322 units (half brick)');
        break;
      case 'neutral-stacked':
        console.log('📋 Pattern: Direct vertical stacking');
        console.log('   - Y spacing: 0.06 units (minimal gap)');
        console.log('   - Z offset: 0.66 units on alternate layers');
        console.log('   - Same X positions maintained');
        break;
    }
    
    setIsGeneratingBuilding(true);
    
    try {
      // Load connection config if not already loaded
      if (Object.keys(connectionConfigs).length === 0) {
        await loadConnectionConfigs();
      }
      
      // Get brick config and dimensions
      const brickConfig = connectionConfigs[selectedMaterial || 'octa2'] || connectionConfigs['default_octa2'];
      
      // Calculate brick dimensions from config or use defaults
      let brickWidth = 0.8;
      let brickHeight = 0.4;
      let brickDepth = 0.8;
      
      if (brickConfig && brickConfig.connections) {
        // Calculate dimensions from connection points
        const bounds = {
          minX: Infinity, maxX: -Infinity,
          minY: Infinity, maxY: -Infinity,
          minZ: Infinity, maxZ: -Infinity
        };
        
        for (const conn of brickConfig.connections) {
          if (conn.localPosition) {
            bounds.minX = Math.min(bounds.minX, conn.localPosition.x);
            bounds.maxX = Math.max(bounds.maxX, conn.localPosition.x);
            bounds.minY = Math.min(bounds.minY, conn.localPosition.y);
            bounds.maxY = Math.max(bounds.maxY, conn.localPosition.y);
            bounds.minZ = Math.min(bounds.minZ, conn.localPosition.z);
            bounds.maxZ = Math.max(bounds.maxZ, conn.localPosition.z);
          }
        }
        
        const width = Math.max(0.4, (bounds.maxX - bounds.minX) * 2);
        const height = Math.max(0.2, (bounds.maxY - bounds.minY) * 2);
        const depth = Math.max(0.4, (bounds.maxZ - bounds.minZ) * 2);
        
        if (width > 0.1) brickWidth = width;
        if (height > 0.1) brickHeight = height;
        if (depth > 0.1) brickDepth = depth;
      }
      
      console.log(`📏 Brick dimensions: ${brickWidth} x ${brickHeight} x ${brickDepth}`);
      
      // Use Blender-derived spacing
      const brickSpacingX = 0.816;
      const brickSpacingY = 0.8;
      const brickSpacingZ = 0.66;
      
      const newBricks: SceneObject[] = [];
      let brickIndex = 0;
      
      // Define exact brick positions from Blender examples
      let brickPositions: Array<{x: number, y: number, z: number}> = [];
      
      // No rotation for any bricks - all at 0,0,0 in Blender examples
      const rotation = { x: 0, y: 0, z: 0 };
      
      switch (patternType) {
        case 'male-female':
          // Use exact user-provided positions (absolute), zero rotation
          brickPositions = [
            { x: 1.83,   y: 0.69, z: 0.42 },
            { x: 0.85,   y: 0.00, z: 0.42 },
            { x: 0.38,   y: 0.67, z: -0.43 },
            { x: -0.659, y: 0.00, z: -0.383 },
            { x: -1.19,  y: 0.67, z: -1.22 },
            { x: -1.14,  y: 0.73, z: 0.44 }
          ];
          break;
          
        case 'neutral-side':
          // Exact positions from Blender Example 2
          brickPositions = [
            // Row at Y=0.0
            { x: 0.0, y: 0.0, z: 0.0 },
            { x: 0.816, y: 0.0, z: 0.0 },
            { x: -0.824, y: 0.0, z: 0.0 },
            { x: -1.626, y: 0.0, z: 0.0 },
            // Row at Y=0.757
            { x: -1.304, y: 0.757, z: 0.0 },
            { x: -0.502, y: 0.757, z: 0.0 },
            { x: 1.138, y: 0.757, z: 0.0 },
            { x: 0.322, y: 0.757, z: 0.0 }
          ];
          break;
          
        case 'neutral-stacked':
          // Exact positions from Blender Example 3
          brickPositions = [
            // Layer at Y=2.782, Z=0.0
            { x: 0.322, y: 2.782, z: 0.0 },
            { x: 1.138, y: 2.782, z: 0.0 },
            { x: -0.502, y: 2.782, z: 0.0 },
            { x: -1.304, y: 2.782, z: 0.0 },
            // Layer at Y=2.842, Z=0.66
            { x: 0.322, y: 2.842, z: 0.66 },
            { x: 1.138, y: 2.842, z: 0.66 },
            { x: -0.502, y: 2.842, z: 0.66 }
          ];
          break;
      }
      
      // Create bricks at exact positions
      brickPositions.forEach((pos, index) => {
        const brick: SceneObject = {
          id: `pattern-${patternType}-brick-${Date.now()}-${index}`,
          name: `${patternType} ${index + 1}`,
          type: 'brick',
          brickType: selectedMaterial || 'octa2',
          position: {
            x: pos.x,
            y: pos.y,
            z: pos.z
          },
          rotation: rotation,
          scale: { x: 1, y: 1, z: 1 },
          visible: true,
          locked: false
        };
        
        newBricks.push(brick);
      });
      
      // Clear existing bricks
      setSceneObjects(prev => prev.filter(obj => obj.type !== 'brick'));
      
      // Add new bricks
      setSceneObjects(prev => [...prev, ...newBricks]);
      
      console.log(`✅ Created ${newBricks.length} bricks in ${patternType} pattern`);
      
      // Show exact positions being created
      console.log(`📊 Created bricks at positions:`);
      newBricks.forEach((brick, i) => {
        console.log(`  ${i+1}. ${brick.name}: X=${brick.position!.x.toFixed(3)}, Y=${brick.position!.y.toFixed(3)}, Z=${brick.position!.z.toFixed(3)}, Rotation=${brick.rotation!.x},${brick.rotation!.y},${brick.rotation!.z}`);
      });
      
      // Compare with expected Blender positions
      console.log(`\n📋 Expected from Blender ${patternType}:`);
      if (patternType === 'male-female') {
        console.log('  Layer 1 (Y=-4.401): (0.868,0.622), (0,0), (-0.993,-0.659)');
        console.log('  Layer 2 (Y=-5.067): (-0.659,-0.383), (0.334,0.276), (1.202,0.899)');
        console.log('  Single (Y=-3.534): (-1.428,0.002)');
      } else if (patternType === 'neutral-side') {
        console.log('  Row 1 (Y=0): (-1.626,0), (-0.824,0), (0,0), (0.816,0)');
        console.log('  Row 2 (Y=0.757): (-1.304,0), (-0.502,0), (0.322,0), (1.138,0)');
      } else if (patternType === 'neutral-stacked') {
        console.log('  Layer 1 (Y=2.782, Z=0): (-1.304), (-0.502), (0.322), (1.138)');
        console.log('  Layer 2 (Y=2.842, Z=0.66): (-0.502), (0.322), (1.138)');
      }
      
      // Debug connection analysis
      if (newBricks.length > 1 && brickConfig) {
        const brick1 = newBricks[0];
        const brick2 = newBricks[1];
        const connectionResult = canBricksConnect(brick1, brick2, brickConfig, 5);
        console.log(`🔗 Connection test between first two bricks:`, connectionResult);
      }
      
    } catch (error) {
      console.error('Error generating connection pattern:', error);
    } finally {
      setIsGeneratingBuilding(false);
    }
  };

  // Advanced layout based on user-provided TechnicBrickSystem concept
  const generateTechnicLayout = async (algorithm: 'structural_grid' | 'connection_optimization' = 'structural_grid') => {
    console.log(`🧱 Generating Technic layout (${algorithm})...`);
    setIsGeneratingBuilding(true);

    try {
      if (Object.keys(connectionConfigs).length === 0) {
        await loadConnectionConfigs();
      }
      const brickConfig = connectionConfigs[selectedMaterial || 'octa2'] || connectionConfigs['default_octa2'];

      const spacing = { x: 1.400, y: 1.300, z: 1.111 };
      const width = 6, height = 4, layers = 3;

      const newBricks: SceneObject[] = [];

      const isEdge = (x: number, y: number, z: number) => (
        x === 0 || x === width - 1 || y === 0 || y === height - 1 || z === 0 || z === layers - 1
      );
      const isCorner = (x: number, y: number, z: number) => (
        (x === 0 || x === width - 1) && (z === 0 || z === layers - 1)
      );

      const determineOrientation = (x: number, y: number, z: number): 'A' | 'B' | 'C' => {
        switch (algorithm) {
          case 'structural_grid': {
            if (isCorner(x, y, z)) return 'A';
            if (isEdge(x, y, z)) return z % 2 === 0 ? 'B' : 'C';
            return ((x + y + z * 2) % 3 === 0) ? 'A' : (((x + y + z * 2) % 3 === 1) ? 'B' : 'C');
          }
          case 'connection_optimization':
          default:
            return 'A';
        }
      };

      const orientationToRotation = (o: 'A' | 'B' | 'C') => {
        // Map so Y-axis connectors face: A→Z+, B→X+, C→Y (default)
        if (o === 'A') return { x: Math.PI / 2, y: 0, z: 0 };
        if (o === 'B') return { x: 0, y: 0, z: Math.PI / 2 };
        return { x: 0, y: 0, z: 0 };
      };

      const canPlace = (candidate: SceneObject): boolean => {
        // Validate against nearby existing bricks
        const nearby = newBricks.filter(b => b.position && candidate.position &&
          Math.abs(b.position.x - candidate.position.x) <= spacing.x + 0.2 &&
          Math.abs(b.position.y - candidate.position.y) <= spacing.y + 0.2 &&
          Math.abs(b.position.z - candidate.position.z) <= spacing.z + 0.2
        );
        if (!brickConfig) return true;
        for (const nb of nearby) {
          const res = canBricksConnect(candidate, nb, brickConfig, 5);
          // Allow placement if at least one potential connection exists or they are sufficiently apart
          if (!res.canConnect &&
              Math.abs(candidate.position!.x - nb.position!.x) < spacing.x * 0.9 &&
              Math.abs(candidate.position!.y - nb.position!.y) < spacing.y * 0.9 &&
              Math.abs(candidate.position!.z - nb.position!.z) < spacing.z * 0.9) {
            return false;
          }
        }
        return true;
      };

      for (let z = 0; z < layers; z++) {
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const orientation = determineOrientation(x, y, z);
            const rotation = orientationToRotation(orientation);

            const pos = {
              x: (x - (width - 1) / 2) * spacing.x,
              y: y * spacing.y,
              z: (z - (layers - 1) / 2) * spacing.z
            };

            const brick: SceneObject = {
              id: `technic-${Date.now()}-${x}-${y}-${z}`,
              name: `Technic ${orientation} (${x},${y},${z})`,
              type: 'brick',
              brickType: selectedMaterial || 'octa2',
              position: pos,
              rotation,
              scale: { x: 1, y: 1, z: 1 },
              visible: true,
              locked: false
            };

            if (canPlace(brick)) {
              newBricks.push(brick);
            }
          }
        }
      }

      setSceneObjects(prev => [...prev, ...newBricks]);
      setSelectedObjects(newBricks.map(b => b.id));
      setTimeout(() => addToHistory(`Generate Technic Layout (${algorithm})`), 0);
      console.log(`✅ Generated Technic layout with ${newBricks.length} bricks`);
    } catch (e) {
      console.error('❌ Technic layout generation failed:', e);
      alert(`❌ Technic layout generation failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIsGeneratingBuilding(false);
    }
  };

  // Test brick generation - Create Z-direction wall
  const generateBrickZWall = async () => {
    console.log('🧱 Generating test Z-direction wall...');
    setIsGeneratingBuilding(true);
    
    try {
      // Load connection config if not already loaded
      if (Object.keys(connectionConfigs).length === 0) {
        await loadConnectionConfigs();
      }
      
      // Get brick config
      const brickConfig = connectionConfigs[selectedMaterial || 'octa2'] || connectionConfigs['default_octa2'];
      
      // Calculate brick dimensions
      let brickWidth = 0.8;
      let brickHeight = 0.4;
      let brickDepth = 0.8;
      
      if (brickConfig && brickConfig.dimensions) {
        const { width, height, depth } = brickConfig.dimensions;
        if (width > 0.1) brickWidth = width;
        if (height > 0.1) brickHeight = height;
        if (depth > 0.1) brickDepth = depth;
      }
      
      console.log(`📏 Brick dimensions: ${brickWidth} x ${brickHeight} x ${brickDepth}`);
      
      // Z-wall parameters
      const wallDepth = 10; // 10 bricks deep (in Z direction)
      const wallHeight = 6; // 6 bricks tall
      const wallWidth = 3; // 3 bricks wide
      // Use Blender-derived spacing for consistency
      const brickSpacingX = 0.816; // From Blender analysis
      const brickSpacingY = 0.8;   // From Blender analysis
      const brickSpacingZ = 0.66; // Based on Blender reference arrangement
      
      const newBricks: SceneObject[] = [];
      let brickIndex = 0;
      
      console.log(`📐 Spacing: X=${brickSpacingX.toFixed(2)}, Y=${brickSpacingY.toFixed(2)}, Z=${brickSpacingZ.toFixed(2)}`);
      
      // Generate Z-wall (extends in Z direction)
      // Since octa2 has Y-axis connectors, we need to rotate bricks 90° around X
      // This makes Y-connectors point in Z direction for front-to-back connections
      for (let layer = 0; layer < wallHeight; layer++) {
        for (let row = 0; row < wallDepth; row++) {
          for (let col = 0; col < wallWidth; col++) {
            // Apply offset pattern
            const xOffset = (layer % 2 === 1) ? brickSpacingX / 2 : 0;
            const yOffset = (layer % 2 === 1) ? 0.06 : 0;
            const zOffset = (row % 2 === 1) ? brickSpacingZ / 2 : 0;
            
            const brick: SceneObject = {
              id: `test-zwall-brick-${Date.now()}-${brickIndex++}`,
              name: `Z-Wall ${brickIndex}`,
              type: 'brick',
              brickType: selectedMaterial || 'octa2',
              position: {
                x: col * brickSpacingX - (wallWidth - 1) * brickSpacingX / 2 + xOffset,
                y: layer * brickSpacingY + yOffset,
                z: row * brickSpacingZ + zOffset
              },
              rotation: { 
                x: Math.PI / 2, // Rotate 90° around X to make Y-connectors face forward/back
                y: 0,
                z: row % 2 === 1 ? Math.PI : 0 // Alternate 180° for male/female alignment
              },
              scale: { x: 1, y: 1, z: 1 },
              visible: true,
              locked: false
            };
            newBricks.push(brick);
          }
        }
      }
      
      // Check for intersections
      let intersectionCount = 0;
      const intersectionPairs: string[] = [];
      
      for (let i = 0; i < newBricks.length; i++) {
        for (let j = i + 1; j < newBricks.length; j++) {
          const brick1 = newBricks[i];
          const brick2 = newBricks[j];
          
          if (!brick1.position || !brick2.position) continue;
          
          const dx = Math.abs(brick1.position.x - brick2.position.x);
          const dy = Math.abs(brick1.position.y - brick2.position.y);
          const dz = Math.abs(brick1.position.z - brick2.position.z);
          
          // Check if bricks overlap (using full dimensions plus connector extents)
          // For octa2, connectors extend significantly beyond nominal dimensions
          const xThreshold = brickWidth + 0.6; // Account for X connectors at ±0.3
          const yThreshold = brickHeight + 0.6; // Account for Y connectors at ±0.3
          const zThreshold = brickDepth + 0.53; // Account for Z connectors at ±0.265
          
          if (dx < xThreshold && dy < yThreshold && dz < zThreshold) {
            intersectionCount++;
            intersectionPairs.push(`${brick1.name} ↔ ${brick2.name}`);
            
            // Mark intersecting bricks with a special property (for visual debugging)
            (brick1 as any).isIntersecting = true;
            (brick2 as any).isIntersecting = true;
          }
        }
      }
      
      // Add all bricks to scene
      const updatedObjects = [...sceneObjects, ...newBricks];
      setSceneObjects(updatedObjects);
      
      console.log(`✅ Created Z-wall with ${newBricks.length} bricks`);
      
      if (intersectionCount > 0) {
        console.warn(`⚠️ Found ${intersectionCount} intersecting brick pairs!`);
        console.log('Intersecting pairs:', intersectionPairs.slice(0, 10)); // Show first 10
        if (intersectionPairs.length > 10) {
          console.log(`... and ${intersectionPairs.length - 10} more`);
        }
      } else {
        console.log('✅ No brick intersections detected');
      }
    } catch (error) {
      console.error('❌ Z-wall generation failed:', error);
    } finally {
      setIsGeneratingBuilding(false);
    }
  };

  // Test brick generation - Create curved wall
  const generateBrickCurvedWall = async () => {
    console.log('🧱 Generating test curved wall...');
    setIsGeneratingBuilding(true);
    
    try {
      // Load connection config if not already loaded
      if (Object.keys(connectionConfigs).length === 0) {
        await loadConnectionConfigs();
      }
      
      // Get brick config
      const brickConfig = connectionConfigs[selectedMaterial || 'octa2'] || connectionConfigs['default_octa2'];
      
      // Calculate brick dimensions
      let brickWidth = 0.8;
      let brickHeight = 0.4;
      let brickDepth = 0.8;
      
      if (brickConfig && brickConfig.connections) {
        const bounds = {
          minX: Infinity, maxX: -Infinity,
          minY: Infinity, maxY: -Infinity,
          minZ: Infinity, maxZ: -Infinity
        };
        
        brickConfig.connections.forEach((conn: any) => {
          bounds.minX = Math.min(bounds.minX, conn.localPosition.x);
          bounds.maxX = Math.max(bounds.maxX, conn.localPosition.x);
          bounds.minY = Math.min(bounds.minY, conn.localPosition.y);
          bounds.maxY = Math.max(bounds.maxY, conn.localPosition.y);
          bounds.minZ = Math.min(bounds.minZ, conn.localPosition.z);
          bounds.maxZ = Math.max(bounds.maxZ, conn.localPosition.z);
        });
        
        const width = Math.max(0.4, (bounds.maxX - bounds.minX) * 2);
        const height = Math.max(0.2, (bounds.maxY - bounds.minY) * 2);
        const depth = Math.max(0.4, (bounds.maxZ - bounds.minZ) * 2);
        
        if (width > 0.1) brickWidth = width;
        if (height > 0.1) brickHeight = height;
        if (depth > 0.1) brickDepth = depth;
      }
      
      console.log(`📏 Brick dimensions: ${brickWidth} x ${brickHeight} x ${brickDepth}`);
      
      // Curved wall parameters
      const curveRadius = 5; // Radius of the curve
      const curveAngle = Math.PI / 2; // 90 degree curve
      const wallHeight = 6; // 6 layers tall
      // Use Blender-derived spacing
      const brickSpacingY = 0.8;
      
      // Calculate proper brick count based on arc length
      const arcLength = curveRadius * curveAngle; // Quarter circumference
      // Use consistent spacing from Blender
      const brickArcLength = 0.816; // Same as brickSpacingX
      const bricksPerCurve = Math.floor(arcLength / brickArcLength);
      
      const newBricks: SceneObject[] = [];
      let brickIndex = 0;
      
      // Generate curved wall layer by layer
      for (let layer = 0; layer < wallHeight; layer++) {
        const angleStep = curveAngle / bricksPerCurve;
        const stagger = layer % 2 === 1;
        const brickCount = stagger ? bricksPerCurve - 1 : bricksPerCurve;
        
        for (let i = 0; i < brickCount; i++) {
          // Add half brick offset for staggered layers
          const angleOffset = stagger ? angleStep / 2 : 0;
          const angle = angleOffset + i * angleStep;
          
          // Calculate position on the curve
          const x = curveRadius * Math.cos(angle);
          const z = curveRadius * Math.sin(angle);
          // Add Y offset for alternating layers
          const yOffset = (layer % 2 === 1) ? 0.06 : 0;
          const y = layer * brickSpacingY + yOffset;
          
          // Rotation to align brick with curve tangent
          const tangentRotation = angle + Math.PI / 2;
          
          let rotation = { x: 0, y: tangentRotation, z: 0 };
          
          // Add 180 degree rotation for alternating layers
          if (layer % 2 === 1) {
            rotation.y += Math.PI;
          }
          
          const brick: SceneObject = {
            id: `test-curve-brick-${Date.now()}-${brickIndex++}`,
            name: `Curve Brick ${brickIndex}`,
            type: 'brick',
            brickType: selectedMaterial || 'octa2',
            position: {
              x: x,
              y: y,
              z: z
            },
            rotation: rotation,
            scale: { x: 1, y: 1, z: 1 },
            visible: true,
            locked: false
          };
          
          newBricks.push(brick);
        }
      }
      
      // Add all bricks to scene
      setSceneObjects(prev => [...prev, ...newBricks]);
      setSelectedObjects(newBricks.map(b => b.id));
      
      // Add to history
      setTimeout(() => addToHistory('Generate Test Curve'), 0);
      
      console.log(`✅ Created test curved wall with ${newBricks.length} bricks`);
      alert(`✅ Test curved wall created!\n\nGenerated ${newBricks.length} bricks in a 90° curved wall.\n\nBricks are rotated to follow the curve with proper staggering.`);
      
    } catch (error) {
      console.error('❌ Test curve generation failed:', error);
      alert(`❌ Test curve generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  // Annotation handlers
  const getStandardAnnotationText = (type: string): { title: string; text: string } => {
    const templates: Record<string, { title: string; text: string }> = {
      'info': {
        title: 'Information Note',
        text: 'This is an informational annotation. Add details about this location, component, or feature that users should know about.'
      },
      'warning': {
        title: 'Important Warning',
        text: 'This area requires special attention. Add safety information, precautions, or important notices that users must be aware of.'
      },
      'construction': {
        title: 'Construction Detail',
        text: 'Construction specification for this element. Include building requirements, materials, techniques, or structural information.'
      },
      'measurement': {
        title: 'Dimension',
        text: 'Measurement annotation. Add specific dimensions, tolerances, or sizing information for this component or space.'
      }
    };
    return templates[type] || templates['info'];
  };

  const handleAnnotationClick = async (event: MouseEvent | any) => {
    if (!isPlacingAnnotation) return;
    
    console.log('📍 handleAnnotationClick called with event:', event);
    
    // Check if this is a direct 3D position from Three.js viewport
    if (event.worldPosition) {
      console.log('📍 Using direct 3D world position:', event.worldPosition);
      
      const standardText = getStandardAnnotationText(selectedAnnotationType);
      
      const newAnnotation: Annotation = {
        id: `annotation-${Date.now()}`,
        position: { 
          x: event.worldPosition.x, 
          y: event.worldPosition.y, 
          z: event.worldPosition.z 
        },
        normal: event.normal || { x: 0, y: 1, z: 0 }, // Default normal pointing up
        text: standardText.text,
        title: standardText.title,
        color: getAnnotationColor(selectedAnnotationType),
        type: selectedAnnotationType,
        visible: true,
        createdAt: new Date().toISOString()
      };
      
      // Add to annotations list
      setAnnotations(prev => [...prev, newAnnotation]);
      setIsPlacingAnnotation(false);
      setSelectedAnnotation(newAnnotation);
      
      console.log('📍 Annotation placed at 3D position:', newAnnotation);
      return;
    }
    
    // Fallback to model-viewer method (for compatibility)
    const modelViewer = document.querySelector('model-viewer') as any;
    if (!modelViewer) {
      console.log('❌ No model-viewer found and no 3D position provided');
      return;
    }
    
    // Get 3D position from click
    const rect = modelViewer.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    try {
      // Use model-viewer's positionAndNormalFromPoint method
      const hit = await modelViewer.positionAndNormalFromPoint(x, y);
      
      if (hit) {
        const standardText = getStandardAnnotationText(selectedAnnotationType);
        
        const newAnnotation: Annotation = {
          id: `annotation-${Date.now()}`,
          position: { x: hit.position.x, y: hit.position.y, z: hit.position.z },
          normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
          text: standardText.text,
          title: standardText.title,
          color: getAnnotationColor(selectedAnnotationType),
          type: selectedAnnotationType,
          visible: true,
          createdAt: new Date().toISOString()
        };
        
        // Add to annotations list
        setAnnotations(prev => [...prev, newAnnotation]);
        setIsPlacingAnnotation(false);
        setSelectedAnnotation(newAnnotation);
        
        console.log('📍 Annotation placed via model-viewer:', newAnnotation);
      }
    } catch (error) {
      console.error('❌ Failed to place annotation:', error);
      setIsPlacingAnnotation(false);
    }
  };

  const getAnnotationColor = (type: string): string => {
    const colors: Record<string, string> = {
      'info': '#2196F3',
      'warning': '#FF9800',
      'construction': '#4CAF50',
      'measurement': '#9C27B0'
    };
    return colors[type] || '#2196F3';
  };

  const handleDeleteAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(ann => ann.id !== id));
    if (selectedAnnotation?.id === id) {
      setSelectedAnnotation(null);
    }
    console.log('🗑️ Annotation deleted:', id);
  };

  const handleEditAnnotation = (id: string, updates: Partial<Annotation>) => {
    setAnnotations(prev => prev.map(ann => 
      ann.id === id ? { ...ann, ...updates } : ann
    ));
    console.log('✏️ Annotation updated:', id, updates);
  };

  const saveAnnotationsToProject = async () => {
    if (!projects[0] || annotations.length === 0) return;
    
    try {
      // Update project structure with annotations
      const project = projects[0] as any;
      const currentStructure = project.project_structure || {};
      const updatedStructure = {
        ...currentStructure,
        annotations: annotations
      };
      
      await updateProject(projects[0].id, { 
        project_structure: updatedStructure 
      } as any);
      
      console.log('💾 Annotations saved to project:', annotations.length);
    } catch (error) {
      console.error('❌ Failed to save annotations:', error);
    }
  };

  // Auto-save annotations when they change
  useEffect(() => {
    if (annotations.length > 0) {
      const saveTimer = setTimeout(() => {
        saveAnnotationsToProject();
      }, 1000); // Debounce saves by 1 second
      
      return () => clearTimeout(saveTimer);
    }
  }, [annotations]);

  // Load annotations from project structure on mount
  useEffect(() => {
    const project = projects[0] as any;
    if (project?.project_structure?.annotations) {
      setAnnotations(project.project_structure.annotations);
      console.log('📍 Loaded annotations from project:', project.project_structure.annotations.length);
    }
  }, [projects]);

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
    
    // Check for authentication using the already available user from useAuth hook
    if (!user) {
      console.log('❌ No user found, checking authentication status...');
      
      console.log('❌ Not authenticated, aborting save');
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

    console.log('✅ User authenticated:', user?.id || 'unknown');
    
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
      
      // Prepare project structure with complete scene data - PRESERVE ALL PROPERTIES
      const projectStructure = {
        sceneObjects: sceneObjects.map(obj => ({
          id: obj.id,
          name: obj.name,
          type: obj.type,
          visible: obj.visible,
          locked: obj.locked || false,
          position: obj.position || { x: 0, y: 0, z: 0 },
          rotation: obj.rotation || { x: 0, y: 0, z: 0 },
          scale: obj.scale || { x: 1, y: 1, z: 1 },
          
          // 🌿 Preserve vine properties
          ...(obj.type === 'vine' && {
            vineType: obj.vineType,
            modelPath: obj.modelPath
          }),
          
          // 🧱 Preserve brick properties  
          ...(obj.type === 'brick' && {
            brickType: obj.brickType,
            connectionPoints: obj.connectionPoints
          }),
          
          // 📐 Preserve form properties
          ...(obj.type === 'form' && {
            formId: obj.formId,
            formParameters: obj.formParameters,
            isHollow: obj.isHollow
          })
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
        : { ...baseProjectData, user_id: user?.id || '' };  // For creates, include user_id

      console.log('📦 Project data prepared:', projectData);
      console.log('📏 Project data size:', JSON.stringify(projectData).length, 'characters');
      console.log('📏 Project structure size:', JSON.stringify(projectStructure).length, 'characters');
      
      // 🚨 CRITICAL - Debug what vine properties are being saved
      console.warn('🚨 DEBUGGING - Scene objects being saved to database:');
      projectStructure.sceneObjects.forEach((obj, index) => {
        if (obj.type === 'vine') {
          console.warn(`   VINE ${index + 1}: ID=${obj.id}, vineType=${obj.vineType}, modelPath=${obj.modelPath}`);
        } else {
          console.warn(`   ${obj.type.toUpperCase()} ${index + 1}: ID=${obj.id}`);
        }
      });

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
        
        // Check if we should export optimized model - now includes bricks, forms, and vines
        const exportableObjects = sceneObjects.filter(obj => obj.type === 'brick' || obj.type === 'form' || obj.type === 'vine');
        const brickObjects = exportableObjects.filter(obj => obj.type === 'brick');
        const formObjects = exportableObjects.filter(obj => obj.type === 'form');
        const vineObjects = exportableObjects.filter(obj => obj.type === 'vine');
        
        console.log('🔍 Scene objects for export:', {
          total: exportableObjects.length,
          bricks: brickObjects.length,
          forms: formObjects.length,
          vines: vineObjects.length,
          objects: exportableObjects.map(obj => ({
            id: obj.id,
            type: obj.type,
            brickType: obj.brickType,
            formId: obj.formId,
            vineType: obj.vineType,
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
                type: obj.type as 'brick' | 'form' | 'vine',
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
              } else if (obj.type === 'vine') {
                return {
                  ...baseData,
                  vineType: obj.vineType || 'vine1'
                };
              }
              return baseData;
            });
            
            console.warn('🚨 CRITICAL - Mixed object instance data for export:');
            objectInstanceData.forEach((obj, index) => {
              console.warn(`   ${index + 1}. Type: ${obj.type}, ID: ${obj.id}`);
              console.warn(`      - vineType: ${obj.vineType}`);
              console.warn(`      - brickType: ${obj.brickType}`);
              console.warn(`      - formId: ${obj.formId}`);
              console.warn(`      - position: ${JSON.stringify(obj.position)}`);
            });
            
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
            user_id: user?.id || ''
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
                transition: 'all 0.2s ease',
                display: 'none',
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
                transition: 'all 0.2s ease',
                display: 'none',
              }}
            >
              🏢
            </button>
            <button
              onClick={() => setCreationMode('annotations')}
              style={{
                background: creationMode === 'annotations' ? 'var(--gradient-primary)' : 'transparent',
                border: 'none',
                color: creationMode === 'annotations' ? 'white' : 'var(--text-muted)',
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: '500',
                transition: 'all 0.2s ease',
                display: 'none',
              }}
            >
              📍
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

          {/* Brick Mode Controls */}
          {creationMode === 'bricks' && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              background: 'var(--surface-glass)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '0.3rem'
            }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                Add:
              </span>
              <select
                value={selectedObjectType}
                onChange={(e) => setSelectedObjectType(e.target.value as 'brick' | 'vine1' | 'vine2')}
                style={{
                  background: 'var(--dark-surface)',
                  color: 'white',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  padding: '0.2rem 0.4rem',
                  fontSize: '0.7rem',
                  minWidth: '80px'
                }}
              >
                <option value="brick">🧱 Brick</option>
                <option value="vine1">🌿 Vine 1</option>
                <option value="vine2">🍃 Vine 2</option>
              </select>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button
                      onClick={generateBrickBuildingFromForm}
                      disabled={isGeneratingBuilding || selectedObjects.length !== 1}
                      style={{
                        background: selectedObjects.length === 1 && !isGeneratingBuilding 
                          ? 'var(--gradient-cyan)' : 'var(--surface-disabled)',
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
                      {isGeneratingBuilding ? '⏳' : '🧱 Bricks'}
                    </Button>
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
                  </div>
                  
                  {/* Test brick generation buttons */}
                  <div style={{ 
                    display: 'flex', 
                    gap: '0.3rem',
                    padding: '0.5rem',
                    background: 'var(--surface-secondary)',
                    borderRadius: '6px',
                    marginTop: '0.3rem'
                  }}>
                    <span style={{ 
                      fontSize: '0.7rem', 
                      color: 'var(--text-muted)',
                      alignSelf: 'center',
                      marginRight: '0.3rem'
                    }}>
                      Test:
                    </span>
                    <Button
                      onClick={generateBrickWall}
                      disabled={isGeneratingBuilding}
                      style={{
                        background: !isGeneratingBuilding ? 'var(--surface-tertiary)' : 'var(--surface-disabled)',
                        border: '1px solid var(--border-subtle)',
                        color: !isGeneratingBuilding ? 'var(--text-primary)' : 'var(--text-muted)',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '4px',
                        cursor: !isGeneratingBuilding ? 'pointer' : 'not-allowed',
                        fontSize: '0.65rem',
                        fontWeight: '500'
                      }}
                    >
                      🧱 Wall
                    </Button>
                    <Button
                      onClick={generateBrickFloor}
                      disabled={isGeneratingBuilding}
                      style={{
                        background: !isGeneratingBuilding ? 'var(--surface-tertiary)' : 'var(--surface-disabled)',
                        border: '1px solid var(--border-subtle)',
                        color: !isGeneratingBuilding ? 'var(--text-primary)' : 'var(--text-muted)',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '4px',
                        cursor: !isGeneratingBuilding ? 'pointer' : 'not-allowed',
                        fontSize: '0.65rem',
                        fontWeight: '500'
                      }}
                    >
                      📦 Floor
                    </Button>
                    <Button
                      onClick={generateBrickCorner}
                      disabled={isGeneratingBuilding}
                      style={{
                        background: !isGeneratingBuilding ? 'var(--surface-tertiary)' : 'var(--surface-disabled)',
                        border: '1px solid var(--border-subtle)',
                        color: !isGeneratingBuilding ? 'var(--text-primary)' : 'var(--text-muted)',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '4px',
                        cursor: !isGeneratingBuilding ? 'pointer' : 'not-allowed',
                        fontSize: '0.65rem',
                        fontWeight: '500'
                      }}
                    >
                      🔗 Corner
                    </Button>
                    <Button
                      onClick={generateBrickSlopeWall}
                      disabled={isGeneratingBuilding}
                      style={{
                        background: !isGeneratingBuilding ? 'var(--surface-tertiary)' : 'var(--surface-disabled)',
                        border: '1px solid var(--border-subtle)',
                        color: !isGeneratingBuilding ? 'var(--text-primary)' : 'var(--text-muted)',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '4px',
                        cursor: !isGeneratingBuilding ? 'pointer' : 'not-allowed',
                        fontSize: '0.65rem',
                        fontWeight: '500'
                      }}
                    >
                      📐 Slope
                    </Button>
                    <Button
                      onClick={generateBrickArch}
                      disabled={isGeneratingBuilding}
                      style={{
                        background: !isGeneratingBuilding ? 'var(--surface-tertiary)' : 'var(--surface-disabled)',
                        border: '1px solid var(--border-subtle)',
                        color: !isGeneratingBuilding ? 'var(--text-primary)' : 'var(--text-muted)',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '4px',
                        cursor: !isGeneratingBuilding ? 'pointer' : 'not-allowed',
                        fontSize: '0.65rem',
                        fontWeight: '500'
                      }}
                    >
                      🏛️ Arch
                    </Button>
                    <Button
                      onClick={generateBrickCurvedWall}
                      disabled={isGeneratingBuilding}
                      style={{
                        background: !isGeneratingBuilding ? 'var(--surface-tertiary)' : 'var(--surface-disabled)',
                        border: '1px solid var(--border-subtle)',
                        color: !isGeneratingBuilding ? 'var(--text-primary)' : 'var(--text-muted)',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '4px',
                        cursor: !isGeneratingBuilding ? 'pointer' : 'not-allowed',
                        fontSize: '0.65rem',
                        fontWeight: '500'
                      }}
                    >
                      🌙 Curve
                    </Button>
                    <Button
                      onClick={generateBrickZWall}
                      disabled={isGeneratingBuilding}
                      style={{
                        background: !isGeneratingBuilding ? 'var(--surface-tertiary)' : 'var(--surface-disabled)',
                        border: '1px solid var(--border-subtle)',
                        color: !isGeneratingBuilding ? 'var(--text-primary)' : 'var(--text-muted)',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '4px',
                        cursor: !isGeneratingBuilding ? 'pointer' : 'not-allowed',
                        width: '100%',
                        transition: 'background 0.2s ease',
                        fontSize: '0.85rem',
                        fontWeight: '500'
                      }}
                    >
                      📐 Z-Wall
                    </Button>
                    
                    <div style={{ 
                      gridColumn: 'span 3', 
                      marginTop: '0.5rem',
                      paddingTop: '0.5rem',
                      borderTop: '1px solid var(--border-subtle)',
                      marginBottom: '0.3rem'
                    }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Connection Patterns:
                      </div>
                    </div>
                    
                    <Button
                      onClick={() => generateConnectionPattern('male-female')}
                      disabled={isGeneratingBuilding}
                      style={{
                        background: !isGeneratingBuilding ? 'var(--surface-tertiary)' : 'var(--surface-disabled)',
                        border: '1px solid var(--border-subtle)',
                        color: !isGeneratingBuilding ? 'var(--text-primary)' : 'var(--text-muted)',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '4px',
                        cursor: !isGeneratingBuilding ? 'pointer' : 'not-allowed',
                        fontSize: '0.65rem',
                        fontWeight: '500'
                      }}
                    >
                      🔌 Male/Female
                    </Button>
                    
                    <Button
                      onClick={() => generateConnectionPattern('neutral-side')}
                      disabled={isGeneratingBuilding}
                      style={{
                        background: !isGeneratingBuilding ? 'var(--surface-tertiary)' : 'var(--surface-disabled)',
                        border: '1px solid var(--border-subtle)',
                        color: !isGeneratingBuilding ? 'var(--text-primary)' : 'var(--text-muted)',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '4px',
                        cursor: !isGeneratingBuilding ? 'pointer' : 'not-allowed',
                        fontSize: '0.65rem',
                        fontWeight: '500'
                      }}
                    >
                      ➡️ Neutral Side
                    </Button>
                    
                    <Button
                      onClick={() => generateConnectionPattern('neutral-stacked')}
                      disabled={isGeneratingBuilding}
                      style={{
                        background: !isGeneratingBuilding ? 'var(--surface-tertiary)' : 'var(--surface-disabled)',
                        border: '1px solid var(--border-subtle)',
                        color: !isGeneratingBuilding ? 'var(--text-primary)' : 'var(--text-muted)',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '4px',
                        cursor: !isGeneratingBuilding ? 'pointer' : 'not-allowed',
                        fontSize: '0.65rem',
                        fontWeight: '500'
                      }}
                    >
                      📚 Neutral Stack
                    </Button>
                    
                    <Button
                      onClick={analyzeBrickModel}
                      style={{
                        background: 'var(--surface-tertiary)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        width: '100%',
                        transition: 'background 0.2s ease',
                        fontSize: '0.85rem',
                        fontWeight: '500'
                      }}
                    >
                      🔍 Analyze
                    </Button>
                    <Button
                      onClick={analyzeBlenderArrangement}
                      style={{
                        background: 'var(--surface-tertiary)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-primary)',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        width: '100%',
                        transition: 'background 0.2s ease',
                        fontSize: '0.85rem',
                        fontWeight: '500'
                      }}
                    >
                      📊 Blender
                    </Button>
                  </div>
                </div>
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

          {/* Annotations Mode Controls */}
          {creationMode === 'annotations' && (
            <>
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column',
                gap: '0.5rem',
                background: 'var(--surface-glass)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '0.5rem'
              }}>
                <div style={{ 
                  fontSize: '0.75rem', 
                  fontWeight: '500', 
                  color: 'var(--text-primary)',
                  marginBottom: '0.25rem' 
                }}>
                  📍 Annotation Tools
                </div>
                
                {/* Click to Place Instructions */}
                <div style={{ 
                  fontSize: '0.65rem', 
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  padding: '0.25rem',
                  background: isPlacingAnnotation ? 'rgba(76, 175, 80, 0.1)' : 'rgba(33, 150, 243, 0.1)',
                  borderRadius: '4px',
                  border: isPlacingAnnotation ? '1px solid rgba(76, 175, 80, 0.3)' : '1px solid rgba(33, 150, 243, 0.2)'
                }}>
                  {isPlacingAnnotation ? 
                    '📍 Click on the 3D model to place annotation' : 
                    `📋 ${annotations.length} annotations placed`}
                </div>
                
                {/* Annotation Type Selector */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.3rem'
                }}>
                  <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', minWidth: '30px' }}>
                    Type:
                  </label>
                  <select
                    value={selectedAnnotationType}
                    onChange={(e) => setSelectedAnnotationType(e.target.value as any)}
                    style={{
                      background: 'var(--surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '4px',
                      padding: '0.2rem 0.4rem',
                      fontSize: '0.65rem',
                      color: 'var(--text-primary)',
                      flex: 1
                    }}
                  >
                    <option value="info">ℹ️ Info</option>
                    <option value="warning">⚠️ Warning</option>
                    <option value="construction">🏗️ Construction</option>
                    <option value="measurement">📏 Measurement</option>
                  </select>
                </div>

                {/* New Annotation Button */}
                <Button
                  onClick={() => setIsPlacingAnnotation(!isPlacingAnnotation)}
                  style={{
                    background: isPlacingAnnotation ? 'var(--accent-green)' : 'var(--gradient-primary)',
                    border: 'none',
                    color: 'white',
                    padding: '0.4rem 0.6rem',
                    borderRadius: '4px',
                    fontSize: '0.65rem',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  {isPlacingAnnotation ? '❌ Cancel Placing' : '➕ New Annotation'}
                </Button>
              </div>
              
              {/* Annotations List */}
              {annotations.length > 0 && (
                <div style={{ 
                  background: 'var(--surface-glass)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '0.5rem',
                  maxHeight: '200px',
                  overflowY: 'auto'
                }}>
                  <div style={{ 
                    fontSize: '0.7rem', 
                    fontWeight: '500', 
                    color: 'var(--text-primary)',
                    marginBottom: '0.5rem' 
                  }}>
                    📋 Annotation List
                  </div>
                  
                  {annotations.map((annotation, index) => (
                    <div 
                      key={annotation.id}
                      onClick={() => setSelectedAnnotation(
                        selectedAnnotation?.id === annotation.id ? null : annotation
                      )}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.3rem',
                        marginBottom: '0.25rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        background: selectedAnnotation?.id === annotation.id ? 
                          'rgba(33, 150, 243, 0.2)' : 'transparent',
                        border: selectedAnnotation?.id === annotation.id ? 
                          '1px solid rgba(33, 150, 243, 0.4)' : '1px solid transparent',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {/* Color Dot */}
                      <div 
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: annotation.color || '#2196F3',
                          flexShrink: 0
                        }}
                      />
                      
                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          fontSize: '0.65rem', 
                          fontWeight: '500',
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {annotation.title || `Annotation ${index + 1}`}
                        </div>
                        <div style={{ 
                          fontSize: '0.6rem', 
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {annotation.text.substring(0, 30)}...
                        </div>
                      </div>
                      
                      {/* Delete Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAnnotation(annotation.id);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '0.1rem',
                          fontSize: '0.7rem',
                          opacity: 0.7,
                          transition: 'opacity 0.2s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
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
            // Annotation mode integration
            creationMode={creationMode}
            isPlacingAnnotation={isPlacingAnnotation}
            annotations={annotations}
            selectedAnnotation={selectedAnnotation}
            onAnnotationClick={handleAnnotationClick}
            onAnnotationSelect={setSelectedAnnotation}
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

          {/* Material Library / Annotation Editor */}
          {(isMaterialVisible && creationMode !== 'annotations') && (
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

          {/* Annotation Editor */}
          {(isMaterialVisible && creationMode === 'annotations') && (
            <div style={{ 
              height: isPropertyVisible ? '50%' : '100%',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}>
              {/* Annotation Editor Header */}
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
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  📍 Annotation Editor
                  {selectedAnnotation && (
                    <span style={{ 
                      fontSize: '0.7rem', 
                      color: 'var(--text-muted)',
                      fontWeight: 'normal'
                    }}>
                      (Editing: {selectedAnnotation.title || 'Untitled'})
                    </span>
                  )}
                </h3>
              </div>

              {/* Annotation Editor Content */}
              <div style={{ 
                flex: 1, 
                overflowY: 'auto',
                padding: '1rem'
              }}>
                {selectedAnnotation ? (
                  // Edit existing annotation
                  <div>
                    {/* Title Field */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ 
                        display: 'block', 
                        fontSize: '0.75rem', 
                        color: 'var(--text-secondary)', 
                        marginBottom: '0.5rem' 
                      }}>
                        Title
                      </label>
                      <input
                        type="text"
                        value={selectedAnnotation.title || ''}
                        onChange={(e) => handleEditAnnotation(selectedAnnotation.id, { title: e.target.value })}
                        placeholder="Enter annotation title..."
                        style={{
                          width: '100%',
                          background: 'var(--surface-elevated)',
                          border: '1px solid var(--border-strong)',
                          color: 'var(--text-primary)',
                          padding: '0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>

                    {/* Text Field */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ 
                        display: 'block', 
                        fontSize: '0.75rem', 
                        color: 'var(--text-secondary)', 
                        marginBottom: '0.5rem' 
                      }}>
                        Description
                      </label>
                      <textarea
                        value={selectedAnnotation.text || ''}
                        onChange={(e) => handleEditAnnotation(selectedAnnotation.id, { text: e.target.value })}
                        placeholder="Enter annotation description..."
                        rows={4}
                        style={{
                          width: '100%',
                          background: 'var(--surface-elevated)',
                          border: '1px solid var(--border-strong)',
                          color: 'var(--text-primary)',
                          padding: '0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.875rem',
                          resize: 'vertical'
                        }}
                      />
                    </div>

                    {/* Type Selection */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ 
                        display: 'block', 
                        fontSize: '0.75rem', 
                        color: 'var(--text-secondary)', 
                        marginBottom: '0.5rem' 
                      }}>
                        Type
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        {[
                          { type: 'info', icon: 'ℹ️', label: 'Info' },
                          { type: 'warning', icon: '⚠️', label: 'Warning' },
                          { type: 'construction', icon: '🏗️', label: 'Construction' },
                          { type: 'measurement', icon: '📏', label: 'Measurement' }
                        ].map(({ type, icon, label }) => (
                          <button
                            key={type}
                            onClick={() => handleEditAnnotation(selectedAnnotation.id, { 
                              type: type as any, 
                              color: getAnnotationColor(type) 
                            })}
                            style={{
                              padding: '0.75rem 0.5rem',
                              fontSize: '0.75rem',
                              border: `2px solid ${selectedAnnotation.type === type ? 'var(--accent-cyan)' : 'var(--border-strong)'}`,
                              borderRadius: '6px',
                              background: selectedAnnotation.type === type ? 'var(--accent-cyan)20' : 'var(--surface-elevated)',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '0.25rem',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            <span style={{ fontSize: '1.2rem' }}>{icon}</span>
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Color Picker */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ 
                        display: 'block', 
                        fontSize: '0.75rem', 
                        color: 'var(--text-secondary)', 
                        marginBottom: '0.5rem' 
                      }}>
                        Color
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <input
                          type="color"
                          value={selectedAnnotation.color || '#2196F3'}
                          onChange={(e) => handleEditAnnotation(selectedAnnotation.id, { color: e.target.value })}
                          style={{
                            width: '60px',
                            height: '40px',
                            border: '2px solid var(--border-strong)',
                            borderRadius: '6px',
                            background: 'transparent',
                            cursor: 'pointer'
                          }}
                        />
                        <div style={{ 
                          flex: 1,
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}>
                          <div
                            style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '50%',
                              backgroundColor: selectedAnnotation.color || '#2196F3',
                              border: '2px solid white',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                            }}
                          />
                          Preview
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ 
                      display: 'flex', 
                      gap: '0.75rem', 
                      marginTop: '1.5rem',
                      paddingTop: '1rem',
                      borderTop: '1px solid var(--border-subtle)'
                    }}>
                      <button
                        onClick={() => setSelectedAnnotation(null)}
                        style={{
                          flex: 1,
                          padding: '0.75rem',
                          background: 'var(--surface-muted)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-muted)',
                          borderRadius: '6px',
                          fontSize: '0.875rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        Done Editing
                      </button>
                      <button
                        onClick={() => {
                          handleDeleteAnnotation(selectedAnnotation.id);
                          setSelectedAnnotation(null);
                        }}
                        style={{
                          padding: '0.75rem',
                          background: 'var(--surface-danger)',
                          border: '1px solid #ff6b6b',
                          color: '#ff6b6b',
                          borderRadius: '6px',
                          fontSize: '0.875rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          minWidth: '80px'
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  // No annotation selected
                  <div style={{ 
                    textAlign: 'center', 
                    color: 'var(--text-muted)', 
                    padding: '2rem 1rem' 
                  }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📍</div>
                    <h4 style={{ 
                      fontSize: '0.875rem', 
                      fontWeight: '600',
                      marginBottom: '0.75rem',
                      color: 'var(--text-primary)'
                    }}>
                      Annotation Mode
                    </h4>
                    <p style={{ 
                      fontSize: '0.75rem',
                      lineHeight: 1.5,
                      marginBottom: '1.5rem'
                    }}>
                      {isPlacingAnnotation 
                        ? 'Click on the 3D model to place an annotation'
                        : 'Click "New Annotation" to start placing, or click on an existing annotation to edit it'
                      }
                    </p>
                    
                    {/* Quick Stats */}
                    <div style={{
                      background: 'var(--surface-glass)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '1rem',
                      marginBottom: '1.5rem'
                    }}>
                      <div style={{ 
                        fontSize: '1.5rem', 
                        fontWeight: '600',
                        color: 'var(--accent-cyan)',
                        marginBottom: '0.25rem'
                      }}>
                        {annotations.length}
                      </div>
                      <div style={{ fontSize: '0.7rem' }}>
                        Annotations Placed
                      </div>
                    </div>

                    {/* Type Legend */}
                    <div style={{
                      background: 'var(--surface-primary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '6px',
                      padding: '1rem',
                      textAlign: 'left'
                    }}>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: '600',
                        marginBottom: '0.75rem',
                        color: 'var(--text-primary)'
                      }}>
                        Annotation Types:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem' }}>
                          <span>ℹ️</span> <span>Info - General information</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem' }}>
                          <span>⚠️</span> <span>Warning - Important notices</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem' }}>
                          <span>🏗️</span> <span>Construction - Building notes</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem' }}>
                          <span>📏</span> <span>Measurement - Dimensions</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
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
                <div style={{ 
                  padding: '2rem', 
                  textAlign: 'center', 
                  color: 'var(--text-muted)' 
                }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📱</div>
                  <p style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
                    QR code generation opens in modal
                  </p>
                  <button
                    onClick={() => setIsQRVisible(true)}
                    style={{
                      background: 'var(--accent-primary)',
                      color: 'white',
                      border: 'none',
                      padding: '0.75rem 1.5rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    Generate QR Code
                  </button>
                </div>
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

      {/* QR Code Modal Overlay */}
      {isQRVisible && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem'
        }}>
          <div style={{
            background: 'var(--surface-elevated)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '800px',
            maxHeight: '90vh',
            overflow: 'hidden',
            border: '1px solid var(--border-strong)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
          }}>
            {projects[0] ? (
              <SimpleQRGenerator 
                projectId={projects[0].id}
                onClose={() => setIsQRVisible(false)}
              />
            ) : (
              <div style={{ 
                padding: '4rem 2rem', 
                textAlign: 'center', 
                color: 'var(--text-muted)' 
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
                <h3 style={{ 
                  fontSize: '1.25rem', 
                  marginBottom: '0.5rem',
                  color: 'var(--text-primary)'
                }}>
                  No Project Found
                </h3>
                <p style={{ fontSize: '0.875rem', marginBottom: '2rem' }}>
                  Please save your project first to generate QR codes
                </p>
                <button
                  onClick={() => setIsQRVisible(false)}
                  style={{
                    background: 'var(--accent-primary)',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
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