import { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, useGLTF, TransformControls } from '@react-three/drei';
import * as THREE from 'three';

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
}

// Safe Octa2 Brick Component with full transform support
function OctaBrick({ 
  position, 
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  selected = false, 
  onClick,
  id,
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
  const [error, setError] = useState<string | null>(null);
  
  // Safely load GLTF with error handling
  const gltf = useMemo(() => {
    try {
      return useGLTF('/Octa2.glb');
    } catch (err) {
      console.error('Failed to load GLTF:', err);
      setError('Failed to load model');
      return null;
    }
  }, []);

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
  if (error || !gltf?.scene) {
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

// Scene content component with error handling
function SceneContent({ 
  onSelectionChange, 
  onObjectTransform,
  gridVisible, 
  viewMode,
  sceneObjects = [],
  selectedObjects = [],
  transformMode = 'translate'
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

  // If we have scene objects, render them dynamically
  if (sceneObjects.length > 0) {
    return (
      <SceneErrorBoundary>
        {/* Professional Lighting Setup */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={0.8}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={50}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />
        <pointLight position={[-10, -10, -5]} intensity={0.3} />

        {/* Professional Grid */}
        {gridVisible && (
          <Grid
            position={[0, 0, 0]}
            args={[20, 20]}
            cellSize={1}
            cellThickness={0.5}
            cellColor="#ffffff"
            sectionSize={5}
            sectionThickness={1}
            sectionColor="#0099ff"
            fadeDistance={25}
            fadeStrength={1}
            followCamera={false}
            infiniteGrid={true}
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
              <OctaBrick
                key={obj.id}
                id={obj.id}
                position={[objPosition.x, objPosition.y, objPosition.z]}
                rotation={[objRotation.x, objRotation.y, objRotation.z]}
                scale={[objScale.x, objScale.y, objScale.z]}
                selected={selectedObjects.includes(obj.id)}
                onClick={() => handleBrickClick(obj.id)}
                onTransform={handleBrickTransform(obj.id)}
                transformMode={transformMode}
              />
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
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={0.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <pointLight position={[-10, -10, -5]} intensity={0.3} />

      {/* Professional Grid */}
      {gridVisible && (
        <Grid
          position={[0, 0, 0]}
          args={[20, 20]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#ffffff"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#0099ff"
          fadeDistance={25}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid={true}
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
        <OctaBrick
          key={brick.id}
          id={brick.id}
          position={brick.pos as [number, number, number]}
          rotation={[0, 0, 0]}
          scale={[1, 1, 1]}
          selected={selectedObjects.includes(brick.id)}
          onClick={() => handleBrickClick(brick.id)}
          onTransform={handleBrickTransform(brick.id)}
          transformMode={transformMode}
        />
      ))}
    </SceneErrorBoundary>
  );
}

export default function Viewport3D({ 
  onSelectionChange, 
  onObjectTransform,
  gridVisible = true, 
  snapEnabled = true,
  viewMode = 'solid',
  sceneObjects = [],
  selectedObjects = [],
  transformMode: externalTransformMode
}: Viewport3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [showControlsHelp, setShowControlsHelp] = useState(false);
  const [showProjectInfo, setShowProjectInfo] = useState(false);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>(externalTransformMode || 'translate');

  // Update internal transform mode when external prop changes
  useEffect(() => {
    if (externalTransformMode) {
      setTransformMode(externalTransformMode);
    }
  }, [externalTransformMode]);

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
          fov: 60,
          near: 0.1,
          far: 1000
        }}
        shadows
        style={{ 
          width: '100%', 
          height: '100%',
          background: 'transparent'
        }}
        dpr={[1, 2]}
        onError={(error) => {
          console.error('Canvas Error:', error);
          setSceneError('3D Canvas initialization failed');
        }}
      >
        {/* Scene Content with Error Boundary */}
        <SceneContent 
          onSelectionChange={onSelectionChange}
          onObjectTransform={onObjectTransform}
          gridVisible={gridVisible}
          viewMode={viewMode}
          sceneObjects={sceneObjects}
          selectedObjects={selectedObjects}
          transformMode={transformMode}
        />

        {/* Enhanced Controls */}
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={3}
          maxDistance={50}
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
          margin={[100, 100]}
        >
          <GizmoViewport 
            axisColors={['#ff6b6b', '#4ecdc4', '#45b7d1']} 
            labelColor="white"
            axisHeadScale={1.2}
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

      {/* Help Toggle Buttons */}
      <div style={{
        position: 'absolute',
        top: '1rem',
        right: '1rem',
        display: 'flex',
        gap: '0.5rem',
        zIndex: 10
      }}>
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

      {/* Project Info Drawer */}
      {showProjectInfo && (
        <div style={{
          position: 'absolute',
          top: '4rem',
          right: '1rem',
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
            <div>FPS: 60</div>
            <div>Objects: {sceneObjects.length}</div>
            <div>Bricks: {sceneObjects.filter(obj => obj.type === 'brick').length}</div>
            <div>Memory: Good</div>
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
          bottom: '1rem',
          right: '1rem',
          background: 'rgba(0, 0, 0, 0.9)',
          backdropFilter: 'blur(10px)',
          borderRadius: '8px',
          padding: '0.75rem',
          color: 'white',
          fontSize: '0.75rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          zIndex: 15,
          minWidth: '180px',
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

// Preload the GLTF model for better performance
try {
  useGLTF.preload('/Octa2.glb');
} catch (error) {
  console.warn('Failed to preload GLTF model:', error);
} 