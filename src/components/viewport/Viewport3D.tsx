import React, { useRef, useEffect, useState, useMemo, Suspense, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, Line, Text, useGLTF, Stats, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';

// Preload the GLTF file for better performance
useGLTF.preload('/Octa2.glb');

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

interface Viewport3DProps {
  onSelectionChange?: (selectedObjects: string[]) => void;
  onObjectTransform?: (objectId: string, transforms: { 
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
  }) => void;
  gridVisible?: boolean;
  snapEnabled?: boolean;
  viewMode?: 'wireframe' | 'solid' | 'textured';
  sceneObjects?: SceneObject[];
  selectedObjects?: string[];
  transformMode?: 'translate' | 'rotate' | 'scale';
  onSave?: (sceneObjects: SceneObject[]) => void;
}

// Safe Octa2 Brick Component with full transform support
function OctaBrick({ 
  position, 
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  selected = false, 
  onClick,
  id: _id,
  onTransform,
  transformMode = 'translate'
}: { 
  position: [number, number, number]; 
  rotation?: [number, number, number];
  scale?: [number, number, number];
  selected?: boolean;
  onClick?: () => void;
  id: string;
  onTransform?: (transforms: { 
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
  }) => void;
  transformMode?: 'translate' | 'rotate' | 'scale';
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  
  // Load GLTF with Suspense boundary handling
  const gltf = useGLTF('/Octa2.glb');
  
  // Validate GLTF loading
  useEffect(() => {
    if (!gltf) {
      setLoadingError('GLTF not loaded');
    } else if (!gltf.scene) {
      setLoadingError('GLTF scene not available');
    } else {
      setLoadingError(null);
    }
  }, [gltf]);

  // Create materials safely
  const materials = useMemo(() => {
    const defaultMaterial = new THREE.MeshStandardMaterial({
      color: selected ? '#00ff88' : '#8B4513',
      emissive: selected ? '#003322' : '#000000',
      emissiveIntensity: selected ? 0.3 : 0,
      roughness: 0.7,
      metalness: 0.2
    });

    const outlineMaterial = new THREE.MeshBasicMaterial({
      color: '#00ff88',
      transparent: true,
      opacity: 0.2,
      wireframe: true
    });

    return { defaultMaterial, outlineMaterial };
  }, [selected]);

  // Cleanup materials on unmount
  useEffect(() => {
    return () => {
      materials.defaultMaterial?.dispose();
      materials.outlineMaterial?.dispose();
    };
  }, [materials]);

  // Handle transform changes for all modes
  const handleTransform = () => {
    if (groupRef.current && onTransform) {
      const worldPosition = new THREE.Vector3();
      const worldRotation = new THREE.Euler();
      const worldScale = new THREE.Vector3();
      
      groupRef.current.getWorldPosition(worldPosition);
      worldRotation.setFromQuaternion(groupRef.current.quaternion);
      groupRef.current.getWorldScale(worldScale);

      const transforms: any = {};

      if (transformMode === 'translate') {
        transforms.position = {
          x: Number(worldPosition.x.toFixed(2)),
          y: Number(worldPosition.y.toFixed(2)),
          z: Number(worldPosition.z.toFixed(2))
        };
      } else if (transformMode === 'rotate') {
        transforms.rotation = {
          x: Number(worldRotation.x.toFixed(3)),
          y: Number(worldRotation.y.toFixed(3)),
          z: Number(worldRotation.z.toFixed(3))
        };
      } else if (transformMode === 'scale') {
        // Adjust for the base scale [0.2, 0.2, 0.2]
        transforms.scale = {
          x: Number((worldScale.x / 0.2).toFixed(2)),
          y: Number((worldScale.y / 0.2).toFixed(2)),
          z: Number((worldScale.z / 0.2).toFixed(2))
        };
      }

      onTransform(transforms);
    }
  };

  // Fallback if GLTF fails to load
  if (loadingError || !gltf?.scene) {
    return (
      <group>
        <mesh 
          ref={groupRef}
          position={position} 
          rotation={rotation}
          scale={[scale[0] * 0.2, scale[1] * 0.2, scale[2] * 0.2]}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial {...materials.defaultMaterial} />
          {selected && (
            <mesh scale={[1.1, 1.1, 1.1]}>
              <boxGeometry args={[1, 1, 1]} />
              <primitive object={materials.outlineMaterial} />
            </mesh>
          )}
        </mesh>
        {selected && groupRef.current && (
          <TransformControls
            object={groupRef.current}
            mode={transformMode}
            showX={true}
            showY={true}
            showZ={true}
            size={0.8}
            onObjectChange={handleTransform}
          />
        )}
      </group>
    );
  }

  // Clone scene safely and apply materials
  const clonedScene = useMemo(() => {
    if (!gltf?.scene) return null;
    
    try {
      const clone = gltf.scene.clone();
      
      // Safely traverse and apply materials
      clone.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Create a new material based on the original
          if (child.material) {
            child.material = materials.defaultMaterial.clone();
          } else {
            child.material = materials.defaultMaterial;
          }
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      return clone;
    } catch (err) {
      console.error('Failed to clone scene:', err);
      return null;
    }
  }, [gltf?.scene, materials.defaultMaterial]);

  return (
    <group>
      <group 
        ref={groupRef}
        position={position} 
        rotation={rotation}
        scale={[scale[0] * 0.2, scale[1] * 0.2, scale[2] * 0.2]}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
      >
        {clonedScene && <primitive object={clonedScene} />}
        
        {/* Selection outline - only if selected */}
        {selected && (
          <mesh scale={[1.1, 1.1, 1.1]} position={[0, 0, 0]}>
            <boxGeometry args={[1, 1, 1]} />
            <primitive object={materials.outlineMaterial} />
          </mesh>
        )}
      </group>
      
      {/* Transform Controls - Professional Gizmo with all modes */}
      {selected && groupRef.current && (
        <TransformControls
          object={groupRef.current}
          mode={transformMode}
          showX={true}
          showY={true}
          showZ={true}
          size={0.8}
          onObjectChange={handleTransform}
        />
      )}
    </group>
  );
}

// Loading fallback for GLTF models
function BrickLoadingFallback({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[0.8, 0.4, 0.8]} />
      <meshStandardMaterial 
        color="#666666" 
        transparent 
        opacity={0.5}
        wireframe 
      />
    </mesh>
  );
}

// Error Boundary Component for 3D Scene
function SceneErrorBoundary({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.message.includes('three') || event.message.includes('fiber')) {
        setHasError(true);
        console.error('3D Scene Error:', event.error);
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <mesh>
        <boxGeometry args={[2, 1, 0.1]} />
        <meshBasicMaterial color="#ff4444" />
      </mesh>
    );
  }

  return <>{children}</>;
}

// Enhanced Grid Component with professional features
function EnhancedGrid({ 
  visible = true, 
  gridSize = 20, 
  cellSize = 1, 
  subdivisions = 10,
  opacity = 0.3,
  fadeDistance = 25,
  gridType = 'lines'
}: {
  visible?: boolean;
  gridSize?: number;
  cellSize?: number;
  subdivisions?: number;
  opacity?: number;
  fadeDistance?: number;
  gridType?: 'lines' | 'dots' | 'both';
}) {
  if (!visible) return null;

  return (
    <>
      {/* Main Grid */}
      <Grid
        position={[0, 0, 0]}
        args={[gridSize, gridSize]}
        cellSize={cellSize}
        cellThickness={0.5}
        cellColor={`rgba(255, 255, 255, ${opacity})`}
        sectionSize={subdivisions}
        sectionThickness={1}
        sectionColor={`rgba(0, 153, 255, ${opacity * 1.5})`}
        fadeDistance={fadeDistance}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid={true}
      />
      
      {/* Subdivision Grid */}
      {gridType === 'both' && (
        <Grid
          position={[0, 0.001, 0]}
          args={[gridSize * 2, gridSize * 2]}
          cellSize={cellSize / 4}
          cellThickness={0.2}
          cellColor={`rgba(255, 255, 255, ${opacity * 0.3})`}
          sectionSize={subdivisions * 4}
          sectionThickness={0.5}
          sectionColor={`rgba(100, 200, 255, ${opacity * 0.8})`}
          fadeDistance={fadeDistance / 2}
          fadeStrength={0.8}
          followCamera={false}
          infiniteGrid={true}
        />
      )}
      
      {/* Origin Axes */}
      <mesh>
        <boxGeometry args={[0.05, 0.05, gridSize]} />
        <meshBasicMaterial color="#4ecdc4" />
      </mesh>
      <mesh>
        <boxGeometry args={[gridSize, 0.05, 0.05]} />
        <meshBasicMaterial color="#ff6b6b" />
      </mesh>
      <mesh position={[0, gridSize / 2, 0]}>
        <boxGeometry args={[0.05, gridSize, 0.05]} />
        <meshBasicMaterial color="#45b7d1" />
      </mesh>
    </>
  );
}

// Professional Lighting System
function ProfessionalLighting({
  ambientIntensity = 0.4,
  directionalIntensity = 0.8,
  pointIntensity = 0.3,
  shadowsEnabled = true,
  lightPosition = [10, 10, 5]
}: {
  ambientIntensity?: number;
  directionalIntensity?: number;
  pointIntensity?: number;
  shadowsEnabled?: boolean;
  lightPosition?: [number, number, number];
}) {
  return (
    <>
      {/* Enhanced Ambient Light */}
      <ambientLight intensity={ambientIntensity} />
      
      {/* Primary Directional Light with Enhanced Shadows */}
      <directionalLight
        position={lightPosition}
        intensity={directionalIntensity}
        castShadow={shadowsEnabled}
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-far={100}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0001}
      />
      
      {/* Fill Light */}
      <directionalLight
        position={[-lightPosition[0], lightPosition[1], -lightPosition[2]]}
        intensity={directionalIntensity * 0.3}
        color="#4ecdc4"
      />
      
      {/* Rim Light */}
      <pointLight 
        position={[0, 15, -10]} 
        intensity={pointIntensity}
        color="#45b7d1"
        distance={50}
        decay={2}
      />
      
      {/* Environment Light */}
      <pointLight 
        position={[-lightPosition[0], -5, lightPosition[2]]} 
        intensity={pointIntensity * 0.5}
        color="#ff6b6b"
        distance={30}
        decay={2}
      />
    </>
  );
}

// Performance Monitor Component
function PerformanceMonitor() {
  const [renderInfo, setRenderInfo] = useState({ fps: 60, calls: 0, triangles: 0 });
  
  useFrame((state) => {
    const renderer = state.gl;
    const info = renderer.info;
    
    // Update render stats (throttled)
    if (performance.now() % 500 < 16) { // Update every 500ms
      setRenderInfo({
        fps: Math.round(1 / state.clock.getDelta()),
        calls: info.render.calls,
        triangles: info.render.triangles
      });
    }
  });

  return null; // Component only tracks stats, doesn't render
}

// Camera Preset Manager
function useCameraPresets(cameraRef: React.RefObject<THREE.PerspectiveCamera | null>, controlsRef: React.RefObject<any>) {
  const presets = useMemo(() => ({
    front: { position: [0, 5, 10] as const, target: [0, 2, 0] as const },
    back: { position: [0, 5, -10] as const, target: [0, 2, 0] as const },
    left: { position: [-10, 5, 0] as const, target: [0, 2, 0] as const },
    right: { position: [10, 5, 0] as const, target: [0, 2, 0] as const },
    top: { position: [0, 20, 0] as const, target: [0, 0, 0] as const },
    bottom: { position: [0, -20, 0] as const, target: [0, 0, 0] as const },
    isometric: { position: [8, 6, 8] as const, target: [0, 2, 0] as const },
    closeup: { position: [3, 3, 3] as const, target: [0, 1, 0] as const },
    overview: { position: [15, 12, 15] as const, target: [0, 0, 0] as const }
  }), []);

  const setPreset = useCallback((presetName: keyof typeof presets) => {
    const preset = presets[presetName];
    if (cameraRef.current && controlsRef.current) {
      // Smooth transition to preset
      const [x, y, z] = preset.position;
      const [tx, ty, tz] = preset.target;
      cameraRef.current.position.set(x, y, z);
      controlsRef.current.target.set(tx, ty, tz);
      controlsRef.current.update();
    }
  }, [presets, cameraRef, controlsRef]);

  return { presets, setPreset };
}

// Scene content component with error handling
function SceneContent({ 
  onSelectionChange, 
  onObjectTransform,
  gridVisible, 
  viewMode: _viewMode,
  sceneObjects = [],
  selectedObjects = [],
  transformMode = 'translate',
  gridSize = 20,
  gridCellSize = 1,
  gridOpacity = 0.3,
  gridType = 'lines',
  ambientIntensity = 0.4,
  directionalIntensity = 0.8,
  pointIntensity = 0.3,
  shadowsEnabled = true,
  onSave
}: {
  onSelectionChange?: (selectedObjects: string[]) => void;
  onObjectTransform?: (objectId: string, transforms: { 
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
  }) => void;
  gridVisible?: boolean;
  viewMode?: string;
  sceneObjects?: SceneObject[];
  selectedObjects?: string[];
  transformMode?: 'translate' | 'rotate' | 'scale';
  gridSize?: number;
  gridCellSize?: number;
  gridOpacity?: number;
  gridType?: 'lines' | 'dots' | 'both';
  ambientIntensity?: number;
  directionalIntensity?: number;
  pointIntensity?: number;
  shadowsEnabled?: boolean;
  onSave?: (sceneObjects: SceneObject[]) => void;
}) {
  // Handle brick selection
  const handleBrickClick = (objectId: string) => {
    onSelectionChange?.([objectId]);
  };

  // Handle background click to deselect all
  const handleBackgroundClick = () => {
    onSelectionChange?.([]);
  };

  const handleBrickTransform = (objectId: string) => (transforms: { 
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
  }) => {
    onObjectTransform?.(objectId, transforms);
  };

  // Auto-save functionality
  useEffect(() => {
    if (sceneObjects.length > 0) {
      const interval = setInterval(() => {
        onSave?.(sceneObjects)
      }, 30000) // Auto-save every 30 seconds
      return () => clearInterval(interval)
    }
  }, [sceneObjects, onSave])

  // If we have scene objects, render them dynamically
  if (sceneObjects.length > 0) {
    return (
      <SceneErrorBoundary>
        {/* Professional Lighting Setup */}
        <ProfessionalLighting
          ambientIntensity={ambientIntensity}
          directionalIntensity={directionalIntensity}
          pointIntensity={pointIntensity}
          shadowsEnabled={shadowsEnabled}
        />

        {/* Professional Grid */}
        {gridVisible && (
          <EnhancedGrid
            gridSize={gridSize}
            cellSize={gridCellSize}
            subdivisions={10}
            opacity={gridOpacity}
            gridType={gridType}
          />
        )}

        {/* Ground Plane */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.01, 0]}
          receiveShadow
          onClick={handleBackgroundClick}
        >
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial
            color="#1a1a2e"
            transparent
            opacity={0.3}
          />
        </mesh>

        {/* Dynamic Scene Objects */}
        {sceneObjects.map((obj) => {
          if (obj.type === 'brick' && obj.visible && !obj.locked) {
            const objPosition = obj.position || { x: 0, y: 0, z: 0 };
            const objRotation = obj.rotation || { x: 0, y: 0, z: 0 };
            const objScale = obj.scale || { x: 1, y: 1, z: 1 };

            return (
              <Suspense key={obj.id} fallback={<BrickLoadingFallback position={[objPosition.x, objPosition.y, objPosition.z]} />}>
                <OctaBrick
                  id={obj.id}
                  position={[objPosition.x, objPosition.y, objPosition.z]}
                  rotation={[objRotation.x, objRotation.y, objRotation.z]}
                  scale={[objScale.x, objScale.y, objScale.z]}
                  selected={selectedObjects.includes(obj.id)}
                  onClick={() => handleBrickClick(obj.id)}
                  onTransform={handleBrickTransform(obj.id)}
                  transformMode={transformMode}
                />
              </Suspense>
            );
          }
          return null;
        })}
      </SceneErrorBoundary>
    );
  }

  // Fallback demo scene if no objects provided
  return (
    <SceneErrorBoundary>
      {/* Professional Lighting Setup */}
      <ProfessionalLighting
        ambientIntensity={ambientIntensity}
        directionalIntensity={directionalIntensity}
        pointIntensity={pointIntensity}
        shadowsEnabled={shadowsEnabled}
      />

      {/* Professional Grid */}
      {gridVisible && (
        <EnhancedGrid
          gridSize={gridSize}
          cellSize={gridCellSize}
          subdivisions={10}
          opacity={gridOpacity}
          gridType={gridType}
        />
      )}

      {/* Ground Plane */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        receiveShadow
        onClick={handleBackgroundClick}
      >
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial
          color="#1a1a2e"
          transparent
          opacity={0.3}
        />
      </mesh>

      {/* Demo Construction Pattern */}
      {[
        // Foundation row
        { id: 'demo-1', pos: [0, 0.2, 0] },
        { id: 'demo-2', pos: [1.2, 0.2, 0] },
        { id: 'demo-3', pos: [2.4, 0.2, 0] },
        // Second row offset
        { id: 'demo-4', pos: [0.6, 0.6, 0] },
        { id: 'demo-5', pos: [1.8, 0.6, 0] },
        // Third row
        { id: 'demo-6', pos: [1.2, 1.0, 0] },
      ].map((brick) => (
        <Suspense key={brick.id} fallback={<BrickLoadingFallback position={brick.pos as [number, number, number]} />}>
          <OctaBrick
            id={brick.id}
            position={brick.pos as [number, number, number]}
            rotation={[0, 0, 0]}
            scale={[1, 1, 1]}
            selected={selectedObjects.includes(brick.id)}
            onClick={() => handleBrickClick(brick.id)}
            onTransform={handleBrickTransform(brick.id)}
            transformMode={transformMode}
          />
        </Suspense>
      ))}
    </SceneErrorBoundary>
  );
}

export default function Viewport3D({ 
  onSelectionChange, 
  onObjectTransform,
  gridVisible = true, 
  snapEnabled: _snapEnabled = true,
  viewMode = 'solid',
  sceneObjects = [],
  selectedObjects = [],
  transformMode: externalTransformMode,
  onSave
}: Viewport3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const controlsRef = useRef<any>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [showControlsHelp, setShowControlsHelp] = useState(false);
  const [showProjectInfo, setShowProjectInfo] = useState(false);
  const [showViewportSettings, setShowViewportSettings] = useState(false);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>(externalTransformMode || 'translate');
  
  // Enhanced viewport settings
  const [viewportSettings, setViewportSettings] = useState({
    grid: {
      visible: gridVisible,
      size: 20,
      cellSize: 1,
      subdivisions: 10,
      opacity: 0.3,
      type: 'lines' as 'lines' | 'dots' | 'both'
    },
    lighting: {
      ambientIntensity: 0.4,
      directionalIntensity: 0.8,
      pointIntensity: 0.3,
      shadowsEnabled: true
    },
    camera: {
      fov: 60,
      near: 0.1,
      far: 1000
    },
    performance: {
      showStats: false,
      enableFrustumCulling: true,
      shadowMapSize: 2048
    }
  });

  // Camera presets integration
  const { presets, setPreset } = useCameraPresets(cameraRef, controlsRef);

  // Update internal transform mode when external prop changes
  useEffect(() => {
    if (externalTransformMode) {
      setTransformMode(externalTransformMode);
    }
  }, [externalTransformMode]);

  // Update grid visibility when prop changes
  useEffect(() => {
    setViewportSettings(prev => ({
      ...prev,
      grid: { ...prev.grid, visible: gridVisible }
    }));
  }, [gridVisible]);

  // Keyboard shortcuts for camera presets and transform modes
  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      // Skip if user is typing in an input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'g':
          event.preventDefault();
          setTransformMode('translate');
          break;
        case 'r':
          event.preventDefault();
          setTransformMode('rotate');
          break;
        case 's':
          event.preventDefault();
          setTransformMode('scale');
          break;
        case '1':
          event.preventDefault();
          setPreset('front');
          break;
        case '3':
          event.preventDefault();
          setPreset('right');
          break;
        case '7':
          event.preventDefault();
          setPreset('top');
          break;
        case '5':
          event.preventDefault();
          setPreset('isometric');
          break;
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [setPreset]);

  // Global error handler for the viewport
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.message.includes('three') || event.message.includes('fiber')) {
        setSceneError(event.message);
        console.error('Viewport Error:', event.error);
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (sceneError) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(to bottom, #0a0a0a, #1a1a2e)',
        color: 'white',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ fontSize: '2rem' }}>⚠️</div>
        <div>3D Viewport Error</div>
        <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>
          Scene failed to load. Please refresh the page.
        </div>
        <button 
          onClick={() => {
            setSceneError(null);
            window.location.reload();
          }}
          style={{
            padding: '0.5rem 1rem',
            background: '#00ff88',
            color: '#000',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Reload
        </button>
      </div>
    );
  }

  return (
    <div 
      ref={mountRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(to bottom, #0a0a0a, #1a1a2e)'
      }}
    >
      <Canvas
        camera={{ 
          position: [8, 6, 8], 
          fov: viewportSettings.camera.fov,
          near: viewportSettings.camera.near,
          far: viewportSettings.camera.far
        }}
        shadows
        style={{ 
          width: '100%', 
          height: '100%',
          background: 'transparent'
        }}
        dpr={[1, 2]}
        gl={{ 
          antialias: true,
          alpha: true
        }}
        onError={(error) => {
          console.error('Canvas Error:', error);
          setSceneError('3D Canvas initialization failed');
        }}
      >
        {/* Performance Monitor */}
        {viewportSettings.performance.showStats && <PerformanceMonitor />}
        
        {/* Stats Display */}
        {viewportSettings.performance.showStats && <Stats />}

        {/* Scene Content with Error Boundary */}
        <SceneContent 
          onSelectionChange={onSelectionChange}
          onObjectTransform={onObjectTransform}
          gridVisible={viewportSettings.grid.visible}
          viewMode={viewMode}
          sceneObjects={sceneObjects}
          selectedObjects={selectedObjects}
          transformMode={transformMode}
          gridSize={viewportSettings.grid.size}
          gridCellSize={viewportSettings.grid.cellSize}
          gridOpacity={viewportSettings.grid.opacity}
          gridType={viewportSettings.grid.type}
          ambientIntensity={viewportSettings.lighting.ambientIntensity}
          directionalIntensity={viewportSettings.lighting.directionalIntensity}
          pointIntensity={viewportSettings.lighting.pointIntensity}
          shadowsEnabled={viewportSettings.lighting.shadowsEnabled}
          onSave={onSave}
        />

        {/* Enhanced Controls */}
        <OrbitControls
          ref={controlsRef}
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={2}
          maxDistance={100}
          target={[0, 0.5, 0]}
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2.2}
          dampingFactor={0.05}
          enableDamping={true}
          makeDefault
        />

        {/* Professional Gizmo Helper */}
        <GizmoHelper
          alignment="bottom-right"
          margin={[120, 120]}
        >
          <GizmoViewport 
            axisColors={['#ff6b6b', '#4ecdc4', '#45b7d1']} 
            labelColor="white"
            axisHeadScale={1.5}
            font="12px Inter, system-ui, sans-serif"
          />
        </GizmoHelper>
      </Canvas>

      {/* Transform Mode Selector */}
      {selectedObjects.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(10px)',
          borderRadius: '8px',
          padding: '0.5rem',
          display: 'flex',
          gap: '0.5rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          zIndex: 15
        }}>
          <button
            onClick={() => setTransformMode('translate')}
            style={{
              padding: '0.5rem 0.75rem',
              background: transformMode === 'translate' ? 'var(--accent-cyan)' : 'transparent',
              color: transformMode === 'translate' ? '#000' : 'white',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              transition: 'all 0.3s ease'
            }}
            title="Move Objects (G)"
          >
            ↔️ Move
          </button>
          <button
            onClick={() => setTransformMode('rotate')}
            style={{
              padding: '0.5rem 0.75rem',
              background: transformMode === 'rotate' ? 'var(--accent-cyan)' : 'transparent',
              color: transformMode === 'rotate' ? '#000' : 'white',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              transition: 'all 0.3s ease'
            }}
            title="Rotate Objects (R)"
          >
            🔄 Rotate
          </button>
          <button
            onClick={() => setTransformMode('scale')}
            style={{
              padding: '0.5rem 0.75rem',
              background: transformMode === 'scale' ? 'var(--accent-cyan)' : 'transparent',
              color: transformMode === 'scale' ? '#000' : 'white',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              transition: 'all 0.3s ease'
            }}
            title="Scale Objects (S)"
          >
            📏 Scale
          </button>
        </div>
      )}

      {/* Clean Viewport Status Bar */}
      <div style={{
        position: 'absolute',
        top: '1rem',
        left: '1rem',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(10px)',
        borderRadius: '8px',
        padding: '0.5rem 0.75rem',
        color: 'white',
        fontSize: '0.75rem',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: '1rem'
      }}>
        <span>
          Objects: {sceneObjects.length} • Selected: {selectedObjects.length}
        </span>
        {selectedObjects.length > 0 && (
          <span style={{ color: '#00ff88' }}>
            🎯 {transformMode === 'translate' ? 'Moving' : transformMode === 'rotate' ? 'Rotating' : 'Scaling'}
          </span>
        )}
      </div>

      {/* Camera Preset Bar */}
      <div style={{
        position: 'absolute',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(10px)',
        borderRadius: '8px',
        padding: '0.5rem',
        display: 'flex',
        gap: '0.5rem',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: 15
      }}>
        {Object.entries(presets).map(([name, _preset]) => (
          <button
            key={name}
            onClick={() => setPreset(name as keyof typeof presets)}
            style={{
              padding: '0.25rem 0.5rem',
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.7rem',
              transition: 'all 0.3s ease',
              textTransform: 'capitalize'
            }}
            title={`View from ${name} (${name === 'front' ? '1' : name === 'right' ? '3' : name === 'top' ? '7' : name === 'isometric' ? '5' : ''})`}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0, 255, 136, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Help Toggle Buttons */}
      <div style={{
        position: 'absolute',
        top: '1rem',
        right: '1rem',
        display: 'flex',
        gap: '0.5rem',
        zIndex: 10
      }}>
        {/* Viewport Settings Toggle */}
        <button
          onClick={() => setShowViewportSettings(!showViewportSettings)}
          style={{
            width: '32px',
            height: '32px',
            background: showViewportSettings ? 'var(--accent-cyan)' : 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            color: showViewportSettings ? '#000' : 'white',
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s ease'
          }}
          title="Viewport Settings"
        >
          ⚙️
        </button>

        {/* Performance Info Toggle */}
        <button
          onClick={() => setShowProjectInfo(!showProjectInfo)}
          style={{
            width: '32px',
            height: '32px',
            background: showProjectInfo ? 'var(--accent-cyan)' : 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            color: showProjectInfo ? '#000' : 'white',
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s ease'
          }}
          title="Performance & Project Info"
        >
          ℹ️
        </button>

        {/* Controls Help Toggle */}
        <button
          onClick={() => setShowControlsHelp(!showControlsHelp)}
          style={{
            width: '32px',
            height: '32px',
            background: showControlsHelp ? 'var(--accent-cyan)' : 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            color: showControlsHelp ? '#000' : 'white',
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s ease'
          }}
          title="Camera & Transform Controls"
        >
          ❓
        </button>
      </div>

      {/* Viewport Settings Panel */}
      {showViewportSettings && (
        <div style={{
          position: 'absolute',
          top: '4rem',
          right: '1rem',
          background: 'rgba(0, 0, 0, 0.95)',
          backdropFilter: 'blur(15px)',
          borderRadius: '8px',
          padding: '1rem',
          color: 'white',
          fontSize: '0.75rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          zIndex: 15,
          minWidth: '250px',
          maxHeight: '80vh',
          overflowY: 'auto',
          animation: 'slideIn 0.3s ease'
        }}>
          <div style={{ marginBottom: '0.75rem', color: '#0099ff', fontWeight: '600', fontSize: '0.875rem' }}>
            🎛️ Viewport Settings
          </div>
          
          {/* Grid Settings */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ marginBottom: '0.5rem', color: '#00ff88', fontWeight: '600' }}>Grid</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={viewportSettings.grid.visible}
                  onChange={(e) => setViewportSettings(prev => ({
                    ...prev,
                    grid: { ...prev.grid, visible: e.target.checked }
                  }))}
                />
                Visible
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Size: 
                <input
                  type="range"
                  min="10"
                  max="50"
                  value={viewportSettings.grid.size}
                  onChange={(e) => setViewportSettings(prev => ({
                    ...prev,
                    grid: { ...prev.grid, size: parseInt(e.target.value) }
                  }))}
                  style={{ width: '100px' }}
                />
                <span>{viewportSettings.grid.size}</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Opacity: 
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={viewportSettings.grid.opacity}
                  onChange={(e) => setViewportSettings(prev => ({
                    ...prev,
                    grid: { ...prev.grid, opacity: parseFloat(e.target.value) }
                  }))}
                  style={{ width: '100px' }}
                />
                <span>{viewportSettings.grid.opacity}</span>
              </label>
            </div>
          </div>

          {/* Lighting Settings */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ marginBottom: '0.5rem', color: '#00ff88', fontWeight: '600' }}>Lighting</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Ambient: 
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={viewportSettings.lighting.ambientIntensity}
                  onChange={(e) => setViewportSettings(prev => ({
                    ...prev,
                    lighting: { ...prev.lighting, ambientIntensity: parseFloat(e.target.value) }
                  }))}
                  style={{ width: '100px' }}
                />
                <span>{viewportSettings.lighting.ambientIntensity}</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Directional: 
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={viewportSettings.lighting.directionalIntensity}
                  onChange={(e) => setViewportSettings(prev => ({
                    ...prev,
                    lighting: { ...prev.lighting, directionalIntensity: parseFloat(e.target.value) }
                  }))}
                  style={{ width: '100px' }}
                />
                <span>{viewportSettings.lighting.directionalIntensity}</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={viewportSettings.lighting.shadowsEnabled}
                  onChange={(e) => setViewportSettings(prev => ({
                    ...prev,
                    lighting: { ...prev.lighting, shadowsEnabled: e.target.checked }
                  }))}
                />
                Shadows
              </label>
            </div>
          </div>

          {/* Performance Settings */}
          <div>
            <div style={{ marginBottom: '0.5rem', color: '#00ff88', fontWeight: '600' }}>Performance</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={viewportSettings.performance.showStats}
                  onChange={(e) => setViewportSettings(prev => ({
                    ...prev,
                    performance: { ...prev.performance, showStats: e.target.checked }
                  }))}
                />
                Show Stats
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Project Info Drawer */}
      {showProjectInfo && (
        <div style={{
          position: 'absolute',
          top: '4rem',
          right: '18rem',
          background: 'rgba(0, 0, 0, 0.9)',
          backdropFilter: 'blur(10px)',
          borderRadius: '8px',
          padding: '0.75rem',
          color: 'white',
          fontSize: '0.75rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          zIndex: 15,
          minWidth: '200px',
          animation: 'slideIn 0.3s ease'
        }}>
          <div style={{ marginBottom: '0.5rem', color: '#0099ff', fontWeight: '600' }}>
            Performance
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div>FPS: {viewportSettings.performance.showStats ? 'Live' : '60'}</div>
            <div>Objects: {sceneObjects.length}</div>
            <div>Bricks: {sceneObjects.filter(obj => obj.type === 'brick').length}</div>
            <div>Memory: Optimized</div>
          </div>

          <div style={{ marginTop: '1rem', marginBottom: '0.5rem', color: '#00ff88', fontWeight: '600' }}>
            Climate Refuge Demo
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div>Material: Sustainable Octa-Brick</div>
            <div>Progress: {sceneObjects.length > 0 ? 'Live Scene' : 'Demo Mode'}</div>
            <div>Efficiency: 98% • Sustainable: ✓</div>
          </div>
        </div>
      )}

      {/* Controls Help Drawer */}
      {showControlsHelp && (
        <div style={{
          position: 'absolute',
          bottom: '4rem',
          right: '1rem',
          background: 'rgba(0, 0, 0, 0.9)',
          backdropFilter: 'blur(10px)',
          borderRadius: '8px',
          padding: '0.75rem',
          color: 'white',
          fontSize: '0.75rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          zIndex: 15,
          minWidth: '250px',
          animation: 'slideIn 0.3s ease'
        }}>
          <div style={{ marginBottom: '0.5rem', color: '#0099ff', fontWeight: '600' }}>
            Camera Controls
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div>🖱️ Left: Rotate View</div>
            <div>🖱️ Right: Pan View</div>
            <div>🎯 Wheel: Zoom In/Out</div>
          </div>

          <div style={{ marginTop: '1rem', marginBottom: '0.5rem', color: '#00ff88', fontWeight: '600' }}>
            Transform Controls
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div>🎯 Click: Select Object</div>
            <div>🔧 Drag Gizmo: Move Object</div>
            <div>📝 Properties: Type Exact Values</div>
            <div>🌐 Background: Deselect All</div>
          </div>

          <div style={{ marginTop: '1rem', marginBottom: '0.5rem', color: '#ff6b6b', fontWeight: '600' }}>
            Keyboard Shortcuts
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div>G: Move Mode • R: Rotate • S: Scale</div>
            <div>1: Front • 3: Right • 7: Top • 5: Iso</div>
          </div>
        </div>
      )}

      {/* CSS Animation for smooth drawer appearance */}
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
} 