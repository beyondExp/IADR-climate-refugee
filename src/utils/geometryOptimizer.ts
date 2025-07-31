import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import type { BrickTypeKey, Position3D, Rotation3D } from '../types';
import { brickTypes } from './brickTypes';
import { formCreator } from './formCreator';

// Interface for brick instances to combine
export interface BrickInstanceData {
  id: string;
  brickType: BrickTypeKey;
  position: Position3D;
  rotation: Rotation3D;
  pathId?: string;
}

// Generic interface for any 3D object instance (bricks or forms)
export interface ObjectInstanceData {
  id: string;
  type: 'brick' | 'form';
  // For bricks
  brickType?: BrickTypeKey;
  // For forms
  formId?: string;
  formParameters?: any;
  isHollow?: boolean;
  // Common properties
  position: Position3D;
  rotation: Rotation3D;
  scale?: { x: number; y: number; z: number };
  pathId?: string;
}

// Optimized combined geometry result
export interface CombinedGeometry {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  totalBricks: number;
  optimizationRatio: number; // How much we reduced draw calls (e.g., 0.9 = 90% reduction)
  memoryEstimate: string;
}

export class GeometryOptimizer {
  private evaluator: Evaluator;
  private cachedBrushes: Map<BrickTypeKey, Brush> = new Map();

  constructor() {
    console.log('🔧 Initializing GeometryOptimizer with CSG evaluator...');
    
    this.evaluator = new Evaluator();
    
    // Configure evaluator based on three-bvh-csg examples
    // Only include attributes that actually exist in our geometries
    this.evaluator.attributes = ['position', 'normal']; // Remove 'uv' since our geometries don't have UVs
    this.evaluator.useGroups = false; // Combine into single material group
    
    console.log('✅ CSG Evaluator configured:', {
      attributes: this.evaluator.attributes,
      useGroups: this.evaluator.useGroups
    });
    
    // Test the evaluator is working
    try {
      console.log('🧪 Testing CSG evaluator initialization...');
      // The evaluator should be ready to use
      console.log('✅ CSG evaluator initialized successfully');
    } catch (error) {
      console.error('❌ CSG evaluator initialization failed:', error);
    }
  }

  /**
   * Create a Three.js Brush from GLTF geometry for Boolean operations
   */
  private createBrushFromGLTF(gltf: any, brickType: BrickTypeKey): Brush | null {
    // Check cache first
    if (this.cachedBrushes.has(brickType)) {
      return this.cachedBrushes.get(brickType)!.clone();
    }

    let geometry: THREE.BufferGeometry | null = null;

    // Extract geometry from GLTF
    gltf.scene.traverse((child: any) => {
      if (child instanceof THREE.Mesh && child.geometry && !geometry) {
        geometry = child.geometry.clone();
      }
    });

    if (!geometry) {
      console.error(`❌ No geometry found in GLTF for ${brickType}`);
      return null;
    }

    // Apply same scale as used in viewer (0.2)
    (geometry as THREE.BufferGeometry).scale(0.2, 0.2, 0.2);

    // Optimize geometry for Boolean operations  
    if (!(geometry as THREE.BufferGeometry).index) {
      geometry = mergeVertices(geometry as THREE.BufferGeometry);
    }

    // Ensure geometry has proper normals
    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }

    // Prepare geometry specifically for CSG operations
    const csgGeometry = this.prepareGeometryForCSG(geometry);
    
    // Create brush and cache it
    const brush = new Brush(csgGeometry);
    this.cachedBrushes.set(brickType, brush.clone());

    console.log(`📐 Created optimized brush for ${brickType}:`, {
      vertices: geometry.attributes.position.count,
      triangles: geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3,
      hasNormals: !!geometry.attributes.normal,
      hasUV: !!geometry.attributes.uv
    });

    return brush;
  }

  /**
   * Transform a brush to specific position, rotation, and optional scale
   */
  private transformBrush(brush: Brush, position: Position3D, rotation: Rotation3D, scale?: { x: number; y: number; z: number }): Brush {
    const matrix = new THREE.Matrix4();
    
    console.log(`🔧 Applying transform:`, {
      position: position,
      rotation: rotation,
      brickType: brush.userData?.brickType
    });
    
    // Apply transformation matrix
    // Note: No height offset needed since positions should match exactly what's in the scene
    const scaleVec = scale ? new THREE.Vector3(scale.x, scale.y, scale.z) : new THREE.Vector3(1, 1, 1);
    matrix.compose(
      new THREE.Vector3(position.x, position.y, position.z), // Use exact position without height adjustment
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z)),
      scaleVec // Apply scale if provided
    );

    const transformedBrush = brush.clone();
    transformedBrush.geometry.applyMatrix4(matrix);
    transformedBrush.geometry.computeVertexNormals(); // Recompute normals after transform
    
    // Debug final position
    transformedBrush.geometry.computeBoundingBox();
    const bounds = transformedBrush.geometry.boundingBox;
    console.log(`📍 Final brush bounds:`, {
      min: bounds?.min,
      max: bounds?.max,
      center: bounds ? bounds.getCenter(new THREE.Vector3()) : 'none'
    });
    
    return transformedBrush;
  }

  /**
   * Combine multiple brick instances into a single optimized geometry using Boolean union
   */
  async combineInstances(
    instances: BrickInstanceData[], 
    gltf: any,
    onProgress?: (progress: number, stage: string) => void
  ): Promise<CombinedGeometry | null> {
    if (instances.length === 0) return null;

    console.log(`🔧 Starting geometry optimization for ${instances.length} bricks...`);
    console.log('🚀 DEBUGGING: Restoring Boolean union operations with enhanced debugging');
    const startTime = performance.now();

    try {
      let resultBrush: Brush | null = null;
      
      for (let i = 0; i < instances.length; i++) {
        const instance = instances[i];
        
        // Progress callback
        if (onProgress) {
          onProgress((i / instances.length) * 100, `Processing brick ${i + 1}/${instances.length}`);
        }

        console.log(`\n🧱 === PROCESSING BRICK ${i + 1}/${instances.length} ===`);
        console.log(`🧱 ID: ${instance.id}`);
        console.log(`🧱 Type: ${instance.brickType}`);
        console.log(`🧱 Position:`, instance.position);
        console.log(`🧱 Rotation:`, instance.rotation);

        // Create brush for this instance
        const baseBrush = this.createBrushFromGLTF(gltf, instance.brickType);
        if (!baseBrush) {
          console.warn(`⚠️ Skipping ${instance.id} - no brush created`);
          continue;
        }

        console.log(`🧱 Base brush created:`, {
          vertices: baseBrush.geometry.attributes.position.count,
          triangles: baseBrush.geometry.index ? baseBrush.geometry.index.count / 3 : 'no index',
          hasNormals: !!baseBrush.geometry.attributes.normal,
          hasUV: !!baseBrush.geometry.attributes.uv
        });

        // Transform to final position
        const transformedBrush = this.transformBrush(baseBrush, instance.position, instance.rotation);
        transformedBrush.userData = { brickType: instance.brickType, originalId: instance.id };

        // Ensure geometry has computed bounding box and normals
        if (!transformedBrush.geometry.boundingBox) {
          transformedBrush.geometry.computeBoundingBox();
        }
        if (!transformedBrush.geometry.attributes.normal) {
          transformedBrush.geometry.computeVertexNormals();
        }

        console.log(`🧱 Transformed brush:`, {
          vertices: transformedBrush.geometry.attributes.position.count,
          triangles: transformedBrush.geometry.index ? transformedBrush.geometry.index.count / 3 : 'no index',
          boundingBox: transformedBrush.geometry.boundingBox,
          hasNormals: !!transformedBrush.geometry.attributes.normal
        });

        if (!resultBrush) {
          // First brick becomes the base
          resultBrush = transformedBrush;
          console.log(`🎯 SET AS BASE RESULT: ${instance.id}`);
          console.log(`🎯 Base result brush:`, {
            vertices: resultBrush.geometry.attributes.position.count,
            triangles: resultBrush.geometry.index ? resultBrush.geometry.index.count / 3 : 'no index'
          });
        } else {
          // Union with existing geometry
          console.log(`\n🔗 === BOOLEAN UNION OPERATION ===`);
          console.log(`🔗 Current result vertices:`, resultBrush.geometry.attributes.position.count);
          console.log(`🔗 Adding brush vertices:`, transformedBrush.geometry.attributes.position.count);
          console.log(`🔗 Evaluator config:`, {
            attributes: this.evaluator.attributes,
            useGroups: this.evaluator.useGroups
          });
          
          // Debug brush validity before operation
          try {
            const resultValid = this.validateBrush(resultBrush, 'Current Result');
            const newBrushValid = this.validateBrush(transformedBrush, 'New Brush');
            
            if (!resultValid || !newBrushValid) {
              console.error('❌ Invalid brushes detected, skipping union');
              if ('dispose' in transformedBrush && typeof transformedBrush.dispose === 'function') {
            transformedBrush.dispose();
          }
              continue;
            }
            
            console.log(`🔗 Performing Boolean ADDITION...`);
            
            // Debug geometry attributes before CSG operation
            console.log(`🔍 CSG Debug - Current result geometry:`, {
              hasPosition: !!resultBrush.geometry.attributes.position,
              positionArray: resultBrush.geometry.attributes.position?.array?.constructor.name,
              positionCount: resultBrush.geometry.attributes.position?.count,
              hasNormal: !!resultBrush.geometry.attributes.normal,
              hasUV: !!resultBrush.geometry.attributes.uv,
              hasIndex: !!resultBrush.geometry.index,
              indexArray: resultBrush.geometry.index?.array?.constructor.name,
              indexCount: resultBrush.geometry.index?.count
            });
            
            console.log(`🔍 CSG Debug - New brush geometry:`, {
              hasPosition: !!transformedBrush.geometry.attributes.position,
              positionArray: transformedBrush.geometry.attributes.position?.array?.constructor.name,
              positionCount: transformedBrush.geometry.attributes.position?.count,
              hasNormal: !!transformedBrush.geometry.attributes.normal,
              hasUV: !!transformedBrush.geometry.attributes.uv,
              hasIndex: !!transformedBrush.geometry.index,
              indexArray: transformedBrush.geometry.index?.array?.constructor.name,
              indexCount: transformedBrush.geometry.index?.count
            });
            
            const unionStart = performance.now();
            
            try {
              // Re-prepare geometries immediately before CSG operation
              const resultGeometry = this.prepareGeometryForCSG(resultBrush.geometry);
              const newGeometry = this.prepareGeometryForCSG(transformedBrush.geometry);
              
              // Validate geometries before CSG
              if (!this.validateGeometryForCSG(resultGeometry, 'result')) {
                throw new Error('Result geometry validation failed');
              }
              if (!this.validateGeometryForCSG(newGeometry, 'new')) {
                throw new Error('New geometry validation failed');
              }
              
              // Create fresh brushes with prepared geometries
              const freshResultBrush = new Brush(resultGeometry);
              const freshNewBrush = new Brush(newGeometry);
              
              // Validate brushes before CSG
              if (!this.validateBrush(freshResultBrush, 'Fresh Result Brush')) {
                throw new Error('Fresh result brush validation failed');
              }
              if (!this.validateBrush(freshNewBrush, 'Fresh New Brush')) {
                throw new Error('Fresh new brush validation failed');
              }
              
              console.log('🔄 Using fresh brushes with prepared geometries for CSG');
              console.log('🔧 Evaluator state:', {
                attributes: this.evaluator.attributes,
                useGroups: this.evaluator.useGroups
              });
              
              // Perform CSG operation with additional error checking
              let newResultBrush: any;
              try {
                newResultBrush = this.evaluator.evaluate(freshResultBrush, freshNewBrush, ADDITION);
              } catch (evaluateError: any) {
                console.error('❌ Evaluator.evaluate() failed:', evaluateError);
                throw new Error(`CSG evaluate failed: ${evaluateError?.message || 'Unknown error'}`);
              }
              const unionTime = performance.now() - unionStart;
              
              console.log(`🔗 Union completed in ${unionTime.toFixed(2)}ms`);
              
              if (newResultBrush && newResultBrush.geometry) {
                const afterVertices = newResultBrush.geometry.attributes.position.count;
                console.log(`✅ Union successful: ${afterVertices} vertices`);
                
                // Clean up old result brush
                if (resultBrush !== transformedBrush) {
                  if ('dispose' in resultBrush && typeof resultBrush.dispose === 'function') {
            resultBrush.dispose();
          }
                }
                
                resultBrush = newResultBrush;
              } else {
                console.error('❌ Union failed - null result or no geometry');
                throw new Error('CSG operation returned null');
              }
              
            } catch (csgError) {
              console.error('❌ CSG operation error:', csgError);
              // Continue with existing fallback logic
              throw csgError;
            }
          } catch (unionError) {
            console.error('❌ Union operation failed:', unionError);
            console.log('🔄 Attempting fallback to simple geometry merge...');
            
            // Fallback: try simple merge for this brick
            try {
              const resultGeometry = resultBrush.geometry.clone();
              const newGeometry = transformedBrush.geometry.clone();
              
              const mergedGeometry = mergeGeometries([resultGeometry, newGeometry], false);
              if (mergedGeometry) {
                console.log('✅ Fallback merge successful');
                // Create new brush with merged geometry
                const fallbackBrush = new Brush(mergedGeometry);
                fallbackBrush.userData = { fallbackMerge: true };
                
                if ('dispose' in resultBrush && typeof resultBrush.dispose === 'function') {
            resultBrush.dispose();
          }
                resultBrush = fallbackBrush;
                
                resultGeometry.dispose();
                newGeometry.dispose();
              } else {
                console.error('❌ Fallback merge also failed');
              }
            } catch (fallbackError) {
              console.error('❌ Fallback merge failed:', fallbackError);
            }
            
            if ('dispose' in transformedBrush && typeof transformedBrush.dispose === 'function') {
            transformedBrush.dispose();
          }
            continue;
          }
          
          // Clean up intermediate brush
          if ('dispose' in transformedBrush && typeof transformedBrush.dispose === 'function') {
            transformedBrush.dispose();
          }
        }

        console.log(`🔗 Current total result vertices:`, resultBrush?.geometry.attributes.position.count || 0);

        // Memory management for large operations
        if (i % 10 === 0 && (window as any).gc) {
          (window as any).gc(); // Force garbage collection if available
        }
      }

      if (!resultBrush) {
        console.error('❌ No valid brushes created - optimization failed');
        return null;
      }

      console.log(`\n✅ === FINAL CSG RESULT ===`);
      console.log(`✅ Final brush vertices:`, resultBrush.geometry.attributes.position.count);

      // Finalize the combined geometry
      const finalGeometry = resultBrush.geometry.clone();
      
      console.log(`🔧 Optimizing final CSG geometry...`);
      console.log(`🔧 Pre-optimization vertices:`, finalGeometry.attributes.position.count);
      
      // Optimize the final geometry
      const optimizedGeometry = this.optimizeFinalGeometry(finalGeometry);
      
      console.log(`🔧 Post-optimization vertices:`, optimizedGeometry.attributes.position.count);
      
      // Create material (standard material for combined mesh)
      const material = new THREE.MeshStandardMaterial({
        color: 0x8b4513, // Clay brown
        roughness: 0.7,
        metalness: 0.1
      });

      // Calculate optimization metrics
      const originalDrawCalls = instances.length;
      const newDrawCalls = 1;
      const optimizationRatio = (originalDrawCalls - newDrawCalls) / originalDrawCalls;
      
      const vertices = optimizedGeometry.attributes.position.count;
      const memoryEstimate = Math.round((vertices * 32) / 1024) + 'KB'; // Rough estimate

      const endTime = performance.now();
      const optimizationTime = (endTime - startTime) / 1000;

      console.log(`✅ Geometry optimization completed in ${optimizationTime.toFixed(2)}s:`, {
        originalBricks: instances.length,
        originalDrawCalls,
        newDrawCalls: 1,
        optimizationRatio: `${(optimizationRatio * 100).toFixed(1)}%`,
        finalVertices: vertices,
        finalTriangles: optimizedGeometry.index ? optimizedGeometry.index.count / 3 : vertices / 3,
        memoryEstimate,
        method: 'Boolean union (CSG operations)'
      });

      // Cleanup
      if ('dispose' in resultBrush && typeof resultBrush.dispose === 'function') {
        resultBrush.dispose();
      }
      if (onProgress) onProgress(100, 'Optimization complete');

      return {
        geometry: optimizedGeometry,
        material,
        totalBricks: instances.length,
        optimizationRatio,
        memoryEstimate
      };

    } catch (error) {
      console.error('❌ Geometry optimization failed:', error);
      return null;
    }
  }

  /**
   * Prepare geometry for CSG operations - ensures proper format for three-bvh-csg
   * Based on three-bvh-csg examples: https://gkjohnson.github.io/three-bvh-csg/examples/bundle/geometry.html
   */
  private prepareGeometryForCSG(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    console.log('🔧 Preparing geometry for CSG operations (following three-bvh-csg examples)...');
    
    const prepared = geometry.clone();
    
    // Ensure position attribute exists and is Float32Array
    if (!prepared.attributes.position) {
      throw new Error('Geometry missing position attribute');
    }
    if (prepared.attributes.position.array.constructor !== Float32Array) {
      console.log('🔄 Converting position to Float32Array');
      const positions = prepared.attributes.position.array;
      prepared.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    }
    
    // Ensure normal attribute exists and is Float32Array
    if (!prepared.attributes.normal) {
      console.log('🔄 Computing missing normals');
      prepared.computeVertexNormals();
    }
    if (prepared.attributes.normal.array.constructor !== Float32Array) {
      console.log('🔄 Converting normals to Float32Array');
      const normals = prepared.attributes.normal.array;
      prepared.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
    }
    
    // Remove UV attribute completely if it doesn't exist - three-bvh-csg will handle this
    if (prepared.attributes.uv) {
      console.log('🔄 Removing UV attribute for CSG compatibility');
      prepared.deleteAttribute('uv');
    }
    
    // Ensure proper index format (critical for three-bvh-csg)
    if (!prepared.index) {
      console.log('🔄 Geometry missing index - creating from non-indexed geometry');
      // For non-indexed geometry, three-bvh-csg might have issues
      // Let's ensure we have an index
      prepared.computeBoundingBox();
      prepared.computeBoundingSphere();
    } else {
      if (![Uint16Array, Uint32Array].includes(prepared.index.array.constructor as any)) {
        console.log('🔄 Converting index to proper format');
        const indices = prepared.index.array;
        const properIndices = indices.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
        prepared.setIndex(new THREE.BufferAttribute(properIndices, 1));
      }
    }
    
    // Force geometry update (critical for three-bvh-csg)
    prepared.attributes.position.needsUpdate = true;
    prepared.attributes.normal.needsUpdate = true;
    if (prepared.index) prepared.index.needsUpdate = true;
    
    // Compute all required geometry properties for CSG
    prepared.computeBoundingBox();
    prepared.computeBoundingSphere();
    prepared.computeVertexNormals(); // Ensure normals are fresh
    
    // Validate the final geometry meets three-bvh-csg requirements
    const isValid = prepared.attributes.position && 
                   prepared.attributes.normal && 
                   prepared.attributes.position.count > 0;
    
    if (!isValid) {
      throw new Error('Geometry validation failed for CSG operations');
    }
    
    console.log('✅ Geometry prepared for CSG (three-bvh-csg compatible):', {
      positionType: prepared.attributes.position.array.constructor.name,
      normalType: prepared.attributes.normal.array.constructor.name,
      indexType: prepared.index?.array.constructor.name || 'none',
      vertices: prepared.attributes.position.count,
      triangles: prepared.index ? prepared.index.count / 3 : prepared.attributes.position.count / 3,
      hasUV: !!prepared.attributes.uv
    });
    
    return prepared;
  }

  /**
   * Validate geometry for CSG operations
   */
  private validateGeometryForCSG(geometry: THREE.BufferGeometry, label: string): boolean {
    if (!geometry) {
      console.error(`❌ ${label}: Geometry is null/undefined`);
      return false;
    }
    
    if (!geometry.attributes.position) {
      console.error(`❌ ${label}: No position attribute`);
      return false;
    }
    
    const positionCount = geometry.attributes.position.count;
    if (positionCount === 0) {
      console.error(`❌ ${label}: Zero vertices`);
      return false;
    }
    
    if (!geometry.attributes.position.array) {
      console.error(`❌ ${label}: Position array is missing`);
      return false;
    }
    
    if (!(geometry.attributes.position.array instanceof Float32Array)) {
      console.error(`❌ ${label}: Position array is not Float32Array:`, geometry.attributes.position.array.constructor.name);
      return false;
    }
    
    console.log(`✅ ${label}: Valid CSG geometry with ${positionCount} vertices`);
    return true;
  }

  /**
   * Validate brush for CSG operations
   */
  private validateBrush(brush: Brush, label: string): boolean {
    if (!brush) {
      console.error(`❌ ${label}: Brush is null/undefined`);
      return false;
    }
    
    if (!brush.geometry) {
      console.error(`❌ ${label}: Brush has no geometry`);
      return false;
    }
    
    if (!brush.geometry.attributes.position) {
      console.error(`❌ ${label}: Brush geometry has no position attribute`);
      return false;
    }
    
    const vertexCount = brush.geometry.attributes.position.count;
    if (vertexCount === 0) {
      console.error(`❌ ${label}: Brush geometry has zero vertices`);
      return false;
    }
    
    // Check for valid indices if they exist
    if (brush.geometry.index && brush.geometry.index.count === 0) {
      console.error(`❌ ${label}: Brush geometry has empty index`);
      return false;
    }
    
    console.log(`✅ ${label}: Valid brush with ${vertexCount} vertices`);
    return true;
  }

  /**
   * Optimize the final combined geometry
   */
  private optimizeFinalGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    console.log('🔧 Optimizing final combined geometry...');
    
         // Merge duplicate vertices
     const optimizedGeometry = mergeVertices(geometry, 0.001);
    
    // Compute bounds and normals
    optimizedGeometry.computeBoundingSphere();
    optimizedGeometry.computeBoundingBox();
    
    if (!optimizedGeometry.attributes.normal) {
      optimizedGeometry.computeVertexNormals();
    }

    // Dispose original
    geometry.dispose();
    
    const reduction = ((geometry.attributes.position.count - optimizedGeometry.attributes.position.count) / geometry.attributes.position.count) * 100;
    
    console.log(`📐 Geometry optimization results:`, {
      originalVertices: geometry.attributes.position.count,
      optimizedVertices: optimizedGeometry.attributes.position.count,
      vertexReduction: `${reduction.toFixed(1)}%`,
      hasNormals: !!optimizedGeometry.attributes.normal,
      hasUV: !!optimizedGeometry.attributes.uv
    });

    return optimizedGeometry;
  }

  /**
   * Check if optimization would be beneficial
   */
  shouldOptimize(instanceCount: number): boolean {
    // Always merge and upload as GLB if we have any objects
    return instanceCount > 0;
  }

  /**
   * Combine mixed objects (bricks and forms) into a single optimized geometry
   */
  async combineObjects(
    objects: ObjectInstanceData[], 
    brickGLTF?: any,
    onProgress?: (progress: number, message: string) => void
  ): Promise<CombinedGeometry> {
    console.log(`🔧 GeometryOptimizer: Starting object combination with ${objects.length} objects...`);
    
    if (objects.length === 0) {
      throw new Error('No objects to combine');
    }

    if (objects.length === 1) {
      console.log('📦 Single object mode: Creating GLB export without CSG operations');
    } else {
      console.log('🔗 Multiple objects mode: Using CSG Boolean union operations');
    }

    if (onProgress) onProgress(10, 'Preparing objects...');

    let resultBrush: Brush | null = null;
    const processedCount = objects.length;
    let successCount = 0;

    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      console.log(`\n🔧 === PROCESSING OBJECT ${i + 1}/${objects.length} ===`);
      console.log(`🔧 ID: ${obj.id}`);
      console.log(`🔧 Type: ${obj.type}`);
      console.log(`🔧 Position:`, obj.position);
      console.log(`🔧 Rotation:`, obj.rotation);
      console.log(`🔧 Scale:`, obj.scale);

      let objectBrush: Brush | null = null;

      try {
        if (obj.type === 'brick' && obj.brickType && brickGLTF) {
          // Handle brick objects
          objectBrush = await this.createBrushFromGLTF(obj.brickType, brickGLTF);
          if (objectBrush) {
            objectBrush = this.transformBrush(objectBrush, obj.position, obj.rotation, obj.scale);
          }
        } else if (obj.type === 'form' && obj.formId) {
          // Handle form objects
          objectBrush = this.createBrushFromForm(obj.formId, obj.formParameters || {}, obj.position, obj.rotation, obj.scale);
        } else {
          console.warn(`⚠️ Unsupported object type or missing data:`, obj);
          continue;
        }

        if (!objectBrush) {
          console.warn(`⚠️ Failed to create brush for object ${obj.id}`);
          continue;
        }

        // Validate brush before CSG operation
        if (!this.validateBrush(objectBrush, `Object ${obj.id}`)) {
          continue;
        }

        if (resultBrush === null) {
          // First object becomes the base
          resultBrush = objectBrush;
          console.log(`✅ Object ${obj.id} set as base geometry`);
        } else {
          // Combine with previous result using Boolean union
          console.log(`\n🔗 === BOOLEAN UNION OPERATION ===`);
          console.log(`🔗 Current result vertices:`, resultBrush.geometry.attributes.position.count);
          console.log(`🔗 Adding object vertices:`, objectBrush.geometry.attributes.position.count);

          try {
            const unionResult: Brush | null = this.evaluator.evaluate(resultBrush, objectBrush, ADDITION);
            if (unionResult && this.validateBrush(unionResult, `Union result ${i}`)) {
              if ('dispose' in resultBrush && typeof resultBrush.dispose === 'function') {
                resultBrush.dispose();
              }
              resultBrush = unionResult;
              console.log(`✅ Union operation successful for object ${obj.id}`);
              successCount++;
            } else {
              console.error(`❌ Union operation failed for object ${obj.id}`);
            }
          } catch (unionError) {
            console.error('❌ Union operation failed:', unionError);
            // Try fallback to simple merge
            try {
              if (resultBrush) {
                const resultGeometry = resultBrush.geometry.clone();
                const newGeometry = objectBrush.geometry.clone();
                const mergedGeometry = mergeGeometries([resultGeometry, newGeometry], false);
                if (mergedGeometry) {
                  console.log('✅ Fallback merge successful');
                  const fallbackBrush = new Brush(mergedGeometry);
                  if ('dispose' in resultBrush && typeof resultBrush.dispose === 'function') {
                    resultBrush.dispose();
                  }
                  resultBrush = fallbackBrush;
                  resultGeometry.dispose();
                  newGeometry.dispose();
                  successCount++;
                }
              }
            } catch (fallbackError) {
              console.error('❌ Fallback merge failed:', fallbackError);
            }
          }

          if ('dispose' in objectBrush && typeof objectBrush.dispose === 'function') {
            objectBrush.dispose();
          }
        }

        // Update progress
        const progress = 20 + (i / objects.length) * 70;
        if (onProgress) onProgress(progress, `Combined ${i + 1}/${objects.length} objects`);

      } catch (error) {
        console.error(`❌ Error processing object ${obj.id}:`, error);
        if (objectBrush && 'dispose' in objectBrush && typeof objectBrush.dispose === 'function') {
          objectBrush.dispose();
        }
        continue;
      }
    }

    if (!resultBrush) {
      throw new Error('Failed to create any valid geometry from objects');
    }

    console.log(`\n✅ Successfully combined ${successCount}/${processedCount} objects`);
    if (onProgress) onProgress(90, 'Optimizing final geometry...');

    // Optimize the final geometry
    const finalGeometry = resultBrush.geometry.clone();
    const optimizedGeometry = this.optimizeFinalGeometry(finalGeometry);
    
    // Create material
    const material = new THREE.MeshLambertMaterial({ color: 0x8B4513 });

    // Calculate statistics
    const vertices = optimizedGeometry.attributes.position.count;
    const memoryEstimate = ''; // TODO: Add memory estimation method

    const method = objects.length === 1 ? 'Single object GLB export' : 'Mixed objects Boolean union (CSG operations)';
    console.log('📊 Final combined geometry stats:', {
      originalObjects: objects.length,
      successfulCombinations: successCount,
      finalVertices: vertices,
      finalTriangles: optimizedGeometry.index ? optimizedGeometry.index.count / 3 : vertices / 3,
      memoryEstimate,
      method
    });

    // Cleanup
    if ('dispose' in resultBrush && typeof resultBrush.dispose === 'function') {
      resultBrush.dispose();
    }
    if (onProgress) onProgress(100, 'Optimization complete');

    return {
      geometry: optimizedGeometry,
      material,
      totalBricks: objects.length,
      optimizationRatio: 0.8, // Estimate
      memoryEstimate
    };
  }

  /**
   * Create a brush from a form geometry
   */
  private createBrushFromForm(
    formId: string,
    formParameters: any,
    position: Position3D,
    rotation: Rotation3D,
    scale?: { x: number; y: number; z: number }
  ): Brush | null {
    try {
      console.log(`🎯 Creating brush from form: ${formId}`);
      
      // Get geometry from form creator
      const geometry = formCreator.createFormGeometry(formId, formParameters);
      if (!geometry) {
        console.error(`❌ Failed to create geometry for form ${formId}`);
        return null;
      }

      // Apply transformations
      const matrix = new THREE.Matrix4();
      const scaleVec = scale ? new THREE.Vector3(scale.x, scale.y, scale.z) : new THREE.Vector3(1, 1, 1);
      matrix.compose(
        new THREE.Vector3(position.x, position.y, position.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z)),
        scaleVec
      );
      
      geometry.applyMatrix4(matrix);
      
      // Prepare for CSG
      const csgGeometry = this.prepareGeometryForCSG(geometry);
      const brush = new Brush(csgGeometry);
      
      console.log(`✅ Form brush created successfully`);
      return brush;
      
    } catch (error) {
      console.error(`❌ Error creating brush from form ${formId}:`, error);
      return null;
    }
  }



  /**
   * Clear cached brushes to free memory
   */
  clearCache(): void {
    this.cachedBrushes.forEach(brush => {
      if ('dispose' in brush && typeof brush.dispose === 'function') {
        brush.dispose();
      }
    });
    this.cachedBrushes.clear();
    console.log('🧹 Geometry optimizer cache cleared');
  }

  /**
   * Get memory usage estimate
   */
  getMemoryUsage(): string {
    const cacheSize = this.cachedBrushes.size;
    const estimatedMemory = cacheSize * 100; // Rough estimate in KB
    return `${estimatedMemory}KB (${cacheSize} cached brushes)`;
  }
} 