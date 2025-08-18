import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GeometryOptimizer, type BrickInstanceData, type ObjectInstanceData } from './geometryOptimizer';
import { storage, supabase } from '../lib/supabase';

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
      console.log('🚀 ModelExporter: Starting mixed object export process... (CSG Boolean union operations)');
      console.log('📦 Project ID:', projectId);
      console.log('🔧 Objects count:', objects?.length);
      console.log('🧱 Bricks:', objects?.filter(o => o.type === 'brick').length);
      console.log('📐 Forms:', objects?.filter(o => o.type === 'form').length);
      console.log('📄 GLTF model loaded:', !!gltfModel);
      
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
      
      // Simple mesh combination without CSG
      const combinedResult = await this.simpleMeshCombination(objects, gltfModel, onProgress);
      
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
      const glbData = await this.exportSceneToGLB(scene, onProgress);
      
      onProgress?.({ stage: 'Uploading to cloud storage', progress: 80 });
      console.log(`📊 GLB export completed, size: ${Math.round(glbData.byteLength / 1024)}KB`);
      
      // Upload using simple debug mode
      console.log('🚨 Using SIMPLE DEBUG upload mode...');
      const fileName = `project-${projectId}-optimized-${Date.now()}.glb`;
      const uploadResult = await this.simpleDebugUpload(projectId, fileName, glbData);

      if (uploadResult.success && uploadResult.url) {
        console.log('✅ Simple debug upload successful - file uploaded AND database updated!');
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
   * Simple mesh combination - just combine all meshes into one scene without CSG
   */
  private async simpleMeshCombination(objects: ObjectInstanceData[], gltfModel?: any, onProgress?: (progress: ExportProgress) => void): Promise<any> {
    console.log(`\n🔧 ===== SIMPLE MESH COMBINATION START =====`);
    console.log(`📊 Combining ${objects.length} objects into single scene`);
    
    try {
      // Import required modules
      const { formCreator } = await import('./formCreator');
      
      onProgress?.({ stage: 'Creating geometries...', progress: 20 });
      
      const geometries: THREE.BufferGeometry[] = [];
      const materials: THREE.Material[] = [];
      
      // Process each object
      console.log(`📋 Objects to combine:`, objects.map(o => ({
        id: o.id,
        type: o.type,
        position: o.position,
        scale: o.scale
      })));
      
      for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        console.log(`\n🎯 Processing object ${i + 1}/${objects.length}: ${obj.id} (${obj.type})`);
        console.log(`   Position: ${JSON.stringify(obj.position)}`);
        console.log(`   Scale: ${JSON.stringify(obj.scale)}`);
        
        let geometry: THREE.BufferGeometry;
        let material: THREE.Material | THREE.Material[];
        
        if (obj.type === 'brick') {
          console.log('🧱 Creating brick geometry from GLTF (single shared mesh)...');
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

          geometry = (brickMesh.geometry as THREE.BufferGeometry).clone();
          material = brickMesh.material ? 
            (Array.isArray(brickMesh.material) ? brickMesh.material.map((m: any) => m.clone()) : (brickMesh.material as THREE.Material).clone()) :
            new THREE.MeshStandardMaterial({ color: 0x8B4513 });

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
          
          // Default material for forms
          material = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.8,
            metalness: 0.2
          });
          
        } else {
          throw new Error(`Unsupported object type: ${obj.type}`);
        }
        
        console.log(`📊 Object geometry: ${geometry.attributes.position.count} vertices`);
        
        // Apply transformations
        const matrix = new THREE.Matrix4();
        const scale = obj.scale || { x: 1, y: 1, z: 1 };
        matrix.compose(
          new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(obj.rotation.x, obj.rotation.y, obj.rotation.z)),
          new THREE.Vector3(scale.x, scale.y, scale.z)
        );
        geometry.applyMatrix4(matrix);
        
        // Prepare geometry
        console.log('🔧 Preparing geometry...');
        if (!geometry.attributes.normal) {
          geometry.computeVertexNormals();
        }
        
        // Add to collections
        geometries.push(geometry);
        materials.push(material as THREE.Material);
        console.log(`✅ Added object ${i + 1} to scene`);
        
        onProgress?.({ stage: `Processed ${i + 1}/${objects.length} objects`, progress: 20 + ((i + 1) / objects.length) * 40 });
      }
      
      console.log('\n✅ All objects processed successfully');
      console.log(`📊 Total geometries: ${geometries.length}`);
      
      // Create a scene with all objects
      const scene = new THREE.Scene();
      
      // Add each object as a separate mesh to preserve individual objects
      let totalVertices = 0;
      for (let i = 0; i < geometries.length; i++) {
        const mesh = new THREE.Mesh(geometries[i], materials[i]);
        scene.add(mesh);
        totalVertices += geometries[i].attributes.position.count;
      }
      
      console.log(`📊 Final scene: ${objects.length} meshes, ${totalVertices} total vertices`);
      
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
    console.log(`🌐 Direct API upload to: ${uploadPath}`);
    
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
    
    const response = await fetch(
      `https://znsrhgncvmvrpigljhlh.supabase.co/storage/v1/object/project-models/${uploadPath}`,
      {
        method: 'POST',
        headers,
        body: glbData
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Direct API upload failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log(`✅ Direct API upload successful:`, result);
    
    return { data: result, error: null };
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
      
      // Step 3: Update database record
      console.log('\n🗄️ Step 3: Updating database record...');
      
      const dbStart = Date.now();
      const updateResult = await supabase
        .from('projects')
        .update({
          optimized_model_url: urlData.publicUrl,
          model_file_size: glbData.byteLength,
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId);
      const dbTime = Date.now() - dbStart;
      
      console.log(`🗄️ Database update completed in ${dbTime}ms`);
      
      if (updateResult.error) {
        console.error(`❌ Database update failed:`, updateResult.error);
        return { 
          success: false, 
          error: `File uploaded but database update failed: ${updateResult.error.message}` 
        };
      }
      
      console.log(`✅ Database record updated successfully`);
      
      const totalTime = Date.now() - uploadStart;
      console.log(`\n🎉 ===== UPLOAD COMPLETE =====`);
      console.log(`⏱️ Total time: ${totalTime}ms`);
      console.log(`📊 Upload: ${uploadTime}ms, Database: ${dbTime}ms`);
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
      console.log('📤 Starting GLTFExporter.parse...');
      
      try {
        // Export the scene as GLB binary
        this.gltfExporter.parse(
          scene,
          (result: any) => {
            console.log('🔍 GLTFExporter callback triggered!');
            console.log('📤 GLTFExporter result:', result);
            console.log('📤 GLTFExporter result type:', typeof result);
            console.log('📤 GLTFExporter result instanceof ArrayBuffer:', result instanceof ArrayBuffer);
            console.log('📤 GLTFExporter result instanceof Uint8Array:', result instanceof Uint8Array);
            console.log('📤 GLTFExporter result constructor:', result?.constructor?.name);
            console.log('📤 GLTFExporter result size info:', result?.byteLength || result?.length || 'no size');
            
            try {
              let glbData: ArrayBuffer;
              
              // Handle different result types from GLTFExporter
              if (result instanceof ArrayBuffer) {
                console.log('✅ Result is ArrayBuffer, using directly');
                glbData = result;
              } else if (result instanceof Uint8Array) {
                console.log('✅ Result is Uint8Array, converting to ArrayBuffer');
                glbData = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
              } else if (result && typeof result === 'object' && result.buffer instanceof ArrayBuffer) {
                console.log('✅ Result has ArrayBuffer buffer, extracting');
                glbData = result.buffer;
              } else {
                throw new Error(`Unexpected GLTFExporter result type: ${typeof result} (${result?.constructor?.name})`);
              }
              
              console.log('📁 GLB export successful, size:', glbData.byteLength, 'bytes');
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
          { binary: true } // Export as GLB (binary format)
        );
        
        console.log('📤 GLTFExporter.parse() called successfully');
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