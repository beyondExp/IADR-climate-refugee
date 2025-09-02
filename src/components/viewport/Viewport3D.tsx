import React, { useRef, useEffect, useState, useMemo, Suspense, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, useGLTF, Stats, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import { formCreator } from '../../utils/formCreator';
import ContextMenu, { type ContextMenuOption } from '../ui/ContextMenu';

// Preload the GLTF file for better performance
useGLTF.preload('/Octa.glb');

interface SceneObject {
  id: string;
  name: string;
  type: 'brick' | 'anchor' | 'group' | 'form' | 'shape' | 'wall' | 'revolutionary-brick';
  visible: boolean;
  locked: boolean;
  children?: SceneObject[];
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  brickType?: string;
  
  // Form properties
  formId?: string;
  formParameters?: any;
  isHollow?: boolean;
  
  // Complex building creator properties (for future use)
  shapeId?: string;
  shapeParameters?: Record<string, any>;
  wallDefinition?: any;
  revolutionaryBrickData?: any;
  csgOperation?: string;
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
  onDuplicateObjects?: (objectIds: string[]) => void;
  onDeleteObjects?: (objectIds: string[]) => void;
  onToggleVisibility?: (objectIds: string[]) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  connectionMode?: boolean;
  connectionConfigs?: Record<string, any>;
}

// Form Renderer Component for geometric shapes
function FormRenderer({ 
  id,
  formId,
  formParameters = {},
  customGeometry,
  material,
  isHollow = false,
  position, 
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  selected = false,
  selectionOrder = 0, // 0 = not selected, 1 = first selected, 2 = second selected
  onClick,
  onTransform,
  transformMode = 'translate',
  totalSelected = 1 // New prop to know total selection count
}: { 
  id: string;
  formId: string;
  formParameters: any;
  customGeometry?: THREE.BufferGeometry;
  material?: {
    color?: string;
    metalness?: number;
    roughness?: number;
    opacity?: number;
    transparent?: boolean;
  };
  isHollow: boolean;
  position: [number, number, number]; 
  rotation?: [number, number, number];
  scale?: [number, number, number];
  selected?: boolean;
  selectionOrder?: number; // New prop for selection order
  onClick?: (event?: any) => void;
  onTransform?: (transforms: { 
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
  }) => void;
  transformMode?: 'translate' | 'rotate' | 'scale';
  totalSelected?: number; // New prop for total selection count
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera, raycaster } = useThree();
  
  // Generate geometry from form creator or use custom geometry
  const geometry = useMemo(() => {
    console.log(`🔄 FormRenderer: Regenerating geometry for ${id}, formId: ${formId}`);
    console.log(`📋 FormParameters keys:`, formParameters ? Object.keys(formParameters) : 'none');
    console.log(`🎮 Has custom geometry:`, !!customGeometry);
    
    // Use custom geometry if provided
    if (customGeometry) {
      console.log(`✅ Using custom geometry with ${customGeometry.attributes.position.count} vertices`);
      return customGeometry;
    }
    
    const geom = formCreator.createFormGeometry(formId, formParameters);
    if (!geom) {
      console.warn(`Failed to create geometry for form ${formId}`);
      return new THREE.BoxGeometry(1, 1, 1); // Fallback geometry
    }
    
    // For custom geometries (like voxel visualizations), clone to ensure React detects changes
    const finalGeom = formId === 'custom-csg' && formParameters?.customGeometry ? geom.clone() : geom;
    
    console.log(`✅ Created geometry with ${finalGeom.attributes.position.count} vertices`);
    return finalGeom;
  }, [formId, formParameters, customGeometry, (formParameters as any)?._voxelUpdateKey]);

  // Material based on hollow state, selection order, and vertex colors support
  const meshMaterial = useMemo(() => {
    // Use custom material if provided
    if (material) {
      return new THREE.MeshPhysicalMaterial({
        color: material.color || '#e0e0e0',
        metalness: material.metalness || 0.1,
        roughness: material.roughness || 0.8,
        opacity: material.opacity || 0.9,
        transparent: material.transparent || false,
        side: THREE.DoubleSide
      });
    }
    
    let baseColor: string;
    
    if (selectionOrder === 1) {
      // First selected form - green (base/target)
      baseColor = '#00ff88';
    } else if (selectionOrder === 2) {
      // Second selected form - orange/red (cutter/operand)
      baseColor = '#ff4444';
    } else if (selected) {
      // Fallback for other selection states
      baseColor = '#00ff88';
    } else {
      // Not selected - default colors
      baseColor = isHollow ? '#4a9eff' : '#ff6b9d';
    }
    
    // Check if this is a custom geometry with vertex colors (e.g., voxel visualization)
    const hasVertexColors = formId === 'custom-csg' && formParameters?.customGeometry?.attributes?.color;
    
    return new THREE.MeshLambertMaterial({
      color: hasVertexColors ? 0xffffff : baseColor, // Use white when vertex colors present
      vertexColors: hasVertexColors, // Enable vertex colors for voxel visualizations
      transparent: false,
      opacity: 0.9,
      wireframe: false,
      side: isHollow ? THREE.DoubleSide : THREE.FrontSide
    });
  }, [selected, selectionOrder, isHollow, formId, formParameters, material]);

  // Handle clicks with proper raycasting for voxel editing
  const handleMeshClick = useCallback((event: any) => {
    
    // Don't stop propagation immediately - let it bubble first
    // event.stopPropagation();
    
    // Check if this is a voxel mesh that needs world coordinates
    if (formParameters?.isVoxelMesh && meshRef.current) {
      
      // Calculate world coordinates using raycasting
      const mouse = new THREE.Vector2();
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      
      console.log(`📍 Mouse coordinates:`, { 
        screen: { x: event.clientX, y: event.clientY },
        normalized: { x: mouse.x, y: mouse.y }
      });
      
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(meshRef.current);
      
      console.log(`🎲 Raycasting results: ${intersects.length} intersections`);
      
      if (intersects.length > 0) {
        const intersection = intersects[0];
        console.log(`✅ World intersection point:`, intersection.point);
        
        // Debug face information
        if (intersection.face) {
          console.log(`🔍 Face normal:`, intersection.face.normal);
        console.log(`🔍 Intersected object:`, intersection.object.type, intersection.object.name || 'unnamed');
        console.log(`🔍 Object position:`, intersection.object.position);
        console.log(`🔍 Object scale:`, intersection.object.scale);
          console.log(`🔍 Face index:`, intersection.faceIndex);
          
          // Calculate potential offset position using face normal
          const offsetPoint = intersection.point.clone().add(
            intersection.face.normal.clone().multiplyScalar(0.01) // Small offset along normal
          );
          console.log(`🔍 Offset point:`, offsetPoint);
        }
        
        // Add world point to event for voxel editing
        const enhancedEvent = {
          ...event,
          point: intersection.point,
          face: intersection.face,
          faceIndex: intersection.faceIndex
        };
        
        console.log(`🎯 Calling onClick with enhanced event`);
        onClick?.(enhancedEvent);
        
        // Stop propagation after handling
        event.stopPropagation();
        return;
      } else {
        console.log(`❌ No intersections found with voxel mesh`);
      }
    }
    
    // Regular click without world coordinates
    console.log(`📝 Regular click (non-voxel mesh)`);
    onClick?.(event);
    
    // Stop propagation for non-voxel clicks too
    event.stopPropagation();
  }, [formParameters, camera, raycaster, onClick, id, formId]);

  // Handle hover for voxel preview
  const handleMeshHover = useCallback((event: any) => {
    if (formParameters?.isVoxelMesh && meshRef.current) {
      // Calculate world coordinates using raycasting
      const mouse = new THREE.Vector2();
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(meshRef.current);
      
      if (intersects.length > 0) {
        const intersection = intersects[0];
        
        // Convert to voxel coordinates for hover preview
        const { voxelResolution, voxelBounds } = formParameters;
        
        if (voxelResolution && voxelBounds) {
          const worldPoint = intersection.point;
          
          // Account for mesh position offset
          const localPoint = worldPoint.clone();
          localPoint.sub(new THREE.Vector3(position[0], position[1], position[2]));
          
          console.log(`🔄 HOVER transform: world(${worldPoint.x.toFixed(3)}, ${worldPoint.y.toFixed(3)}, ${worldPoint.z.toFixed(3)}) → local(${localPoint.x.toFixed(3)}, ${localPoint.y.toFixed(3)}, ${localPoint.z.toFixed(3)})`);
          console.log(`📍 MESH POSITION: (${position[0].toFixed(3)}, ${position[1].toFixed(3)}, ${position[2].toFixed(3)}), ROTATION: (${rotation[0].toFixed(3)}, ${rotation[1].toFixed(3)}, ${rotation[2].toFixed(3)})`);
          
          // Use original voxelBounds but calculate coordinates properly
          // The mesh is positioned at (0, 1, 0) so localPoint is already adjusted for that
          const voxelX = Math.floor((localPoint.x - voxelBounds.min.x) / voxelResolution);
          const voxelY = Math.floor((localPoint.y - voxelBounds.min.y) / voxelResolution);
          const voxelZ = Math.floor((localPoint.z - voxelBounds.min.z) / voxelResolution);
          
          // Debug: Show coordinate calculation and intersection details
          if (voxelX >= 0 && voxelY >= 0 && voxelZ >= 0) {
            console.log(`🎯 HOVER calculation: worldPoint(${worldPoint.x.toFixed(3)}, ${worldPoint.y.toFixed(3)}, ${worldPoint.z.toFixed(3)}) → voxel(${voxelX}, ${voxelY}, ${voxelZ})`);
            console.log(`🎯 HOVER bounds: min(${voxelBounds.min.x.toFixed(3)}, ${voxelBounds.min.y.toFixed(3)}, ${voxelBounds.min.z.toFixed(3)}) max(${voxelBounds.max.x.toFixed(3)}, ${voxelBounds.max.y.toFixed(3)}, ${voxelBounds.max.z.toFixed(3)}) resolution: ${voxelResolution.toFixed(3)}`);
          
          // Compare with actual foundation/roof bounds from logs
          console.log(`🔍 BOUNDS ANALYSIS:`);
          console.log(`   🎯 Voxel bounds claim Y range: ${voxelBounds.min.y.toFixed(3)} to ${voxelBounds.max.y.toFixed(3)}`);
          console.log(`   🏗️ Foundation logs show: grid[0-4] world[-1.1 to -0.7]`);
          console.log(`   🔴 Roof logs show: grid[17-20] world[0.7 to 0.9]`);
          console.log(`   ❓ These should match! If not, voxel bounds are wrong.`);
            
            // Calculate where this voxel should appear visually using the mesh position offset
            // Since the mesh is at (0, 1, 0), add that offset to the voxel world position
            const voxelWorldX = voxelBounds.min.x + ((voxelX + 0.5) * voxelResolution);
            const voxelWorldY = voxelBounds.min.y + ((voxelY + 0.5) * voxelResolution);
            const voxelWorldZ = voxelBounds.min.z + ((voxelZ + 0.5) * voxelResolution);
            
            // Add mesh position offset to get expected visual position
            const expectedVisualX = voxelWorldX + position[0];
            const expectedVisualY = voxelWorldY + position[1];
            const expectedVisualZ = voxelWorldZ + position[2];
            
            console.log(`🔧 CORRECTED expected position: (${expectedVisualX.toFixed(3)}, ${expectedVisualY.toFixed(3)}, ${expectedVisualZ.toFixed(3)})`);
            console.log(`🎯 EXPECTED VISUAL: voxel(${voxelX}, ${voxelY}, ${voxelZ}) should appear at world(${expectedVisualX.toFixed(3)}, ${expectedVisualY.toFixed(3)}, ${expectedVisualZ.toFixed(3)})`);
          
          // Enhanced raycast debugging
          const rayOrigin = raycaster.ray.origin;
          const hitDistance = rayOrigin.distanceTo(worldPoint);
          const cameraDistance = rayOrigin.length(); // Distance from origin
          
          console.log(`📏 DISTANCE ANALYSIS:`);
          console.log(`   📷 Camera position: (${rayOrigin.x.toFixed(3)}, ${rayOrigin.y.toFixed(3)}, ${rayOrigin.z.toFixed(3)})`);
          console.log(`   📏 Camera distance from origin: ${cameraDistance.toFixed(3)}`);
          console.log(`   🎯 Ray hit distance: ${hitDistance.toFixed(3)}`);
          const offsetX = worldPoint.x - expectedVisualX;
          const offsetY = worldPoint.y - expectedVisualY; 
          const offsetZ = worldPoint.z - expectedVisualZ;
          const totalOffset = Math.sqrt(offsetX*offsetX + offsetY*offsetY + offsetZ*offsetZ);
          
          console.log(`🔫 ===== RAYCAST DEBUG ANALYSIS =====`);
          console.log(`📍 Ray Origin: (${rayOrigin.x.toFixed(3)}, ${rayOrigin.y.toFixed(3)}, ${rayOrigin.z.toFixed(3)})`);
          console.log(`🎯 Hit Point:  (${worldPoint.x.toFixed(3)}, ${worldPoint.y.toFixed(3)}, ${worldPoint.z.toFixed(3)}) ← WHERE RAY HITS`);
          console.log(`✅ Expected:   (${expectedVisualX.toFixed(3)}, ${expectedVisualY.toFixed(3)}, ${expectedVisualZ.toFixed(3)}) ← WHERE VOXEL CENTER IS`);
          console.log(`❌ OFFSET:     (${offsetX.toFixed(3)}, ${offsetY.toFixed(3)}, ${offsetZ.toFixed(3)}) TOTAL: ${totalOffset.toFixed(3)}`);
          console.log(`📐 Resolution: ${voxelResolution.toFixed(3)} (Half: ${(voxelResolution/2).toFixed(3)})`);
          console.log(`🔍 Offset as % of voxel size: X:${(Math.abs(offsetX)/voxelResolution*100).toFixed(1)}% Y:${(Math.abs(offsetY)/voxelResolution*100).toFixed(1)}% Z:${(Math.abs(offsetZ)/voxelResolution*100).toFixed(1)}%`);
          console.log(`🔧 Distance vs Offset correlation: Distance=${cameraDistance.toFixed(1)}, Offset=${totalOffset.toFixed(3)}`);
          console.log(`=====================================`);
          
          // SOLUTION: For large offsets, snap to voxel grid instead of using imprecise raycast
          if (totalOffset > voxelResolution * 0.5) { // If offset > 50% of voxel size
            console.log(`🎯 SNAPPING: Offset too large (${totalOffset.toFixed(3)} = ${(totalOffset/voxelResolution*100).toFixed(1)}% of voxel)`);
            console.log(`   📍 Using calculated voxel center instead of raycast hit point`);
            
            // Override the hover coordinates with the calculated voxel center
            const snappedX = expectedVisualX;
            const snappedY = expectedVisualY; 
            const snappedZ = expectedVisualZ;
            
            console.log(`   ✅ Snapped to voxel center: (${snappedX.toFixed(3)}, ${snappedY.toFixed(3)}, ${snappedZ.toFixed(3)})`);
            
            // Update the global hover data to use snapped coordinates
            (window as any).raycastDebug = {
              rayOrigin: rayOrigin.clone(),
              hitPoint: new THREE.Vector3(snappedX, snappedY, snappedZ), // Use snapped position
              expectedPoint: new THREE.Vector3(expectedVisualX, expectedVisualY, expectedVisualZ),
              show: true,
              wasSnapped: true
            };
          }
          
          // Store debug info globally for visual rendering
          (window as any).raycastDebug = {
            rayOrigin: rayOrigin.clone(),
            hitPoint: worldPoint.clone(),
            expectedPoint: new THREE.Vector3(expectedVisualX, expectedVisualY, expectedVisualZ),
            show: true
          };
          
          // Temporarily show offset in browser title for quick visual feedback
          const originalTitle = document.title;
          document.title = `OFFSET: (${offsetX.toFixed(3)}, ${offsetY.toFixed(3)}, ${offsetZ.toFixed(3)}) - TOTAL: ${totalOffset.toFixed(3)}`;
          setTimeout(() => {
            document.title = originalTitle;
          }, 2000);
          
          // Store debug ray data for visual rendering
          (window as any).debugRayData = {
            start: rayOrigin.clone(),
            end: worldPoint.clone(),
            hitPoint: worldPoint.clone(),
            expectedPoint: new THREE.Vector3(expectedVisualX, expectedVisualY, expectedVisualZ),
            timestamp: Date.now()
          };
          }
          
          // Only log significant offsets for debugging
          // Note: Voxels are positioned at their centers, so add 0.5 offset
          const expectedWorldX = voxelBounds.min.x + ((voxelX + 0.5) * voxelResolution);
          const expectedWorldY = voxelBounds.min.y + ((voxelY + 0.5) * voxelResolution); // No Y offset needed with aligned coordinates
          const expectedWorldZ = voxelBounds.min.z + ((voxelZ + 0.5) * voxelResolution);
          const offsetX = worldPoint.x - expectedWorldX;
          const offsetY = worldPoint.y - expectedWorldY;
          const offsetZ = worldPoint.z - expectedWorldZ;
          
          // Only log if offset is significant (debugging)
          if (Math.abs(offsetX) > 0.2 || Math.abs(offsetY) > 0.2 || Math.abs(offsetZ) > 0.2) {
            console.log(`⚠️ Large hover offset: (${offsetX.toFixed(3)}, ${offsetY.toFixed(3)}, ${offsetZ.toFixed(3)})`);
          }
          
          // Call hover callback if available
          if ((window as any).handleVoxelHover) {
            (window as any).handleVoxelHover(voxelX, voxelY, voxelZ);
          }
        }
      }
    }
  }, [formParameters, camera, raycaster]);

  // Handle hover end
  const handleMeshHoverEnd = useCallback(() => {
    if ((window as any).handleVoxelHoverEnd) {
      (window as any).handleVoxelHoverEnd();
    }
  }, []);

  // Handle transform changes
  const handleTransformChange = useCallback(() => {
    if (meshRef.current && onTransform) {
      const mesh = meshRef.current;
      onTransform({
        position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
        rotation: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
        scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z }
      });
    }
  }, [onTransform]);

  // Force geometry update when it changes
  useEffect(() => {
    if (meshRef.current && geometry) {
      console.log(`🔄 Updating mesh geometry for ${id}`);
      meshRef.current.geometry = geometry;
      meshRef.current.geometry.computeBoundingBox();
      meshRef.current.geometry.computeBoundingSphere();
    }
  }, [geometry, id]);

  return (
    <group>
      <mesh
        ref={meshRef}
        position={position}
        rotation={rotation}
        scale={scale}
        onClick={handleMeshClick}
        onPointerMove={handleMeshHover}
        onPointerLeave={handleMeshHoverEnd}
        onPointerEnter={() => {
          document.body.style.cursor = formParameters?.isVoxelMesh ? 'crosshair' : 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
        geometry={geometry}
        material={meshMaterial}
      />
      
      {/* Transform Controls - only show for single selection and not in voxel mode */}
      {selected && totalSelected === 1 && !formParameters?.isVoxelMesh && (
        <TransformControls
          object={meshRef.current!}
          mode={transformMode}
          onMouseUp={handleTransformChange}
          size={0.8}
          showX={true}
          showY={true}
          showZ={true}
        />
      )}
      
      {/* No need for visual indicator - hollow forms now have real geometry */}
    </group>
  );
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
  transformMode = 'translate',
  totalSelected = 1
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
  totalSelected?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  
  // Load GLTF with Suspense boundary handling
  const gltf = useGLTF('/Octa.glb');
  
  // Validate GLTF loading
  useEffect(() => {
    console.log('🧱 OctaBrick GLTF loading status:', { 
      loaded: !!gltf, 
      hasScene: !!gltf?.scene,
      sceneChildren: gltf?.scene?.children?.length || 0
    });
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
        // Direct scale without any adjustment
        transforms.scale = {
          x: Number(worldScale.x.toFixed(2)),
          y: Number(worldScale.y.toFixed(2)),
          z: Number(worldScale.z.toFixed(2))
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
          scale={[scale[0], scale[1], scale[2]]}
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
      
      // Safely traverse and keep original materials
      clone.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Keep original material but apply selection state if needed
          if (selected && child.material) {
            // Clone original material and modify for selection
            const originalMat = child.material as THREE.MeshStandardMaterial;
            child.material = originalMat.clone();
            (child.material as THREE.MeshStandardMaterial).emissive = new THREE.Color('#003322');
            (child.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3;
          }
          // Otherwise keep the original material as-is
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      return clone;
    } catch (err) {
      console.error('Failed to clone scene:', err);
      return null;
    }
  }, [gltf?.scene, selected]);

  return (
    <group>
      <group 
        ref={groupRef}
        position={position} 
        rotation={rotation}
        scale={[scale[0], scale[1], scale[2]]}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
      >
        {clonedScene ? (
          <primitive object={clonedScene} />
        ) : (
          // Fallback geometry if GLTF fails
          <mesh>
            <octahedronGeometry args={[0.5, 0]} />
            <meshStandardMaterial color={selected ? '#00ff88' : '#8B4513'} />
          </mesh>
        )}
        
        {/* Selection outline - only if selected */}
        {selected && (
          <mesh scale={[1.1, 1.1, 1.1]} position={[0, 0, 0]}>
            <boxGeometry args={[1, 1, 1]} />
            <primitive object={materials.outlineMaterial} />
          </mesh>
        )}
      </group>
      
      {/* Transform Controls - Professional Gizmo with all modes (only for single selection) */}
      {selected && totalSelected === 1 && groupRef.current && (
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
  const lastTime = useRef(performance.now());
  const frameCountRef = useRef(0);

  useFrame(() => {
    frameCountRef.current++;
    const currentTime = performance.now();
    
    if (currentTime - lastTime.current >= 1000) {
      // Performance tracking without storing unused values
      frameCountRef.current = 0;
      lastTime.current = currentTime;
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
    
    const applyPreset = () => {
      if (cameraRef.current && controlsRef.current) {
        // Smooth transition to preset
        const [x, y, z] = preset.position;
        const [tx, ty, tz] = preset.target;
        
        cameraRef.current.position.set(x, y, z);
        controlsRef.current.target.set(tx, ty, tz);
        controlsRef.current.update();
        
        return true;
      }
      return false;
    };

    // Try immediately first
    if (!applyPreset()) {
      // Retry after a short delay to allow Three.js to initialize
      setTimeout(() => {
        if (!applyPreset()) {
          console.warn(`⚠️ Cannot set camera preset "${presetName}": camera or controls not ready`);
        }
      }, 100);
    }
  }, [presets, cameraRef, controlsRef]);

  return { presets, setPreset };
}

// Simplified camera capture component
function CameraCapture({ 
  cameraRef 
}: { 
  cameraRef?: React.RefObject<THREE.PerspectiveCamera | null>;
}) {
  const { camera } = useThree();
  
  useEffect(() => {
    if (!cameraRef || cameraRef.current) return;
    
    if (camera) {
      (cameraRef as any).current = camera;
    }
  }, [camera, cameraRef]);
  
  // Try via useFrame as backup
  useFrame((state) => {
    if (!cameraRef || cameraRef.current || !state.camera) return;
    
    (cameraRef as any).current = state.camera;
  });
  
  return null;
}

// Group Transform Controls for multi-object selection
function GroupTransformControls({
  selectedObjects,
  sceneObjects,
  transformMode,
  onTransform
}: {
  selectedObjects: string[];
  sceneObjects: SceneObject[];
  transformMode: 'translate' | 'rotate' | 'scale';
  onTransform: (objectId: string, transforms: { 
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
  }) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [groupCenter, setGroupCenter] = useState(new THREE.Vector3());
  const [isDragging, setIsDragging] = useState(false);
  const controlsRef = useRef<any>(null);
  
  // Calculate group center when selection changes
  useEffect(() => {
    console.log(`🎯 GroupTransformControls: Selection changed, ${selectedObjects.length} objects selected`);
    
    if (selectedObjects.length < 2) {
      console.log('📍 Less than 2 objects selected, hiding group controls');
      return;
    }
    
    const selectedObjs = sceneObjects.filter(obj => selectedObjects.includes(obj.id));
    console.log('📍 Found selected objects:', selectedObjs.length);
    
    const center = new THREE.Vector3();
    
    selectedObjs.forEach(obj => {
      const pos = obj.position || { x: 0, y: 0, z: 0 };
      center.add(new THREE.Vector3(pos.x, pos.y, pos.z));
    });
    
    center.divideScalar(selectedObjs.length);
    console.log(`📍 Group center calculated: x=${center.x.toFixed(2)}, y=${center.y.toFixed(2)}, z=${center.z.toFixed(2)}`);
    
    setGroupCenter(center);
    
    if (groupRef.current) {
      groupRef.current.position.copy(center);
    }
  }, [selectedObjects, sceneObjects]);
  
  // Handle group transform
  const handleGroupTransform = useCallback(() => {
    if (!groupRef.current || selectedObjects.length < 2) return;
    
    const newPosition = groupRef.current.position;
    const newRotation = groupRef.current.rotation;
    const newScale = groupRef.current.scale;
    
    // Calculate the transformation delta
    const deltaPos = new THREE.Vector3().subVectors(newPosition, groupCenter);
    const deltaRot = new THREE.Euler().copy(newRotation);
    const deltaScale = new THREE.Vector3().copy(newScale);
    
    // Apply relative transformation to all selected objects
    selectedObjects.forEach(objectId => {
      const obj = sceneObjects.find(o => o.id === objectId);
      if (!obj) return;
      
      const currentPos = obj.position || { x: 0, y: 0, z: 0 };
      const currentRot = obj.rotation || { x: 0, y: 0, z: 0 };
      const currentScale = obj.scale || { x: 1, y: 1, z: 1 };
      
      const transforms: { 
        position?: { x: number; y: number; z: number };
        rotation?: { x: number; y: number; z: number };
        scale?: { x: number; y: number; z: number };
      } = {};
      
      if (transformMode === 'translate') {
        transforms.position = {
          x: Number((currentPos.x + deltaPos.x).toFixed(2)),
          y: Number((currentPos.y + deltaPos.y).toFixed(2)),
          z: Number((currentPos.z + deltaPos.z).toFixed(2))
        };
      } else if (transformMode === 'rotate') {
        // For rotation, rotate around group center
        const objPosVec = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z);
        const offsetFromCenter = objPosVec.clone().sub(groupCenter);
        
        // Apply rotation to offset
        const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(deltaRot);
        offsetFromCenter.applyMatrix4(rotMatrix);
        
        // Calculate new position
        const newObjPos = groupCenter.clone().add(offsetFromCenter);
        
        transforms.position = {
          x: Number(newObjPos.x.toFixed(2)),
          y: Number(newObjPos.y.toFixed(2)),
          z: Number(newObjPos.z.toFixed(2))
        };
        
        transforms.rotation = {
          x: Number((currentRot.x + deltaRot.x).toFixed(3)),
          y: Number((currentRot.y + deltaRot.y).toFixed(3)),
          z: Number((currentRot.z + deltaRot.z).toFixed(3))
        };
      } else if (transformMode === 'scale') {
        // For scale, scale relative to group center
        const objPosVec = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z);
        const offsetFromCenter = objPosVec.clone().sub(groupCenter);
        
        // Scale the offset
        offsetFromCenter.multiply(deltaScale);
        
        // Calculate new position
        const newObjPos = groupCenter.clone().add(offsetFromCenter);
        
        transforms.position = {
          x: Number(newObjPos.x.toFixed(2)),
          y: Number(newObjPos.y.toFixed(2)),
          z: Number(newObjPos.z.toFixed(2))
        };
        
        transforms.scale = {
          x: Number((currentScale.x * deltaScale.x).toFixed(2)),
          y: Number((currentScale.y * deltaScale.y).toFixed(2)),
          z: Number((currentScale.z * deltaScale.z).toFixed(2))
        };
      }
      
      onTransform(objectId, transforms);
    });
    
    // Reset group transform after applying to objects
    if (groupRef.current) {
      groupRef.current.position.copy(groupCenter);
      groupRef.current.rotation.set(0, 0, 0);
      groupRef.current.scale.set(1, 1, 1);
    }
  }, [selectedObjects, sceneObjects, groupCenter, transformMode, onTransform]);
  
  // Only show for multiple selection
  if (selectedObjects.length < 2) {
    console.log('🚫 GroupTransformControls: Not rendering (less than 2 objects)');
    return null;
  }
  
  console.log('✅ GroupTransformControls: Rendering with center:', groupCenter.x, groupCenter.y, groupCenter.z);
  
  return (
    <>
      {/* Group for transform controls */}
      <group ref={groupRef} position={[groupCenter.x, groupCenter.y, groupCenter.z]}>
        {/* Invisible helper mesh for transform controls */}
        <mesh visible={false}>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshBasicMaterial />
        </mesh>
      </group>
      
      {/* Visual indicator at group center (separate from transform group) */}
      <mesh position={[groupCenter.x, groupCenter.y, groupCenter.z]} visible={true}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshBasicMaterial color="#00ff88" opacity={0.5} transparent />
      </mesh>
      
      {/* Group Transform Controls - attached to the group but rendered outside */}
      {groupRef.current && (
        <TransformControls
          ref={controlsRef}
          object={groupRef.current}
          mode={transformMode}
          showX={true}
          showY={true}
          showZ={true}
          size={1.2}
          onObjectChange={handleGroupTransform}
          onMouseDown={() => {
            setIsDragging(true);
            // Add a class to body to prevent deselection
            document.body.classList.add('transform-controls-active');
          }}
          onMouseUp={() => {
            setIsDragging(false);
            // Remove the class after a short delay to ensure the click event has passed
            setTimeout(() => {
              document.body.classList.remove('transform-controls-active');
            }, 100);
          }}
        />
      )}
    </>
  );
}

// Debug Ray Component for visualizing raycasting
function DebugRay() {
  const [rayData, setRayData] = useState<any>(null);

  useFrame(() => {
    // Check for debug ray data on every frame
    const data = (window as any).debugRayData;
    if (data && data.timestamp && Date.now() - data.timestamp < 5000) { // Show for 5 seconds
      setRayData(data);
      console.log('🔫 DebugRay: Found ray data:', data);
    } else {
      if (rayData) {
        console.log('🔫 DebugRay: Ray data expired, hiding ray');
      }
      setRayData(null);
    }
  });

  // ALWAYS show a test sphere to verify component is rendering
  console.log('🔫 DebugRay: Component rendering, rayData:', rayData ? 'exists' : 'null');
  
  return (
    <group>
      {/* ALWAYS VISIBLE TEST SPHERE - should appear at origin */}
      <mesh position={[0, 2, 0]}>
        <sphereGeometry args={[0.3]} />
        <meshBasicMaterial color="#ff0000" wireframe={true} />
      </mesh>
      
      {rayData && (
        <mesh position={[0, 3, 0]}>
          <sphereGeometry args={[0.2]} />
          <meshBasicMaterial color="#00ff00" />
        </mesh>
      )}
    </group>
  );

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
  onSave,
  cameraRef,
  controlsRef
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
  cameraRef?: React.RefObject<THREE.PerspectiveCamera | null>;
  controlsRef?: React.RefObject<any>;
}) {
  // Handle object selection (bricks and forms)
  const handleObjectClick = (objectId: string, event?: any) => {
    console.log(`🏠 handleObjectClick called:`, {
      objectId,
      hasEvent: !!event,
      hasEventPoint: !!event?.point,
      eventKeys: event ? Object.keys(event) : 'no event'
    });
    
    // Check if this is a voxel mesh click
    const clickedObject = sceneObjects.find(obj => obj.id === objectId);
    console.log(`🔍 Found clicked object:`, {
      found: !!clickedObject,
      isVoxelMesh: clickedObject?.formParameters?.isVoxelMesh,
      hasVoxelResolution: !!clickedObject?.formParameters?.voxelResolution,
      hasVoxelBounds: !!clickedObject?.formParameters?.voxelBounds
    });
    
    if (clickedObject?.formParameters?.isVoxelMesh && event?.point) {
      console.log(`🎯 Processing voxel click...`);
      
      // Handle voxel editing - convert world coordinates to voxel grid coordinates
      const { voxelResolution, voxelBounds } = clickedObject.formParameters;
      
      if (voxelResolution && voxelBounds) {
        const worldPoint = event.point;
        // Debug the conversion parameters
        console.log(`🔍 Conversion parameters:`, {
          worldPoint: { x: worldPoint.x.toFixed(3), y: worldPoint.y.toFixed(3), z: worldPoint.z.toFixed(3) },
          voxelBounds: {
            min: { x: voxelBounds.min.x.toFixed(3), y: voxelBounds.min.y.toFixed(3), z: voxelBounds.min.z.toFixed(3) },
            max: { x: voxelBounds.max.x.toFixed(3), y: voxelBounds.max.y.toFixed(3), z: voxelBounds.max.z.toFixed(3) }
          },
          voxelResolution: voxelResolution.toFixed(6)
        });

        // Test both coordinate interpretations
        
        // Method 1: Round to nearest (current)
        const voxelX1 = Math.round((worldPoint.x - voxelBounds.min.x) / voxelResolution);
        const voxelY1 = Math.round((worldPoint.y - voxelBounds.min.y) / voxelResolution);
        const voxelZ1 = Math.round((worldPoint.z - voxelBounds.min.z) / voxelResolution);
        
        // Method 2: Floor (which cell contains this point)
        const voxelX2 = Math.floor((worldPoint.x - voxelBounds.min.x) / voxelResolution);
        const voxelY2 = Math.floor((worldPoint.y - voxelBounds.min.y) / voxelResolution);
        const voxelZ2 = Math.floor((worldPoint.z - voxelBounds.min.z) / voxelResolution);
        
        console.log(`🎯 Method comparison:`);
        console.log(`   Round: (${voxelX1}, ${voxelY1}, ${voxelZ1})`);
        console.log(`   Floor: (${voxelX2}, ${voxelY2}, ${voxelZ2})`);
        
        // Use floor method (which voxel cell contains the point)
        const voxelX = voxelX2;
        const voxelY = voxelY2;
        const voxelZ = voxelZ2;

        // Calculate what world position this voxel should represent
        // Option A: Corner-based (current)
        const expectedWorldX_corner = voxelBounds.min.x + (voxelX * voxelResolution);
        const expectedWorldY_corner = voxelBounds.min.y + (voxelY * voxelResolution);
        const expectedWorldZ_corner = voxelBounds.min.z + (voxelZ * voxelResolution);
        
        // Option B: Center-based
        const expectedWorldX_center = voxelBounds.min.x + ((voxelX + 0.5) * voxelResolution);
        const expectedWorldY_center = voxelBounds.min.y + ((voxelY + 0.5) * voxelResolution);
        const expectedWorldZ_center = voxelBounds.min.z + ((voxelZ + 0.5) * voxelResolution);
        
        console.log(`🎯 Position comparison:`);
        console.log(`   Corner: (${expectedWorldX_corner.toFixed(3)}, ${expectedWorldY_corner.toFixed(3)}, ${expectedWorldZ_corner.toFixed(3)})`);
        console.log(`   Center: (${expectedWorldX_center.toFixed(3)}, ${expectedWorldY_center.toFixed(3)}, ${expectedWorldZ_center.toFixed(3)})`);
        
        // Use center-based positioning
        const expectedWorldX = expectedWorldX_center;
        const expectedWorldY = expectedWorldY_center;
        const expectedWorldZ = expectedWorldZ_center;

        console.log(`🎯 Voxel click: world(${worldPoint.x.toFixed(3)}, ${worldPoint.y.toFixed(3)}, ${worldPoint.z.toFixed(3)}) → grid(${voxelX}, ${voxelY}, ${voxelZ})`);
        console.log(`🎯 Expected voxel world position: (${expectedWorldX.toFixed(3)}, ${expectedWorldY.toFixed(3)}, ${expectedWorldZ.toFixed(3)})`);
        
        // Calculate the offset between click and expected position
        const offsetX = worldPoint.x - expectedWorldX;
        const offsetY = worldPoint.y - expectedWorldY;
        const offsetZ = worldPoint.z - expectedWorldZ;
        console.log(`⚠️ OFFSET: (${offsetX.toFixed(3)}, ${offsetY.toFixed(3)}, ${offsetZ.toFixed(3)})`);

        // Account for mesh position offset  
        const localPoint = worldPoint.clone();
        // Get mesh position from the scene object (we know it's positioned at Y=1)
        const meshPosition = new THREE.Vector3(0, 1, 0); // From debug logs we know mesh is at (0,1,0)
        localPoint.sub(meshPosition);
        
        console.log(`🔄 CLICK transform: world(${worldPoint.x.toFixed(3)}, ${worldPoint.y.toFixed(3)}, ${worldPoint.z.toFixed(3)}) → local(${localPoint.x.toFixed(3)}, ${localPoint.y.toFixed(3)}, ${localPoint.z.toFixed(3)})`);
        console.log(`📍 CLICKED MESH POSITION: (${meshPosition.x.toFixed(3)}, ${meshPosition.y.toFixed(3)}, ${meshPosition.z.toFixed(3)})`);
        
        // Calculate which voxel was clicked with offset correction to align with actual mesh position
        const clickedVoxelX = Math.floor((localPoint.x - voxelBounds.min.x + voxelResolution * 0.5) / voxelResolution);
        const clickedVoxelY = Math.floor((localPoint.y - voxelBounds.min.y + voxelResolution * 0.5) / voxelResolution);
        const clickedVoxelZ = Math.floor((localPoint.z - voxelBounds.min.z + voxelResolution * 0.5) / voxelResolution);
        
        console.log(`🎯 CLICK calculation: worldPoint(${localPoint.x.toFixed(3)}, ${localPoint.y.toFixed(3)}, ${localPoint.z.toFixed(3)}) → voxel(${clickedVoxelX}, ${clickedVoxelY}, ${clickedVoxelZ})`);
        console.log(`🎯 CLICK bounds: min(${voxelBounds.min.x.toFixed(3)}, ${voxelBounds.min.y.toFixed(3)}, ${voxelBounds.min.z.toFixed(3)}) resolution: ${voxelResolution.toFixed(3)}`);

        // Apply Minecraft-style placement logic
        const placementMode = (window as any).voxelPlacementMode || 'adjacent'; // Default to Minecraft-style
        let finalVoxelX = clickedVoxelX;
        let finalVoxelY = clickedVoxelY; 
        let finalVoxelZ = clickedVoxelZ;
        
        if (placementMode === 'adjacent' && event?.face) {
          // Minecraft-style: place voxel adjacent to clicked face (add new voxel, don't replace)
          let faceNormal = event.face.normal.clone();
          
          // Convert face normal to voxel offset (round to nearest integer for clean placement)
          const offsetX = Math.round(faceNormal.x);
          const offsetY = Math.round(faceNormal.y);
          const offsetZ = Math.round(faceNormal.z);
          
          // Apply offset to place new voxel adjacent to clicked one
          finalVoxelX = clickedVoxelX + offsetX;
          finalVoxelY = clickedVoxelY + offsetY;
          finalVoxelZ = clickedVoxelZ + offsetZ;
          
          console.log(`⛏️ Minecraft placement: clicked(${clickedVoxelX}, ${clickedVoxelY}, ${clickedVoxelZ}) + offset(${offsetX}, ${offsetY}, ${offsetZ}) = new(${finalVoxelX}, ${finalVoxelY}, ${finalVoxelZ})`);
          
          // Transform face normal to local space if mesh has transforms
          // Note: Simplified - assuming mesh at origin for now
          if (false) { // Disabled mesh transform check for now
            // Convert normal from world to local space
            const normalMatrix = new THREE.Matrix3();
            const localNormal = faceNormal.clone().applyMatrix3(normalMatrix.invert()).normalize();
            console.log(`🧩 Local face normal:`, {
              x: localNormal.x.toFixed(6),
              y: localNormal.y.toFixed(6), 
              z: localNormal.z.toFixed(6),
              length: localNormal.length().toFixed(6)
            });
            faceNormal = localNormal;
          }
          
          // Store original coordinates before offset
          const originalVoxelX = clickedVoxelX;
          const originalVoxelY = clickedVoxelY;
          const originalVoxelZ = clickedVoxelZ;
          
          // Use the existing offset values (already calculated above)
          
          // Apply safety clamping (already done since we use Math.round on face normals)
          console.log(`🧩 Face normal offsets: (${offsetX}, ${offsetY}, ${offsetZ})`);
          console.log(`🧩 Original voxel: (${originalVoxelX}, ${originalVoxelY}, ${originalVoxelZ})`);
          
          // Apply Minecraft-style placement: place adjacent to clicked voxel
          finalVoxelX = clickedVoxelX + offsetX;
          finalVoxelY = clickedVoxelY + offsetY;
          finalVoxelZ = clickedVoxelZ + offsetZ;
          
          console.log(`🧩 Final adjacent voxel: (${finalVoxelX}, ${finalVoxelY}, ${finalVoxelZ})`);
          console.log(`🧩 Total displacement: (${finalVoxelX - originalVoxelX}, ${finalVoxelY - originalVoxelY}, ${finalVoxelZ - originalVoxelZ})`);
          
          // Calculate expected world positions for verification
          const originalWorldX = voxelBounds.min.x + (originalVoxelX * voxelResolution);
          const originalWorldY = voxelBounds.min.y + (originalVoxelY * voxelResolution);
          const originalWorldZ = voxelBounds.min.z + (originalVoxelZ * voxelResolution);
          
          const newWorldX = voxelBounds.min.x + (finalVoxelX * voxelResolution);
          const newWorldY = voxelBounds.min.y + (finalVoxelY * voxelResolution);
          const newWorldZ = voxelBounds.min.z + (finalVoxelZ * voxelResolution);
          
          console.log(`🌍 Original world position: (${originalWorldX.toFixed(3)}, ${originalWorldY.toFixed(3)}, ${originalWorldZ.toFixed(3)})`);
          console.log(`🌍 New world position: (${newWorldX.toFixed(3)}, ${newWorldY.toFixed(3)}, ${newWorldZ.toFixed(3)})`);
          console.log(`🌍 World displacement: (${(newWorldX - originalWorldX).toFixed(3)}, ${(newWorldY - originalWorldY).toFixed(3)}, ${(newWorldZ - originalWorldZ).toFixed(3)})`);
          
        } else {
          console.log(`🎮 Direct placement mode - replacing clicked voxel`);
        }

        // Call voxel edit callback with final coordinates
        if ((window as any).handleVoxelEdit) {
          console.log(`🔧 Calling handleVoxelEdit with (${finalVoxelX}, ${finalVoxelY}, ${finalVoxelZ})...`);
          (window as any).handleVoxelEdit(finalVoxelX, finalVoxelY, finalVoxelZ, event);
        } else {
          console.log(`❌ No handleVoxelEdit function found on window`);
        }
        return; // Don't do normal selection for voxel meshes
      } else {
        console.log(`❌ Missing voxel parameters:`, { voxelResolution, voxelBounds });
      }
    } else {
      console.log(`📝 Not a voxel click - proceeding with normal selection`);
    }

    const isMultiSelect = event?.ctrlKey || event?.metaKey; // Ctrl/Cmd for multi-select
    
    if (isMultiSelect) {
      // Add/remove from current selection
      const currentSelection = selectedObjects || [];
      if (currentSelection.includes(objectId)) {
        // Remove from selection
        const newSelection = currentSelection.filter(id => id !== objectId);
        onSelectionChange?.(newSelection);
      } else {
        // Add to selection
        onSelectionChange?.([...currentSelection, objectId]);
      }
    } else {
      // Single selection (replace current selection)
      console.log(`🎯 Setting single selection to:`, objectId);
      onSelectionChange?.([objectId]);
    }
  };

  // Legacy alias for backward compatibility
  const handleBrickClick = (objectId: string, event?: any) => {
    handleObjectClick(objectId, event);
  };

  // Handle background click to deselect all
  const handleBackgroundClick = (event: any) => {
    // Don't deselect if we're interacting with transform controls
    if (event?.defaultPrevented) return;
    
    // Check if any transform control is active
    const transformControlsActive = document.querySelector('.transform-controls-active');
    if (transformControlsActive) return;
    
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
          // Render Brick Objects
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
                  totalSelected={selectedObjects.length}
                />
              </Suspense>
            );
          }
          
          // Render Form Objects
          if (obj.type === 'form' && obj.visible && !obj.locked && (obj.formId || (obj as any).customGeometry)) {
            const objPosition = obj.position || { x: 0, y: 0, z: 0 };
            const objRotation = obj.rotation || { x: 0, y: 0, z: 0 };
            const objScale = obj.scale || { x: 1, y: 1, z: 1 };

            return (
              <FormRenderer
                key={`${obj.id}-${(obj as any)._voxelUpdateKey || 0}`}
                id={obj.id}
                formId={obj.formId || 'custom'}
                formParameters={obj.formParameters || {}}
                customGeometry={(obj as any).customGeometry}
                material={(obj as any).material}
                isHollow={obj.isHollow || false}
                position={[objPosition.x, objPosition.y, objPosition.z]}
                rotation={[objRotation.x, objRotation.y, objRotation.z]}
                scale={[objScale.x, objScale.y, objScale.z]}
                selected={selectedObjects.includes(obj.id)}
                selectionOrder={selectedObjects.indexOf(obj.id) + 1} // 1-based index (0 = not selected)
                onClick={(event) => handleObjectClick(obj.id, event)}
                onTransform={handleBrickTransform(obj.id)}
                transformMode={transformMode}
                totalSelected={selectedObjects.length}
              />
            );
          }
          
          return null;
        })}

        {/* Group Transform Controls for multi-object selection */}
        <GroupTransformControls
          selectedObjects={selectedObjects}
          sceneObjects={sceneObjects}
          transformMode={transformMode}
          onTransform={onObjectTransform!}
        />

        {/* Camera Ref Capture - Always render */}
        <CameraCapture cameraRef={cameraRef} />
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

      {/* Visual Debug Ray */}
      <DebugRay />

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
              {/* Camera Ref Capture - Always render */}
        <CameraCapture cameraRef={cameraRef} />

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
  onSave,
  onDuplicateObjects,
  onDeleteObjects,
  onToggleVisibility,
  onSelectAll,
  onDeselectAll,
  connectionMode = false,
  connectionConfigs = {}
}: Viewport3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
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
      ambientIntensity: 0.6,
      directionalIntensity: 1.2,
      pointIntensity: 0.5,
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

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
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

  // Context menu functions
  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false }));
  }, []);

  // Camera presets integration
  const { presets, setPreset } = useCameraPresets(cameraRef, controlsRef);

  // AUTOMATIC CAMERA REF FIX - runs in main component where both refs exist
  useEffect(() => {
    if (cameraRef.current) return; // Already have camera

    const tryAutoFix = () => {
      if (controlsRef.current?.object) {
        (cameraRef as any).current = controlsRef.current.object;
        console.log('📷 Camera ref initialized successfully');
        return true;
      }
      return false;
    };

    // Try immediately
    if (tryAutoFix()) return;

    // Then try every 50ms for up to 3 seconds
    let attempts = 0;
    const maxAttempts = 60; // 3 seconds / 50ms
    
    const interval = setInterval(() => {
      attempts++;
      
      if (tryAutoFix()) {
        clearInterval(interval);
      } else if (attempts >= maxAttempts) {
        console.warn('⚠️ Camera initialization timeout - manual intervention may be required');
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, []); // Empty dependency array - run once on mount



  // Focus on selected objects functionality with retry mechanism
  const focusOnObjects = useCallback((objectIds: string[]) => {
    const performFocus = () => {
      if (objectIds.length === 0) {
        console.warn('Cannot focus: no objects provided');
        return false;
      }

      if (!cameraRef.current || !controlsRef.current) {
        console.warn('Cannot focus: camera or controls not ready');
        return false;
      }

      // Find selected objects
      const targetObjects = sceneObjects.filter(obj => objectIds.includes(obj.id));
      if (targetObjects.length === 0) {
        console.warn('Cannot focus: no matching objects found');
        return false;
      }

      // Calculate bounding box of all selected objects
      const boundingBox = new THREE.Box3();
      let hasGeometry = false;

      targetObjects.forEach(obj => {
        const pos = obj.position || { x: 0, y: 0, z: 0 };
        const scale = obj.scale || { x: 1, y: 1, z: 1 };
        
        // Estimate object bounds based on type
        let size = { x: 1, y: 1, z: 1 };
        
        if (obj.type === 'brick') {
          // TODO: Update these dimensions based on the actual brick model size from Blender
          size = { x: 12 * scale.x, y: 4.8 * scale.y, z: 12 * scale.z }; // Estimated brick dimensions (will be updated)
        } else if (obj.type === 'form') {
          const params = obj.formParameters || {};
          if (obj.formId === 'cube') {
            size = { 
              x: (params.width || 2) * scale.x, 
              y: (params.height || 2) * scale.y, 
              z: (params.depth || 2) * scale.z 
            };
          } else if (obj.formId === 'sphere') {
            const radius = (params.radius || 1) * Math.max(scale.x, scale.y, scale.z);
            size = { x: radius * 2, y: radius * 2, z: radius * 2 };
          } else if (obj.formId === 'cylinder') {
            const radius = (params.radius || 1) * Math.max(scale.x, scale.z);
            const height = (params.height || 2) * scale.y;
            size = { x: radius * 2, y: height, z: radius * 2 };
          }
        }

        // Expand bounding box
        const objMin = new THREE.Vector3(
          pos.x - size.x / 2,
          pos.y - size.y / 2,
          pos.z - size.z / 2
        );
        const objMax = new THREE.Vector3(
          pos.x + size.x / 2,
          pos.y + size.y / 2,
          pos.z + size.z / 2
        );

        if (!hasGeometry) {
          boundingBox.setFromPoints([objMin, objMax]);
          hasGeometry = true;
        } else {
          boundingBox.expandByPoint(objMin);
          boundingBox.expandByPoint(objMax);
        }
      });

      if (!hasGeometry) {
        console.warn('Cannot focus: no geometry bounds calculated');
        return false;
      }

      // Calculate center and size of bounding box
      const center = boundingBox.getCenter(new THREE.Vector3());
      const size = boundingBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      // Calculate camera distance (with some padding)
      const distance = Math.max(maxDim * 2, 5); // Minimum distance of 5 units
      
      // Position camera at an isometric angle for good viewing
      const angle = Math.PI / 4; // 45 degrees
      const cameraPosition = new THREE.Vector3(
        center.x + Math.cos(angle) * distance,
        center.y + distance * 0.7, // Slightly above
        center.z + Math.sin(angle) * distance
      );

      // Animate camera to new position
      cameraRef.current.position.copy(cameraPosition);
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
      return true;
    };

    // Try immediately first
    if (!performFocus()) {
      // Retry after a short delay
      setTimeout(() => {
        if (!performFocus()) {
          console.warn('⚠️ Cannot focus on objects: camera or controls not ready');
        }
      }, 100);
    }
  }, [sceneObjects]);

  // Context menu options (defined after focusOnObjects)
  const getContextMenuOptions = useCallback((targetObject: SceneObject | null): ContextMenuOption[] => {
    const hasSelection = selectedObjects.length > 0;
    const hasTarget = !!targetObject;
    const isTargetSelected = targetObject ? selectedObjects.includes(targetObject.id) : false;

    return [
      // Selection-based actions
      {
        id: 'select-all',
        label: 'Select All',
        icon: '⊡',
        shortcut: 'Ctrl+A',
        disabled: sceneObjects.length === 0,
        action: () => onSelectAll?.()
      },
      {
        id: 'deselect-all',
        label: 'Deselect All',
        icon: '⊟',
        shortcut: 'Alt+A',
        disabled: !hasSelection,
        action: () => onDeselectAll?.()
      },
      {
        id: 'separator-1',
        label: '',
        separator: true
      },
      // Object-specific actions
      {
        id: 'duplicate',
        label: hasTarget ? `Duplicate ${targetObject.name}` : 'Duplicate Selected',
        icon: '⧉',
        shortcut: 'Shift+D',
        disabled: !hasSelection && !hasTarget,
        action: () => {
          if (hasTarget && !isTargetSelected) {
            onDuplicateObjects?.([targetObject.id]);
          } else {
            onDuplicateObjects?.(selectedObjects);
          }
        }
      },
      {
        id: 'delete',
        label: hasTarget ? `Delete ${targetObject.name}` : 'Delete Selected',
        icon: '🗑️',
        shortcut: 'X',
        disabled: !hasSelection && !hasTarget,
        action: () => {
          if (hasTarget && !isTargetSelected) {
            onDeleteObjects?.([targetObject.id]);
          } else {
            onDeleteObjects?.(selectedObjects);
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
            onToggleVisibility?.([targetObject.id]);
          } else {
            onToggleVisibility?.(selectedObjects);
          }
        }
      },
      {
        id: 'separator-3',
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
          if (hasTarget && !isTargetSelected) {
            focusOnObjects([targetObject.id]);
          } else {
            focusOnObjects(selectedObjects);
          }
        }
      }
    ];
  }, [selectedObjects, sceneObjects, onSelectAll, onDeselectAll, onDuplicateObjects, onDeleteObjects, onToggleVisibility, focusOnObjects]);

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
        case '.':
          if (event.location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD) {
            event.preventDefault();
            if (selectedObjects.length > 0) {
              focusOnObjects(selectedObjects);
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [setPreset, focusOnObjects, selectedObjects]);

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
        background: '#ffffff'
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
        onPointerMissed={(event) => {
          // Only deselect if we're not dragging with transform controls
          const isTransformControlActive = (event.target as any)?.classList?.contains('transform-controls');
          if (!isTransformControlActive && selectedObjects.length > 0) {
            console.log('Canvas clicked - deselecting all');
            onDeselectAll?.();
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          
          // Get mouse position
          const x = event.clientX;
          const y = event.clientY;
          
          // TODO: Implement raycast to detect clicked object
          // For now, show context menu without specific target
          setContextMenu({
            visible: true,
            x,
            y,
            targetObject: null
          });
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
          cameraRef={cameraRef}
          controlsRef={controlsRef}
        />

        {/* Enhanced Controls */}
        <OrbitControls
          ref={(controls) => {
            (controlsRef as any).current = controls;
          }}
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
          flexDirection: selectedObjects.length > 1 ? 'column' : 'row',
          gap: '0.5rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          zIndex: 15
        }}>
          {/* Group Mode Indicator */}
          {selectedObjects.length > 1 && (
            <div style={{
              fontSize: '0.7rem',
              color: 'var(--accent-cyan)',
              fontWeight: 'bold',
              textAlign: 'center',
              padding: '0.25rem 0.5rem',
              background: 'rgba(0, 255, 136, 0.1)',
              borderRadius: '4px',
              border: '1px solid var(--accent-cyan)',
              width: '100%',
              marginBottom: '0.25rem'
            }}>
              🔗 Group Mode: {selectedObjects.length} objects
            </div>
          )}
          
          {/* Transform Mode Buttons */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            width: '100%'
          }}>
            <button
              onClick={() => setTransformMode('translate')}
            style={{
              padding: '0.5rem 0.75rem',
              background: transformMode === 'translate' ? 'var(--accent-cyan)' : 'transparent',
              color: transformMode === 'translate' ? 'white' : 'white',
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
            <div>Forms: {sceneObjects.filter(obj => obj.type === 'form').length}</div>
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

      {/* Context Menu */}
      <ContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        options={getContextMenuOptions(contextMenu.targetObject)}
        onClose={closeContextMenu}
      />

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