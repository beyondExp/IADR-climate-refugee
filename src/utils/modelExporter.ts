import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GeometryOptimizer, type BrickInstanceData } from './geometryOptimizer';
import { storage } from '../lib/supabase';

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

      // Export as GLB binary
      const gltfData = await new Promise<ArrayBuffer>((resolve, reject) => {
        console.log('📤 Starting GLTFExporter.parse...');
        
        const options = {
          binary: true,
          embedImages: true,
          animations: [],
          truncateDrawRange: true,
          forceIndices: false
        };
        
        try {
          this.gltfExporter.parse(
            exportScene,
            (result) => {
              console.log('🔍 GLTFExporter callback triggered!');
              console.log('📤 GLTFExporter result:', result);
              console.log('📤 GLTFExporter result type:', typeof result);
              console.log('📤 GLTFExporter result instanceof ArrayBuffer:', result instanceof ArrayBuffer);
              console.log('📤 GLTFExporter result instanceof Uint8Array:', result instanceof Uint8Array);
              console.log('📤 GLTFExporter result constructor:', result?.constructor?.name);
              console.log('📤 GLTFExporter result size info:', result?.byteLength || result?.length || 'no size');
              
              // Try to handle all possible return types
              try {
                if (result instanceof ArrayBuffer) {
                  console.log('✅ Processing ArrayBuffer, size:', result.byteLength);
                  resolve(result);
                } else if (result instanceof Uint8Array) {
                  console.log('✅ Processing Uint8Array, size:', result.byteLength);
                  resolve(result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength));
                } else if (typeof result === 'object' && result?.buffer instanceof ArrayBuffer) {
                  console.log('✅ Processing object with ArrayBuffer buffer');
                  resolve(result.buffer);
                } else if (typeof result === 'string') {
                  console.log('❌ Got string result - binary mode failed, trying to convert');
                  const encoder = new TextEncoder();
                  resolve(encoder.encode(result).buffer);
                } else if (result && typeof result === 'object' && result.byteLength !== undefined) {
                  console.log('✅ Processing array-like object with byteLength');
                  const uint8Array = new Uint8Array(result);
                  resolve(uint8Array.buffer);
                } else {
                  console.error('❌ Completely unexpected result type:', typeof result);
                  console.error('❌ Result details:', result);
                  console.error('❌ Result keys:', result ? Object.keys(result) : 'null/undefined');
                  reject(new Error(`Expected binary GLB output, got ${typeof result}: ${JSON.stringify(result)}`));
                }
              } catch (processingError) {
                console.error('❌ Error processing GLTFExporter result:', processingError);
                reject(processingError);
              }
            },
            (error) => {
              console.error('❌ GLTFExporter callback error:', error);
              reject(new Error(`GLTFExporter failed: ${error?.message || error}`));
            },
            options
          );
          console.log('📤 GLTFExporter.parse() called successfully');
        } catch (parseError) {
          console.error('❌ GLTFExporter.parse() threw error:', parseError);
          reject(parseError);
        }
      });

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
   * Check if project should be exported (has enough bricks to benefit from optimization)
   */
  shouldExportProject(brickCount: number): boolean {
    return this.geometryOptimizer.shouldOptimize(brickCount);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.geometryOptimizer.clearCache();
  }
} 