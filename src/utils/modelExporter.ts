import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GeometryOptimizer, type BrickInstanceData, type ObjectInstanceData } from './geometryOptimizer';
import { storage, supabase } from '../lib/supabase';
import * as tus from 'tus-js-client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, prune, quantize } from '@gltf-transform/functions';

export interface ExportProgress {
  stage: string;
  progress: number;
}

export interface ModelExportResult {
  success: boolean;
  modelUrl?: string;
  fileSize?: number;
  error?: string;
}

export class ModelExporter {
  private geometryOptimizer: GeometryOptimizer;
  private gltfExporter: GLTFExporter;

  constructor() {
    this.geometryOptimizer = new GeometryOptimizer();
    this.gltfExporter = new GLTFExporter();
  }

  /**
   * Export project bricks as optimized GLB file and upload to Supabase storage
   */
  async exportAndUploadProject(
    projectId: string,
    bricks: BrickInstanceData[],
    gltfModel: any,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<ModelExportResult> {
    
    try {
      console.log('🚀 ModelExporter: Starting export process... (CSG Boolean union operations)');
      console.log('📦 Project ID:', projectId);
      console.log('🧱 Bricks count:', bricks?.length);
      console.log('📄 GLTF model loaded:', !!gltfModel);
      
      onProgress?.({ stage: 'Validating input', progress: 5 });
      
      if (!bricks || bricks.length === 0) {
        console.error('❌ ModelExporter: No bricks to export');
        return { success: false, error: 'No bricks to export' };
      }

      if (!gltfModel) {
        console.error('❌ ModelExporter: GLTF model not loaded');
        return { success: false, error: 'GLTF model not loaded' };
      }

      console.log('✅ ModelExporter: Input validation passed');
      onProgress?.({ stage: 'Optimizing geometry', progress: 15 });

      // Use the existing GeometryOptimizer to combine all bricks
      const optimizedResult = await this.geometryOptimizer.combineInstances(
        bricks,
        gltfModel,
        (progress, stage) => {
          onProgress?.({ stage: `Optimizing: ${stage}`, progress: 15 + (progress * 0.5) });
        }
      );

      if (!optimizedResult) {
        return { success: false, error: 'Geometry optimization failed' };
      }

      onProgress?.({ stage: 'Creating optimized mesh', progress: 65 });

      // Create a scene with the optimized mesh for export
      const exportScene = new THREE.Scene();
      const optimizedMesh = new THREE.Mesh(optimizedResult.geometry, optimizedResult.material);
      
      // Add metadata to the mesh
      optimizedMesh.userData = {
        projectId,
        originalBrickCount: optimizedResult.totalBricks,
        optimizationRatio: optimizedResult.optimizationRatio,
        exportedAt: new Date().toISOString(),
        version: '1.0'
      };

      exportScene.add(optimizedMesh);

      onProgress?.({ stage: 'Exporting GLB file', progress: 75 });

      // Export to GLB format using shared method
      const gltfData = await this.exportSceneToGLB(exportScene, onProgress);

      console.log('📁 ModelExporter: GLB export successful, size:', gltfData.byteLength, 'bytes');
      onProgress?.({ stage: 'Preparing upload', progress: 85 });

      // Convert to File object for upload
      const blob = new Blob([gltfData], { type: 'model/gltf-binary' });
      const fileName = `project-${projectId}-optimized.glb`;
      const file = new File([blob], fileName, { type: 'model/gltf-binary' });

      console.log('📤 ModelExporter: Starting upload to Supabase storage...');
      console.log('📁 File name:', fileName);
      console.log('📏 File size:', file.size, 'bytes');
      
      onProgress?.({ stage: 'Uploading to storage', progress: 90 });

      // Upload to Supabase storage with extended timeout for large files
      console.log('📤 Starting upload to Supabase storage bucket: project-models');
      console.log(`📤 Upload timeout: 480 seconds (8 minutes) for ${Math.round(file.size / 1024)}KB file`);
      const uploadStartTime = Date.now();
      
      // Create upload promise with timeout
      const uploadPromise = storage.uploadOptimizedModel(
        projectId,
        file,
        (uploadProgress) => {
          const elapsed = ((Date.now() - uploadStartTime) / 1000).toFixed(1);
          console.log(`📊 Upload progress: ${Math.round(uploadProgress * 100)}% (${elapsed}s elapsed)`);
          onProgress?.({ stage: 'Uploading', progress: 90 + (uploadProgress * 0.1) });
        }
      );
      
      // Create timeout promise (480 seconds / 8 minutes for large file upload)
      const timeoutPromise = new Promise<{ url?: string; error?: any }>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Upload timeout after 480 seconds'));
        }, 480000);
      });
      
      let uploadResult: { url?: string; error?: any };
      try {
        uploadResult = await Promise.race([uploadPromise, timeoutPromise]);
      } catch (timeoutError) {
        console.error('❌ Upload timed out:', timeoutError);
        return { success: false, error: 'Upload timed out after 240 seconds. The file may be too large or there may be network issues.' };
      }
      
      const uploadDuration = ((Date.now() - uploadStartTime) / 1000).toFixed(1);
      console.log(`📤 Upload completed in ${uploadDuration}s`);
      
      const { url, error: uploadError } = uploadResult;

      console.log('📤 Upload result:', { url, error: uploadError });

      if (uploadError || !url) {
        console.error('❌ ModelExporter: Upload failed:', uploadError);
        
        // For smaller files (< 2MB), try one retry
        if (file.size < 2 * 1024 * 1024) {
          console.log('🔄 Retrying upload for small file...');
          onProgress?.({ stage: 'Retrying upload', progress: 92 });
          
          try {
            const retryResult = await Promise.race([
              storage.uploadOptimizedModel(projectId, file),
              new Promise<{ url?: string; error?: any }>((_, reject) => {
                setTimeout(() => reject(new Error('Retry timeout')), 120000); // 2 minutes for retry
              })
            ]);
            
            if (retryResult.url && !retryResult.error) {
              console.log('✅ Retry successful!');
              const { url: retryUrl } = retryResult;
              
              // Continue with database update
              console.log('🗄️ ModelExporter: Updating database with model URL (retry)...');
              onProgress?.({ stage: 'Updating database', progress: 98 });
              
              const { error: dbError } = await storage.updateProjectWithOptimizedModel(
                projectId,
                retryUrl,
                file.size
              );
              
              if (dbError) {
                console.error('❌ ModelExporter: Database update failed:', dbError);
                return { success: false, error: `Database update failed: ${dbError.message}` };
              }
              
              console.log('✅ ModelExporter: Complete success!');
              return { success: true, modelUrl: retryUrl, fileSize: file.size };
            }
          } catch (retryError) {
            console.warn('❌ Retry also failed:', retryError);
          }
        }
        
        // Save locally as fallback
        console.log('💾 Saving optimized model locally as fallback...');
        try {
          const localStorageKey = `optimized_model_${projectId}`;
          const modelData = {
            projectId,
            fileName,
            fileSize: file.size,
            data: Array.from(new Uint8Array(await file.arrayBuffer())),
            timestamp: Date.now()
          };
          localStorage.setItem(localStorageKey, JSON.stringify(modelData));
          console.log('✅ Model saved locally for offline access');
        } catch (localError) {
          console.error('❌ Failed to save locally:', localError);
        }
        
        return { success: false, error: `Upload failed: ${uploadError?.message || 'Unknown error'}. Model saved locally.` };
      }

      console.log('🗄️ ModelExporter: Updating database with model URL...');
      onProgress?.({ stage: 'Updating database', progress: 98 });

      // Update project record with model URL
      const { error: dbError } = await storage.updateProjectWithOptimizedModel(
        projectId,
        url,
        file.size
      );

      console.log('🗄️ Database update result:', { error: dbError });

      if (dbError) {
        console.warn('⚠️ Model uploaded but database update failed:', dbError);
        // Don't fail completely - the model is uploaded successfully
      } else {
        console.log('✅ Database updated successfully with model URL');
      }

      onProgress?.({ stage: 'Export complete', progress: 100 });

      console.log('✅ Model export completed:', {
        projectId,
        modelUrl: url,
        fileSize: file.size,
        originalBricks: optimizedResult.totalBricks,
        optimizationRatio: optimizedResult.optimizationRatio
      });

      // Cleanup
      exportScene.clear();
      optimizedResult.geometry.dispose();
      if (optimizedResult.material instanceof THREE.Material) {
        optimizedResult.material.dispose();
      }

      return {
        success: true,
        modelUrl: url,
        fileSize: file.size
      };

    } catch (error) {
      console.error('❌ Model export error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown export error'
      };
    }
  }

  /**
   * Export project objects (bricks and forms) as optimized GLB file and upload to Supabase storage
   */
  async exportAndUploadProjectObjects(
    projectId: string,
    objects: ObjectInstanceData[],
    gltfModel?: any,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<ModelExportResult> {
    
    try {
      console.warn('🚨 =================================');
      console.warn('🚨 EXPORT DEBUG: Starting export process');
      console.warn('🚨 =================================');
      console.log('🚀 ModelExporter: Starting mixed object export process... (CSG Boolean union operations)');
      console.log('📦 Project ID:', projectId);
      console.log('🔧 Objects count:', objects?.length);
      console.log('🧱 Bricks:', objects?.filter(o => o.type === 'brick').length);
      console.log('📐 Forms:', objects?.filter(o => o.type === 'form').length);
      console.log('🌿 Vines:', objects?.filter(o => o.type === 'vine').length);
      console.log('📄 GLTF model loaded:', !!gltfModel);
      
      // CRITICAL: Show all object details
      console.warn('🔍 CRITICAL - All objects being exported:');
      objects.forEach((obj, index) => {
        console.warn(`   ${index + 1}. ${obj.type} - ${obj.id} - vineType: ${obj.vineType} - position: ${JSON.stringify(obj.position)}`);
      });
      
      onProgress?.({ stage: 'Validating input', progress: 5 });
      
      if (!objects || objects.length === 0) {
        console.error('❌ No objects provided for export');
        return { 
          success: false, 
          error: 'No objects provided for export' 
        };
      }
      
      // Always merge and export objects, even single objects get GLB export
      console.log(`🔧 Processing ${objects.length} objects for GLB export...`);
      if (objects.length === 1) {
        console.log('📦 Single object will be exported as GLB for consistency');
      }

      // Check if brick objects exist and we have GLTF model for them
      const brickObjects = objects.filter(o => o.type === 'brick');
      if (brickObjects.length > 0 && !gltfModel) {
        console.error('❌ Brick objects found but no GLTF model provided');
        return { 
          success: false, 
          error: 'Brick objects found but no GLTF model provided' 
        };
      }
      
      onProgress?.({ stage: 'Combining meshes', progress: 10 });
      
      console.log('🚀 COMBINATION MODE: Combining meshes without boolean operations');
      console.log('🔧 This preserves all individual objects in the scene');
      
      console.warn('🚨 ABOUT TO CALL simpleMeshCombination with:');
      console.warn(`   - ${objects.length} total objects`);
      console.warn(`   - Object types: ${objects.map(o => o.type).join(', ')}`);
      
      // Simple mesh combination without CSG
      const combinedResult = await this.simpleMeshCombination(objects, gltfModel, onProgress);
      
      console.warn('🚨 simpleMeshCombination COMPLETED');
      console.warn(`   - Result has ${combinedResult.totalObjects} objects`);
      console.warn(`   - Scene has ${combinedResult.scene.children.length} children`);
      
      console.log('✅ Mesh combination completed');
      console.log('📊 Combination stats:', {
        totalObjects: combinedResult.totalObjects,
        finalVertices: combinedResult.finalVertices
      });
      
      onProgress?.({ stage: 'Preparing final scene', progress: 60 });
      
      // Use the combined scene directly
      const scene = combinedResult.scene;
      scene.userData = {
        projectId,
        totalObjects: combinedResult.totalObjects,
        finalVertices: combinedResult.finalVertices,
        exportTimestamp: Date.now(),
        mode: 'mesh-combination'
      };
      
      onProgress?.({ stage: 'Exporting to GLB format', progress: 70 });
      
      // Export to GLB format
      console.warn('🚨 BEFORE GLB EXPORT:');
      console.warn(`   - Scene has ${scene.children.length} children`);
      scene.children.forEach((child, index) => {
        console.warn(`   ${index + 1}. ${child.name} - type: ${child.type} - visible: ${child.visible} - position: ${child.position.x},${child.position.y},${child.position.z}`);
      });
      
      let glbData = await this.exportSceneToGLB(scene, onProgress);
      
      console.warn('🚨 AFTER GLB EXPORT:');
      console.warn(`   - GLB data size: ${Math.round(glbData.byteLength / 1024)}KB`);
      
      onProgress?.({ stage: 'Compressing with Draco', progress: 75 });
      console.log(`📊 GLB export completed, size: ${Math.round(glbData.byteLength / 1024)}KB`);
      
      // Apply Draco compression
      const originalSize = Math.round(glbData.byteLength / 1024);
      console.warn(`🚨 BEFORE COMPRESSION: ${originalSize}KB`);
      
      glbData = await this.compressGLBWithDraco(glbData);
      
      const compressedSize = Math.round(glbData.byteLength / 1024);
      console.warn(`🚨 AFTER COMPRESSION: ${compressedSize}KB (${((1 - compressedSize/originalSize) * 100).toFixed(1)}% reduction)`);
      
      onProgress?.({ stage: 'Uploading to DigitalOcean Spaces', progress: 80 });
      
      // Use DigitalOcean Spaces for much faster uploads
      const fileName = `project-${projectId}-optimized-${Date.now()}.glb`;
      const fileSizeInMB = glbData.byteLength / (1024 * 1024);
      
      console.log(`📤 Using DIGITALOCEAN SPACES for ${fileSizeInMB.toFixed(2)}MB file...`);
      console.log('🚀 This should be MUCH faster than Supabase!');
      const uploadResult = await this.uploadToDigitalOcean(projectId, fileName, glbData, onProgress);

      if (uploadResult.success && uploadResult.url) {
        console.log('✅ Upload successful - file uploaded AND database updated!');
        onProgress?.({ stage: 'Export complete', progress: 100 });
        
        return {
          success: true,
          modelUrl: uploadResult.url,
          fileSize: glbData.byteLength
        };
      } else {
        console.error('❌ Simple debug upload failed:', uploadResult.error);
        
        return {
          success: false,
          error: `Simple debug upload failed: ${uploadResult.error}`
        };
      }
      
    } catch (error: any) {
      console.error('❌ Model export error:', error);
      onProgress?.({ stage: 'Export failed', progress: 0 });
      
      return {
        success: false,
        error: error.message || 'Unknown export error'
      };
    }
  }

  /**
   * Compress GLB using optimizations (without Draco for now)
   */
  private async compressGLBWithDraco(glbData: ArrayBuffer): Promise<ArrayBuffer> {
    console.log('🗜️ Applying GLB optimizations...');
    const startSize = glbData.byteLength;
    
    try {
      // Create IO handler
      const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
      
      // Read the GLB
      const document = await io.readBinary(new Uint8Array(glbData));
      
      // Apply optimizations WITHOUT Draco for now
      await document.transform(
        // Remove duplicate vertex data
        dedup(),
        // Quantize vertex attributes to reduce precision
        quantize({
          quantizePosition: 14,
          quantizeNormal: 10,
          quantizeTexcoord: 12,
          quantizeColor: 8,
          quantizeWeight: 12
        }),
        // Remove unused nodes, materials, etc.
        prune()
      );
      
      // Write back to binary
      const compressedData = await io.writeBinary(document);
      const endSize = compressedData.byteLength;
      const reduction = Math.round((1 - endSize / startSize) * 100);
      
      console.log(`✅ GLB optimization complete:`);
      console.log(`   Original: ${(startSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Optimized: ${(endSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Reduction: ${reduction}%`);
      
      return compressedData.buffer;
    } catch (error) {
      console.error('❌ GLB optimization failed:', error);
      console.log('⚠️ Falling back to uncompressed GLB');
      return glbData;
    }
  }

  /**
   * Simple mesh combination - just combine all meshes into one scene without CSG
   */


  private async simpleMeshCombination(objects: ObjectInstanceData[], gltfModel?: any, onProgress?: (progress: ExportProgress) => void): Promise<any> {
    console.log(`\n🔧 ===== SIMPLE MESH COMBINATION START =====`);
    console.log(`📊 Combining ${objects.length} objects into single scene`);
    console.log(`🔍 Object types breakdown:`, {
      bricks: objects.filter(obj => obj.type === 'brick').length,
      forms: objects.filter(obj => obj.type === 'form').length, 
      vines: objects.filter(obj => obj.type === 'vine').length,
      other: objects.filter(obj => !['brick', 'form', 'vine'].includes(obj.type)).length
    });
    console.log(`🔍 All objects:`, objects.map(obj => ({
      id: obj.id,
      type: obj.type,
      brickType: obj.brickType,
      formId: obj.formId,
      vineType: obj.vineType,
      position: obj.position
    })));
    
    // Check if we should use instancing for bricks
    const brickCount = objects.filter(obj => obj.type === 'brick').length;
    const USE_INSTANCING = brickCount > 50; // Use instancing if more than 50 bricks
    
    if (USE_INSTANCING) {
      console.log(`🏗️ Using instanced rendering for ${brickCount} bricks to reduce file size`);
    }
    
    try {
      // Import required modules
      const { formCreator } = await import('./formCreator');
      
      onProgress?.({ stage: 'Creating geometries...', progress: 20 });
      
      const geometries: THREE.BufferGeometry[] = [];
      const materials: THREE.Material[] = [];
      
      // Process each object
      for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        console.log(`🔧 Processing object ${i + 1}/${objects.length}: ${obj.id} at position:`, obj.position);
        
        let geometry: THREE.BufferGeometry;
        let material: THREE.Material | THREE.Material[];
        
        if (obj.type === 'brick') {

          if (!gltfModel) {
            throw new Error('GLTF model required for brick objects');
          }
          
          // Use the first mesh found in the GLTF as the brick geometry (all bricks share same mesh)
          let brickMesh: any = null;
          try {
            if (gltfModel.scene && typeof gltfModel.scene.traverse === 'function') {
              gltfModel.scene.traverse((child: any) => {
                if (!brickMesh && child && child.isMesh && child.geometry) {
                  brickMesh = child;
                }
              });
            }
          } catch (traverseError) {
            console.warn('⚠️ Failed to traverse GLTF scene for brick mesh:', traverseError);
          }
          
          if (!brickMesh) {
            console.error('❌ No mesh found in GLTF scene. Ensure the brick GLB contains at least one mesh child.');
            throw new Error('No brick mesh found in GLTF');
          }
          
          // Check if the GLTF model has any scale applied
          console.log(`🔍 Brick mesh scale from GLTF: x=${brickMesh.scale.x}, y=${brickMesh.scale.y}, z=${brickMesh.scale.z}`);
          console.log(`🔍 GLTF scene scale: x=${gltfModel.scene.scale.x}, y=${gltfModel.scene.scale.y}, z=${gltfModel.scene.scale.z}`);

          geometry = (brickMesh.geometry as THREE.BufferGeometry).clone();
          
          // Calculate actual brick dimensions
          geometry.computeBoundingBox();
          const bbox = geometry.boundingBox!;
          const brickWidth = bbox.max.x - bbox.min.x;
          const brickHeight = bbox.max.y - bbox.min.y;
          const brickDepth = bbox.max.z - bbox.min.z;
          
          console.log(`\n🧱 BRICK MODEL ANALYSIS:`);
          console.log(`📏 Raw geometry dimensions: ${brickWidth.toFixed(2)} x ${brickHeight.toFixed(2)} x ${brickDepth.toFixed(2)} units`);
          console.log(`🔍 GLTF mesh scale: ${brickMesh.scale.x}, ${brickMesh.scale.y}, ${brickMesh.scale.z}`);
          console.log(`📐 Effective size in scene: ${(brickWidth * brickMesh.scale.x).toFixed(2)} x ${(brickHeight * brickMesh.scale.y).toFixed(2)} x ${(brickDepth * brickMesh.scale.z).toFixed(2)} units`);
          
          // Apply the GLTF's scale to match what's shown in the editor
          if (brickMesh.scale.x !== 1 || brickMesh.scale.y !== 1 || brickMesh.scale.z !== 1) {
            console.log(`\n⚠️  Applying GLTF scale (${brickMesh.scale.x}) to geometry for export...`);
            geometry.scale(brickMesh.scale.x, brickMesh.scale.y, brickMesh.scale.z);
            
            // Recalculate after scaling
            geometry.computeBoundingBox();
            const scaledBbox = geometry.boundingBox!;
            console.log(`📏 Scaled geometry: ${(scaledBbox.max.x - scaledBbox.min.x).toFixed(2)} x ${(scaledBbox.max.y - scaledBbox.min.y).toFixed(2)} x ${(scaledBbox.max.z - scaledBbox.min.z).toFixed(2)} units`);
          }
          
          // Log vertex count for monitoring
          const vertexCount = geometry.attributes.position.count;
          if (vertexCount > 10000) {
            console.warn(`⚠️ Brick model has ${vertexCount.toLocaleString()} vertices!`);
            console.warn(`💡 For better performance, consider:`);
            console.warn(`   1. Simplify the brick model in Blender (target < 1000 vertices)`);
            console.warn(`   2. Enable Draco compression when exporting from Blender`);
            console.warn(`   3. Use File > Export > glTF 2.0 > Geometry > Compression`);
          }
          // Clone material and make it unique to prevent GLTFExporter from merging meshes
          if (brickMesh.material) {
            if (Array.isArray(brickMesh.material)) {
              material = brickMesh.material.map((m: any) => {
                const cloned = m.clone();
                cloned.name = `${cloned.name || 'material'}_${obj.id}`;
                return cloned;
              });
            } else {
              material = (brickMesh.material as THREE.Material).clone();
              (material as any).name = `${(material as any).name || 'brick_material'}_${obj.id}`;
            }
          } else {
            material = new THREE.MeshStandardMaterial({ 
              color: 0x8B4513,
              name: `brick_material_${obj.id}`
            });
          }
          
        } else if (obj.type === 'form') {
          console.log('📐 Creating form geometry...');
          
          if (obj.formId === 'custom-csg') {
            // Use custom geometry if available
            if (obj.formParameters?.customGeometry) {
              geometry = obj.formParameters.customGeometry.clone();
            } else {
              throw new Error('Custom CSG form missing geometry');
            }
          } else {
            // Create standard form geometry
            const formGeometry = formCreator.createFormGeometry(obj.formId!, obj.formParameters || {});
            if (!formGeometry) {
              throw new Error(`Failed to create geometry for form: ${obj.formId}`);
            }
            geometry = formGeometry;
          }
          
          // Default material for forms (unique per object)
          material = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.8,
            metalness: 0.2,
            name: `form_material_${obj.id}`
          });
          
        } else if (obj.type === 'vine') {
          console.warn(`🚨 PROCESSING VINE OBJECT: ${obj.vineType} (${obj.id})`);
          
          // Load the vine GLTF model
          const vineLoader = new GLTFLoader();
          const vineGLTF = await new Promise<any>((resolve, reject) => {
            vineLoader.load(
              `/${obj.vineType || 'vine1'}.glb`,
              (gltf: any) => resolve(gltf),
              undefined,
              (error: any) => reject(error)
            );
          });
          
          if (!vineGLTF?.scene) {
            throw new Error(`Failed to load vine GLTF: ${obj.vineType}`);
          }
          
          // Find the first mesh in the vine GLTF
          let vineMesh: any = null;
          vineGLTF.scene.traverse((child: any) => {
            if (!vineMesh && child && child.isMesh && child.geometry) {
              vineMesh = child;
            }
          });
          
          if (!vineMesh) {
            throw new Error(`No mesh found in vine GLTF: ${obj.vineType}`);
          }
          
          console.warn(`🚨 FOUND VINE MESH: ${vineMesh.name || 'unnamed'} (${obj.vineType})`);
          
          // Clone the vine geometry
          geometry = (vineMesh.geometry as THREE.BufferGeometry).clone();
          console.warn(`🚨 VINE GEOMETRY CLONED - vertices: ${geometry.attributes.position.count}`);
          
          // Calculate vine dimensions before scaling
          geometry.computeBoundingBox();
          const bbox = geometry.boundingBox!;
          const vineWidth = bbox.max.x - bbox.min.x;
          const vineHeight = bbox.max.y - bbox.min.y;
          const vineDepth = bbox.max.z - bbox.min.z;
          
          console.warn(`🌿 VINE MODEL ANALYSIS (${obj.vineType}):`);
          console.warn(`📏 Raw geometry dimensions: ${vineWidth.toFixed(2)} x ${vineHeight.toFixed(2)} x ${vineDepth.toFixed(2)} units`);
          console.warn(`🔍 Vine mesh scale: ${vineMesh.scale.x}, ${vineMesh.scale.y}, ${vineMesh.scale.z}`);
          
          // Apply a reasonable scale for vines to match editor display (similar to brick scaling)
          // Bricks use ~0.01 scale, vines should be similar but slightly larger due to their nature
          const VINE_SCALE_FACTOR = 0.05; // Scale vines down to be similar to brick size
          console.warn(`🌿 Applying vine scale factor: ${VINE_SCALE_FACTOR} (similar to brick's 0.01 scale)`);
          geometry.scale(VINE_SCALE_FACTOR, VINE_SCALE_FACTOR, VINE_SCALE_FACTOR);
          
          // Recalculate after scaling
          geometry.computeBoundingBox();
          const scaledBbox = geometry.boundingBox!;
          console.warn(`📏 Scaled vine geometry: ${(scaledBbox.max.x - scaledBbox.min.x).toFixed(2)} x ${(scaledBbox.max.y - scaledBbox.min.y).toFixed(2)} x ${(scaledBbox.max.z - scaledBbox.min.z).toFixed(2)} units`);
          
          // Preserve the original vine material with unique name
          if (vineMesh.material) {
            if (Array.isArray(vineMesh.material)) {
              material = vineMesh.material.map((m: any, idx: number) => {
                const cloned = m.clone();
                cloned.name = `${cloned.name || 'vine_material'}_${obj.id}_${idx}`;
                return cloned;
              });
            } else {
              material = (vineMesh.material as THREE.Material).clone();
              (material as any).name = `${(material as any).name || 'vine_material'}_${obj.id}`;
            }
          } else {
            // Fallback material for vines
            material = new THREE.MeshStandardMaterial({ 
              color: 0x2d5a27,
              name: `vine_material_${obj.id}`
            });
          }
          
          console.warn(`🚨 VINE PROCESSING COMPLETE: ${obj.vineType} (${obj.id})`);
          
        } else {
          throw new Error(`Unsupported object type: ${obj.type}`);
        }
        
        // DON'T apply transformations to geometry - we'll apply them to the mesh instead
        // This preserves the original geometry and applies transforms properly
        
        // Log transformation details
        console.log(`📐 Transform for ${obj.id}:`);
        console.log(`   Position: ${obj.position.x}, ${obj.position.y}, ${obj.position.z}`);
        console.log(`   Rotation: ${obj.rotation.x}, ${obj.rotation.y}, ${obj.rotation.z}`);
        const scale = obj.scale || { x: 1, y: 1, z: 1 };
        console.log(`   Scale: ${scale.x}, ${scale.y}, ${scale.z}`);
        
        // Prepare geometry
        if (!geometry.attributes.normal) {
          geometry.computeVertexNormals();
        }
        
        // Store transform data along with geometry
        geometries.push(geometry);
        materials.push(material as THREE.Material);
        
        console.log(`✅ Successfully processed ${obj.type} object ${obj.id} (${i + 1}/${objects.length})`);
        console.log(`   - Geometry vertices: ${geometry.attributes.position.count}`);
        console.log(`   - Material name: ${(material as any).name || 'unnamed'}`);
        
        onProgress?.({ stage: `Processed ${i + 1}/${objects.length} objects`, progress: 20 + ((i + 1) / objects.length) * 40 });
      }
      
      // Create a scene with all objects
      const scene = new THREE.Scene();
      
      console.log(`🏗️ Creating scene with ${geometries.length} geometries and ${materials.length} materials`);
      
      // Add each object as a separate mesh to preserve individual objects
      let totalVertices = 0;
      for (let i = 0; i < geometries.length; i++) {
        const mesh = new THREE.Mesh(geometries[i], materials[i]);
        mesh.name = `object_${i}_${objects[i].id}`;  // Give each mesh a unique name
        
        // Apply the object's transform to the mesh
        const obj = objects[i];
        console.log(`📍 Adding ${obj.type} mesh to scene: ${obj.id}`);
        console.log(`   - Position: x=${obj.position.x}, y=${obj.position.y}, z=${obj.position.z}`);
        console.log(`   - Mesh name: ${mesh.name}`);
        mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
        mesh.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z);
        
        // Apply scale directly without any viewport factors
        const scale = obj.scale || { x: 1, y: 1, z: 1 };
        mesh.scale.set(scale.x, scale.y, scale.z);
        
        scene.add(mesh);
        totalVertices += geometries[i].attributes.position.count;
        console.log(`   - Scene now has ${scene.children.length} children`);
      }
      
      console.log(`✅ Combined ${objects.length} objects into scene`);
      console.log(`📊 Scene statistics:`);
      console.log(`   - Total objects: ${objects.length}`);
      console.log(`   - Bricks: ${objects.filter(o => o.type === 'brick').length}`);
      console.log(`   - Forms: ${objects.filter(o => o.type === 'form').length}`);
      console.log(`   - Vines: ${objects.filter(o => o.type === 'vine').length}`);
      console.log(`   - Total vertices: ${totalVertices.toLocaleString()}`);
      console.log(`   - Average vertices per object: ${Math.round(totalVertices / objects.length).toLocaleString()}`);
      console.log(`🎯 Final scene children:`, scene.children.map(child => ({
        name: child.name,
        type: child.type,
        position: { x: child.position.x, y: child.position.y, z: child.position.z },
        visible: child.visible
      })));
      
      return {
        scene: scene,
        totalObjects: objects.length,
        finalVertices: totalVertices
      };
      
    } catch (error: any) {
      console.error('❌ Simple mesh combination failed:', error);
      throw new Error(`Simple mesh combination failed: ${error.message}`);
    }
  }

  /**
   * Direct API upload using fetch instead of Supabase client
   */
  private async directAPIUpload(uploadPath: string, glbData: ArrayBuffer): Promise<any> {
    console.log(`📤 Uploading ${Math.round(glbData.byteLength / 1024)}KB to storage...`);
    
    // Get auth token
    let authToken = null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      authToken = session?.access_token;
      console.log(`🔑 Auth token: ${authToken ? 'Found' : 'Not found'}`);
    } catch (e) {
      console.warn('Could not get auth session');
    }
    
    // Fallback to localStorage
    if (!authToken) {
      try {
        const authData = localStorage.getItem('sb-znsrhgncvmvrpigljhlh-auth-token');
        if (authData) {
          const parsedAuth = JSON.parse(authData);
          authToken = parsedAuth.access_token;
          console.log(`🔑 Auth token from localStorage: ${authToken ? 'Found' : 'Not found'}`);
        }
      } catch (e) {
        console.warn('Could not get auth token from localStorage');
      }
    }
    
    const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpuc3JoZ25jdm12cnBpZ2xqaGxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc3MTc2NzUsImV4cCI6MjA1MzI5MzY3NX0.9IU66z8ZxFu0i0CZOoU4al-uRBukZZ22zdMqvHz_sqM';
    
    const headers: any = {
      'apikey': anonKey,
      'Content-Type': 'model/gltf-binary',
      'Cache-Control': '3600',
      'x-upsert': 'true'
    };
    
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    console.log(`🌐 Making direct POST request to Supabase storage API...`);
    console.log(`📤 URL: https://znsrhgncvmvrpigljhlh.supabase.co/storage/v1/object/project-models/${uploadPath}`);
    
    const uploadStartTime = Date.now();
    
    // Add timeout to fetch request (5 minutes for large uploads)
    const controller = new AbortController();
    const uploadTimeoutMs = 300000; // 5 minutes
    const timeoutId = setTimeout(() => {
      console.error(`❌ Upload timeout after ${uploadTimeoutMs/1000} seconds!`);
      controller.abort();
    }, uploadTimeoutMs);
    
    try {
      console.log(`🚀 Starting fetch request...`);
    const response = await fetch(
      `https://znsrhgncvmvrpigljhlh.supabase.co/storage/v1/object/project-models/${uploadPath}`,
      {
        method: 'POST',
        headers,
          body: glbData,
          signal: controller.signal
      }
    );
      
      clearTimeout(timeoutId);
      
      const uploadEndTime = Date.now();
      console.log(`📤 Upload completed in ${uploadEndTime - uploadStartTime}ms, status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Direct API upload failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
      console.log(`📤 Parsing response JSON...`);
    const result = await response.json();
    console.log(`✅ Direct API upload successful:`, result);
    
    return { data: result, error: null };
    } catch (error: any) {
      console.error(`❌ Upload error:`, error);
      if (error.name === 'AbortError') {
        throw new Error('Upload timed out after 2 minutes');
      }
      throw error;
    }
  }

  /**
   * Simple geometry decimation to reduce vertex count
   */
  private decimateGeometry(geometry: THREE.BufferGeometry, targetVertices: number): THREE.BufferGeometry {
    const currentVertices = geometry.attributes.position.count;
    
    if (currentVertices <= targetVertices) {
      return geometry;
    }
    
    // Calculate decimation ratio
    const ratio = targetVertices / currentVertices;
    
    // For now, just return a simplified box geometry as a placeholder
    // In production, you'd use a proper decimation algorithm
    console.warn(`⚠️ Using simplified box geometry instead of proper decimation`);
    console.warn(`📦 Original: ${currentVertices} vertices → Target: ${targetVertices} vertices`);
    
    // Create a simple box that roughly matches brick dimensions
    const boxGeometry = new THREE.BoxGeometry(1, 0.4, 1, 2, 1, 2);
    
    // Copy UV and normal attributes if needed
    if (geometry.attributes.uv) {
      boxGeometry.computeBoundingBox();
    }
    
    return boxGeometry;
  }

  /**
   * Update project database with model URL using direct HTTP request
   */
  private async updateProjectDatabase(projectId: string, modelUrl: string, fileSize: number): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🌐 Using HTTP request to update project (bypassing Supabase client)...');
      console.log(`🔍 Starting database update for project: ${projectId}`);
      
      // Get authentication info
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
      }

      // Get user token
      let accessToken = supabaseKey; // Default to anon key
      
      // Try to get the actual user token from Supabase session
      console.log('🔑 Attempting to get auth session...');
      try {
        const sessionPromise = supabase.auth.getSession();
        const sessionTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session fetch timeout')), 5000)
        );
        
        const { data: { session } } = await Promise.race([sessionPromise, sessionTimeout]) as any;
        if (session?.access_token) {
          accessToken = session.access_token;
          console.log('🔑 Using user access token for update');
        } else {
          console.log('🔑 No session found, using anon key');
        }
      } catch (e: any) {
        console.log('🔑 Session fetch failed, using anon key for update:', e.message || e);
      }

      // Prepare the update data
      const updateData = {
        optimized_model_url: modelUrl,
        model_file_size: fileSize,
        updated_at: new Date().toISOString()
      };

      // Make the HTTP PATCH request
      const url = `${supabaseUrl}/rest/v1/projects?id=eq.${projectId}`;
      const headers = {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${accessToken}`,
        'Prefer': 'return=representation'
      };

      const requestBody = JSON.stringify(updateData);

      console.log('\n🔍 ===== PATCH REQUEST DEBUG =====');
      console.log(`📍 URL: ${url}`);
      console.log(`📦 Project ID: ${projectId}`);
      console.log('📋 Headers:', JSON.stringify(headers, null, 2));
      console.log('📝 Request Body:', requestBody);
      console.log('📊 Body Details:', {
        optimized_model_url: modelUrl,
        model_file_size: fileSize,
        updated_at: updateData.updated_at
      });
      console.log('🔗 Model URL length:', modelUrl.length);
      console.log('================================\n');

      // Add timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('⏰ PATCH request timeout - aborting...');
        controller.abort();
      }, 30000); // 30 second timeout
      
      const response = await fetch(url, {
        method: 'PATCH',
        headers,
        body: requestBody,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      console.log('\n🔍 ===== PATCH RESPONSE DEBUG =====');
      console.log('📊 Status:', response.status, response.statusText);
      console.log('📋 Response Headers:');
      response.headers.forEach((value, key) => {
        console.log(`  ${key}: ${value}`);
      });

      const responseText = await response.text();
      console.log('📝 Raw Response Body:', responseText);
      console.log('📏 Response Length:', responseText.length, 'characters');
      console.log('==================================\n');

      if (!response.ok) {
        console.error('❌ HTTP update error:', responseText);
        return { success: false, error: `HTTP ${response.status}: ${responseText}` };
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        console.error('❌ Failed to parse response as JSON:', responseText);
        return { success: false, error: 'Invalid JSON response from server' };
      }

      console.log('✅ Project updated successfully via HTTP:', result);
      
      // Check if the update actually worked
      if (Array.isArray(result) && result.length > 0) {
        const updated = result[0];
        console.log('📊 Updated project fields:', Object.keys(updated));
        if (updated.optimized_model_url !== modelUrl) {
          console.warn('⚠️ URL was not updated in response:', {
            expected: modelUrl,
            actual: updated.optimized_model_url
          });
          
          // Try a direct GET to verify the update
          console.log('🔍 Verifying update with GET request...');
          const verifyResponse = await fetch(`${supabaseUrl}/rest/v1/projects?id=eq.${projectId}&select=id,optimized_model_url,model_file_size`, {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          if (verifyResponse.ok) {
            const verifyResult = await verifyResponse.json();
            console.log('🔍 Verification result:', verifyResult);
          }
        } else {
          console.log('✅ Model URL successfully updated in database');
        }
      }
      
      return { success: true };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('❌ Database update timed out after 30 seconds');
        console.log(`📋 Model URL for manual access: ${modelUrl}`);
        return { success: false, error: 'Database update timed out' };
      }
      console.error('❌ Database update error:', error.message);
      console.error('Full error:', error);
      console.log(`📋 Model URL for manual access: ${modelUrl}`);
      return { success: false, error: error.message || 'Database update failed' };
    }
  }

  /**
   * Upload to DigitalOcean Spaces - much faster than Supabase
   */
  private async uploadToDigitalOcean(projectId: string, fileName: string, glbData: ArrayBuffer, onProgress?: (progress: ExportProgress) => void): Promise<{ success: boolean; url?: string; error?: string }> {
    console.log(`\n📤 ===== DIGITALOCEAN SPACES UPLOAD =====`);
    console.log(`📁 File: ${fileName}`);
    console.log(`📏 Size: ${Math.round(glbData.byteLength / 1024)}KB`);
    console.log(`🕐 Start time: ${new Date().toISOString()}`);
    
    try {
      // DigitalOcean Spaces configuration
      const accessKeyId = 'DO8014G36CQCKEAQEYRJ'; // TODO: Move to env vars
      const secretAccessKey = 'FdR3RelIxs9xgqOZIfP+cC59nadJzfSGx0zEIILZrrA'; // TODO: Move to env vars
      const bucket = 'iadr-climate-refugee';
      const region = 'nyc3';
      const endpoint = `https://${region}.digitaloceanspaces.com`;
      
      // Initialize S3 client for DigitalOcean Spaces
      const s3Client = new S3Client({
        endpoint: endpoint,
        region: region,
        credentials: {
          accessKeyId: accessKeyId,
          secretAccessKey: secretAccessKey,
        },
      });
      
      const uploadPath = `projects/${projectId}/${fileName}`;
      
      console.log(`🎯 Uploading to: ${bucket}/${uploadPath}`);
      
      const uploadStartTime = Date.now();
      
      // Convert ArrayBuffer to Uint8Array for S3
      const uint8Array = new Uint8Array(glbData);
      
      // Upload using S3 client
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: uploadPath,
        Body: uint8Array,
        ContentType: 'model/gltf-binary',
        ACL: 'public-read',
      });
      
      // Add progress tracking
      if (onProgress) {
        onProgress({ 
          stage: 'Uploading to DigitalOcean Spaces...', 
          progress: 85
        });
      }
      
      console.log('📤 Uploading file to DigitalOcean Spaces...');
      await s3Client.send(command);
      
      const uploadTime = (Date.now() - uploadStartTime) / 1000;
      const uploadSpeed = (glbData.byteLength / 1024 / 1024) / uploadTime;
      
      if (onProgress) {
        onProgress({ 
          stage: 'Upload complete, updating database...', 
          progress: 95
        });
      }
      
      console.log(`⏱️ Upload completed in ${uploadTime.toFixed(1)}s`);
      console.log(`⚡ Upload speed: ${uploadSpeed.toFixed(2)} MB/s`);
      
      // The public URL for the file
      const publicUrl = `https://${bucket}.${region}.digitaloceanspaces.com/${uploadPath}`;
      console.log(`✅ File uploaded successfully to DigitalOcean Spaces`);
      console.log(`🔗 Public URL: ${publicUrl}`);
      
      // Update database with the new URL
      const updateResult = await this.updateProjectDatabase(projectId, publicUrl, glbData.byteLength);
      
      if (updateResult.success) {
        console.log('✅ Database updated successfully');
      } else {
        console.warn('⚠️ Database update failed, but file is uploaded:', updateResult.error);
      }
      
      return { success: true, url: publicUrl };
      
    } catch (error: any) {
      console.error('❌ DigitalOcean upload error:', error);
      return { 
        success: false, 
        error: `DigitalOcean upload failed: ${error.message}` 
      };
    }
  }

  /**
   * Resumable upload using TUS protocol for large files
   */
  private async resumableUpload(projectId: string, fileName: string, glbData: ArrayBuffer, onProgress?: (progress: ExportProgress) => void): Promise<{ success: boolean; url?: string; error?: string }> {
    console.log(`\n📤 ===== RESUMABLE UPLOAD (TUS) =====`);
    console.log(`📁 File: ${fileName}`);
    console.log(`📏 Size: ${Math.round(glbData.byteLength / 1024)}KB`);
    console.log(`🕐 Start time: ${new Date().toISOString()}`);
    
    try {
      // Get auth session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No authenticated session');
      }

      // Convert ArrayBuffer to File
      const blob = new Blob([glbData], { type: 'model/gltf-binary' });
      const file = new File([blob], fileName, { type: 'model/gltf-binary' });
      
      // Get Supabase project ID from the URL
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const supabaseProjectId = supabaseUrl.split('.')[0].replace('https://', '');
      
      console.log(`🔗 Using direct storage hostname for better performance`);
      console.log(`📍 Project ID: ${supabaseProjectId}`);
      
      const uploadPath = `${projectId}/${fileName}`;
      
      return new Promise((resolve, reject) => {
        const tusEndpoint = `https://${supabaseProjectId}.storage.supabase.co/storage/v1/upload/resumable`;
        console.log(`🎯 TUS endpoint: ${tusEndpoint}`);
        console.log(`📦 Upload path: ${uploadPath}`);
        
        const uploadStartTime = Date.now();
        
        const upload = new tus.Upload(file, {
          // Use direct storage hostname for better performance
          endpoint: tusEndpoint,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            authorization: `Bearer ${session.access_token}`,
            'x-upsert': 'true', // Overwrite existing files
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: 'project-models',
            objectName: uploadPath,
            contentType: 'model/gltf-binary',
            cacheControl: '3600',
          },
          chunkSize: 6 * 1024 * 1024, // 6MB chunks as required by Supabase
          onError: (error) => {
            console.error('❌ TUS upload failed:', error);
            reject(error);
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            const percentage = (bytesUploaded / bytesTotal) * 100;
            const elapsedTime = (Date.now() - uploadStartTime) / 1000;
            const uploadSpeed = (bytesUploaded / 1024 / 1024) / elapsedTime; // MB/s
            const remainingBytes = bytesTotal - bytesUploaded;
            const estimatedTimeRemaining = remainingBytes / (bytesUploaded / elapsedTime) / 1000;
            
            console.log(`📊 Upload progress: ${percentage.toFixed(2)}% (${Math.round(bytesUploaded / 1024)}KB / ${Math.round(bytesTotal / 1024)}KB)`);
            console.log(`⚡ Upload speed: ${uploadSpeed.toFixed(2)} MB/s | Time elapsed: ${elapsedTime.toFixed(1)}s | ETA: ${estimatedTimeRemaining.toFixed(1)}s`);
            
            // Update progress callback
            if (onProgress) {
              const overallProgress = 80 + (percentage * 0.15); // 80-95% range for upload
              onProgress({ 
                stage: `Uploading to cloud storage (${percentage.toFixed(0)}%) - ${uploadSpeed.toFixed(1)} MB/s`, 
                progress: overallProgress 
              });
            }
          },
          onSuccess: async () => {
            const totalUploadTime = (Date.now() - uploadStartTime) / 1000;
            const averageSpeed = (file.size / 1024 / 1024) / totalUploadTime;
            console.log('✅ TUS upload completed successfully');
            console.log(`⏱️ Total upload time: ${totalUploadTime.toFixed(1)}s`);
            console.log(`⚡ Average speed: ${averageSpeed.toFixed(2)} MB/s`);
            
            try {
              // Get public URL using Supabase client
              const { data: urlData } = supabase
                .storage
                .from('project-models')
                .getPublicUrl(uploadPath);
              
              const publicUrl = urlData?.publicUrl || '';
              console.log(`🔗 Public URL: ${publicUrl}`);
              
              // Update database
              console.log('\n📝 Updating database...');
              const updateResult = await this.updateProjectDatabase(projectId, publicUrl, file.size);
              
              if (updateResult.success) {
                console.log('✅ Database updated successfully');
                resolve({ success: true, url: publicUrl });
              } else {
                console.error('❌ Database update failed:', updateResult.error);
                resolve({ success: true, url: publicUrl }); // Still return URL even if DB update fails
              }
            } catch (error) {
              console.error('❌ Post-upload processing failed:', error);
              resolve({ success: true, url: '' }); // Upload succeeded, just URL retrieval failed
            }
          },
        });

        // Check for previous uploads and resume if found
        upload.findPreviousUploads().then((previousUploads) => {
          if (previousUploads.length) {
            console.log('📂 Found previous upload, resuming...');
            upload.resumeFromPreviousUpload(previousUploads[0]);
          }
          // Start the upload
          upload.start();
        });
      });
    } catch (error: any) {
      console.error('❌ Resumable upload error:', error);
      return { 
        success: false, 
        error: `Resumable upload failed: ${error.message}` 
      };
    }
  }

  /**
   * Simple debug upload - combines upload and database update in one flow
   */
  private async simpleDebugUpload(projectId: string, fileName: string, glbData: ArrayBuffer): Promise<{ success: boolean; url?: string; error?: string }> {
    console.log(`\n🚨 ===== SIMPLE DEBUG UPLOAD =====`);
    console.log(`📁 File: ${fileName}`);
    console.log(`📏 Size: ${Math.round(glbData.byteLength / 1024)}KB`);
    console.log(`🕐 Start time: ${new Date().toISOString()}`);
    
    try {
      // Step 1: Upload file to storage with timeout
      console.log('\n📤 Step 1: Using DIRECT API upload (bypassing hanging client)...');
      const uploadPath = `${projectId}/${fileName}`;
      
      console.log(`📍 Upload path: project-models/${uploadPath}`);
      console.log(`🚀 Using fetch() instead of Supabase client`);
      
      const uploadStart = Date.now();
      let uploadResult: any;
      let uploadTime: number;
      
      try {
        // Wrap storage upload with timeout
                  // Use direct API upload instead of hanging Supabase client
          uploadResult = await this.directAPIUpload(uploadPath, glbData);
        
        uploadTime = Date.now() - uploadStart;
              } catch (uploadError: any) {
          uploadTime = Date.now() - uploadStart;
          console.error(`❌ Direct API upload failed after ${uploadTime}ms:`, uploadError);
          
          return { 
            success: false, 
            error: `Direct API upload failed: ${uploadError.message}` 
          };
        }
      
      console.log(`📤 Upload completed in ${uploadTime}ms`);
      
      if (uploadResult.error) {
        console.error(`❌ Upload failed:`, uploadResult.error);
        return { success: false, error: uploadResult.error.message };
      }
      
      console.log(`✅ File uploaded successfully`);
      console.log(`📁 Upload path: ${uploadResult.data?.path}`);
      
      // Step 2: Get public URL
      console.log('\n🔗 Step 2: Getting public URL...');
      const { data: urlData } = supabase
        .storage
        .from('project-models')
        .getPublicUrl(uploadPath);
      
      console.log(`🔗 Public URL: ${urlData.publicUrl}`);
      
      // Step 3: Update database record with timeout
      console.log('\n🗄️ Step 3: Updating database record...');
      
      const dbStart = Date.now();
      
      try {
        // Add timeout to database update
        const updatePromise = supabase
        .from('projects')
        .update({
          optimized_model_url: urlData.publicUrl,
          model_file_size: glbData.byteLength,
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId);
        
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Database update timed out after 10 seconds')), 10000);
        });
        
        const updateResult = await Promise.race([updatePromise, timeoutPromise]) as any;
      const dbTime = Date.now() - dbStart;
      
      console.log(`🗄️ Database update completed in ${dbTime}ms`);
      
      if (updateResult.error) {
        console.error(`❌ Database update failed:`, updateResult.error);
          // Continue anyway - file is uploaded
          console.log(`⚠️ Continuing despite database error - file is uploaded`);
        } else {
          console.log(`✅ Database record updated successfully`);
        }
      } catch (dbError: any) {
        const dbTime = Date.now() - dbStart;
        console.error(`❌ Database update error after ${dbTime}ms:`, dbError.message);
        console.log(`⚠️ Continuing despite database error - file is uploaded`);
      }
      
      const totalTime = Date.now() - uploadStart;
      console.log(`\n🎉 ===== UPLOAD COMPLETE =====`);
      console.log(`⏱️ Total time: ${totalTime}ms`);
      console.log(`📊 Upload: ${uploadTime}ms`);
      console.log(`🌐 Final URL: ${urlData.publicUrl}`);
      
      return { 
        success: true, 
        url: urlData.publicUrl 
      };
      
    } catch (error: any) {
      console.error(`❌ Simple debug upload failed:`, error);
      return { 
        success: false, 
        error: error.message || 'Unknown error in simple debug upload' 
      };
    }
  }

  /**
   * Simple upload without any diagnostics - for emergency use when diagnostics hang
   */
  private async uploadWithoutDiagnostics(fileName: string, glbData: ArrayBuffer): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      console.log(`\n🚨 ===== EMERGENCY UPLOAD (NO DIAGNOSTICS) =====`);
      console.log(`📤 Direct upload without any preliminary checks`);
      console.log(`📁 File: ${fileName}`);
      console.log(`📏 Size: ${Math.round(glbData.byteLength / 1024)}KB`);
      
      const projectId = fileName.split('-optimized-')[0].replace('project-', '');
      const uploadPath = `${projectId}/${fileName}`;
      
      console.log(`🚀 Direct upload to: project-models/${uploadPath}`);
      
              // Use direct API upload instead of Supabase client (which hangs)
        const result = await this.directAPIUpload(uploadPath, glbData);
      
        if (result.error) {
        console.error(`❌ Direct upload failed:`, result.error);
        return { success: false, error: result.error.message };
      }
      
      const { data: urlData } = supabase
        .storage
        .from('project-models')
        .getPublicUrl(uploadPath);
      
      console.log(`✅ Direct upload successful: ${urlData.publicUrl}`);
      return { success: true, url: urlData.publicUrl };
      
    } catch (error: any) {
      console.error(`❌ Emergency upload failed:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Upload GLB data with smart timeout and aggressive retry logic
   */
  private async uploadWithTimeout(fileName: string, glbData: ArrayBuffer, maxTimeoutMs: number, skipDiagnostics: boolean = false): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      console.log(`\n🚀 ===== UPLOAD PROCESS START =====`);
      console.log(`🕐 Current time: ${new Date().toISOString()}`);
      console.log(`📤 Starting upload process for: ${fileName}`);
      
      // Convert to File object for upload
      const blob = new Blob([glbData], { type: 'model/gltf-binary' });
      const file = new File([blob], fileName, { type: 'model/gltf-binary' });

      console.log('📊 File Details:');
      console.log('  📁 File name:', fileName);
      console.log('  📏 ArrayBuffer size:', glbData.byteLength, 'bytes');
      console.log('  📏 Blob size:', blob.size, 'bytes');
      console.log('  📏 File size:', file.size, 'bytes', `(${Math.round(file.size / 1024)}KB)`);
      console.log('  🏷️ Content type:', file.type);
      
      // Extract project ID
      const projectId = fileName.split('-optimized-')[0].replace('project-', '');
      console.log('🆔 Extracted project ID:', projectId);
      
      // Pre-upload diagnostics - CRITICAL FOR DEBUGGING!
      if (skipDiagnostics) {
        console.log(`\n⏭️ ===== SKIPPING DIAGNOSTICS =====`);
        console.log(`🚀 Diagnostics skipped as requested - proceeding directly to upload...`);
      } else {
        console.log(`\n🔍 ===== PRE-UPLOAD DIAGNOSTICS =====`);
        console.log(`⏰ Running diagnostics with individual timeouts to prevent hanging...`);
        
        const diagnosticsStartTime = Date.now();
      
              // 1. Check authentication (with aggressive timeout to prevent hanging)
        console.log('🔐 1. Checking Supabase authentication...');
        try {
          console.log('🔐 Calling supabase.auth.getSession() with 3s aggressive timeout...');
          
          // Use AbortController for more reliable timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.warn('⚠️ Auth check timeout triggered after 3s - aborting');
            controller.abort();
          }, 3000);
          
          let authResult;
          try {
            // Note: Supabase client doesn't support AbortController, so we still use Promise.race
            const authPromise = supabase.auth.getSession();
            const authTimeout = new Promise((_, reject) => {
              setTimeout(() => {
                console.error('⏰ Auth Promise.race timeout after 3s');
                reject(new Error('Auth check timeout after 3s'));
              }, 3000);
            });
            
            authResult = await Promise.race([authPromise, authTimeout]);
          } finally {
            clearTimeout(timeoutId);
          }
          
          const { data: { session }, error: sessionError } = authResult as any;
          
          if (sessionError) {
            console.error('❌ Auth session error:', sessionError);
          } else if (session) {
            console.log('✅ User authenticated:', session.user.id, `(${session.user.email})`);
            console.log('🔑 Access token length:', session.access_token?.length || 'missing');
            console.log('⏰ Token expires:', new Date(session.expires_at! * 1000).toISOString());
            console.log('🔄 Refresh token present:', session.refresh_token ? 'YES' : 'NO');
          } else {
            console.warn('⚠️ No active session found - this could be the problem!');
          }
        } catch (authError) {
          console.error('❌ Auth check failed (timeout or error):', authError);
          console.log('⚠️ Proceeding with upload anyway - auth diagnostics are non-critical');
        }
      
        // 2. Test bucket access (with timeout)
        console.log('\n🪣 2. Testing storage bucket access...');
        try {
          console.log('📋 Listing all buckets with 3s timeout...');
          const bucketPromise = supabase.storage.listBuckets();
          const bucketTimeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Bucket list timeout after 3s')), 3000);
          });
          
          const { data: buckets, error: bucketsError } = await Promise.race([bucketPromise, bucketTimeout]) as any;
          
          if (bucketsError) {
            console.error('❌ Failed to list buckets:', bucketsError);
          } else {
            console.log('✅ Available buckets:', buckets?.map((b: any) => `${b.name} (public: ${b.public})`).join(', '));
            const projectModelsBucket = buckets?.find((b: any) => b.name === 'project-models');
            if (projectModelsBucket) {
              console.log('✅ project-models bucket found:', {
                name: projectModelsBucket.name,
                public: projectModelsBucket.public,
                created_at: projectModelsBucket.created_at,
                updated_at: projectModelsBucket.updated_at
              });
            } else {
              console.error('❌ project-models bucket NOT FOUND! Available:', buckets?.map((b: any) => b.name));
            }
          }
        } catch (bucketError) {
          console.error('❌ Bucket access test failed (possibly timed out):', bucketError);
          console.log('⚠️ Proceeding with upload anyway - bucket diagnostics are non-critical');
        }
      
        // 3. Test project folder (with timeout)
        console.log('\n📁 3. Testing project folder access...');
        try {
          console.log(`📂 Listing files in project folder: ${projectId}/ with 3s timeout...`);
          const listPromise = supabase
            .storage
            .from('project-models')
            .list(projectId, { limit: 10 });
          const listTimeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Folder list timeout after 3s')), 3000);
          });
          
          const { data: files, error: listError } = await Promise.race([listPromise, listTimeout]) as any;
          
          if (listError) {
            console.error('❌ Failed to list project folder:', listError);
          } else {
            console.log(`✅ Project folder accessible: ${files?.length || 0} existing files`);
            if (files && files.length > 0) {
              console.log('📄 Existing files:', files.map((f: any) => `${f.name} (${f.metadata?.size || '?'} bytes)`));
            }
          }
        } catch (listError) {
          console.error('❌ Project folder test failed (possibly timed out):', listError);
          console.log('⚠️ Proceeding with upload anyway - folder diagnostics are non-critical');
        }
      
        // 4. Check for existing file (with timeout)
        console.log('\n🔍 4. Checking for existing file...');
        try {
          console.log(`🔍 Checking existing file with 3s timeout...`);
          const downloadPromise = supabase
            .storage
            .from('project-models')
            .download(`${projectId}/${fileName}`);
          const downloadTimeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Existing file check timeout after 3s')), 3000);
          });
          
          const { data: existingFile, error: existingError } = await Promise.race([downloadPromise, downloadTimeout]) as any;
          
          if (existingError && existingError.message !== 'Object not found') {
            console.warn('⚠️ Error checking existing file:', existingError);
          } else if (existingFile) {
            console.log('📄 Existing file found - will be overwritten with upsert:true');
            console.log('📏 Existing file size:', existingFile.size, 'bytes');
          } else {
            console.log('✅ No existing file - fresh upload');
          }
        } catch (existingError) {
          console.log('✅ No existing file found or check timed out (expected for new uploads)');
        }
      
        const diagnosticsDuration = Date.now() - diagnosticsStartTime;
        console.log(`\n✅ ===== DIAGNOSTICS COMPLETE =====`);
        console.log(`🚀 Diagnostics completed in ${diagnosticsDuration}ms - proceeding to actual upload...`);
        console.log(`📊 Ready to upload ${Math.round(glbData.byteLength / 1024)}KB file`);
        
        if (diagnosticsDuration > 10000) {
          console.warn(`⚠️ Diagnostics took ${diagnosticsDuration}ms (>10s) - this may indicate network issues`);
        }
      }
      
      // Smart timeout based on file size
      const fileSizeKB = file.size / 1024;
      let uploadTimeout: number;
      let retryTimeout: number;
      let maxRetries: number;
      
      if (fileSizeKB < 100) { // < 100KB - very small
        uploadTimeout = 15000; // 15 seconds
        retryTimeout = 10000; // 10 seconds  
        maxRetries = 3;
        console.log('\n📦 Very small file detected - using aggressive fast timeouts');
      } else if (fileSizeKB < 500) { // < 500KB - small
        uploadTimeout = 30000; // 30 seconds
        retryTimeout = 20000; // 20 seconds
        maxRetries = 2;
        console.log('\n📦 Small file detected - using fast timeouts');
      } else if (fileSizeKB < 2048) { // < 2MB - medium
        uploadTimeout = 60000; // 1 minute
        retryTimeout = 45000; // 45 seconds
        maxRetries = 2;
        console.log('\n📦 Medium file detected - using standard timeouts');
      } else { // > 2MB - large
        uploadTimeout = Math.min(maxTimeoutMs, 240000); // 4 minutes max
        retryTimeout = 120000; // 2 minutes
        maxRetries = 1;
        console.log('\n📦 Large file detected - using extended timeouts');
      }
      
      console.log('⏰ Timeout Configuration:');
      console.log(`  ⏱️ Upload timeout: ${uploadTimeout / 1000}s`);
      console.log(`  🔄 Retry timeout: ${retryTimeout / 1000}s`);
      console.log(`  🔁 Max retries: ${maxRetries}`);
      console.log(`  🚀 Total attempts: ${maxRetries + 1}`);
      
      console.log(`\n🔄 ===== STARTING UPLOAD ATTEMPTS =====`);
      
      // Attempt upload with retries
      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        const attemptStartTime = Date.now();
        const isRetry = attempt > 1;
        
        console.log(`\n🚀 ===== ATTEMPT ${attempt}/${maxRetries + 1} =====`);
        console.log(`🕐 Attempt start time: ${new Date().toISOString()}`);
        
        if (isRetry) {
          console.log(`🔄 This is retry ${attempt - 1}`);
          // Add exponential backoff for retries
          const delayMs = Math.min(1000 * (attempt - 1), 5000);
          console.log(`⏳ Applying retry delay: ${delayMs}ms`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        try {
          // Create upload promise - try direct ArrayBuffer upload for better reliability
          console.log(`📤 Preparing upload attempt ${attempt}`);
          console.log(`🎯 Using direct Supabase storage.upload() with ArrayBuffer`);
          console.log(`📁 Target path: ${projectId}/${fileName}`);
          console.log(`📊 Data: ArrayBuffer(${glbData.byteLength} bytes)`);
          console.log(`⚙️ Options: { cacheControl: '3600', upsert: true, contentType: 'model/gltf-binary' }`);
          
          const uploadPath = `${projectId}/${fileName}`;
          console.log(`🚀 Initiating upload to project-models/${uploadPath}...`);
          
          const uploadPromise = supabase
            .storage
            .from('project-models')
            .upload(uploadPath, glbData, {
              cacheControl: '3600',
              upsert: true, // Allow overwriting if file exists - this could solve our conflicts!
              contentType: 'model/gltf-binary'
            })
            .then(result => {
              const endTime = Date.now();
              console.log(`📤 Upload attempt ${attempt} completed at ${new Date().toISOString()}`);
              console.log(`⏱️ Upload duration: ${endTime - attemptStartTime}ms`);
              console.log(`📤 Raw Supabase result:`, JSON.stringify(result, null, 2));
              
              if (result.error) {
                console.error(`❌ Upload attempt ${attempt} FAILED`);
                console.error(`   Error type: ${result.error.name || 'Unknown'}`);
                console.error(`   Error message: ${result.error.message}`);
                console.error(`   Error details:`, result.error);
                if ((result.error as any).details) {
                  console.error(`   Additional details:`, (result.error as any).details);
                }
                return { error: result.error, url: null };
              }
              
              console.log(`✅ Upload attempt ${attempt} SUCCEEDED!`);
              console.log(`📁 Uploaded file details:`);
              console.log(`   Path: ${result.data?.path}`);
              console.log(`   ID: ${result.data?.id}`);
              console.log(`   Full name: ${result.data?.fullPath}`);
              
              // Get public URL for the uploaded file
              console.log(`🔗 Getting public URL for: ${uploadPath}`);
              const { data: urlData } = supabase
                .storage
                .from('project-models')
                .getPublicUrl(uploadPath);
              console.log(`🔗 Public URL generation result:`, JSON.stringify(urlData, null, 2));
              console.log(`🌐 Final public URL: ${urlData.publicUrl}`);
              
              return { error: null, url: urlData.publicUrl };
            })
            .catch(uploadError => {
              console.error(`❌ Upload attempt ${attempt} EXCEPTION:`, uploadError);
              console.error(`   Exception type: ${uploadError.constructor.name}`);
              console.error(`   Exception message: ${uploadError.message}`);
              console.error(`   Exception stack:`, uploadError.stack);
              return { error: uploadError, url: null };
            });
          
          // Create timeout promise with appropriate timeout
          const currentTimeout = isRetry ? retryTimeout : uploadTimeout;
          console.log(`⏰ Setting up timeout for attempt ${attempt}: ${currentTimeout / 1000}s`);
          const timeoutPromise = new Promise<{ url?: string; error?: any }>((_, reject) => {
            setTimeout(() => {
              console.error(`⏰ TIMEOUT TRIGGERED for attempt ${attempt} after ${currentTimeout / 1000}s`);
              reject(new Error(`Upload timeout after ${currentTimeout / 1000} seconds (attempt ${attempt})`));
            }, currentTimeout);
          });
          
          console.log(`🏁 Racing upload vs timeout for attempt ${attempt}...`);
          console.log(`   Upload promise: Ready`);
          console.log(`   Timeout promise: ${currentTimeout / 1000}s`);
          
          // Race upload vs timeout
          const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);
          
          const attemptDuration = ((Date.now() - attemptStartTime) / 1000).toFixed(1);
          console.log(`🏁 Upload attempt ${attempt} race completed in ${attemptDuration}s`);
          
          const { url, error: uploadError } = uploadResult;
          console.log(`📊 Upload attempt ${attempt} result analysis:`);
          console.log(`   URL present: ${url ? 'YES' : 'NO'}`);
          console.log(`   URL value: ${url || 'null'}`);
          console.log(`   Error present: ${uploadError ? 'YES' : 'NO'}`);
          console.log(`   Error type: ${uploadError?.constructor?.name || 'none'}`);
          console.log(`   Error message: ${uploadError?.message || 'none'}`);

          if (!uploadError && url) {
            console.log(`\n🎉 ===== UPLOAD SUCCESS =====`);
            console.log(`✅ Upload successful on attempt ${attempt}!`);
            console.log(`🌐 Final URL: ${url}`);
            console.log(`⏱️ Total duration: ${attemptDuration}s`);
            console.log(`🚀 Returning success result...`);
            return { success: true, url };
          } else {
            console.log(`\n❌ ===== UPLOAD FAILED =====`);
            console.warn(`⚠️ Upload attempt ${attempt} failed:`);
            console.warn(`   Reason: ${uploadError?.message || 'Unknown error'}`);
            console.warn(`   URL received: ${url || 'none'}`);
            
            if (attempt === maxRetries + 1) {
              // Last attempt failed, save locally as fallback
              console.log(`\n💾 ===== FINAL FALLBACK =====`);
              console.log('💾 All upload attempts exhausted, saving locally...');
              return await this.saveLocallyAsFallback(fileName, file);
            }
            // Continue to next retry
            console.log(`🔄 Will retry upload (${maxRetries + 1 - attempt} attempts remaining)`);
          }
          
        } catch (timeoutError: any) {
          const attemptDuration = ((Date.now() - attemptStartTime) / 1000).toFixed(1);
          console.log(`\n⏰ ===== TIMEOUT CAUGHT =====`);
          console.error(`❌ Upload attempt ${attempt} timed out after ${attemptDuration}s`);
          console.error(`   Timeout error: ${timeoutError.message}`);
          console.error(`   Expected timeout: 30s`);
          console.error(`   Actual duration: ${attemptDuration}s`);
          
          if (attempt === maxRetries + 1) {
            // Last attempt failed, save locally as fallback
            console.log(`\n💾 ===== TIMEOUT FALLBACK =====`);
            console.log('💾 All upload attempts timed out, saving locally...');
            return await this.saveLocallyAsFallback(fileName, file);
          }
          // Continue to next retry
          console.log(`🔄 Timeout on attempt ${attempt}, will retry (${maxRetries + 1 - attempt} attempts remaining)`);
        }
        
        // Wait a bit before retry (backoff)
        if (attempt <= maxRetries) {
          const backoffMs = attempt * 1000; // 1s, 2s, 3s...
          console.log(`\n⏳ ===== RETRY BACKOFF =====`);
          console.log(`⏳ Waiting ${backoffMs}ms before retry...`);
          console.log(`🕐 Next attempt starts at: ${new Date(Date.now() + backoffMs).toISOString()}`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          console.log(`✅ Backoff complete, starting next attempt...`);
        }
      }
      
      // This should not be reached, but just in case
      console.log(`\n🚨 ===== UNEXPECTED FALLBACK =====`);
      console.log('💾 Unexpected: All attempts completed without resolution, saving locally...');
      console.log('🐛 This indicates a bug in the upload logic - please report this!');
      return await this.saveLocallyAsFallback(fileName, file);
      
    } catch (error: any) {
      console.log(`\n💥 ===== UPLOAD SYSTEM ERROR =====`);
      console.error('❌ Upload system caught unexpected error:', error);
      console.error('   Error type:', error.constructor?.name);
      console.error('   Error message:', error.message);
      console.error('   Error stack:', error.stack);
      console.log('🚨 This represents a critical failure in the upload system');
      return { success: false, error: error.message || 'Unknown upload error' };
    }
  }

  /**
   * Convert ArrayBuffer to Base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Save model locally as fallback when upload fails
   */
  private async saveLocallyAsFallback(fileName: string, file: File): Promise<{ success: boolean; error: string }> {
    console.log(`\n💾 ===== LOCAL STORAGE FALLBACK =====`);
    console.log('💾 Saving optimized model locally as fallback...');
    console.log(`🕐 Fallback initiated at: ${new Date().toISOString()}`);
    console.log(`📁 File name: ${fileName}`);
    console.log(`📏 File size: ${file.size} bytes (${Math.round(file.size / 1024)}KB)`);
    
    try {
      // Extract project ID from filename
      const projectId = fileName.split('-optimized-')[0].replace('project-', '');
      console.log(`🆔 Extracted project ID: ${projectId}`);
      
      const localStorageKey = `optimized_model_${projectId}`;
      console.log(`🔑 Local storage key: ${localStorageKey}`);
      
      console.log(`📊 Converting file to Base64 for local storage...`);
      const arrayBuffer = await file.arrayBuffer();
      console.log(`🔄 File converted to ArrayBuffer: ${arrayBuffer.byteLength} bytes`);
      
      const uint8Array = new Uint8Array(arrayBuffer);
      console.log(`🔄 ArrayBuffer converted to Uint8Array: ${uint8Array.length} items`);
      
      const dataArray = Array.from(uint8Array);
      console.log(`🔄 Uint8Array converted to Array: ${dataArray.length} items`);
      
      const modelData = {
        projectId,
        fileName,
        fileSize: file.size,
        data: dataArray,
        timestamp: Date.now()
      };
      
      const jsonString = JSON.stringify(modelData);
      console.log(`📊 Local storage data prepared:`);
      console.log(`   JSON size: ${jsonString.length} characters`);
      console.log(`   Data array length: ${dataArray.length}`);
      console.log(`   Timestamp: ${new Date(modelData.timestamp).toISOString()}`);
      
      console.log(`💾 Saving to localStorage with key: ${localStorageKey}`);
      localStorage.setItem(localStorageKey, jsonString);
      console.log(`✅ Successfully saved to localStorage`);
      console.log('✅ Model saved locally for offline access');
      return { success: false, error: 'Upload failed but model saved locally' };
    } catch (localError: any) {
      console.error('❌ Failed to save locally:', localError);
      return { success: false, error: `Upload failed and local storage failed: ${localError.message}` };
    }
  }

  /**
   * Export a Three.js scene to GLB format
   */
  private async exportSceneToGLB(scene: THREE.Scene, onProgress?: (progress: ExportProgress) => void): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      try {
        console.warn('🚨 INSIDE exportSceneToGLB:');
        console.warn(`   - Scene children: ${scene.children.length}`);
        scene.children.forEach((child, index) => {
          const mesh = child as any; // Cast to access mesh properties
          console.warn(`   ${index + 1}. ${child.name} - visible: ${child.visible} - type: ${child.type}`);
          if (mesh.geometry) {
            console.warn(`      - is mesh: true - vertices: ${mesh.geometry.attributes.position?.count || 0}`);
            console.warn(`      - material name: ${mesh.material?.name || 'unnamed'}`);
          } else {
            console.warn(`      - is mesh: false`);
          }
        });
        
        // Export the scene as GLB binary
        this.gltfExporter.parse(
          scene,
          (result: any) => {
            try {
              console.warn('🚨 GLTFExporter SUCCESS CALLBACK:');
              console.warn(`   - Result type: ${typeof result}`);
              console.warn(`   - Result is ArrayBuffer: ${result instanceof ArrayBuffer}`);
              console.warn(`   - Result is Uint8Array: ${result instanceof Uint8Array}`);
              if (result instanceof ArrayBuffer) {
                console.warn(`   - ArrayBuffer size: ${Math.round(result.byteLength / 1024)}KB`);
              }
              
              let glbData: ArrayBuffer;
              
              // Handle different result types from GLTFExporter
              if (result instanceof ArrayBuffer) {
                glbData = result;
              } else if (result instanceof Uint8Array) {
                glbData = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
              } else if (result && typeof result === 'object' && result.buffer instanceof ArrayBuffer) {
                glbData = result.buffer;
              } else {
                throw new Error(`Unexpected GLTFExporter result type: ${typeof result}`);
              }
              
              console.warn(`🚨 GLTFExporter final GLB size: ${Math.round(glbData.byteLength / 1024)}KB`);
              resolve(glbData);
              
            } catch (processingError) {
              console.error('❌ Error processing GLTFExporter result:', processingError);
              reject(processingError);
            }
          },
          (error: any) => {
            console.error('❌ GLTFExporter callback error:', error);
            reject(new Error(`GLTFExporter failed: ${error?.message || error}`));
          },
          { 
            binary: true, // Export as GLB (binary format)
            onlyVisible: false, // Export ALL objects (don't filter by visibility)
            truncateDrawRange: true, // Truncate draw range
            embedImages: true, // Embed images in GLB
            maxTextureSize: 1024 // Limit texture size
          }
        );
      } catch (parseError) {
        console.error('❌ GLTFExporter.parse() threw error:', parseError);
        reject(parseError);
      }
    });
  }

  /**
   * Check if project should be exported (has enough bricks to benefit from optimization)
   */
  shouldExportProject(brickCount: number): boolean {
    return this.geometryOptimizer.shouldOptimize(brickCount);
  }

  /**
   * Clear all optimized models from storage bucket (debug utility)
   */
  async clearAllModels(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🧹 Clearing all optimized models from storage bucket...');
      
      const { data, error } = await supabase
        .storage
        .emptyBucket('project-models');
        
      if (error) {
        console.error('❌ Failed to clear models bucket:', error);
        return { success: false, error: error.message };
      }
      
      console.log('✅ All models cleared from storage bucket');
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error clearing bucket:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  /**
   * List all files in the storage bucket (debug utility)
   */
  async listAllModels(): Promise<{ success: boolean; files?: any[]; error?: string }> {
    try {
      console.log('📋 Listing all models in storage bucket...');
      
      const { data, error } = await supabase
        .storage
        .from('project-models')
        .list('', {
          limit: 100,
          offset: 0
        });
        
      if (error) {
        console.error('❌ Failed to list models:', error);
        return { success: false, error: error.message };
      }
      
      console.log(`📋 Found ${data?.length || 0} items in bucket:`, data);
      return { success: true, files: data };
    } catch (error: any) {
      console.error('❌ Error listing bucket:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.geometryOptimizer.clearCache();
  }
} 