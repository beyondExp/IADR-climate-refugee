import { useState, useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import type { WebXRState, Position3D, Rotation3D, BrickTypeKey, Anchor } from '../types';
import { brickTypes } from '../utils/brickTypes';
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
  mesh: THREE.Object3D;
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

  const startXRSession = useCallback(async () => {
    try {
      if (!navigator.xr) {
        throw new Error('WebXR not available - try Chrome on Android');
      }

      console.log('WebXR: Requesting AR session...');
      
      // Request session with hit testing for surface detection
      const sessionOptions = {
        requiredFeatures: ['local'],
        optionalFeatures: ['local-floor', 'anchors', 'dom-overlay', 'hit-test'],
        domOverlay: { root: document.body }
      };

      const session = await navigator.xr.requestSession('immersive-ar', sessionOptions);
      console.log('WebXR: AR session created successfully');

      const referenceSpace = await session.requestReferenceSpace('local');
      console.log('WebXR: Reference space created');

      // Setup hit test source for surface detection
      let hitTestSource = null;
      try {
        if (session && (session as any).requestHitTestSource) {
          hitTestSource = await (session as any).requestHitTestSource({ space: referenceSpace });
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
        preserveDrawingBuffer: true,
        powerPreference: "high-performance"
      });
      
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit for performance
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.xr.enabled = true;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      
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

  // Initialize GLTF loader and load brick model
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Import THREE.js GLTF loader
      import('three/examples/jsm/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
        gltfLoader.current = new GLTFLoader();
        
        // Load the same model as the editor
        gltfLoader.current.load('/Octa2.glb', (gltf: any) => {
          console.log('🧱 GLTF brick model loaded successfully');
          setBrickGLTF(gltf);
        }, undefined, (error: any) => {
          console.error('❌ Failed to load GLTF brick model:', error);
        });
      });
    }
  }, []);

  const createBrickMesh = useCallback((brickType: BrickTypeKey, position: Position3D, rotation: Rotation3D = { x: 0, y: 0, z: 0 }, forAR: boolean = false) => {
    const brick = brickTypes[brickType];
    
    // Create a group to hold the brick
    const brickGroup = new THREE.Group();
    
    if (brickGLTF?.scene) {
      // Use GLTF model for both AR and 3D modes (same geometry)
      console.log(`🧱 Creating GLTF brick${forAR ? ' (AR-optimized materials)' : ''} at`, position);
      const clonedScene = brickGLTF.scene.clone();
      
      // Apply materials and scale
      clonedScene.traverse((child: any) => {
        if (child instanceof THREE.Mesh) {
          // Use optimized material for AR mode, standard for 3D mode
          const material = forAR 
            ? new THREE.MeshBasicMaterial({
                color: brick.color,
                transparent: true,
                opacity: 0.9
              })
            : new THREE.MeshStandardMaterial({
                color: brick.color,
                roughness: 0.7,
                metalness: 0.2
              });
          
          child.material = material;
          
          // Disable shadows in AR mode for performance
          if (!forAR) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        }
      });
      
      // Apply same scale as editor (0.2)
      clonedScene.scale.set(0.2, 0.2, 0.2);
      brickGroup.add(clonedScene);
    } else {
      // Fallback to basic geometry if GLTF not loaded
      console.log('🧱 Creating fallback brick at', position);
      const geometry = new THREE.BoxGeometry(
        brick.size.width,
        brick.size.height,
        brick.size.depth
      );

      const material = new THREE.MeshStandardMaterial({ 
        color: brick.color,
        roughness: 0.7,
        metalness: 0.2
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      brickGroup.add(mesh);
    }

    // Position and rotation (same as before)
    brickGroup.position.set(position.x, position.y + brick.size.height / 2, position.z);
    brickGroup.rotation.set(rotation.x, rotation.y, rotation.z);

    return brickGroup;
  }, [brickGLTF]);

  const addBrick = useCallback((brickType: BrickTypeKey, position: Position3D, rotation: Rotation3D = { x: 0, y: 0, z: 0 }, pathId?: string, forAR?: boolean) => {
    if (!sceneState.group) {
      console.warn('❌ Cannot add brick: no group available');
      return null;
    }

    try {
      // Auto-detect AR mode if not specified
      const isARMode = forAR ?? sceneState.renderer?.xr.isPresenting ?? false;
      const mesh = createBrickMesh(brickType, position, rotation, isARMode);
      const brickId = `brick-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      if (isARMode) {
        // In AR: Start with temporary position, will be repositioned via hit testing
        // This ensures objects are placed at detected real-world surfaces
        mesh.position.set(
          position.x * 0.1,      // Scale to AR size  
          position.y * 0.1,      // Keep relative Y
          position.z * 0.1       // Keep relative Z
        );
        mesh.setRotationFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z));
        console.log(`📍 AR brick created, awaiting surface placement:`, mesh.position);
      } else {
        // In 3D Preview: Use original editor positions
        mesh.position.set(position.x, position.y, position.z);
        mesh.setRotationFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z));
        console.log(`📐 3D Preview brick positioned:`, mesh.position);
      }
      
      sceneState.group.add(mesh);

      const newBrick: ConstructedBrick = {
        id: brickId,
        mesh,
        position,
        rotation,
        brickType,
        isStable: true,
        pathId,
        isAnchored: false // All bricks start unanchored and will be positioned by hit testing
      };

      setBricks(prev => [...prev, newBrick]);
      console.log(`✅ Added ${isARMode ? 'AR' : '3D'} brick - Mode: ${isARMode ? 'AR (awaiting placement)' : '3D Preview'}`);
      return newBrick;
    } catch (err) {
      console.error('❌ Failed to add brick:', err);
      return null;
    }
  }, [sceneState.group, sceneState.renderer, createBrickMesh]);

  const removeBrick = useCallback((brickId: string) => {
    if (!sceneState.group) return;

    const brick = bricks.find(b => b.id === brickId);
    if (brick) {
      sceneState.group.remove(brick.mesh);
      setBricks(prev => prev.filter(b => b.id !== brickId));
    }
  }, [sceneState.group, bricks]);

  const clearAllBricks = useCallback(() => {
    if (!sceneState.group) return;

    bricks.forEach(brick => {
      sceneState.group!.remove(brick.mesh);
    });
    setBricks([]);
    console.log('🧹 Cleared all bricks');
  }, [sceneState.group, bricks]);

  const updateBrickPhysics = useCallback(() => {
    if (!physicsEnabled || bricks.length === 0) return;

    const brickData = bricks.map(brick => ({
      id: brick.id,
      position: brick.position,
      brickType: brick.brickType
    }));

    const physics = simulateBrickPhysics(brickData);

    // Update brick stability visual indicators
    setBricks(prev => prev.map(brick => {
      const brickPhysics = physics[brick.id];
      if (brickPhysics) {
        // Update mesh color based on stability
        const mesh = brick.mesh as THREE.Group;
        const brickMesh = mesh.children[0] as THREE.Mesh;
        const material = brickMesh.material as THREE.MeshLambertMaterial;
        
        if (brickPhysics.isStable) {
          material.color.setHex(brickTypes[brick.brickType].color);
        } else {
          material.color.setHex(0xff4444); // Red for unstable
        }

        return {
          ...brick,
          isStable: brickPhysics.isStable
        };
      }
      return brick;
    }));
  }, [physicsEnabled, bricks]);

  // Position unanchored bricks at detected surfaces using WebXR hit testing
  const anchorBricksToSurfaces = useCallback((frame: any, referenceSpace: any, session: any) => {
    if (!sceneState.group || bricks.length === 0) return;

    // Only position unanchored bricks
    const unanchoredBricks = bricks.filter(brick => !brick.isAnchored);
    if (unanchoredBricks.length === 0) return;

    try {
      // Use hit testing to find real-world surfaces
      const hitTestResults = session.hitTestSource ? frame.getHitTestResults(session.hitTestSource) : [];
      
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const hitPose = hit.getPose(referenceSpace);
        
        if (hitPose) {
          // Get the surface position in world coordinates
          const surfaceMatrix = new THREE.Matrix4().fromArray(hitPose.transform.matrix);
          const surfacePosition = new THREE.Vector3();
          const surfaceQuaternion = new THREE.Quaternion();
          const surfaceScale = new THREE.Vector3();
          surfaceMatrix.decompose(surfacePosition, surfaceQuaternion, surfaceScale);

          console.log('🎯 Found real-world surface at:', surfacePosition);

          // Position ALL unanchored bricks relative to this detected surface
          // This creates a "build area" on the detected surface
          unanchoredBricks.forEach((brick) => {
            if (brick.mesh) {
              // Calculate final world position: surface + scaled relative position
              const worldPosition = new THREE.Vector3(
                surfacePosition.x + (brick.position.x * 0.1), // Scaled relative X
                surfacePosition.y + (brick.position.y * 0.1), // Scaled relative Y  
                surfacePosition.z + (brick.position.z * 0.1)  // Scaled relative Z
              );
              
              // Set the mesh position in world coordinates - this will stay fixed!
              brick.mesh.position.copy(worldPosition);
              brick.mesh.setRotationFromEuler(new THREE.Euler(
                brick.rotation.x,
                brick.rotation.y, 
                brick.rotation.z
              ));

              console.log(`🔒 Brick ${brick.id} anchored to world position:`, worldPosition);
            }
          });

          // Mark all positioned bricks as anchored
          setBricks(prev => prev.map(b => 
            unanchoredBricks.find(ub => ub.id === b.id) 
              ? { ...b, isAnchored: true }
              : b
          ));

          console.log(`✅ Anchored ${unanchoredBricks.length} bricks to detected surface`);
        }
      } else {
        // Fallback: position relative to origin if no surface detected
        console.log('📍 No surface detected, positioning at origin');
        
        unanchoredBricks.forEach((brick) => {
          if (brick.mesh) {
            // Position in world space at origin with scaled positions
            brick.mesh.position.set(
              brick.position.x * 0.1,
              brick.position.y * 0.1,
              brick.position.z * 0.1 - 1.5  // 1.5m in front
            );
            brick.mesh.setRotationFromEuler(new THREE.Euler(
              brick.rotation.x,
              brick.rotation.y,
              brick.rotation.z
            ));
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
      console.error('❌ Error anchoring bricks to surfaces:', error);
    }
  }, [bricks, sceneState.group, setBricks]);

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

    const animate = (_timestamp: number, frame?: any) => {
      animationRef.current = requestAnimationFrame(animate);
      
      // Update controls if available and not in XR mode
      if (sceneState.controls && !sceneState.renderer!.xr.isPresenting) {
        sceneState.controls.update();
      }

             // Handle AR mode - optimize settings and anchor unpositioned objects
       if (sceneState.renderer!.xr.isPresenting && frame) {
         // Optimize renderer for AR mode
         if (sceneState.renderer!.shadowMap.enabled) {
           console.log('🎯 Disabling shadows for AR performance');
           sceneState.renderer!.shadowMap.enabled = false;
         }
         
         // Use hit testing to anchor unpositioned bricks to real-world surfaces
         const session = sceneState.renderer!.xr.getSession();
         if (session) {
           const referenceSpace = sceneState.renderer!.xr.getReferenceSpace();
           if (referenceSpace) {
             anchorBricksToSurfaces(frame, referenceSpace, session);
           }
         }
         
       } else if (!sceneState.renderer!.xr.isPresenting && !sceneState.renderer!.shadowMap.enabled) {
         // Re-enable shadows when exiting AR mode
         console.log('🎯 Re-enabling shadows for 3D preview');
         sceneState.renderer!.shadowMap.enabled = true;
       }
      
      // Render the scene
      sceneState.renderer!.render(sceneState.scene!, sceneState.camera!);
    };

    // Set animation loop (supports both regular and XR modes)
    sceneState.renderer!.setAnimationLoop(animate);

    // Start physics simulation if enabled
    if (physicsEnabled && !physicsRef.current) {
      const runPhysics = () => {
        if (!physicsRef.current) return;
        updateBrickPhysics();
        physicsRef.current = setTimeout(runPhysics, 100);
      };
      physicsRef.current = setTimeout(runPhysics, 100);
    }
  }, [sceneState.renderer, sceneState.scene, sceneState.camera, sceneState.controls, physicsEnabled, updateBrickPhysics, anchorBricksToSurfaces]);

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

  return {
    sceneState,
    bricks,
    isAnimating,
    physicsEnabled,
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
    createBrickMesh
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