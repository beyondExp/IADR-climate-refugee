import { useState, useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import type { WebXRState, Position3D, Rotation3D, BrickTypeKey, Anchor } from '../types';
import { brickTypes } from '../utils/brickTypes';
import { GeometryOptimizer, type BrickInstanceData, type CombinedGeometry } from '../utils/geometryOptimizer';
import { 
  calculateLinearPath, 
  createStructuralNetwork, 
  generateConstructionSequence,
  simulateBrickPhysics,
  analyzeClimateResilience,
  type ConstructionPath,
  type StructuralNode,
  type ClimateAnalysis
} from '../utils/constructionAlgorithms';

export interface WebXRSceneState {
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  renderer: THREE.WebGLRenderer | null;
  group: THREE.Group | null;
  controls: any | null;
  isInitialized: boolean;
}

export interface ConstructedBrick {
  id: string;
  instanceIndex: number; // Index in the InstancedMesh instead of individual mesh
  position: Position3D;
  rotation: Rotation3D;
  brickType: BrickTypeKey;
  isStable: boolean;
  pathId?: string;
  isAnchored?: boolean; // Track if brick is positioned in world space
}

export function useWebXR() {
  const [xrState, setXRState] = useState<WebXRState>({
    session: null,
    referenceSpace: null,
    isSupported: false,
    isActive: false,
    hitTestSource: null
  });

  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const checkWebXRSupport = useCallback(async () => {
    try {
      if (!navigator.xr) {
        console.log('WebXR: navigator.xr not available');
        setXRState(prev => ({ ...prev, isSupported: false }));
        return false;
      }

      const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
      console.log('WebXR: AR session support check:', isSupported);
      setXRState(prev => ({ ...prev, isSupported }));
      return isSupported;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'WebXR support check failed';
      console.error('WebXR support check error:', errorMsg);
      setError(errorMsg);
      setXRState(prev => ({ ...prev, isSupported: false }));
      return false;
    }
  }, []);

  const startXRSession = useCallback(async (overlayRoot?: HTMLElement | null) => {
    try {
      if (!navigator.xr) {
        throw new Error('WebXR not available - try Chrome on Android');
      }

      console.log('WebXR: Requesting AR session...');
      
      // Request session with hit testing for surface detection
      const sessionOptions: any = {
        requiredFeatures: ['local', 'hit-test'],
        optionalFeatures: ['local-floor', 'anchors', 'dom-overlay']
      };
      if (overlayRoot) {
        sessionOptions.domOverlay = { root: overlayRoot };
      }

      const session = await navigator.xr.requestSession('immersive-ar', sessionOptions);
      console.log('WebXR: AR session created successfully');

      const referenceSpace = await session.requestReferenceSpace('local');
      ;(session as any).preferredRefSpace = 'local';
      const viewerSpace = await session.requestReferenceSpace('viewer');
      console.log('WebXR: Reference space created');

      // Setup hit test source for surface detection
      let hitTestSource: any = null;
      try {
        if (session && (session as any).requestHitTestSource) {
          // Use viewer space for hit testing so results are relative to device pose
          hitTestSource = await (session as any).requestHitTestSource({ space: viewerSpace });
          console.log('WebXR: Hit test source created for surface detection');
        }
      } catch (hitTestError) {
        console.warn('WebXR: Hit testing not supported, objects will be placed at origin:', hitTestError);
      }

      setXRState(prev => ({
        ...prev,
        session,
        referenceSpace,
        isActive: true,
        hitTestSource
      }));

      // Handle session end
      session.addEventListener('end', () => {
        console.log('WebXR: Session ended');
        setXRState(prev => ({
          ...prev,
          session: null,
          referenceSpace: null,
          isActive: false,
          hitTestSource: null
        }));
      });

      return { session, referenceSpace, hitTestSource };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start XR session';
      console.error('WebXR session start error:', err);
      setError(`AR Session Failed: ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }, []);

  const endXRSession = useCallback(async () => {
    try {
      if (xrState.session) {
        console.log('WebXR: Ending session...');
        await xrState.session.end();
      }
    } catch (err) {
      console.error('Error ending XR session:', err);
    }
  }, [xrState.session]);

  useEffect(() => {
    checkWebXRSupport();
  }, [checkWebXRSupport]);

  return {
    xrState,
    error,
    containerRef,
    checkWebXRSupport,
    startXRSession,
    endXRSession,
    clearError: () => setError(null)
  };
}

// Instance management for efficient rendering
interface BrickInstance {
  instanceMesh: THREE.InstancedMesh;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  instanceCount: number;
  maxInstances: number;
}

export function useThreeScene() {
  const [sceneState, setSceneState] = useState<WebXRSceneState>({
    scene: null,
    camera: null,
    renderer: null,
    group: null,
    controls: null,
    isInitialized: false
  });

     const [bricks, setBricks] = useState<ConstructedBrick[]>([]);
   const [isAnimating, setIsAnimating] = useState(false);
   const [physicsEnabled, setPhysicsEnabled] = useState(false);
   const animationRef = useRef<number | null>(null);
   const physicsRef = useRef<NodeJS.Timeout | null>(null);

   // Geometry optimization for performance
   const geometryOptimizer = useRef<GeometryOptimizer>(new GeometryOptimizer());
   const [optimizedMeshes, setOptimizedMeshes] = useState<Map<string, THREE.Mesh>>(new Map());
   const [isOptimizing, setIsOptimizing] = useState(false);

  // Instance management for each brick type
  const instancedMeshes = useRef<Map<BrickTypeKey, { ar: BrickInstance; normal: BrickInstance }>>(new Map());
  const nextInstanceIndex = useRef<Map<string, number>>(new Map()); // Track next available instance index for each type+mode
  const anchorDebugRef = useRef<number>(0);

  const initializeScene = useCallback(async (container: HTMLElement) => {
    try {
      console.log('🎬 Starting scene initialization...');
      
      // Don't manually clear container - let React handle it
      // Only proceed if we haven't already appended a canvas
      const existingCanvas = container.querySelector('canvas');
      if (existingCanvas) {
        console.log('⚠️ Canvas already exists, skipping initialization');
        return null;
      }

      // Scene
      const scene = new THREE.Scene();
      scene.background = null; // Transparent for AR

      // Camera with better positioning
      const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
      
      // Position camera for better 3D viewing
      camera.position.set(3, 3, 5);
      camera.lookAt(0, 0, 0);

      // Renderer with improved settings
      const renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance"
      });
      
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit for performance
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.xr.enabled = true;
      // Prevent R3F-like automatic resize during XR presentation
      (renderer as any).xr.addEventListener && (renderer as any).xr.addEventListener('sessionstart', () => {
        // No-op: handled by WebXR layer sizing
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      
      // Add WebGL context loss recovery with proper cleanup references
      const handleContextLost = (event: Event) => {
        console.warn('🚨 WebGL context lost - preventing default and attempting recovery');
        event.preventDefault();
      };
      
      const handleContextRestored = () => {
        console.log('✅ WebGL context restored - reinitializing resources');
        // Context will be restored automatically by THREE.js
      };
      
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);
      
      // Store cleanup references for disposal
      (renderer as any)._contextEventCleanup = () => {
        renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      };
      
      // Safely append to container
      try {
        container.appendChild(renderer.domElement);
      } catch (err) {
        console.error('Failed to append renderer to container:', err);
        renderer.dispose();
        throw err;
      }

      // Enhanced lighting setup
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(10, 10, 5);
      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.width = 1024;
      directionalLight.shadow.mapSize.height = 1024;
      directionalLight.shadow.camera.near = 0.1;
      directionalLight.shadow.camera.far = 50;
      directionalLight.shadow.camera.left = -10;
      directionalLight.shadow.camera.right = 10;
      directionalLight.shadow.camera.top = 10;
      directionalLight.shadow.camera.bottom = -10;
      scene.add(directionalLight);

      // Add hemisphere light for better overall illumination
      const hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.3);
      scene.add(hemisphereLight);

      // Improved ground plane
      const groundGeometry = new THREE.PlaneGeometry(20, 20);
      const groundMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x444444, 
        transparent: true, 
        opacity: 0.2
      });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      // Group for construction objects
      const group = new THREE.Group();
      scene.add(group);

      // Import and setup orbit controls for 3D mode
      let controls = null;
      try {
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 2;
        controls.maxDistance = 50;
        controls.maxPolarAngle = Math.PI / 2; // Prevent going below ground
        controls.target.set(0, 0, 0);
        controls.update();
        console.log('✅ Orbit controls initialized');
      } catch (err) {
        console.warn('⚠️ Could not load orbit controls:', err);
      }

      const newSceneState = {
        scene,
        camera,
        renderer,
        group,
        controls,
        isInitialized: true
      };

      setSceneState(newSceneState);
      console.log('✅ Scene initialization completed successfully');
      
      return newSceneState;
    } catch (err) {
      console.error('❌ Failed to initialize Three.js scene:', err);
      throw err;
    }
  }, []);

  // GLTF Loader for brick models (same as editor)
  const gltfLoader = useRef<any>(null);
  const [brickGLTF, setBrickGLTF] = useState<any>(null);
  const gltfLoadingRef = useRef<boolean>(false);

  // Initialize GLTF loader and load brick model ONCE
  useEffect(() => {
    if (typeof window !== 'undefined' && !brickGLTF && !gltfLoadingRef.current) {
      gltfLoadingRef.current = true;
      
      // Import THREE.js GLTF loader
      import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
        gltfLoader.current = new GLTFLoader();
        
        // Load the same model as the editor (only once)
        gltfLoader.current.load('/Octa2.glb', (gltf: any) => {
          console.log('🧱 GLTF brick model loaded successfully');
          
          // Debug: Log GLTF model details for memory analysis
          let totalVertices = 0;
          let totalTriangles = 0;
          let meshCount = 0;
          gltf.scene.traverse((child: any) => {
            if (child instanceof THREE.Mesh && child.geometry) {
              meshCount++;
              const geometry = child.geometry;
              const vertices = geometry.attributes.position?.count || 0;
              const triangles = geometry.index ? geometry.index.count / 3 : vertices / 3;
              totalVertices += vertices;
              totalTriangles += triangles;
              
              console.log(`📦 GLTF Mesh ${meshCount}:`, {
                vertices,
                triangles: Math.round(triangles),
                hasIndex: !!geometry.index,
                memoryEstimate: Math.round((vertices * 12 + (geometry.index?.count || 0) * 4) / 1024) + 'KB'
              });
            }
          });
          
          console.log('📊 GLTF Model Summary:', {
            totalMeshes: meshCount,
            totalVertices,
            totalTriangles: Math.round(totalTriangles),
            estimatedMemory: Math.round((totalVertices * 12) / 1024 / 1024) + 'MB'
          });
          
          if (totalTriangles > 50000) {
            console.warn(`⚠️ HIGH-POLY GLTF MODEL: ${Math.round(totalTriangles)} triangles! This may cause performance issues.`);
          }
                     
           setBrickGLTF(gltf);
           gltfLoadingRef.current = false; // Mark loading as complete
         }, undefined, (error: any) => {
           console.error('❌ Failed to load GLTF brick model:', error);
           gltfLoadingRef.current = false; // Reset loading flag on error
         });
      });
    }
  }, []);

  // Memory cleanup function
  const forceMemoryCleanup = useCallback(() => {
    console.log('🧹 Starting aggressive memory cleanup...');
    
    // Dispose of unused instanced meshes
    instancedMeshes.current.forEach((instances, brickType) => {
      ['ar', 'normal'].forEach(mode => {
        const instance = instances[mode as 'ar' | 'normal'];
        if (instance && instance.instanceCount === 0) {
          console.log(`🗑️ Disposing unused InstancedMesh: ${brickType}-${mode}`);
          if (sceneState.group) {
            sceneState.group.remove(instance.instanceMesh);
          }
          instance.instanceMesh.dispose();
          instance.geometry.dispose();
          if (Array.isArray(instance.material)) {
            instance.material.forEach(mat => mat.dispose());
          } else {
            instance.material.dispose();
          }
          instances[mode as 'ar' | 'normal'] = null as any;
        }
      });
    });
    
    // Force garbage collection if available
    if ((window as any).gc) {
      console.log('🗑️ Forcing garbage collection...');
      (window as any).gc();
    }
    
    console.log('✅ Memory cleanup completed');
  }, [sceneState.group]);

  // Auto-cleanup unused InstancedMesh objects when bricks are removed
  const autoCleanupUnusedInstances = useCallback(() => {
    if (bricks.length === 0) {
      // If no bricks exist, clean up all instances
      console.log('🧹 No bricks remaining - cleaning up all instances');
      forceMemoryCleanup();
      return;
    }

    // Check each brick type to see if it's still in use
    instancedMeshes.current.forEach((instances, brickType) => {
      const bricksOfThisType = bricks.filter(b => b.brickType === brickType);
      
      if (bricksOfThisType.length === 0) {
        console.log(`🗑️ No bricks of type ${brickType} remaining - disposing instances`);
        
        // Dispose AR instance if no bricks of this type
        if (instances.ar && instances.ar.instanceMesh) {
          if (sceneState.group) {
            sceneState.group.remove(instances.ar.instanceMesh);
          }
          instances.ar.instanceMesh.dispose();
          instances.ar.geometry.dispose();
          if (Array.isArray(instances.ar.material)) {
            instances.ar.material.forEach(mat => mat.dispose());
          } else {
            instances.ar.material.dispose();
          }
          instances.ar = null as any;
        }
        
        // Dispose Normal instance if no bricks of this type
        if (instances.normal && instances.normal.instanceMesh) {
          if (sceneState.group) {
            sceneState.group.remove(instances.normal.instanceMesh);
          }
          instances.normal.instanceMesh.dispose();
          instances.normal.geometry.dispose();
          if (Array.isArray(instances.normal.material)) {
            instances.normal.material.forEach(mat => mat.dispose());
          } else {
            instances.normal.material.dispose();
          }
          instances.normal = null as any;
        }
        
        // Remove the brick type from the map entirely
        instancedMeshes.current.delete(brickType);
      }
    });
  }, [bricks, sceneState.group, forceMemoryCleanup]);

     // Create or get InstancedMesh for a brick type and mode (AR/normal)
   const getOrCreateInstancedMesh = useCallback((brickType: BrickTypeKey, forAR: boolean) => {
     const existing = instancedMeshes.current.get(brickType);
     const currentInstance = forAR ? existing?.ar : existing?.normal;
     
     if (currentInstance && currentInstance.instanceCount < currentInstance.maxInstances) {
       return currentInstance;
     }

     if (!brickGLTF?.scene) {
       console.warn(`⚠️ GLTF not loaded yet for ${brickType}`);
       return null;
     }

     let geometry: THREE.BufferGeometry;
     let baseMaterial: THREE.Material | null = null;

    if (brickGLTF?.scene) {
      // Extract geometry from GLTF model by traversing the scene
      let gltfGeometry: THREE.BufferGeometry | null = null;
      
      brickGLTF.scene.traverse((child: any) => {
        if (child instanceof THREE.Mesh && child.geometry && !gltfGeometry) {
          gltfGeometry = child.geometry;
          const childMat = child.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(childMat)) {
            baseMaterial = childMat[0] ? childMat[0] : null;
          } else if (childMat) {
            baseMaterial = childMat;
          }
        }
      });

             if (gltfGeometry) {
         geometry = (gltfGeometry as THREE.BufferGeometry).clone();
         // Apply same scale as editor (0.2)
         geometry.scale(0.2, 0.2, 0.2);
         
         // Compute proper bounds for rendering
         geometry.computeBoundingSphere();
         geometry.computeBoundingBox();
         
         // Ensure normals are computed for proper lighting
         if (!geometry.attributes.normal) {
           geometry.computeVertexNormals();
         }
         
         console.log(`📦 Using GLTF geometry for ${brickType} instancing`, {
           vertices: geometry.attributes.position ? geometry.attributes.position.count : 0,
           triangles: geometry.index ? geometry.index.count / 3 : 0,
           hasNormals: !!geometry.attributes.normal
         });
      } else {
        console.error(`❌ No mesh geometry found in GLTF for ${brickType}`);
        return null; // Don't create instances without GLTF
      }
    } else {
      console.error(`❌ GLTF not loaded for ${brickType}`);
      return null;
    }

    // Use GLTF material for AR too to match look
    let material: THREE.Material;
    if (forAR && baseMaterial) {
      material = baseMaterial;
      (material as any).side = THREE.DoubleSide;
      if ((material as any).transparent !== undefined) (material as any).transparent = true;
    } else if (forAR) {
      material = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide });
    } else {
      material = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide });
    }

         // CRITICAL: Reduce max instances to 2 for high-poly GLTF model performance
     const maxInstances = 2; // Reduced to 2 due to 35K triangle GLTF model
    const instancedMesh = new THREE.InstancedMesh(geometry, material, maxInstances);
    
    // Configure shadows only for normal mode
    if (!forAR) {
      instancedMesh.castShadow = true;
      instancedMesh.receiveShadow = true;
    }

    const brickInstance: BrickInstance = {
      instanceMesh: instancedMesh,
      geometry: geometry,
      material: material,
      instanceCount: 0,
      maxInstances: maxInstances
    };

    // Store the instance
    if (!existing) {
      instancedMeshes.current.set(brickType, {
        ar: forAR ? brickInstance : {} as BrickInstance,
        normal: forAR ? {} as BrickInstance : brickInstance
      });
    } else {
      if (forAR) {
        existing.ar = brickInstance;
      } else {
        existing.normal = brickInstance;
      }
    }

    // Add to scene
    if (sceneState.group) {
      sceneState.group.add(instancedMesh);
      console.log(`🏗️ Created InstancedMesh for ${brickType} (${forAR ? 'AR' : 'normal'}) with max ${maxInstances} instances`);
    }

    return brickInstance;
  }, [brickGLTF, sceneState.group]);

   // CRITICAL: Add safeguards against infinite spawning
   const MAX_TOTAL_BRICKS = 50; // Hard limit to prevent infinite spawning
   const brickCreationCount = useRef<number>(0);
   const lastCreationReset = useRef<number>(Date.now());
   
    const addBrick = useCallback((brickType: BrickTypeKey, position: Position3D, rotation: Rotation3D = { x: 0, y: 0, z: 0 }, pathId?: string, forAR?: boolean) => {
      // 🔥 FUNCTION CALL LOGGING 🔥
      console.log(`🎯 addBrick() CALLED:`, {
        brickType,
        position,
        rotation,
        pathId,
        forAR,
        currentBricks: bricks.length,
        calledAt: new Date().toISOString(),
        caller: new Error().stack?.split('\n')[2]?.trim() || 'unknown'
      });
      
      // EMERGENCY: Prevent infinite spawning
      const now = Date.now();
      if (now - lastCreationReset.current > 5000) {
        brickCreationCount.current = 0;
        lastCreationReset.current = now;
        console.log(`🔄 Reset brick creation counter (5s window expired)`);
      }
      
      brickCreationCount.current++;
      console.log(`📊 Brick creation count: ${brickCreationCount.current}/20 in current 5s window`);
      
      // CRITICAL: Stop infinite spawning immediately
      if (bricks.length >= MAX_TOTAL_BRICKS) {
        console.error(`🚨 EMERGENCY STOP: Maximum brick limit (${MAX_TOTAL_BRICKS}) reached! Stopping infinite spawning.`, {
          currentBricks: bricks.length,
          maxLimit: MAX_TOTAL_BRICKS,
          attemptedBrickType: brickType,
          attemptedPosition: position,
          timestamp: new Date().toISOString()
        });
        return null;
      }
      
      if (brickCreationCount.current > 20) {
        console.error(`🚨 EMERGENCY STOP: Too many bricks created in 5 seconds (${brickCreationCount.current}). Infinite loop detected!`, {
          spawnCount: brickCreationCount.current,
          timeWindow: '5 seconds',
          attemptedBrickType: brickType,
          attemptedPosition: position,
          timestamp: new Date().toISOString(),
          stackTrace: new Error().stack?.split('\n').slice(1, 6).join('\n')
        });
        return null;
      }

      try {
       // Auto-detect AR mode if not specified
       const isARMode = forAR ?? sceneState.renderer?.xr.isPresenting ?? false;
       const brickId = `brick-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
       
       // 🔥 DETAILED BRICK SPAWN LOGGING 🔥
       console.log(`🧱 BRICK SPAWN #${brickCreationCount.current}:`, {
         brickId,
         brickType,
         position,
         rotation,
         pathId,
         isARMode,
         forAR,
         totalBricks: bricks.length,
         instanceMode: isARMode ? 'AR' : '3D',
         timestamp: new Date().toISOString(),
         stackTrace: new Error().stack?.split('\n').slice(1, 4).join('\n') // Show caller
       });
       
       // Get or create InstancedMesh for this brick type and mode
       const brickInstance = getOrCreateInstancedMesh(brickType, isARMode);
       if (!brickInstance) {
         console.warn(`❌ Cannot create brick instance for ${brickType} - GLTF not loaded yet`);
         return null;
       }
       const instanceIndex = brickInstance.instanceCount;
       
       // Create transformation matrix for this instance
       const matrix = new THREE.Matrix4();
       const brick = brickTypes[brickType];
       
       if (isARMode) {
         // In AR: defer placement until hit-test anchors it. Initialize off-screen
         console.log('🎯 AR Mode: Using hit testing to find real world surface...');
         matrix.identity();
         matrix.makeScale(0,0,0);
         console.log('📍 AR brick instance created, awaiting real-world surface detection');
       } else {
         // In 3D Preview: Use original editor positions
         matrix.compose(
           new THREE.Vector3(position.x, position.y + brick.size.height / 2, position.z),
           new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z)),
           new THREE.Vector3(1, 1, 1)
         );
         console.log(`📐 3D Preview brick instance positioned:`, position);
       }
       
       // Set the matrix for this instance
       brickInstance.instanceMesh.setMatrixAt(instanceIndex, matrix);
       brickInstance.instanceMesh.instanceMatrix.needsUpdate = true;
       
       // Update instance count
       brickInstance.instanceCount++;

       const newBrick: ConstructedBrick = {
          id: brickId,
          instanceIndex,
          position,
          rotation,
          brickType,
          isStable: true,
          pathId,
          isAnchored: !isARMode // AR objects start unanchored and need surface detection
        };

       setBricks(prev => [...prev, newBrick]);
       
       // REMOVED: Manual cleanup that was running before state update completed
       // autoCleanupUnusedInstances(); // This was cleaning up immediately because setState is async
       
       // 🔥 SUCCESS LOGGING 🔥
       console.log(`✅ BRICK SPAWN SUCCESS #${brickCreationCount.current}:`, {
         brickId,
         brickType,
         instanceIndex,
         totalBricksAfter: bricks.length + 1,
         mode: isARMode ? 'AR-unanchored (awaiting surface detection)' : '3D Preview',
         finalPosition: position,
         success: true
       });
       
       return newBrick;
     } catch (err) {
       // 🔥 ERROR LOGGING 🔥
       console.error(`❌ BRICK SPAWN FAILED #${brickCreationCount.current}:`, {
         brickType,
         position,
         error: err,
         errorMessage: err instanceof Error ? err.message : String(err),
         totalBricks: bricks.length,
         timestamp: new Date().toISOString()
       });
       return null;
     }
   }, [sceneState.group, sceneState.renderer, getOrCreateInstancedMesh, autoCleanupUnusedInstances, bricks]);

  const removeBrick = useCallback((brickId: string) => {
    const brick = bricks.find(b => b.id === brickId);
    if (!brick) return;

    // Hide this instance by setting it to a zero matrix (effectively invisible)
    const isARMode = sceneState.renderer?.xr.isPresenting ?? false;
    const instances = instancedMeshes.current.get(brick.brickType);
    const mode = isARMode ? 'ar' : 'normal';
    
    if (instances && instances[mode]) {
      const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
      instances[mode].instanceMesh.setMatrixAt(brick.instanceIndex, zeroMatrix);
      instances[mode].instanceMesh.instanceMatrix.needsUpdate = true;
    }
    
    setBricks(prev => prev.filter(b => b.id !== brickId));
    
    // Manual cleanup since we removed the useEffect auto-cleanup to prevent infinite loops  
    autoCleanupUnusedInstances();
  }, [sceneState.renderer, bricks, autoCleanupUnusedInstances]);

  const clearAllBricks = useCallback(() => {
    if (!sceneState.group) return;

    console.log('🧹 Starting comprehensive brick cleanup...');
    
    // Clear all InstancedMesh objects with proper disposal
    instancedMeshes.current.forEach((instances, brickType) => {
      console.log(`🗑️ Disposing InstancedMesh for ${brickType}...`);
      
      // Dispose AR instance
      if (instances.ar && instances.ar.instanceMesh) {
        console.log(`  - Removing AR instance (${instances.ar.instanceCount}/${instances.ar.maxInstances} used)`);
        sceneState.group!.remove(instances.ar.instanceMesh);
        instances.ar.instanceMesh.dispose();
        instances.ar.geometry.dispose();
        if (Array.isArray(instances.ar.material)) {
          instances.ar.material.forEach(mat => mat.dispose());
        } else {
          instances.ar.material.dispose();
        }
      }
      
      // Dispose Normal instance  
      if (instances.normal && instances.normal.instanceMesh) {
        console.log(`  - Removing Normal instance (${instances.normal.instanceCount}/${instances.normal.maxInstances} used)`);
        sceneState.group!.remove(instances.normal.instanceMesh);
        instances.normal.instanceMesh.dispose();
        instances.normal.geometry.dispose();
        if (Array.isArray(instances.normal.material)) {
          instances.normal.material.forEach(mat => mat.dispose());
        } else {
          instances.normal.material.dispose();
        }
      }
    });
    
    // Reset instance management completely
    instancedMeshes.current.clear();
    nextInstanceIndex.current.clear();
    
    // Clear React state
    setBricks([]);
    
    // Force garbage collection if available
    if ((window as any).gc) {
      console.log('🗑️ Forcing garbage collection after cleanup...');
      (window as any).gc();
    }
    
    console.log('✅ Comprehensive brick cleanup completed');
  }, [sceneState.group]);

  const updateBrickPhysics = useCallback(() => {
    if (!physicsEnabled || bricks.length === 0) return;

    const brickData = bricks.map(brick => ({
      id: brick.id,
      position: brick.position,
      brickType: brick.brickType
    }));

    const physics = simulateBrickPhysics(brickData);

    // Update brick stability (color changes would need instance-level materials for instanced rendering)
    setBricks(prev => prev.map(brick => {
      const brickPhysics = physics[brick.id];
      if (brickPhysics) {
        return {
          ...brick,
          isStable: brickPhysics.isStable
        };
      }
      return brick;
    }));
     }, [physicsEnabled, bricks]);

   // Position unanchored AR objects at detected real-world surfaces ONCE using hit testing
     const anchorBricksToRealSurfaces = useCallback((frame: any, referenceSpace: any, session: any) => {
     if (!sceneState.group || bricks.length === 0) return;

      // Only position unanchored bricks (AR objects awaiting surface detection)
      let unanchoredBricks = bricks.filter(brick => !brick.isAnchored);

      try {
       // Use WebXR hit testing to find real-world surfaces
        const hitTestResults = session.hitTestSource ? frame.getHitTestResults(session.hitTestSource) : [];
        // Throttled debug logs
        anchorDebugRef.current = (anchorDebugRef.current + 1) % 90;
        if (anchorDebugRef.current === 0) {
          const viewerPose = frame.getViewerPose(referenceSpace);
          console.log('[AR DEBUG] HitTest results:', hitTestResults ? hitTestResults.length : 0, '| viewerPose:', !!viewerPose);
        }
       
        if (hitTestResults && hitTestResults.length > 0) {
          // Prefer plane-like stable hit if available
          const hit = hitTestResults[0];
         const hitPose = hit.getPose(referenceSpace);
         
         if (hitPose) {
           // Get REAL WORLD surface position from hit test
           const hitMatrix = new THREE.Matrix4().fromArray(hitPose.transform.matrix);
           const realWorldPosition = new THREE.Vector3();
           const realWorldQuaternion = new THREE.Quaternion();
           const realWorldScale = new THREE.Vector3();
           hitMatrix.decompose(realWorldPosition, realWorldQuaternion, realWorldScale);

           console.log('🎯 Found REAL WORLD surface at:', realWorldPosition);

            // If nothing exists yet, spawn one AR brick now
            if (bricks.length === 0 && brickGLTF) {
              const spawned = addBrick('clay-sustainable', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, undefined, true);
              if (spawned) {
                const instances0 = instancedMeshes.current.get(spawned.brickType);
                const brickInstance0 = instances0?.ar;
                if (brickInstance0) {
                  const m0 = new THREE.Matrix4();
                  m0.compose(realWorldPosition.clone(), realWorldQuaternion.clone(), new THREE.Vector3(1, 1, 1));
                  brickInstance0.instanceMesh.setMatrixAt(spawned.instanceIndex, m0);
                  brickInstance0.instanceMesh.instanceMatrix.needsUpdate = true;
                  setBricks(prev => prev.map(b => (b.id === spawned.id ? { ...b, isAnchored: true } : b)));
                  console.log('📌 Spawned and anchored AR brick at plane');
                }
              }
              return; // done this frame
            }

                       // Position ALL unanchored bricks at this detected REAL surface
            unanchoredBricks.forEach((brick) => {
              const instances = instancedMeshes.current.get(brick.brickType);
              const brickInstance = instances?.ar;
              
              if (brickInstance) {
                // Position at REAL WORLD coordinates from hit test + relative offsets
                const finalWorldPosition = new THREE.Vector3(
                  realWorldPosition.x,
                  realWorldPosition.y,
                  realWorldPosition.z
                );
                
                // Create new transform matrix for this instance
                const matrix = new THREE.Matrix4();
                matrix.compose(
                  finalWorldPosition,
                  realWorldQuaternion,
                  new THREE.Vector3(1, 1, 1)
                );
                
                // Set position in REAL WORLD coordinates - this stays FIXED!
                brickInstance.instanceMesh.setMatrixAt(brick.instanceIndex, matrix);
                brickInstance.instanceMesh.instanceMatrix.needsUpdate = true;

                console.log(`🔒 Brick ${brick.id} instance ${brick.instanceIndex} anchored to REAL WORLD position:`, finalWorldPosition);
              }
            });

           // Mark all positioned bricks as anchored (NO MORE REPOSITIONING!)
           setBricks(prev => prev.map(b => 
             unanchoredBricks.find(ub => ub.id === b.id) 
               ? { ...b, isAnchored: true }
               : b
           ));

           console.log(`✅ Anchored ${unanchoredBricks.length} bricks to REAL WORLD surface`);
         }
        } else {
         // Fallback: position at origin if no surface detected after some time
         console.log('📍 No real surface detected, using fallback positioning');
         
          // Use viewer pose to place 1.5m in front of camera in world space
          const viewerPose = frame.getViewerPose(referenceSpace);
          let basePos = new THREE.Vector3(0, 1.4, -1.5); // sensible default if pose missing
          let baseQuat = new THREE.Quaternion();
          if (viewerPose && viewerPose.views && viewerPose.views.length > 0) {
            const t = viewerPose.views[0].transform; // XRRigidTransform
            const m = new THREE.Matrix4().fromArray((t as any).matrix || t.matrix);
            const p = new THREE.Vector3(); const q = new THREE.Quaternion(); const s = new THREE.Vector3();
            m.decompose(p, q, s);
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
            basePos.copy(p).add(forward.multiplyScalar(1.5)).add(up.multiplyScalar(0.1));
            baseQuat.copy(q);
          }
          
          unanchoredBricks.forEach((brick) => {
            const instances = instancedMeshes.current.get(brick.brickType);
            const brickInstance = instances?.ar;
            
            if (brickInstance) {
               // Position 1.5m in front of user as fallback
              const matrix = new THREE.Matrix4();
              matrix.compose(basePos, baseQuat, new THREE.Vector3(1, 1, 1));
              
              brickInstance.instanceMesh.setMatrixAt(brick.instanceIndex, matrix);
              brickInstance.instanceMesh.instanceMatrix.needsUpdate = true;
            }
          });

         // Mark fallback positioned bricks as anchored
         setBricks(prev => prev.map(b => 
           unanchoredBricks.find(ub => ub.id === b.id) 
             ? { ...b, isAnchored: true }
             : b
         ));
       }
     } catch (error) {
       console.error('❌ Error anchoring bricks to real surfaces:', error);
     }
    }, [bricks, sceneState.group, setBricks, addBrick, brickGLTF]);

  const startAnimation = useCallback(() => {
    if (!sceneState.renderer || !sceneState.scene || !sceneState.camera) {
      console.warn('❌ Cannot start animation: missing scene components');
      return;
    }
    
    // Prevent multiple animations
    if (animationRef.current) {
      console.log('⚠️ Animation already running');
      return;
    }

    console.log('▶️ Starting animation loop');
    setIsAnimating(true);

    // Debug: Log scene statistics with error handling
    const logSceneStats = () => {
      if (!sceneState.scene || !sceneState.group) return;
      
      try {
      
      let totalObjects = 0;
      let totalTriangles = 0;
      let instancedMeshCount = 0;
      let totalInstances = 0;
      
      sceneState.scene.traverse((child) => {
        totalObjects++;
        if (child instanceof THREE.Mesh) {
          if (child instanceof THREE.InstancedMesh) {
            instancedMeshCount++;
            totalInstances += child.count;
            const geometry = child.geometry;
            if (geometry.index) {
              totalTriangles += (geometry.index.count / 3) * child.count;
            } else if (geometry.attributes.position) {
              totalTriangles += (geometry.attributes.position.count / 3) * child.count;
            }
          } else {
            const geometry = child.geometry;
            if (geometry.index) {
              totalTriangles += geometry.index.count / 3;
            } else if (geometry.attributes.position) {
              totalTriangles += geometry.attributes.position.count / 3;
            }
          }
        }
      });

      const instancedMeshStats = Array.from(instancedMeshes.current.entries()).map(([brickType, instances]) => ({
        brickType,
        ar: instances.ar && instances.ar.instanceMesh ? {
          count: instances.ar.instanceCount || 0,
          max: instances.ar.maxInstances || 0,
          triangles: instances.ar.instanceMesh.geometry?.index ? instances.ar.instanceMesh.geometry.index.count / 3 : 0
        } : null,
        normal: instances.normal && instances.normal.instanceMesh ? {
          count: instances.normal.instanceCount || 0,
          max: instances.normal.maxInstances || 0,
          triangles: instances.normal.instanceMesh.geometry?.index ? instances.normal.instanceMesh.geometry.index.count / 3 : 0
        } : null
      }));

        console.log('📊 Scene Statistics:', {
          totalObjects,
          totalTriangles: Math.round(totalTriangles),
          instancedMeshCount,
          totalInstances,
          bricksCount: bricks.length,
          gltfLoaded: !!brickGLTF,
          instancedMeshStats
        });
      } catch (error) {
        console.error('❌ Error in logSceneStats:', error);
        console.warn('🚨 Scene statistics logging disabled due to error');
      }
    };

    // Log initial scene stats
    logSceneStats();

    let frameCount = 0;
    let lastStatsTime = performance.now();
    let lastFrameTime = 16; // Start with good performance assumption

    const animate = (_timestamp: number, frame?: any) => {
      const frameStart = performance.now();
      
      frameCount++;
      const currentTime = performance.now();
      
      // CRITICAL: Only log stats in development and much less frequently to prevent memory pressure
      const DEBUG_STATS_ENABLED = process.env.NODE_ENV === 'development';
      const STATS_INTERVAL = DEBUG_STATS_ENABLED ? 60000 : 300000; // 1 min dev, 5 min prod
      
      if (DEBUG_STATS_ENABLED && currentTime - lastStatsTime > STATS_INTERVAL) {
        try {
          console.log('🔧 Performance Debug (dev only):');
          logSceneStats();
          
          // Log instancing details
          console.log('🏗️ Instance Management:', {
            instancedMeshesSize: instancedMeshes.current.size,
            nextInstanceIndexSize: nextInstanceIndex.current.size,
            totalBricks: bricks.length,
            unanchoredBricks: bricks.filter(b => !b.isAnchored).length
          });
          
          // Log WebXR state
          if (sceneState.renderer!.xr.isPresenting) {
            console.log('📱 AR Mode Active:', {
              shadowsEnabled: sceneState.renderer!.shadowMap.enabled,
              pixelRatio: sceneState.renderer!.getPixelRatio(),
              renderSize: {
                width: sceneState.renderer!.getSize(new THREE.Vector2()).x,
                height: sceneState.renderer!.getSize(new THREE.Vector2()).y
              }
            });
          }
        } catch (error) {
          console.error('❌ Error during debug logging in animation loop:', error);
        }
        
        lastStatsTime = currentTime;
      }
      
      // Update controls if available and not in XR mode
      if (sceneState.controls && !sceneState.renderer!.xr.isPresenting) {
        sceneState.controls.update();
      }

      // Handle AR mode - optimize settings and anchor unpositioned objects to real surfaces
      if (sceneState.renderer!.xr.isPresenting && frame) {
        // Optimize renderer for AR mode
        if (sceneState.renderer!.shadowMap.enabled) {
          console.log('🎯 Disabling shadows for AR performance');
          sceneState.renderer!.shadowMap.enabled = false;
        }
        
        // Use WebXR hit testing to anchor unpositioned objects to REAL WORLD surfaces
        const session = sceneState.renderer!.xr.getSession();
        if ((session as any) && (session as any).requestAnimationFrame) {
          // anchor using the frame provided by XR loop
          const referenceSpace = sceneState.renderer!.xr.getReferenceSpace();
          if (referenceSpace) {
            anchorBricksToRealSurfaces(frame, referenceSpace, session);
          }
        }
        
      } else if (!sceneState.renderer!.xr.isPresenting && !sceneState.renderer!.shadowMap.enabled) {
        // Only re-enable shadows if performance is good (not disabled for performance reasons)
        // Check if we're not in a performance emergency by looking at recent frame times
        if (frameCount > 300) { // Only after initial warmup period
          const shouldReEnableShadows = lastFrameTime < 40; // Only if performance is good (25+ FPS)
          if (shouldReEnableShadows) {
            console.log('🎯 Re-enabling shadows for 3D preview (performance is good)');
            sceneState.renderer!.shadowMap.enabled = true;
          } else {
            // Don't re-enable shadows if performance is poor
            if (frameCount % 300 === 0) { // Log occasionally
              console.log('⚠️ Keeping shadows disabled due to performance concerns');
            }
          }
        }
      }
      
      // Render the scene (WebXR will drive timing; setAnimationLoop uses XR RAF when presenting)
      const renderStart = performance.now();
      sceneState.renderer!.render(sceneState.scene!, sceneState.camera!);
      const renderEnd = performance.now();
      
      // Performance monitoring and emergency optimizations (disabled for XR pixel ratio changes)
      const frameTime = renderEnd - frameStart;
      const renderTime = renderEnd - renderStart;
      const fps = 1000 / frameTime;
      
      // Emergency performance management - trigger much earlier and more aggressively
      if (frameTime > 50) { // Trigger at 20 FPS instead of waiting for severe issues
        // Only log occasionally to avoid spam
        if (frameCount % 120 === 0) {
          console.warn(`🐌 Performance warning: ${frameTime.toFixed(1)}ms/frame (${fps.toFixed(1)} FPS)`);
        }
        
                 // Progressive performance optimization based on severity
         if (frameTime > 60) { // Below 16.7 FPS - moderate measures
           // Suggest geometry optimization for multiple bricks
           if (bricks.length >= 3 && optimizedMeshes.size === 0 && !isOptimizing && frameCount % 600 === 0) {
             console.warn('💡 PERFORMANCE TIP: Auto-optimizing geometry due to consistent slow frames');
             setTimeout(() => {
               autoOptimizeIfBeneficial();
             }, 50);
           }
         }
         
          if (frameTime > 80) { // Below 12.5 FPS - aggressive measures
          // Disable shadows immediately for performance
          if (sceneState.renderer!.shadowMap.enabled) {
            sceneState.renderer!.shadowMap.enabled = false;
            console.warn('🚨 PERF: Disabled shadows for emergency performance boost');
          }
          
          // Reduce pixel ratio aggressively
           if (!sceneState.renderer!.xr.isPresenting) {
             const currentPixelRatio = sceneState.renderer!.getPixelRatio();
             if (currentPixelRatio > 0.5) {
               sceneState.renderer!.setPixelRatio(Math.max(0.5, currentPixelRatio * 0.8));
               console.warn(`🚨 PERF: Reduced pixel ratio to ${sceneState.renderer!.getPixelRatio()}`);
             }
           }
          
          // Skip non-essential operations every other frame
          if (frameCount % 2 === 0) {
            return; // Skip this frame for performance
          }
        }
        
        if (frameTime > 150) { // Below 6.7 FPS - extreme measures
          console.error('🚨 CRITICAL PERFORMANCE: Triggering extreme optimizations');
          
          // Force garbage collection
          if ((window as any).gc) {
            (window as any).gc();
          }
          
          // Reduce pixel ratio to minimum
           if (!sceneState.renderer!.xr.isPresenting) {
             sceneState.renderer!.setPixelRatio(0.25);
           }
          
          // Skip 3 out of 4 frames
          if (frameCount % 4 !== 0) {
            return;
          }
          
                     console.error('💡 SOLUTION: Consider auto-optimization of geometry or reducing brick count');
           
           // AUTO-TRIGGER geometry optimization for performance recovery
           if (bricks.length >= 3 && optimizedMeshes.size === 0 && !isOptimizing) {
             console.error('🚨 AUTO-TRIGGERING geometry optimization due to critical performance');
             setTimeout(() => {
               autoOptimizeIfBeneficial();
             }, 100);
           }
         }
        } else if (frameTime < 25 && sceneState.renderer!.getPixelRatio() < 1 && !sceneState.renderer!.xr.isPresenting) {
        // Performance recovery - gradually restore quality (more conservative)
        if (frameCount % 600 === 0) { // Check every 600 frames (~10 seconds at 60fps)
          const currentRatio = sceneState.renderer!.getPixelRatio();
          const newPixelRatio = Math.min(1, Math.round((currentRatio + 0.25) * 100) / 100); // Increase by 0.25, round to avoid precision issues
          if (newPixelRatio > currentRatio) {
            sceneState.renderer!.setPixelRatio(newPixelRatio);
            console.log(`📈 PERF RECOVERY: Increased pixel ratio to ${newPixelRatio}`);
          }
        }
      }
      
      // Update lastFrameTime for next frame's decisions
      lastFrameTime = frameTime;
    };

    // Set animation loop (supports both regular and XR modes)
    sceneState.renderer!.setAnimationLoop((ts: number, xrFrame?: any) => animate(ts, xrFrame));

    // Start physics simulation if enabled
    if (physicsEnabled && !physicsRef.current) {
      const runPhysics = () => {
        if (!physicsRef.current) return;
        updateBrickPhysics();
        physicsRef.current = setTimeout(runPhysics, 100);
      };
      physicsRef.current = setTimeout(runPhysics, 100);
    }
    }, [sceneState.renderer, sceneState.scene, sceneState.camera, sceneState.controls, physicsEnabled, updateBrickPhysics, anchorBricksToRealSurfaces, bricks, brickGLTF]);

  const stopAnimation = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      console.log('⏹️ Animation stopped');
    }
    if (physicsRef.current) {
      clearTimeout(physicsRef.current as NodeJS.Timeout);
      physicsRef.current = null;
    }
    setIsAnimating(false);
  }, []);

  const enablePhysics = useCallback((enabled: boolean) => {
    setPhysicsEnabled(enabled);
  }, []);

  const resizeRenderer = useCallback((width: number, height: number) => {
    if (!sceneState.renderer || !sceneState.camera) return;

    sceneState.camera.aspect = width / height;
    sceneState.camera.updateProjectionMatrix();
    sceneState.renderer.setSize(width, height);
    console.log(`📐 Renderer resized to ${width}x${height}`);
  }, [sceneState.renderer, sceneState.camera]);

  const resetCameraFor3D = useCallback(() => {
    if (!sceneState.camera || !sceneState.controls) return;
    
    // Reset camera to good 3D viewing position
    sceneState.camera.position.set(5, 5, 5);
    sceneState.camera.lookAt(0, 0, 0);
    sceneState.controls.target.set(0, 0, 0);
    sceneState.controls.update();
    console.log('📹 Camera reset for 3D mode');
  }, [sceneState.camera, sceneState.controls]);

  const disposeScene = useCallback(() => {
    console.log('🗑️ Disposing scene...');
    
    // Stop animation first
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (physicsRef.current) {
      clearTimeout(physicsRef.current as NodeJS.Timeout);
      physicsRef.current = null;
    }
    setIsAnimating(false);

    // Use current scene state directly without dependency
    setSceneState(currentState => {
      // Dispose of controls
      if (currentState.controls) {
        currentState.controls.dispose();
      }

      // Dispose of renderer and safely remove canvas
      if (currentState.renderer) {
        const canvas = currentState.renderer.domElement;
        
        // Clean up WebGL context event listeners
        if ((currentState.renderer as any)._contextEventCleanup) {
          (currentState.renderer as any)._contextEventCleanup();
          console.log('🧹 Cleaned up WebGL context event listeners');
        }
        
        // Only try to remove canvas if it has a parent
        if (canvas && canvas.parentNode) {
          try {
            canvas.parentNode.removeChild(canvas);
          } catch (err) {
            console.warn('Could not remove canvas element:', err);
          }
        }
        
        currentState.renderer.dispose();
      }

      // Return reset state
      return {
        scene: null,
        camera: null,
        renderer: null,
        group: null,
        controls: null,
        isInitialized: false
      };
    });

    // Clear bricks
    setBricks([]);
    
    console.log('✅ Scene disposed');
  }, []); // No dependencies to prevent infinite loops

  // REMOVED: Memory monitoring useEffect - was causing infinite loops and spawning
  // This was triggering constant re-renders and infinite brick creation
   
     // Simple cleanup function called manually only when needed
   const performCleanup = useCallback(() => {
     console.log('🧹 Manual cleanup triggered');
     autoCleanupUnusedInstances();
   }, [autoCleanupUnusedInstances]);

   /**
    * Optimize geometry by combining multiple brick instances into a single mesh
    */
   const optimizeGeometry = useCallback(async (
     onProgress?: (progress: number, stage: string) => void
   ): Promise<boolean> => {
     if (!brickGLTF || bricks.length === 0 || isOptimizing) {
       console.log('⚠️ Cannot optimize: GLTF not loaded, no bricks, or already optimizing');
       return false;
     }

     if (!geometryOptimizer.current.shouldOptimize(bricks.length)) {
       console.log(`⚠️ Optimization not beneficial for ${bricks.length} bricks (minimum 5 required)`);
       return false;
     }

     setIsOptimizing(true);
     console.log(`🚀 Starting geometry optimization for ${bricks.length} bricks...`);

     try {
       // Convert bricks to instance data
       const instanceData: BrickInstanceData[] = bricks.map(brick => ({
         id: brick.id,
         brickType: brick.brickType,
         position: brick.position,
         rotation: brick.rotation,
         pathId: brick.pathId
       }));

       // Perform optimization
       const result = await geometryOptimizer.current.combineInstances(
         instanceData,
         brickGLTF,
         onProgress
       );

       if (!result) {
         console.error('❌ Geometry optimization failed');
         return false;
       }

       // Create optimized mesh
       const optimizedMesh = new THREE.Mesh(result.geometry, result.material);
       optimizedMesh.castShadow = true;
       optimizedMesh.receiveShadow = true;
       optimizedMesh.userData = { 
         type: 'optimized-geometry',
         originalBrickCount: result.totalBricks,
         optimizationRatio: result.optimizationRatio
       };

       // Remove all individual instanced meshes
       if (sceneState.group) {
         // Clear existing instanced meshes with complete disposal
         instancedMeshes.current.forEach((instances, brickType) => {
           if (instances.normal?.instanceMesh) {
             sceneState.group!.remove(instances.normal.instanceMesh);
             // Complete disposal: mesh, geometry, and material
             instances.normal.instanceMesh.geometry?.dispose();
             if (Array.isArray(instances.normal.instanceMesh.material)) {
               instances.normal.instanceMesh.material.forEach(mat => mat.dispose());
             } else {
               instances.normal.instanceMesh.material?.dispose();
             }
             instances.normal.instanceMesh.dispose();
           }
           if (instances.ar?.instanceMesh) {
             sceneState.group!.remove(instances.ar.instanceMesh);
             // Complete disposal: mesh, geometry, and material
             instances.ar.instanceMesh.geometry?.dispose();
             if (Array.isArray(instances.ar.instanceMesh.material)) {
               instances.ar.instanceMesh.material.forEach(mat => mat.dispose());
             } else {
               instances.ar.instanceMesh.material?.dispose();
             }
             instances.ar.instanceMesh.dispose();
           }
         });

         // Add optimized mesh
         sceneState.group.add(optimizedMesh);
         console.log(`✅ Added optimized mesh to scene (${result.optimizationRatio * 100}% draw call reduction)`);
       }

       // Update state
       setOptimizedMeshes(new Map([['combined', optimizedMesh]]));
       instancedMeshes.current.clear();

       console.log(`🎉 Geometry optimization completed successfully!`, {
         originalBricks: result.totalBricks,
         drawCallReduction: `${(result.optimizationRatio * 100).toFixed(1)}%`,
         memoryEstimate: result.memoryEstimate,
         finalVertices: result.geometry.attributes.position.count
       });

       return true;

     } catch (error) {
       console.error('❌ Geometry optimization error:', error);
       return false;
     } finally {
       setIsOptimizing(false);
     }
   }, [bricks, brickGLTF, isOptimizing, sceneState.group]);

   /**
    * Auto-optimize geometry when we have enough instances (called after loading projects)
    */
   const autoOptimizeIfBeneficial = useCallback(async () => {
     if (!brickGLTF || isOptimizing) return;

     const shouldOptimize = geometryOptimizer.current.shouldOptimize(bricks.length);
     if (shouldOptimize && optimizedMeshes.size === 0) { // Don't re-optimize
       console.log(`🔧 Auto-optimizing geometry for ${bricks.length} bricks...`);
       await optimizeGeometry((progress, stage) => {
         console.log(`📊 Auto-optimization: ${progress.toFixed(1)}% - ${stage}`);
       });
     }
   }, [bricks.length, brickGLTF, isOptimizing, optimizedMeshes.size, optimizeGeometry]);

   /**
    * Clear optimized meshes and return to instanced rendering
    */
   const clearOptimizedGeometry = useCallback(() => {
     if (optimizedMeshes.size === 0) return;

     console.log('🧹 Clearing optimized geometry, returning to instanced rendering...');
     
     // Remove optimized meshes from scene
     optimizedMeshes.forEach(mesh => {
       if (sceneState.group) {
         sceneState.group.remove(mesh);
       }
       mesh.geometry.dispose();
       if (Array.isArray(mesh.material)) {
         mesh.material.forEach(mat => mat.dispose());
       } else {
         mesh.material.dispose();
       }
     });

     setOptimizedMeshes(new Map());
     
     // Clear optimizer cache
     geometryOptimizer.current.clearCache();
     
     console.log('✅ Optimized geometry cleared');
   }, [optimizedMeshes, sceneState.group]);

           return {
      sceneState,
      bricks,
      isAnimating,
      physicsEnabled,
      brickGLTF, // Expose GLTF loading state for demo creation timing
      isOptimizing,
      optimizedMeshes,
      initializeScene,
      addBrick,
      removeBrick,
      clearAllBricks,
      startAnimation,
      stopAnimation,
      enablePhysics,
      resizeRenderer,
      resetCameraFor3D,
      disposeScene,
      getOrCreateInstancedMesh,
      forceMemoryCleanup,
      autoCleanupUnusedInstances,
      optimizeGeometry,
      autoOptimizeIfBeneficial,
      clearOptimizedGeometry
    };
}

export function useARConstruction() {
  const [anchors, setAnchors] = useState<Array<{ id: string; position: Position3D; mesh: THREE.Mesh; anchor: Anchor }>>([]);
  const [isConstructing, setIsConstructing] = useState(false);
  const [constructionProgress, setConstructionProgress] = useState(0);
  const [structuralNetwork, setStructuralNetwork] = useState<StructuralNode[]>([]);
  const [constructionPaths, setConstructionPaths] = useState<ConstructionPath[]>([]);
  const [climateAnalysis, setClimateAnalysis] = useState<ClimateAnalysis | null>(null);

  const addAnchor = useCallback((anchor: Anchor, scene: THREE.Scene) => {
    // Create anchor visualization with different shapes based on purpose
    let geometry: THREE.BufferGeometry;
    let color: number;

    switch (anchor.purpose) {
      case 'foundation':
        geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        color = 0x00ff00; // Green for foundation
        break;
      case 'column-base':
        geometry = new THREE.CylinderGeometry(0.05, 0.05, 0.1);
        color = 0x0000ff; // Blue for columns
        break;
      case 'wall-corner':
        geometry = new THREE.ConeGeometry(0.05, 0.1);
        color = 0xffff00; // Yellow for wall corners
        break;
      case 'roof-point':
        geometry = new THREE.OctahedronGeometry(0.05);
        color = 0xff00ff; // Magenta for roof points
        break;
      default:
        geometry = new THREE.SphereGeometry(0.05, 16, 16);
        color = 0xff0000; // Red for other types
    }

    const material = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(anchor.position.x, anchor.position.y, anchor.position.z);
    
    scene.add(mesh);

    const anchorData = {
      id: `anchor-${Date.now()}`,
      position: anchor.position,
      mesh,
      anchor
    };

    setAnchors(prev => {
      const updated = [...prev, anchorData];
      
      // Update structural network when anchors change
      const network = createStructuralNetwork(updated.map(a => a.anchor));
      setStructuralNetwork(network);
      
      return updated;
    });

    return anchorData;
  }, []);

  const generateAutomaticConstruction = useCallback(async (
    brickType: BrickTypeKey,
    addBrick: (brickType: BrickTypeKey, position: Position3D, rotation?: Position3D, pathId?: string) => ConstructedBrick | null
  ) => {
    if (isConstructing || structuralNetwork.length < 2) return;

    setIsConstructing(true);
    setConstructionProgress(0);

    try {
      // Generate construction sequence
      const paths = generateConstructionSequence(structuralNetwork, brickType);
      setConstructionPaths(paths);

      // Analyze climate resilience
      const analysis = analyzeClimateResilience(paths, brickType);
      setClimateAnalysis(analysis);

      // Build each path progressively
      let totalBricks = 0;
      const allBricks = paths.reduce((sum, path) => sum + path.totalBricks, 0);

      for (const [pathIndex, path] of paths.entries()) {
        for (const [brickIndex, position] of path.brickPositions.entries()) {
          const rotation = path.brickRotations[brickIndex];
          const pathId = `path-${pathIndex}`;
          
          addBrick(brickType, position, rotation, pathId);
          
          totalBricks++;
          setConstructionProgress((totalBricks / allBricks) * 100);

          // Add delay for visual effect
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }
    } finally {
      setIsConstructing(false);
    }
  }, [isConstructing, structuralNetwork]);

  const constructBetweenAnchors = useCallback(async (
    anchor1: Position3D,
    anchor2: Position3D,
    brickType: BrickTypeKey,
    addBrick: (brickType: BrickTypeKey, position: Position3D, rotation?: Position3D) => ConstructedBrick | null,
    constructionType: import('../types').ConstructionType = 'wall'
  ) => {
    if (isConstructing) return;

    setIsConstructing(true);
    setConstructionProgress(0);

    try {
      const path = calculateLinearPath(anchor1, anchor2, brickType, constructionType);
      
      // Build progressively
      for (let i = 0; i < path.brickPositions.length; i++) {
        const position = path.brickPositions[i];
        const rotation = path.brickRotations[i];
        
        addBrick(brickType, position, rotation);
        setConstructionProgress(((i + 1) / path.brickPositions.length) * 100);

        // Add delay for visual effect
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error('Construction failed:', error);
    } finally {
      setIsConstructing(false);
    }
  }, [isConstructing]);

  const clearAnchors = useCallback((scene: THREE.Scene) => {
    anchors.forEach(anchor => {
      scene.remove(anchor.mesh);
    });
    setAnchors([]);
    setStructuralNetwork([]);
    setConstructionPaths([]);
    setClimateAnalysis(null);
  }, [anchors]);

  return {
    anchors,
    isConstructing,
    constructionProgress,
    structuralNetwork,
    constructionPaths,
    climateAnalysis,
    addAnchor,
    constructBetweenAnchors,
    generateAutomaticConstruction,
    clearAnchors
  };
} 