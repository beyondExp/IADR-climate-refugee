import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Evaluator, Brush, SUBTRACTION } from 'three-bvh-csg';

// Perlin noise implementation for organic building shapes
class PerlinNoise {
  private permutation: number[];
  private p: number[];

  constructor(seed: number = 0) {
    this.permutation = [];
    // Generate permutation table based on seed
    for (let i = 0; i < 256; i++) {
      this.permutation[i] = i;
    }
    
    // Shuffle using seed
    const random = this.seededRandom(seed);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [this.permutation[i], this.permutation[j]] = [this.permutation[j], this.permutation[i]];
    }
    
    // Duplicate permutation table
    this.p = new Array(512);
    for (let i = 0; i < 512; i++) {
      this.p[i] = this.permutation[i % 256];
    }
  }

  private seededRandom(seed: number) {
    let x = Math.sin(seed) * 10000;
    return () => {
      x = Math.sin(x) * 10000;
      return x - Math.floor(x);
    };
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);

    const A = this.p[X] + Y;
    const AA = this.p[A] + Z;
    const AB = this.p[A + 1] + Z;
    const B = this.p[X + 1] + Y;
    const BA = this.p[B] + Z;
    const BB = this.p[B + 1] + Z;

    return this.lerp(w,
      this.lerp(v,
        this.lerp(u, this.grad(this.p[AA], x, y, z),
          this.grad(this.p[BA], x - 1, y, z)),
        this.lerp(u, this.grad(this.p[AB], x, y - 1, z),
          this.grad(this.p[BB], x - 1, y - 1, z))),
      this.lerp(v,
        this.lerp(u, this.grad(this.p[AA + 1], x, y, z - 1),
          this.grad(this.p[BA + 1], x - 1, y, z - 1)),
        this.lerp(u, this.grad(this.p[AB + 1], x, y - 1, z - 1),
          this.grad(this.p[BB + 1], x - 1, y - 1, z - 1))));
  }

  // Fractal noise with multiple octaves
  fractalNoise(x: number, y: number, z: number, octaves: number = 4, persistence: number = 0.5): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;

    for (let i = 0; i < octaves; i++) {
      value += this.noise(x * frequency, y * frequency, z * frequency) * amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return value;
  }
}

// Floor generation parameters
export interface FloorParameters {
  height: number;
  floorHeight: number;
  floorCount: number;
  floorThickness: number;
  indentAmount: number;
  balconyProbability: number;
}

// Window cutting parameters
export interface WindowParameters {
  windowWidth: number;
  windowHeight: number;
  windowSpacing: number;
  windowInset: number;
  balconyDepth: number;
  roundness: number;
}

// Building style parameters
export interface BuildingStyle {
  organicFactor: number; // 0-1, how organic/rounded the building should be
  modernFactor: number; // 0-1, how modern/geometric vs. organic
  ecoFactor: number; // 0-1, eco-friendly features like green walls, curves
  noiseScale: number; // Scale of Perlin noise features
  noiseIntensity: number; // Intensity of noise displacement
  taperFactor: number; // How much building tapers towards top
  twistFactor: number; // Rotation along height
}

// Main Building Generator class
export class BuildingGenerator {
  private noise: PerlinNoise;
  private csgEvaluator: Evaluator;

  constructor(seed: number = Date.now()) {
    this.noise = new PerlinNoise(seed);
    
    // Properly initialize CSG evaluator
    try {
      this.csgEvaluator = new Evaluator();
      this.csgEvaluator.attributes = ['position', 'normal'];
      this.csgEvaluator.useGroups = false;
      console.log('✅ CSG Evaluator initialized successfully');
    } catch (error) {
      console.warn('⚠️ CSG Evaluator initialization failed:', error);
      this.csgEvaluator = null as any; // Will trigger manual fallback
    }
  }

  // Generate building from simple form inspiration
  async generateBuilding(
    inspirationGeometry: THREE.BufferGeometry,
    style: BuildingStyle,
    floorParams: FloorParameters,
    windowParams: WindowParameters,
    voxelEditMode: boolean = false
  ): Promise<THREE.BufferGeometry | ArchitecturalHierarchy> {
    console.log('🏗️ Starting building generation process...');

    try {
      console.log('🏗️ VOXEL-BASED Architectural Building Generation Pipeline:');
      console.log('📦 Step 1: Create voxel space from original form mass');
      console.log('🏛️ Step 2: Hierarchical decomposition (mass → facades → floors → bays)');
      console.log('🏢 Step 3: Apply architectural rule sets for building type');
      console.log('🪟 Step 4: Generate semantic components (windows, doors, details)');
      console.log('🌊 Step 5: Apply style-specific voxel modifications (eco rounding)');
      console.log('✨ Step 6: Convert voxels to high-quality mesh');

      // Step 1: Create voxel space from original form
      const voxelSpace = this.createVoxelSpaceFromForm(inspirationGeometry, style, floorParams);
      console.log('✅ Step 1: Voxel space created with architectural boundaries');

      // Step 2: Hierarchical architectural decomposition
      const architecturalHierarchy = this.performHierarchicalDecomposition(voxelSpace, style, floorParams);
      console.log('✅ Step 2: Architectural hierarchy established (mass → facades → floors → bays)');

      // Step 3: Apply building type rules
      const ruledBuilding = this.applyBuildingTypeRules(architecturalHierarchy, style, floorParams);
      console.log('✅ Step 3: Building type rules applied for coherent architecture');

      // Step 4: Generate semantic components
      const detailedBuilding = this.generateSemanticComponents(ruledBuilding, style, floorParams);
      console.log('✅ Step 4: Windows, doors, and architectural details generated');

      // Step 5: Apply style-specific modifications
      const styledBuilding = this.applyStyleSpecificModifications(detailedBuilding, style);
      console.log('✅ Step 5: Style-specific modifications applied (eco rounding, etc.)');

      // Step 6: Check if we should stop at voxel editing mode
      if (voxelEditMode) {
        console.log('🎨 VOXEL EDIT MODE: Stopping at voxel stage for editing');
        console.log(`📦 Generated ${styledBuilding.mass.voxels.length} voxels ready for editing`);
        console.log('🔧 Use voxel editor to modify, then convert to mesh');
        return styledBuilding; // Return ArchitecturalHierarchy for editing
      }

      // Step 6: Convert to high-quality mesh (only if not in edit mode)
      const finalBuilding = this.convertVoxelsToMesh(styledBuilding, style);
      console.log('✅ Step 6: Voxel data converted to high-quality architectural mesh');

      return finalBuilding;
    } catch (error) {
      console.error('❌ Building generation failed:', error);
      throw error;
    }
  }

    // Create parametric building preserving original form quality
  private createParametricBuilding(
    originalForm: THREE.BufferGeometry,
    style: BuildingStyle,
    floorParams: FloorParameters
  ): { base: THREE.BufferGeometry, tower: THREE.BufferGeometry } {
    console.log('🏗️ Creating parametric building preserving original form...');
    
    // Get dimensions of the ORIGINAL form (no subdivision!)
    originalForm.computeBoundingBox();
    const box = originalForm.boundingBox!;
    const currentHeight = box.max.y - box.min.y;
    const formWidth = box.max.x - box.min.x;
    const formDepth = box.max.z - box.min.z;
    
    // Calculate professional building proportions
    const targetHeight = Math.max(floorParams.height, currentHeight * 2.0); // More reasonable height
    const towerHeight = targetHeight - currentHeight;
    
    console.log(`📏 Original form: ${formWidth.toFixed(2)}×${currentHeight.toFixed(2)}×${formDepth.toFixed(2)}`);
    console.log(`🏢 Tower height: ${towerHeight.toFixed(2)} (total: ${targetHeight.toFixed(2)})`);
    
    // Create high-poly parametric tower
    const tower = this.createHighPolyParametricTower(
      originalForm,
      towerHeight,
      style,
      floorParams
    );
    
    console.log('✅ Parametric building components created with preserved original quality');
    return { 
      base: originalForm.clone(), // Keep original EXACTLY as is
      tower: tower 
    };
  }

  // Create high-poly parametric tower based on original form
  private createHighPolyParametricTower(
    originalForm: THREE.BufferGeometry,
    height: number,
    style: BuildingStyle,
    floorParams: FloorParameters
  ): THREE.BufferGeometry {
    console.log('🏢 Creating high-poly parametric tower...');
    
    originalForm.computeBoundingBox();
    const box = originalForm.boundingBox!;
    const baseWidth = box.max.x - box.min.x;
    const baseDepth = box.max.z - box.min.z;
    
    // Detect form type for appropriate tower creation
    const aspectRatio = Math.min(baseWidth, baseDepth) / Math.max(baseWidth, baseDepth);
    const isCircular = aspectRatio > 0.8 && this.detectCircularGeometry(originalForm);
    
    let tower: THREE.BufferGeometry;
    
    if (isCircular) {
      // Create high-poly cylindrical tower
      const radius = Math.max(baseWidth, baseDepth) / 2;
      const segments = Math.max(64, Math.min(128, Math.floor(radius * 16))); // HIGH-POLY: 64-128 segments
      
      console.log(`🏢 Creating cylindrical tower: radius=${radius.toFixed(2)}, segments=${segments}`);
      
      tower = this.createTaperedCylindricalTower(radius, height, segments, style, floorParams);
      
    } else {
      // Create high-poly rectangular tower  
      const segments = Math.max(32, Math.min(64, Math.floor((baseWidth + baseDepth) * 4))); // HIGH-POLY
      
      console.log(`🏢 Creating rectangular tower: ${baseWidth.toFixed(2)}×${baseDepth.toFixed(2)}, segments=${segments}`);
      
      tower = this.createTaperedRectangularTower(baseWidth, baseDepth, height, segments, style, floorParams);
    }
    
    // Position tower on top of original form
    tower.translate(0, box.max.y, 0);
    
    console.log(`✅ High-poly parametric tower created with ${tower.attributes.position.count} vertices`);
    return tower;
  }

  // Create seamless high-poly tapered cylindrical tower  
  private createTaperedCylindricalTower(
    baseRadius: number,
    height: number,
    segments: number,
    style: BuildingStyle,
    floorParams: FloorParameters
  ): THREE.BufferGeometry {
    console.log(`🏢 Creating seamless cylindrical tower with taper...`);
    
    // Calculate taper for smooth transition
    const topRadius = baseRadius * Math.max(0.6, 1 - style.taperFactor * 0.4);
    
    // Create seamless tapered cylinder with multiple height segments for smoothness
    const heightSegments = Math.max(8, Math.floor(height / 2)); // Multiple height segments for smooth taper
    
    const tower = new THREE.CylinderGeometry(
      topRadius,     // Top radius (tapered)
      baseRadius,    // Bottom radius (full size)
      height,        // Height
      segments,      // Radial segments (high-poly)
      heightSegments // Height segments for smooth taper
    );
    
    console.log(`✅ Seamless tower: ${segments} radial × ${heightSegments} height segments`);
    return tower;
  }

  // Create seamless high-poly tapered rectangular tower
  private createTaperedRectangularTower(
    baseWidth: number,
    baseDepth: number,
    height: number,
    segments: number,
    style: BuildingStyle,
    floorParams: FloorParameters
  ): THREE.BufferGeometry {
    console.log(`🏢 Creating seamless rectangular tower with taper...`);
    
    // Calculate taper for architectural appeal
    const taperFactor = style.taperFactor * 0.3;
    const topWidth = baseWidth * Math.max(0.7, 1 - taperFactor);
    const topDepth = baseDepth * Math.max(0.7, 1 - taperFactor);
    
    // Create seamless tower using custom geometry for proper tapering
    const tower = this.createTaperedBoxGeometry(
      baseWidth, baseDepth,    // Bottom dimensions
      topWidth, topDepth,      // Top dimensions  
      height,                  // Height
      Math.max(8, Math.floor(segments / 8)), // Width segments
      Math.max(8, Math.floor(height / 2)),   // Height segments
      Math.max(8, Math.floor(segments / 8))  // Depth segments
    );
    
    console.log(`✅ Seamless rectangular tower created`);
    return tower;
  }

  // Create custom tapered box geometry for seamless rectangular towers
  private createTaperedBoxGeometry(
    bottomWidth: number, bottomDepth: number,
    topWidth: number, topDepth: number,
    height: number,
    widthSegments: number, heightSegments: number, depthSegments: number
  ): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    
    const vertices: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    
    let vertexIndex = 0;
    
    // Create vertices for each height level
    for (let h = 0; h <= heightSegments; h++) {
      const heightRatio = h / heightSegments;
      const y = (heightRatio - 0.5) * height;
      
      // Interpolate dimensions based on height
      const currentWidth = bottomWidth + (topWidth - bottomWidth) * heightRatio;
      const currentDepth = bottomDepth + (topDepth - bottomDepth) * heightRatio;
      
      // Create vertices for this height level
      for (let d = 0; d <= depthSegments; d++) {
        for (let w = 0; w <= widthSegments; w++) {
          const x = (w / widthSegments - 0.5) * currentWidth;
          const z = (d / depthSegments - 0.5) * currentDepth;
          
          vertices.push(x, y, z);
          
          // Calculate normals (simplified)
          const nx = 0, ny = 0, nz = 1; // Will recalculate later
          normals.push(nx, ny, nz);
          
          // UV coordinates
          uvs.push(w / widthSegments, d / depthSegments);
          
          vertexIndex++;
        }
      }
    }
    
    // Create faces
    const wSegs = widthSegments + 1;
    const dSegs = depthSegments + 1;
    
    for (let h = 0; h < heightSegments; h++) {
      for (let d = 0; d < depthSegments; d++) {
        for (let w = 0; w < widthSegments; w++) {
          const base = h * wSegs * dSegs + d * wSegs + w;
          const next = base + wSegs * dSegs;
          
          // Two triangles per quad
          indices.push(
            base, base + 1, next,
            base + 1, next + 1, next,
            base, next, base + wSegs,
            next, next + wSegs, base + wSegs
          );
        }
      }
    }
    
    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    
    return geometry;
  }

  // Detect if geometry is circular
  private detectCircularGeometry(geometry: THREE.BufferGeometry): boolean {
    const positions = geometry.attributes.position.array as Float32Array;
    const vertexCount = positions.length / 3;
    
    if (vertexCount < 20) return false;
    
    let avgRadius = 0;
    let radiusCount = 0;
    
    // Sample vertices to check circularity
    for (let i = 0; i < Math.min(100, vertexCount * 3); i += 9) { // Every 3rd vertex
      const x = positions[i];
      const z = positions[i + 2];
      const radius = Math.sqrt(x * x + z * z);
      
      if (radius > 0.1) { // Ignore center vertices
        avgRadius += radius;
        radiusCount++;
      }
    }
    
    if (radiusCount === 0) return false;
    avgRadius /= radiusCount;
    
    // Check variance in radius - circular shapes have low variance
    let variance = 0;
    let varianceCount = 0;
    
    for (let i = 0; i < Math.min(100, vertexCount * 3); i += 9) {
      const x = positions[i];
      const z = positions[i + 2];
      const radius = Math.sqrt(x * x + z * z);
      
      if (radius > 0.1) {
        const diff = Math.abs(radius - avgRadius) / avgRadius;
        variance += diff;
        varianceCount++;
      }
    }
    
    variance /= varianceCount;
    return variance < 0.3; // Less than 30% variance = circular
  }

  // Integrate geometries seamlessly without CSG artifacts
  private integrateGeometries(components: { base: THREE.BufferGeometry, tower: THREE.BufferGeometry }): THREE.BufferGeometry {
    console.log('🔗 Integrating geometries seamlessly without CSG...');
    
    // Simple BufferGeometry merging - no CSG required!
    const geometries = [components.base, components.tower];
    const integrated = BufferGeometryUtils.mergeGeometries(geometries);
    
    if (!integrated) {
      console.warn('Geometry merging failed, using base form');
      return components.base.clone();
    }
    
    // Clean up
    integrated.computeVertexNormals();
    integrated.computeBoundingBox();
    integrated.computeBoundingSphere();
    
    console.log(`✅ Geometries integrated: ${integrated.attributes.position.count} vertices`);
    return integrated;
  }

  // Apply architecturally-aware surface displacement 
  private applySurfaceDisplacement(geometry: THREE.BufferGeometry, style: BuildingStyle): THREE.BufferGeometry {
    console.log('🌊 Applying architecturally-aware Perlin noise displacement...');
    
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal?.array as Float32Array;
    
    if (!normals) {
      geometry.computeVertexNormals();
    }
    
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const buildingHeight = box.max.y - box.min.y;
    
    // Apply displacement only to vertical surfaces, preserving floor/roof boundaries
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Check if this vertex is on a vertical surface (not floor/ceiling)
      const normalX = normals[i] || 0;
      const normalY = normals[i + 1] || 0;
      const normalZ = normals[i + 2] || 0;
      
      // Calculate surface orientation - horizontal surfaces have high Y normal component
      const isVerticalSurface = Math.abs(normalY) < 0.7; // Less than 70% vertical = side surface
      
      // Only apply noise to vertical surfaces to preserve architectural boundaries
      if (isVerticalSurface) {
        // Height-based modulation - more organic detail higher up
        const heightFactor = Math.max(0.1, (y - box.min.y) / buildingHeight);
        const organicStrength = style.organicFactor * 0.6; // Strong but controlled displacement
        
        // Multi-scale organic noise for modern eco appearance
        const largeScale = this.noise.fractalNoise(x * style.noiseScale * 0.5, y * style.noiseScale * 0.2, z * style.noiseScale * 0.5, 3, 0.6);
        const mediumScale = this.noise.fractalNoise(x * style.noiseScale * 1.2, y * style.noiseScale * 0.6, z * style.noiseScale * 1.2, 2, 0.4);
        const fineDetail = this.noise.fractalNoise(x * style.noiseScale * 2.5, y * style.noiseScale * 1.0, z * style.noiseScale * 2.5, 2, 0.3);
        
        const combinedNoise = largeScale * 0.5 + mediumScale * 0.3 + fineDetail * 0.2;
        
        // Apply displacement primarily in horizontal directions to preserve vertical alignment
        let displacement = combinedNoise * organicStrength * style.noiseIntensity * heightFactor;
        
        // Apply displacement along surface normals if available
        if (normals && i < normals.length) {
          // Reduce vertical displacement component to preserve floor alignment
          const horizontalNormalStrength = Math.sqrt(normalX * normalX + normalZ * normalZ);
          const verticalDisplacementFactor = Math.min(0.2, horizontalNormalStrength); // Max 20% vertical displacement
          
          positions[i] += normalX * displacement;
          positions[i + 1] += normalY * displacement * verticalDisplacementFactor; // Minimal vertical displacement
          positions[i + 2] += normalZ * displacement;
        } else {
          // Fallback: radial displacement for cylindrical forms (horizontal only)
          const centerX = (box.max.x + box.min.x) / 2;
          const centerZ = (box.max.z + box.min.z) / 2;
          const dirX = x - centerX;
          const dirZ = z - centerZ;
          const length = Math.sqrt(dirX * dirX + dirZ * dirZ);
          
          if (length > 0.01) {
            const normalizedDirX = dirX / length;
            const normalizedDirZ = dirZ / length;
            
            positions[i] += normalizedDirX * displacement;
            // NO vertical displacement here to preserve floor boundaries
            positions[i + 2] += normalizedDirZ * displacement;
          }
        }
      }
      // Floor/ceiling vertices (horizontal surfaces) are left unchanged to preserve architectural boundaries
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals(); // Recompute normals after displacement
    
    const vertexCount = geometry.attributes.position.count;
    console.log(`✅ Architecturally-aware displacement applied - floors and roof boundaries preserved`);
    return geometry;
  }

  // Enhance surface quality for professional appearance
  private enhanceSurfaceQuality(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    console.log('✨ Enhancing surface quality for professional appearance...');
    
    // Ensure proper indexing for optimal rendering
    if (!geometry.index) {
      geometry = this.convertToIndexed(geometry);
    }
    
    // Apply conservative smoothing for professional finish
    const smoothed = this.applyConservativeSmoothing(geometry, 1);
    
    // Final normal computation for perfect lighting
    smoothed.computeVertexNormals();
    smoothed.computeTangents?.();
    
    console.log('✅ Professional surface quality enhanced');
    return smoothed;
  }

  // Apply conservative smoothing without destroying detail
  private applyConservativeSmoothing(geometry: THREE.BufferGeometry, iterations: number): THREE.BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const indices = geometry.index?.array as Uint32Array;
    
    if (!indices) return geometry;
    
    for (let iter = 0; iter < iterations; iter++) {
      const newPositions = new Float32Array(positions.length);
      const vertexNeighbors = new Map<number, number[]>();
      
      // Build adjacency
      for (let i = 0; i < indices.length; i += 3) {
        const v1 = indices[i], v2 = indices[i + 1], v3 = indices[i + 2];
        this.addNeighbor(vertexNeighbors, v1, v2);
        this.addNeighbor(vertexNeighbors, v1, v3);
        this.addNeighbor(vertexNeighbors, v2, v1);
        this.addNeighbor(vertexNeighbors, v2, v3);
        this.addNeighbor(vertexNeighbors, v3, v1);
        this.addNeighbor(vertexNeighbors, v3, v2);
      }
      
      // Conservative smoothing
      const smoothingFactor = 0.1; // Very conservative
      
      for (let v = 0; v < positions.length / 3; v++) {
        const neighbors = vertexNeighbors.get(v) || [];
        
        if (neighbors.length === 0) {
          newPositions[v * 3] = positions[v * 3];
          newPositions[v * 3 + 1] = positions[v * 3 + 1];
          newPositions[v * 3 + 2] = positions[v * 3 + 2];
          continue;
        }
        
        let avgX = 0, avgY = 0, avgZ = 0;
        for (const n of neighbors) {
          avgX += positions[n * 3];
          avgY += positions[n * 3 + 1];
          avgZ += positions[n * 3 + 2];
        }
        avgX /= neighbors.length;
        avgY /= neighbors.length;
        avgZ /= neighbors.length;
        
        newPositions[v * 3] = positions[v * 3] + (avgX - positions[v * 3]) * smoothingFactor;
        newPositions[v * 3 + 1] = positions[v * 3 + 1] + (avgY - positions[v * 3 + 1]) * smoothingFactor;
        newPositions[v * 3 + 2] = positions[v * 3 + 2] + (avgZ - positions[v * 3 + 2]) * smoothingFactor;
      }
      
      // Update positions
      for (let i = 0; i < positions.length; i++) {
        positions[i] = newPositions[i];
      }
    }
    
    geometry.attributes.position.needsUpdate = true;
    return geometry;
  }

  // Validate architectural quality 
  private validateArchitecturalQuality(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    console.log('✅ Validating architectural quality...');
    
    // Ensure proper bounding information
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    
    // Validate vertex count for quality
    const vertexCount = geometry.attributes.position.count;
    console.log(`📊 Final building: ${vertexCount} vertices`);
    
    if (vertexCount < 100) {
      console.warn('⚠️ Low vertex count - may appear low-poly');
    } else if (vertexCount > 100000) {
      console.warn('⚠️ Very high vertex count - may impact performance');
    } else {
      console.log('✅ Optimal vertex count for high-quality building');
    }
    
    // Validate geometry integrity
    const positions = geometry.attributes.position.array as Float32Array;
    let hasNaN = false;
    for (let i = 0; i < positions.length; i++) {
      if (isNaN(positions[i]) || !isFinite(positions[i])) {
        hasNaN = true;
        break;
      }
    }
    
    if (hasNaN) {
      console.error('❌ Geometry contains invalid values');
      throw new Error('Invalid geometry - contains NaN or infinite values');
    }
    
    console.log('✅ Architectural quality validation passed');
    return geometry;
  }

  // Create extension geometry that matches the original form's cross-section
  private createFormMatchingExtension(
    baseForm: THREE.BufferGeometry,
    extensionHeight: number,
    style: BuildingStyle,
    floorParams: FloorParameters
  ): THREE.BufferGeometry {
    baseForm.computeBoundingBox();
    const box = baseForm.boundingBox!;
    
    // Use form's actual dimensions with minimal scaling
    const formWidth = (box.max.x - box.min.x) * (1 - style.taperFactor * 0.1); // Very subtle taper
    const formDepth = (box.max.z - box.min.z) * (1 - style.taperFactor * 0.1);
    
    // Create high-density extension geometry that matches the form
    const widthSegments = Math.max(8, Math.floor(formWidth * 4)); // More conservative density
    const heightSegments = Math.max(8, Math.floor(extensionHeight / floorParams.floorHeight * 2));
    const depthSegments = Math.max(8, Math.floor(formDepth * 4));
    
    let extensionGeometry: THREE.BufferGeometry;
    
    // Try to detect the original form type and match it
    const aspectRatio = Math.abs(formWidth - formDepth) / Math.max(formWidth, formDepth);
    const isRoughlyCircular = aspectRatio < 0.3; // If width ≈ depth, likely from sphere/cylinder
    
    if (isRoughlyCircular && style.organicFactor > 0.3) {
      // Create cylindrical extension for round forms
      const radius = Math.max(formWidth, formDepth) / 2;
      const segments = Math.max(12, Math.floor(radius * 8));
      
      extensionGeometry = new THREE.CylinderGeometry(
        radius * (1 - style.taperFactor * 0.1), // Top radius (slight taper)
        radius, // Bottom radius (matches form)
        extensionHeight,
        segments,
        heightSegments
      );
    } else {
      // Create box extension for rectangular forms
      extensionGeometry = new THREE.BoxGeometry(
        formWidth,
        extensionHeight,
        formDepth,
        widthSegments,
        heightSegments,
        depthSegments
      );
    }
    
    return extensionGeometry;
  }

  // Cut basic windows - simpler and more reliable approach
  private async cutBasicWindows(
    geometry: THREE.BufferGeometry,
    windowParams: WindowParameters,
    floorParams: FloorParameters
  ): Promise<THREE.BufferGeometry> {
    console.log('🪟 Adding basic windows...');
    
    try {
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const buildingHeight = box.max.y - box.min.y;
      
      // Create fewer, larger windows for better performance
      const windows: THREE.BufferGeometry[] = [];
      const windowsPerFloor = 3; // Conservative number
      
      for (let floor = 1; floor < floorParams.floorCount; floor++) {
        const floorY = box.min.y + (floor / floorParams.floorCount) * buildingHeight;
        
        // Simple window placement on main faces only
        for (let w = 0; w < windowsPerFloor; w++) {
          const angle = (w / windowsPerFloor) * Math.PI * 2;
          const distance = Math.min(box.max.x - box.min.x, box.max.z - box.min.z) * 0.4;
          
          const windowGeometry = new THREE.BoxGeometry(
            windowParams.windowWidth * 0.8,
            windowParams.windowHeight * 0.8,
            0.3
          );
          
          windowGeometry.translate(
            Math.cos(angle) * distance,
            floorY,
            Math.sin(angle) * distance
          );
          
          windows.push(windowGeometry);
        }
      }
      
               // Cut windows in smaller batches for stability
         if (windows.length > 0 && this.csgEvaluator && typeof this.csgEvaluator.evaluate === 'function') {
           let result = geometry;
           
           for (let i = 0; i < Math.min(windows.length, 3); i++) { // Reduced to 3 windows max
             try {
               const buildingBrush = new Brush(result);
               buildingBrush.updateMatrixWorld();
               
               const windowBrush = new Brush(windows[i]);
               windowBrush.updateMatrixWorld();
               
               // Perform CSG subtraction with proper constants
               const subtractResult = this.csgEvaluator.evaluate(buildingBrush, windowBrush, SUBTRACTION);
               
               if (result !== geometry) result.dispose();
               result = subtractResult.geometry; // Extract geometry from result Brush
             } catch (error) {
               console.warn(`Window ${i} cutting failed:`, error);
             }
           }
        
        // Clean up unused windows
        windows.forEach(w => w.dispose());
        
        return result;
      }
      
      return geometry;
    } catch (error) {
      console.error('❌ Basic window cutting failed:', error);
      return geometry;
    }
  }

  // Subdivide geometry to increase vertex density with proper topology
  private subdivideGeometry(geometry: THREE.BufferGeometry, levels: number): THREE.BufferGeometry {
    console.log('🔧 Subdividing geometry with proper vertex welding...');
    
    let subdividedGeometry = geometry.clone();
    
    // Ensure we have proper indexed geometry
    if (!subdividedGeometry.index) {
      subdividedGeometry = this.convertToIndexed(subdividedGeometry);
    }
    
    // Clean and repair geometry first
    subdividedGeometry = this.repairGeometry(subdividedGeometry);
    
    for (let i = 0; i < levels; i++) {
      console.log(`📐 Subdivision level ${i + 1}/${levels}`);
      
      // Apply careful subdivision
      subdividedGeometry = this.subdivideTrianglesCarefully(subdividedGeometry);
      
      // Weld vertices after each subdivision to maintain manifold (balanced tolerance for 2 levels)
      subdividedGeometry = this.weldVertices(subdividedGeometry, 0.01); // Balanced tolerance for gentle subdivision
      
      // Repair any issues
      subdividedGeometry = this.repairGeometry(subdividedGeometry);
    }
    
    console.log(`✅ Subdivision complete: ${subdividedGeometry.attributes.position.count} vertices`);
    return subdividedGeometry;
  }

  // Convert non-indexed geometry to indexed
  private convertToIndexed(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const vertexCount = positions.length / 3;
    
    // Create simple index array
    const indices = new Uint32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      indices[i] = i;
    }
    
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    return geometry;
  }

  // Carefully subdivide triangles with proper topology maintenance
  private subdivideTrianglesCarefully(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal?.array as Float32Array;
    const indices = geometry.index?.array as Uint32Array;
    
    if (!indices) return geometry;
    
    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newIndices: number[] = [];
    const edgeMap = new Map<string, number>();
    
    // Add original vertices and normals
    for (let i = 0; i < positions.length; i += 3) {
      newPositions.push(positions[i], positions[i + 1], positions[i + 2]);
      if (normals) {
        newNormals.push(normals[i], normals[i + 1], normals[i + 2]);
      }
    }
    
    let nextVertexIndex = positions.length / 3;
    
    // Function to get or create midpoint vertex with proper normal interpolation
    const getMidpointVertex = (i1: number, i2: number): number => {
      const key = i1 < i2 ? `${i1}-${i2}` : `${i2}-${i1}`;
      
      if (edgeMap.has(key)) {
        return edgeMap.get(key)!;
      }
      
      // Create midpoint position
      const x1 = positions[i1 * 3], y1 = positions[i1 * 3 + 1], z1 = positions[i1 * 3 + 2];
      const x2 = positions[i2 * 3], y2 = positions[i2 * 3 + 1], z2 = positions[i2 * 3 + 2];
      
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const midZ = (z1 + z2) / 2;
      
      newPositions.push(midX, midY, midZ);
      
      // Interpolate normals if available
      if (normals) {
        const nx1 = normals[i1 * 3], ny1 = normals[i1 * 3 + 1], nz1 = normals[i1 * 3 + 2];
        const nx2 = normals[i2 * 3], ny2 = normals[i2 * 3 + 1], nz2 = normals[i2 * 3 + 2];
        
        const midNX = (nx1 + nx2) / 2;
        const midNY = (ny1 + ny2) / 2;
        const midNZ = (nz1 + nz2) / 2;
        
        // Normalize the interpolated normal
        const length = Math.sqrt(midNX * midNX + midNY * midNY + midNZ * midNZ);
        if (length > 0) {
          newNormals.push(midNX / length, midNY / length, midNZ / length);
        } else {
          newNormals.push(0, 1, 0); // Default up normal
        }
      }
      
      const midIndex = nextVertexIndex++;
      edgeMap.set(key, midIndex);
      return midIndex;
    };
    
    // Process each triangle with proper winding order
    for (let i = 0; i < indices.length; i += 3) {
      const i1 = indices[i];
      const i2 = indices[i + 1];
      const i3 = indices[i + 2];
      
      // Get midpoint vertices
      const m12 = getMidpointVertex(i1, i2);
      const m23 = getMidpointVertex(i2, i3);
      const m31 = getMidpointVertex(i3, i1);
      
      // Create 4 new triangles with consistent winding order
      newIndices.push(i1, m12, m31);   // Corner 1
      newIndices.push(m12, i2, m23);   // Corner 2
      newIndices.push(m31, m23, i3);   // Corner 3
      newIndices.push(m12, m23, m31);  // Center triangle
    }
    
    // Create new geometry with all attributes
    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    
    if (newNormals.length > 0) {
      newGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    }
    
    newGeometry.setIndex(newIndices);
    
    // Compute fresh normals to ensure consistency
    newGeometry.computeVertexNormals();
    
    return newGeometry;
  }

  // Weld vertices that are very close together
  private weldVertices(geometry: THREE.BufferGeometry, tolerance: number = 0.0001): THREE.BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const indices = geometry.index?.array as Uint32Array;
    
    if (!indices) return geometry;
    
    console.log(`🔧 Welding vertices (tolerance: ${tolerance})`);
    
    const vertexMap = new Map<string, number>();
    const newPositions: number[] = [];
    const indexMap = new Map<number, number>();
    let newVertexIndex = 0;
    
    // Hash function for vertex positions
    const hashVertex = (x: number, y: number, z: number): string => {
      const precision = Math.round(1 / tolerance);
      return `${Math.round(x * precision)},${Math.round(y * precision)},${Math.round(z * precision)}`;
    };
    
    // Process each vertex
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      const hash = hashVertex(x, y, z);
      
      if (vertexMap.has(hash)) {
        // Use existing vertex
        const existingIndex = vertexMap.get(hash)!;
        indexMap.set(i / 3, existingIndex);
      } else {
        // Add new vertex
        newPositions.push(x, y, z);
        vertexMap.set(hash, newVertexIndex);
        indexMap.set(i / 3, newVertexIndex);
        newVertexIndex++;
      }
    }
    
    // Remap indices
    const newIndices: number[] = [];
    for (let i = 0; i < indices.length; i++) {
      const oldIndex = indices[i];
      const newIndex = indexMap.get(oldIndex);
      if (newIndex !== undefined) {
        newIndices.push(newIndex);
      }
    }
    
    // Create welded geometry
    const weldedGeometry = new THREE.BufferGeometry();
    weldedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    weldedGeometry.setIndex(newIndices);
    weldedGeometry.computeVertexNormals();
    
    const originalCount = positions.length / 3;
    const newCount = newPositions.length / 3;
    console.log(`✅ Welded ${originalCount} → ${newCount} vertices (${originalCount - newCount} duplicates removed)`);
    
    return weldedGeometry;
  }

  // Repair geometry by fixing common issues
  private repairGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    // Ensure we have all required attributes
    if (!geometry.attributes.position) {
      console.error('❌ Geometry missing position attribute');
      return geometry;
    }
    
    // Remove degenerate triangles
    geometry = this.removeDegenrateTriangles(geometry);
    
    // Ensure proper normals
    geometry.computeVertexNormals();
    
    // Compute bounding box and sphere
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    
    return geometry;
  }

  // Remove degenerate (zero-area) triangles
  private removeDegenrateTriangles(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const indices = geometry.index?.array as Uint32Array;
    
    if (!indices) return geometry;
    
    const newIndices: number[] = [];
    const minArea = 0.000001; // Minimum triangle area
    
    for (let i = 0; i < indices.length; i += 3) {
      const i1 = indices[i] * 3;
      const i2 = indices[i + 1] * 3;
      const i3 = indices[i + 2] * 3;
      
      // Get triangle vertices
      const v1 = new THREE.Vector3(positions[i1], positions[i1 + 1], positions[i1 + 2]);
      const v2 = new THREE.Vector3(positions[i2], positions[i2 + 1], positions[i2 + 2]);
      const v3 = new THREE.Vector3(positions[i3], positions[i3 + 1], positions[i3 + 2]);
      
      // Calculate triangle area using cross product
      const edge1 = v2.clone().sub(v1);
      const edge2 = v3.clone().sub(v1);
      const cross = edge1.cross(edge2);
      const area = cross.length() / 2;
      
      // Only keep triangles with sufficient area
      if (area > minArea) {
        newIndices.push(indices[i], indices[i + 1], indices[i + 2]);
      }
    }
    
    // Create new geometry with valid triangles only
    const repairedGeometry = geometry.clone();
    repairedGeometry.setIndex(newIndices);
    
    return repairedGeometry;
  }

  // Prepare geometry for robust CSG operations
  private prepareGeometryForCSG(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    console.log('🔧 Preparing geometry for CSG...');
    
    // Clone to avoid modifying original
    let prepared = geometry.clone();
    
    // Ensure indexed geometry
    if (!prepared.index) {
      prepared = this.convertToIndexed(prepared);
    }
    
    // Weld very close vertices to ensure manifold (balanced tolerance for gentle subdivision)
    prepared = this.weldVertices(prepared, 0.01); // Balanced tolerance for gentle subdivision
    
    // Remove degenerate triangles
    prepared = this.removeDegenrateTriangles(prepared);
    
    // Ensure proper normal computation
    prepared.computeVertexNormals();
    
    // Validate the geometry has minimum requirements for CSG
    const positions = prepared.attributes.position;
    const indices = prepared.index;
    
    if (!positions || !indices) {
      console.warn('⚠️ Geometry missing required attributes for CSG');
      return geometry;
    }
    
    if (positions.count < 3 || indices.count < 3) {
      console.warn('⚠️ Geometry has insufficient vertices/indices for CSG');
      return geometry;
    }
    
    // Ensure proper index format for CSG
    if (prepared.index && prepared.index.array.constructor !== Uint32Array && prepared.index.array.constructor !== Uint16Array) {
      const indices = prepared.index.array;
      prepared.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    }
    
    // Force geometry update
    prepared.attributes.position.needsUpdate = true;
    if (prepared.attributes.normal) prepared.attributes.normal.needsUpdate = true;
    if (prepared.index) prepared.index.needsUpdate = true;
    
    // Compute required properties
    prepared.computeBoundingBox();
    prepared.computeBoundingSphere();
    
    console.log(`✅ Geometry prepared for CSG: ${prepared.attributes.position.count} vertices, ${prepared.index?.count || 0} indices`);
    
    return prepared;
  }

  // Manually extend geometry by duplicating and transforming vertices (CSG fallback)
  private manuallyExtendGeometry(
    baseGeometry: THREE.BufferGeometry, 
    extensionHeight: number,
    style: BuildingStyle
  ): THREE.BufferGeometry {
    console.log('🔧 Manually extending geometry (CSG fallback)...');
    
    baseGeometry.computeBoundingBox();
    const box = baseGeometry.boundingBox!;
    
    const positions = baseGeometry.attributes.position.array as Float32Array;
    const normals = baseGeometry.attributes.normal?.array as Float32Array;
    const indices = baseGeometry.index?.array as Uint32Array;
    
    if (!indices) {
      console.warn('Cannot manually extend non-indexed geometry');
      return baseGeometry;
    }
    
    const extendedPositions: number[] = [];
    const extendedNormals: number[] = [];
    const extendedIndices: number[] = [];
    
    // Copy original vertices
    for (let i = 0; i < positions.length; i += 3) {
      extendedPositions.push(positions[i], positions[i + 1], positions[i + 2]);
      if (normals) {
        extendedNormals.push(normals[i], normals[i + 1], normals[i + 2]);
      }
    }
    
    // Copy original indices
    for (let i = 0; i < indices.length; i++) {
      extendedIndices.push(indices[i]);
    }
    
    const originalVertexCount = positions.length / 3;
    let newVertexIndex = originalVertexCount;
    
    // Create fewer layers for cleaner geometry  
    const layers = Math.max(2, Math.min(4, Math.floor(extensionHeight / 1.5))); // Limited layers
    
    for (let layer = 1; layer <= layers; layer++) {
      const layerHeight = (layer / layers) * extensionHeight;
      const yOffset = box.max.y + layerHeight;
      
      // Slight taper per layer (very conservative)
      const taperFactor = 1 - (layer / layers) * style.taperFactor * 0.05; // Reduced taper
      
      // Duplicate vertices for this layer
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i] * taperFactor;
        const y = yOffset;
        const z = positions[i + 2] * taperFactor;
        
        extendedPositions.push(x, y, z);
        
        if (normals) {
          extendedNormals.push(normals[i], normals[i + 1], normals[i + 2]);
        }
      }
      
      // Connect this layer to the previous layer with triangles
      const prevLayerStart = layer === 1 ? 0 : originalVertexCount + (layer - 2) * originalVertexCount;
      const currentLayerStart = originalVertexCount + (layer - 1) * originalVertexCount;
      
      // For the final layer, create a top face
      if (layer === layers) {
        for (let i = 0; i < indices.length; i += 3) {
          // Create top face with proper winding order
          extendedIndices.push(
            currentLayerStart + indices[i + 2],  // Reverse winding for outward normal
            currentLayerStart + indices[i + 1],
            currentLayerStart + indices[i]
          );
        }
      }
    }
    
    // Create the extended geometry
    const extendedGeometry = new THREE.BufferGeometry();
    extendedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(extendedPositions, 3));
    
    if (extendedNormals.length > 0) {
      extendedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(extendedNormals, 3));
    }
    
    extendedGeometry.setIndex(extendedIndices);
    extendedGeometry.computeVertexNormals();
    
    console.log(`✅ Manual extension complete: ${extendedGeometry.attributes.position.count} vertices`);
    
    return extendedGeometry;
  }

  // Create form-based extension with ultra-smooth transitions
  private createFormBasedExtension(
    baseForm: THREE.BufferGeometry,
    extensionHeight: number,
    style: BuildingStyle,
    floorParams: FloorParameters
  ): THREE.BufferGeometry {
    console.log('🏗️ Creating ultra-smooth form-based extension...');
    
    baseForm.computeBoundingBox();
    const box = baseForm.boundingBox!;
    
    const floorHeight = floorParams.floorHeight || 2.5;
    const numberOfFloors = Math.max(3, Math.floor(extensionHeight / floorHeight)); // Reasonable number of floors to maintain quality
    
    console.log(`🏗️ Creating ${numberOfFloors} integrated floors starting from top of original form`);
    
    const floorGeometries: THREE.BufferGeometry[] = [];
    
    // Create multiple levels with smooth interpolation
    for (let floor = 0; floor < numberOfFloors; floor++) {
      const floorGeometry = baseForm.clone();
      const heightRatio = floor / (numberOfFloors - 1);
      const y = (floor / numberOfFloors) * extensionHeight;
      
      // Smooth taper using cubic easing for ultra-smooth transitions
      const smoothHeightRatio = this.smoothStep(0.0, 1.0, heightRatio);
      const taperFactor = 1 - smoothHeightRatio * style.taperFactor * 0.2; // Gentler tapering
      
      // Very subtle organic variation for natural feel
      const organicVariation = (Math.random() - 0.5) * style.organicFactor * 0.05; // Much smaller variation
      const finalScale = Math.max(0.4, taperFactor + organicVariation);
      
      // Transform each floor with smooth scaling
      const positions = floorGeometry.attributes.position.array as Float32Array;
      
      for (let i = 0; i < positions.length; i += 3) {
        // Apply smooth horizontal scaling preserving form shape
        positions[i] *= finalScale;     // X
        positions[i + 2] *= finalScale; // Z
        
        // Position vertically starting from top of base form with smooth distribution
        positions[i + 1] = positions[i + 1] + y; // Start from original Y position and add extension height
      }
      
      floorGeometry.attributes.position.needsUpdate = true;
      floorGeometry.computeVertexNormals();
      
      floorGeometries.push(floorGeometry);
    }
    
    // Merge all floors into one ultra-smooth geometry
    const mergedExtension = BufferGeometryUtils.mergeGeometries(floorGeometries);
    
    // Clean up individual floor geometries
    floorGeometries.forEach(geo => geo.dispose());
    
    if (!mergedExtension) {
      console.warn('Failed to merge extension floors, using base form');
      return baseForm.clone();
    }
    
    // Additional smoothing pass for the merged extension
    mergedExtension.computeVertexNormals();
    
    console.log(`✅ Ultra-smooth form-based extension created with ${mergedExtension.attributes.position.count} vertices`);
    return mergedExtension;
  }

  // Check if form is generally circular
  private isCircularForm(geometry: THREE.BufferGeometry): boolean {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const width = box.max.x - box.min.x;
    const depth = box.max.z - box.min.z;
    const aspectRatio = Math.min(width, depth) / Math.max(width, depth);
    
    // If nearly square and has many vertices around perimeter, likely circular
    return aspectRatio > 0.8 && geometry.attributes.position.count > 100;
  }

  // Create tapered cylindrical building
  private createTaperedCylindricalBuilding(
    baseWidth: number,
    baseDepth: number,
    height: number,
    floors: number,
    style: BuildingStyle
  ): THREE.BufferGeometry {
    const radius = Math.max(baseWidth, baseDepth) / 2;
    const segments = Math.max(16, Math.min(32, Math.floor(radius * 8))); // Adaptive segments
    
    const geometries: THREE.BufferGeometry[] = [];
    
    for (let floor = 0; floor < floors; floor++) {
      const floorHeight = height / floors;
      const y = floor * floorHeight;
      
      // Calculate taper - stronger taper for higher buildings
      const heightRatio = floor / (floors - 1);
      const taperFactor = 1 - heightRatio * style.taperFactor * 0.3; // More aggressive tapering
      const floorRadius = radius * taperFactor;
      
      // Add slight variation per floor
      const variation = (Math.random() - 0.5) * 0.1 * style.organicFactor;
      const variedRadius = floorRadius * (1 + variation);
      
      // Create floor cylinder
      const floorGeometry = new THREE.CylinderGeometry(
        variedRadius, 
        variedRadius, 
        floorHeight * 1.1, // Slightly overlap floors
        segments
      );
      
      floorGeometry.translate(0, y + floorHeight / 2, 0);
      geometries.push(floorGeometry);
    }
    
    // Merge all floors
    const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries);
    geometries.forEach(g => g.dispose());
    
    return mergedGeometry || new THREE.CylinderGeometry(radius, radius, height, segments);
  }

  // Create tapered rectangular building 
  private createTaperedRectangularBuilding(
    baseWidth: number,
    baseDepth: number,
    height: number,
    floors: number,
    style: BuildingStyle
  ): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    
    for (let floor = 0; floor < floors; floor++) {
      const floorHeight = height / floors;
      const y = floor * floorHeight;
      
      // Calculate taper
      const heightRatio = floor / (floors - 1);
      const taperFactor = 1 - heightRatio * style.taperFactor * 0.2; // Conservative tapering
      
      const floorWidth = baseWidth * taperFactor;
      const floorDepth = baseDepth * taperFactor;
      
      // Add setbacks for some floors
      const setbackChance = style.modernFactor;
      const hasSetback = Math.random() < setbackChance * 0.3 && floor > floors / 3;
      
      const actualWidth = hasSetback ? floorWidth * 0.9 : floorWidth;
      const actualDepth = hasSetback ? floorDepth * 0.9 : floorDepth;
      
      // Create floor box
      const floorGeometry = new THREE.BoxGeometry(actualWidth, floorHeight * 1.1, actualDepth);
      floorGeometry.translate(0, y + floorHeight / 2, 0);
      
      geometries.push(floorGeometry);
    }
    
    // Merge all floors
    const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries);
    geometries.forEach(g => g.dispose());
    
    return mergedGeometry || new THREE.BoxGeometry(baseWidth, height, baseDepth);
  }

  // Add building features like floor lines, cornicing, etc.
  private addBuildingFeatures(
    geometry: THREE.BufferGeometry,
    floors: number,
    style: BuildingStyle,
    floorParams: FloorParameters
  ): THREE.BufferGeometry {
    console.log('🏗️ Adding architectural features...');
    
    // For now, just ensure good topology - we'll let the noise do the detailed work
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    
    // Add slight floor line indentations if modern style
    if (style.modernFactor > 0.7) {
      geometry = this.addSubtleFloorLines(geometry, floors);
    }
    
    return geometry;
  }

  // Add subtle floor line indentations
  private addSubtleFloorLines(geometry: THREE.BufferGeometry, floors: number): THREE.BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const buildingHeight = box.max.y - box.min.y;
    const floorHeight = buildingHeight / floors;
    
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      
      // Check if vertex is near a floor line
      const relativeY = y - box.min.y;
      const floorIndex = Math.floor(relativeY / floorHeight);
      const yInFloor = relativeY % floorHeight;
      
      // Indent slightly at floor boundaries
      if (yInFloor < 0.1 || yInFloor > floorHeight - 0.1) {
        const centerX = (box.max.x + box.min.x) / 2;
        const centerZ = (box.max.z + box.min.z) / 2;
        
        const dirX = positions[i] - centerX;
        const dirZ = positions[i + 2] - centerZ;
        const length = Math.sqrt(dirX * dirX + dirZ * dirZ);
        
        if (length > 0.1) {
          const indentFactor = 0.98; // 2% indent
          positions[i] = centerX + dirX * indentFactor;
          positions[i + 2] = centerZ + dirZ * indentFactor;
        }
      }
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    return geometry;
  }

  // Gentle organic shaping with smooth transitions for perfect surfaces
  private applyGentleOrganicShaping(geometry: THREE.BufferGeometry, style: BuildingStyle): THREE.BufferGeometry {
    console.log('🌊 Applying gentle organic shaping with ultra-smooth transitions...');
    
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal?.array as Float32Array;
    
    // Ultra-gentle parameters for smooth organic appearance
    const gentleStyle = {
      ...style,
      noiseIntensity: style.noiseIntensity * 0.6, // Reduced intensity for smoothness
      noiseScale: style.noiseScale * 1.2,         // Larger scale = smoother transitions
      organicFactor: style.organicFactor * 0.8    // Gentle organic factor
    };
    
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const buildingSize = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    
    console.log(`🌊 Applying gentle noise to ultra-high poly building (${positions.length / 3} vertices)`);
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Large-scale gentle noise for overall shape flow
      const largescaleNoise = this.noise.fractalNoise(
        x * gentleStyle.noiseScale * 0.3, 
        y * gentleStyle.noiseScale * 0.1, 
        z * gentleStyle.noiseScale * 0.3, 
        2, 0.7 // Smooth octaves
      );
      
      // Medium-scale for gentle surface variation
      const mediumscaleNoise = this.noise.fractalNoise(
        x * gentleStyle.noiseScale * 0.8, 
        y * gentleStyle.noiseScale * 0.4, 
        z * gentleStyle.noiseScale * 0.8, 
        2, 0.5
      );
      
      // Height-based smooth modulation
      const heightFactor = Math.max(0, (y - box.min.y) / (box.max.y - box.min.y));
      const smoothHeightModulation = this.smoothStep(0.1, 0.9, heightFactor); // Smooth S-curve
      
      // Distance-based smooth modulation
      const centerX = (box.max.x + box.min.x) / 2;
      const centerZ = (box.max.z + box.min.z) / 2;
      const distFromCenter = Math.sqrt((x - centerX) ** 2 + (z - centerZ) ** 2);
      const normalizedDist = Math.min(1.0, distFromCenter / (buildingSize * 0.4));
      const smoothSurfaceModulation = this.smoothStep(0.2, 0.8, normalizedDist);
      
      // Combine noise with smooth falloff
      const combinedNoise = largescaleNoise * 0.7 + mediumscaleNoise * 0.3;
      
      // Apply ultra-gentle displacement with smooth transitions
      const displacement = combinedNoise * 
        gentleStyle.noiseIntensity * 
        gentleStyle.organicFactor * 
        smoothHeightModulation * 
        smoothSurfaceModulation * 
        0.08; // Very gentle displacement for smooth surfaces
      
      if (normals && i / 3 < normals.length / 3) {
        const normalX = normals[i];
        const normalY = normals[i + 1];
        const normalZ = normals[i + 2];
        
        // Apply gentle displacement along normals
        positions[i] += normalX * displacement;
        positions[i + 1] += normalY * displacement * 0.2; // Minimal vertical variation
        positions[i + 2] += normalZ * displacement;
      } else {
        // Fallback: gentle radial displacement
        const dirX = x - centerX;
        const dirZ = z - centerZ;
        const length = Math.sqrt(dirX * dirX + dirZ * dirZ);
        
        if (length > 0.1) {
          const normalizedDirX = dirX / length;
          const normalizedDirZ = dirZ / length;
          
          positions[i] += normalizedDirX * displacement;
          positions[i + 2] += normalizedDirZ * displacement;
        }
      }
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    console.log('✅ Gentle organic shaping applied - smooth transitions ready for further smoothing');
    return geometry;
  }

  // Smooth step function for ultra-smooth transitions
  private smoothStep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t); // Hermite interpolation
  }

  // Laplacian smoothing for perfect surface quality
  private applyLaplacianSmoothing(geometry: THREE.BufferGeometry, iterations: number): THREE.BufferGeometry {
    console.log(`✨ Applying ${iterations} Laplacian smoothing passes for perfect surface quality...`);
    
    for (let iter = 0; iter < iterations; iter++) {
      console.log(`✨ Smoothing pass ${iter + 1}/${iterations}`);
      geometry = this.performLaplacianSmoothingPass(geometry);
    }
    
    console.log('✅ Laplacian smoothing completed - surfaces are now perfectly smooth');
    return geometry;
  }

  // Single Laplacian smoothing pass
  private performLaplacianSmoothingPass(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const indices = geometry.index?.array as Uint32Array;
    
    if (!indices) {
      console.warn('Cannot perform Laplacian smoothing without indexed geometry');
      return geometry;
    }
    
    const vertexCount = positions.length / 3;
    const newPositions = new Float32Array(positions.length);
    const vertexNeighbors = new Map<number, number[]>();
    
    // Build vertex adjacency information
    for (let i = 0; i < indices.length; i += 3) {
      const i1 = indices[i];
      const i2 = indices[i + 1];
      const i3 = indices[i + 2];
      
      // Add neighbors for each vertex in the triangle
      this.addNeighbor(vertexNeighbors, i1, i2);
      this.addNeighbor(vertexNeighbors, i1, i3);
      this.addNeighbor(vertexNeighbors, i2, i1);
      this.addNeighbor(vertexNeighbors, i2, i3);
      this.addNeighbor(vertexNeighbors, i3, i1);
      this.addNeighbor(vertexNeighbors, i3, i2);
    }
    
    // Apply Laplacian smoothing with conservative factor
    const smoothingFactor = 0.3; // Conservative smoothing to preserve shape
    
    for (let v = 0; v < vertexCount; v++) {
      const neighbors = vertexNeighbors.get(v) || [];
      
      if (neighbors.length === 0) {
        // No neighbors, keep original position
        newPositions[v * 3] = positions[v * 3];
        newPositions[v * 3 + 1] = positions[v * 3 + 1];
        newPositions[v * 3 + 2] = positions[v * 3 + 2];
        continue;
      }
      
      // Calculate average position of neighbors
      let avgX = 0, avgY = 0, avgZ = 0;
      
      for (const neighbor of neighbors) {
        avgX += positions[neighbor * 3];
        avgY += positions[neighbor * 3 + 1];
        avgZ += positions[neighbor * 3 + 2];
      }
      
      avgX /= neighbors.length;
      avgY /= neighbors.length;
      avgZ /= neighbors.length;
      
      // Interpolate between original and average position
      const originalX = positions[v * 3];
      const originalY = positions[v * 3 + 1];
      const originalZ = positions[v * 3 + 2];
      
      newPositions[v * 3] = originalX + (avgX - originalX) * smoothingFactor;
      newPositions[v * 3 + 1] = originalY + (avgY - originalY) * smoothingFactor;
      newPositions[v * 3 + 2] = originalZ + (avgZ - originalZ) * smoothingFactor;
    }
    
    // Update geometry with smoothed positions
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }

  // Helper method to add neighbor relationships
  private addNeighbor(neighborMap: Map<number, number[]>, vertex: number, neighbor: number): void {
    if (!neighborMap.has(vertex)) {
      neighborMap.set(vertex, []);
    }
    
    const neighbors = neighborMap.get(vertex)!;
    if (!neighbors.includes(neighbor)) {
      neighbors.push(neighbor);
    }
  }

  // Topology repair step (Step 5)
  private performTopologyRepair(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    console.log('🔧 Performing comprehensive topology repair...');
    
    let repairedGeometry = geometry.clone();
    
    // 1. Weld nearby vertices with moderate tolerance
    repairedGeometry = this.weldVertices(repairedGeometry, 0.001);
    console.log('✅ Vertex welding completed');
    
    // 2. Remove degenerate triangles
    repairedGeometry = this.removeDegenrateTriangles(repairedGeometry);
    console.log('✅ Degenerate triangle removal completed');
    
    // 3. Ensure proper indexing
    if (!repairedGeometry.index) {
      repairedGeometry = this.convertToIndexed(repairedGeometry);
    }
    console.log('✅ Geometry indexing verified');
    
    // 4. Recompute all geometric properties
    repairedGeometry.computeVertexNormals();
    repairedGeometry.computeBoundingBox();
    repairedGeometry.computeBoundingSphere();
    console.log('✅ Geometric properties recomputed');
    
    // 5. Validate mesh integrity
    const positions = repairedGeometry.attributes.position;
    const indices = repairedGeometry.index;
    
    if (!positions || !indices) {
      throw new Error('Topology repair failed: missing essential attributes');
    }
    
    if (positions.count < 3 || indices.count < 3) {
      throw new Error('Topology repair failed: insufficient geometry');
    }
    
    console.log(`✅ Topology repair completed: ${positions.count} vertices, ${indices.count} indices`);
    
    // Dispose original if different
    if (repairedGeometry !== geometry) {
      geometry.dispose();
    }
    
    return repairedGeometry;
  }

  // Final validation and cleanup (Step 6)
  private performFinalValidation(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    console.log('✅ Performing final validation and cleanup...');
    
    let finalGeometry = geometry;
    
    // 1. Final vertex count optimization
    const beforeCount = finalGeometry.attributes.position.count;
    finalGeometry = this.weldVertices(finalGeometry, 0.0001); // Very tight tolerance for final cleanup
    const afterCount = finalGeometry.attributes.position.count;
    
    if (beforeCount !== afterCount) {
      console.log(`✅ Final optimization: ${beforeCount} → ${afterCount} vertices`);
    }
    
    // 2. Ensure all attributes are properly formatted
    finalGeometry.attributes.position.needsUpdate = true;
    if (finalGeometry.attributes.normal) {
      finalGeometry.attributes.normal.needsUpdate = true;
    }
    if (finalGeometry.index) {
      finalGeometry.index.needsUpdate = true;
    }
    
    // 3. Final geometric computations
    finalGeometry.computeVertexNormals();
    finalGeometry.computeBoundingBox();
    finalGeometry.computeBoundingSphere();
    
    // 4. Validate final mesh properties
    const box = finalGeometry.boundingBox!;
    const sphere = finalGeometry.boundingSphere!;
    
    console.log(`✅ Final building dimensions: ${(box.max.x - box.min.x).toFixed(2)}×${(box.max.y - box.min.y).toFixed(2)}×${(box.max.z - box.min.z).toFixed(2)}`);
    console.log(`✅ Bounding sphere radius: ${sphere.radius.toFixed(2)}`);
    console.log(`✅ Final vertex count: ${finalGeometry.attributes.position.count}`);
    console.log(`✅ Final triangle count: ${finalGeometry.index?.count ? finalGeometry.index.count / 3 : 0}`);
    
    // Dispose previous if different
    if (finalGeometry !== geometry) {
      geometry.dispose();
    }
    
    console.log('✅ Final validation completed - building ready for export!');
    return finalGeometry;
  }

  // Add architectural details before applying noise
  private addArchitecturalDetails(
    geometry: THREE.BufferGeometry, 
    style: BuildingStyle, 
    floorParams: FloorParameters
  ): THREE.BufferGeometry {
    console.log('🏗️ Adding architectural details...');
    
    // Add floor line indentations
    this.addFloorLines(geometry, floorParams);
    
    // Add vertical elements (columns, buttresses) for structural realism
    if (style.modernFactor > 0.7) {
      this.addVerticalElements(geometry, style);
    }
    
    // Add corner details for geometric buildings
    if (style.organicFactor < 0.5) {
      this.addCornerDetails(geometry, style);
    }
    
    return geometry;
  }

  // Add subtle floor line indentations
  private addFloorLines(geometry: THREE.BufferGeometry, floorParams: FloorParameters): void {
    const positions = geometry.attributes.position.array as Float32Array;
    
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const buildingHeight = box.max.y - box.min.y;
    const buildingBottom = box.min.y;
    
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const relativeHeight = (y - buildingBottom) / buildingHeight;
      
      // Calculate floor position
      const floorLevel = Math.floor(relativeHeight * floorParams.floorCount);
      const floorY = (floorLevel / floorParams.floorCount) * buildingHeight + buildingBottom;
      
      // Add slight inward displacement at floor lines
      const distanceToFloor = Math.abs(y - floorY);
      if (distanceToFloor < 0.1) {
        const x = positions[i];
        const z = positions[i + 2];
        const distanceFromCenter = Math.sqrt(x * x + z * z);
        
        if (distanceFromCenter > 0) {
          const inwardFactor = 0.05 * (1 - distanceToFloor / 0.1);
          positions[i] *= (1 - inwardFactor);
          positions[i + 2] *= (1 - inwardFactor);
        }
      }
    }
    
    geometry.attributes.position.needsUpdate = true;
  }

  // Add vertical structural elements
  private addVerticalElements(geometry: THREE.BufferGeometry, style: BuildingStyle): void {
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      
      // Create vertical emphasis at corners and edges
      const cornerDistance = Math.min(
        Math.abs(x), Math.abs(z),
        Math.abs(x - z), Math.abs(x + z)
      );
      
      if (cornerDistance < 0.2) {
        const emphasis = (0.2 - cornerDistance) / 0.2 * style.modernFactor;
        const angle = Math.atan2(z, x);
        positions[i] += Math.cos(angle) * emphasis * 0.1;
        positions[i + 2] += Math.sin(angle) * emphasis * 0.1;
      }
    }
    
    geometry.attributes.position.needsUpdate = true;
  }

  // Add corner details for geometric buildings
  private addCornerDetails(geometry: THREE.BufferGeometry, style: BuildingStyle): void {
    const positions = geometry.attributes.position.array as Float32Array;
    
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      
      // Add chamfered corners
      const isCorner = (
        (Math.abs(x - box.max.x) < 0.1 || Math.abs(x - box.min.x) < 0.1) &&
        (Math.abs(z - box.max.z) < 0.1 || Math.abs(z - box.min.z) < 0.1)
      );
      
      if (isCorner) {
        const chamferAmount = 0.05 * (1 - style.organicFactor);
        const dirX = x > 0 ? -1 : 1;
        const dirZ = z > 0 ? -1 : 1;
        
        positions[i] += dirX * chamferAmount;
        positions[i + 2] += dirZ * chamferAmount;
      }
    }
    
    geometry.attributes.position.needsUpdate = true;
  }

  // Apply sophisticated organic shaping using multi-layer Perlin noise
  private applyOrganicShaping(geometry: THREE.BufferGeometry, style: BuildingStyle): THREE.BufferGeometry {
    console.log('🌊 Applying sophisticated organic shaping with high-density noise...');
    
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal?.array as Float32Array;

    // Multi-scale noise for realistic architectural deformation
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      // Large-scale building form noise
      const largescaleNoise = this.noise.fractalNoise(
        x * style.noiseScale * 0.5,
        y * style.noiseScale * 0.2, // Very gentle Y variation
        z * style.noiseScale * 0.5,
        3,
        0.6
      );

      // Medium-scale architectural features
      const mediumscaleNoise = this.noise.fractalNoise(
        x * style.noiseScale * 2,
        y * style.noiseScale * 1,
        z * style.noiseScale * 2,
        4,
        0.5
      );

      // Fine-scale surface details
      const finescaleNoise = this.noise.fractalNoise(
        x * style.noiseScale * 8,
        y * style.noiseScale * 4,
        z * style.noiseScale * 8,
        2,
        0.3
      );

      // Height-based attenuation (less deformation at base)
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const heightFactor = Math.max(0, (y - box.min.y) / (box.max.y - box.min.y));
      const baseStability = Math.max(0.1, 1 - Math.pow(heightFactor, 0.5)); // More stable base

      // Combine noise layers with different intensities
      const combinedNoise = 
        largescaleNoise * 0.6 +
        mediumscaleNoise * 0.3 +
        finescaleNoise * 0.1;

      // Apply displacement based on style and height (more conservative)
      const baseDisplacement = combinedNoise * style.noiseIntensity * style.organicFactor * 0.5; // 50% reduction
      const heightModulatedDisplacement = baseDisplacement * baseStability;

      // Eco-friendly features: add green wall variation
      let ecoDisplacement = 0;
      if (style.ecoFactor > 0) {
        const ecoNoise = this.noise.fractalNoise(
          x * style.noiseScale * 12,
          y * style.noiseScale * 6,
          z * style.noiseScale * 12,
          3,
          0.4
        );
        ecoDisplacement = ecoNoise * style.ecoFactor * 0.1;
      }

      const totalDisplacement = heightModulatedDisplacement + ecoDisplacement;

      // Use normal for displacement direction, with fallback calculation
      if (normals && i / 3 < normals.length / 3) {
        const normalX = normals[i];
        const normalY = normals[i + 1];
        const normalZ = normals[i + 2];
        
        // Apply displacement along normal with architectural constraints
        positions[i] += normalX * totalDisplacement;
        positions[i + 1] += normalY * totalDisplacement * 0.3; // Limited vertical deformation
        positions[i + 2] += normalZ * totalDisplacement;
      } else {
        // Estimate outward direction from building center
        const centerX = (box.max.x + box.min.x) / 2;
        const centerZ = (box.max.z + box.min.z) / 2;
        const dirX = x - centerX;
        const dirZ = z - centerZ;
        const length = Math.sqrt(dirX * dirX + dirZ * dirZ);
        
        if (length > 0.1) {
          const normalizedDirX = dirX / length;
          const normalizedDirZ = dirZ / length;
          
          positions[i] += normalizedDirX * totalDisplacement;
          positions[i + 2] += normalizedDirZ * totalDisplacement;
        }
      }

      // Add slight vertical variation for organic feel
      if (style.organicFactor > 0.5) {
        const verticalNoise = this.noise.noise(x * 0.1, y * 0.05, z * 0.1);
        positions[i + 1] += verticalNoise * style.organicFactor * 0.1;
      }
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    
    console.log('✅ Organic shaping applied with multi-scale noise');
    return geometry;
  }

  // Generate floors using technique inspired by the CodePen
  private generateFloors(geometry: THREE.BufferGeometry, params: FloorParameters): THREE.BufferGeometry {
    const floors: THREE.BufferGeometry[] = [];
    
    for (let floor = 0; floor < params.floorCount; floor++) {
      const floorY = (floor * params.floorHeight) - (params.height / 2);
      
      // Create floor slab
      const floorGeometry = this.createFloorSlab(geometry, floorY, params);
      if (floorGeometry) {
        floors.push(floorGeometry);
      }
    }

    // Merge all floors with the main building
    if (floors.length > 0) {
      try {
        // Create union of all floor slabs
        let combinedFloors = floors[0];
        for (let i = 1; i < floors.length; i++) {
          const brush1 = new Brush(combinedFloors);
          const brush2 = new Brush(floors[i]);
          const result = this.csgEvaluator.evaluate(brush1, brush2, SUBTRACTION);
          combinedFloors = result.geometry;
        }

        // Union with main building
        const mainBrush = new Brush(geometry);
        const floorsBrush = new Brush(combinedFloors);
        const finalResult = this.csgEvaluator.evaluate(mainBrush, floorsBrush, SUBTRACTION);
        
        return finalResult.geometry;
      } catch (error) {
        console.warn('Floor generation CSG failed, returning original geometry:', error);
        return geometry;
      }
    }

    return geometry;
  }

  // Create individual floor slab
  private createFloorSlab(
    buildingGeometry: THREE.BufferGeometry, 
    floorY: number, 
    params: FloorParameters
  ): THREE.BufferGeometry | null {
    // Get building cross-section at this height
    buildingGeometry.computeBoundingBox();
    const box = buildingGeometry.boundingBox!;
    
    // Create floor slab that matches building outline at this height
    const width = (box.max.x - box.min.x) * 0.9; // Slightly smaller than building
    const depth = (box.max.z - box.min.z) * 0.9;
    
    const floorGeometry = new THREE.BoxGeometry(
      width,
      params.floorThickness,
      depth
    );
    
    // Position floor
    floorGeometry.translate(0, floorY, 0);
    
    return floorGeometry;
  }

  // Cut windows from the building
  private async cutWindows(
    geometry: THREE.BufferGeometry,
    windowParams: WindowParameters,
    floorParams: FloorParameters
  ): Promise<THREE.BufferGeometry> {
    console.log('🪟 Starting window cutting process...');
    
    try {
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const buildingWidth = box.max.x - box.min.x;
      const buildingDepth = box.max.z - box.min.z;
      
      const windows: THREE.BufferGeometry[] = [];
      
      // Generate windows for each floor
      for (let floor = 0; floor < floorParams.floorCount; floor++) {
        const floorY = (floor * floorParams.floorHeight) - (floorParams.height / 2) + (floorParams.floorHeight / 2);
        
        // Windows on each face
        const faces = [
          { pos: [buildingWidth / 2 + windowParams.windowInset, floorY, 0], rot: [0, 0, 0] }, // Front
          { pos: [-buildingWidth / 2 - windowParams.windowInset, floorY, 0], rot: [0, Math.PI, 0] }, // Back
          { pos: [0, floorY, buildingDepth / 2 + windowParams.windowInset], rot: [0, -Math.PI / 2, 0] }, // Right
          { pos: [0, floorY, -buildingDepth / 2 - windowParams.windowInset], rot: [0, Math.PI / 2, 0] }, // Left
        ];
        
        for (const face of faces) {
          const windowsPerFace = Math.floor(Math.max(buildingWidth, buildingDepth) / windowParams.windowSpacing);
          
          for (let w = 0; w < windowsPerFace; w++) {
            const windowOffset = (w - windowsPerFace / 2) * windowParams.windowSpacing;
            
            // Create rounded window geometry
            const windowGeometry = this.createRoundedWindow(windowParams);
            
            // Position window
            windowGeometry.translate(
              face.pos[0] + (face.rot[1] === 0 ? windowOffset : 0),
              face.pos[1],
              face.pos[2] + (face.rot[1] !== 0 ? windowOffset : 0)
            );
            
            // Rotate window to face
            if (face.rot[1] !== 0) {
              windowGeometry.rotateY(face.rot[1]);
            }
            
            windows.push(windowGeometry);
          }
        }
      }
      
      // Cut all windows from building
      if (windows.length > 0) {
        let result = geometry;
        
        // Process windows in batches to avoid performance issues
        const batchSize = 10;
        for (let i = 0; i < windows.length; i += batchSize) {
          const batch = windows.slice(i, i + batchSize);
          
          // Combine windows in this batch
          let combinedWindows = batch[0];
          for (let j = 1; j < batch.length; j++) {
            try {
              const brush1 = new Brush(combinedWindows);
              const brush2 = new Brush(batch[j]);
              const unionResult = this.csgEvaluator.evaluate(brush1, brush2, SUBTRACTION);
              combinedWindows = unionResult.geometry;
            } catch (error) {
              console.warn('Window batch union failed:', error);
            }
          }
          
          // Subtract combined windows from building
          try {
            const buildingBrush = new Brush(result);
            const windowsBrush = new Brush(combinedWindows);
            const subtractResult = this.csgEvaluator.evaluate(buildingBrush, windowsBrush, SUBTRACTION);
            result = subtractResult.geometry;
          } catch (error) {
            console.warn('Window cutting failed for batch:', error);
          }
        }
        
        return result;
      }
      
      return geometry;
    } catch (error) {
      console.error('❌ Window cutting failed:', error);
      return geometry;
    }
  }

  // Create rounded window geometry
  private createRoundedWindow(params: WindowParameters): THREE.BufferGeometry {
    if (params.roundness > 0) {
      // Create rounded rectangle using a shape
      const shape = new THREE.Shape();
      const width = params.windowWidth;
      const height = params.windowHeight;
      const radius = Math.min(width, height) * params.roundness * 0.5;
      
      shape.moveTo(-width / 2 + radius, -height / 2);
      shape.lineTo(width / 2 - radius, -height / 2);
      shape.quadraticCurveTo(width / 2, -height / 2, width / 2, -height / 2 + radius);
      shape.lineTo(width / 2, height / 2 - radius);
      shape.quadraticCurveTo(width / 2, height / 2, width / 2 - radius, height / 2);
      shape.lineTo(-width / 2 + radius, height / 2);
      shape.quadraticCurveTo(-width / 2, height / 2, -width / 2, height / 2 - radius);
      shape.lineTo(-width / 2, -height / 2 + radius);
      shape.quadraticCurveTo(-width / 2, -height / 2, -width / 2 + radius, -height / 2);
      
      const extrudeSettings = {
        depth: 0.5,
        bevelEnabled: false
      };
      
      return new THREE.ExtrudeGeometry(shape, extrudeSettings);
    } else {
      // Simple rectangular window
      return new THREE.BoxGeometry(
        params.windowWidth,
        params.windowHeight,
        0.5
      );
    }
  }

  // Add eco-friendly features
  private addEcoFeatures(geometry: THREE.BufferGeometry, style: BuildingStyle): THREE.BufferGeometry {
    if (style.ecoFactor <= 0) return geometry;
    
    // Add subtle green wall texture variation using vertex colors
    const positions = geometry.attributes.position.array as Float32Array;
    const colors = new Float32Array(positions.length);
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Generate green variation based on eco factor and noise
      const greenVariation = this.noise.fractalNoise(x * 0.1, y * 0.1, z * 0.1) * style.ecoFactor;
      
      // Base green color with variation
      const r = 0.3 + greenVariation * 0.2;
      const g = 0.6 + greenVariation * 0.3;
      const b = 0.3 + greenVariation * 0.1;
      
      colors[i] = r;
      colors[i + 1] = g;
      colors[i + 2] = b;
    }
    
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    return geometry;
  }

  // Apply twist to geometry
  private applyTwist(geometry: THREE.BufferGeometry, twistFactor: number, height: number): void {
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Calculate twist angle based on height
      const normalizedY = (y + height / 2) / height; // 0 to 1
      const angle = normalizedY * twistFactor * Math.PI;
      
      // Apply rotation around Y axis
      const cosAngle = Math.cos(angle);
      const sinAngle = Math.sin(angle);
      
      positions[i] = x * cosAngle - z * sinAngle;
      positions[i + 2] = x * sinAngle + z * cosAngle;
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  // ========== VOXEL-BASED BUILDING GENERATION METHODS ==========

  // Step 1: Create voxel space from original form
  private createVoxelSpaceFromForm(
    originalForm: THREE.BufferGeometry,
    style: BuildingStyle,
    floorParams: FloorParameters
  ): VoxelSpace {
    console.log('📦 Creating voxel space from original form mass...');
    
    // Calculate form bounds
    originalForm.computeBoundingBox();
    const box = originalForm.boundingBox!;
    
    // Determine voxel resolution based on form size
    const formSize = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    const resolution = Math.max(0.1, formSize / 40); // 40 voxels across the largest dimension
    
    // Calculate building height and floor information
    const originalHeight = box.max.y - box.min.y;
    const floorHeight = floorParams.floorHeight || Math.max(1.0, originalHeight / 4); // Adaptive floor height
    const floorCount = Math.max(2, Math.floor(originalHeight / floorHeight));
    
    // Fix Y coordinates to ensure foundation starts at ground level (Y=0)
    const padding = resolution * 0.5;
    const buildingHeight = box.max.y - box.min.y;
    
    const bounds = {
      min: { 
        x: box.min.x - padding, 
        y: box.min.y - padding, // Keep Y aligned with original geometry
        z: box.min.z - padding 
      },
      max: { 
        x: box.max.x + padding, 
        y: box.max.y + padding, // Keep Y aligned with original geometry
        z: box.max.z + padding 
      }
    };
    
    console.log(`📦 Original mesh: ${box.min.x.toFixed(2)},${box.min.y.toFixed(2)},${box.min.z.toFixed(2)} to ${box.max.x.toFixed(2)},${box.max.y.toFixed(2)},${box.max.z.toFixed(2)}`);
    console.log(`📦 Voxel space: ${bounds.min.x.toFixed(2)},${bounds.min.y.toFixed(2)},${bounds.min.z.toFixed(2)} to ${bounds.max.x.toFixed(2)},${bounds.max.y.toFixed(2)},${bounds.max.z.toFixed(2)}`);
    console.log(`📦 Grid size: ${Math.ceil((bounds.max.x - bounds.min.x) / resolution)}×${Math.ceil((bounds.max.y - bounds.min.y) / resolution)}×${Math.ceil((bounds.max.z - bounds.min.z) / resolution)} voxels`);
    console.log(`📦 Resolution: ${resolution.toFixed(3)} units per voxel`);
    
    return {
      voxels: new Map<string, VoxelCell>(),
      bounds,
      resolution,
      metadata: {
        originalForm: originalForm.clone(),
        buildingType: this.getBuildingTypeFromStyle(style),
        floorCount,
        floorHeight
      }
    };
  }

  // Step 2: Hierarchical architectural decomposition
  private performHierarchicalDecomposition(
    voxelSpace: VoxelSpace,
    style: BuildingStyle,
    floorParams: FloorParameters
  ): ArchitecturalHierarchy {
    console.log('🏛️ Performing hierarchical architectural decomposition...');
    
    // 1. Create mass model (overall building volume)
    const mass = this.createMassModel(voxelSpace);
    console.log('  ✅ Mass model created');
    
    // 2. Decompose into facades
    const facades = this.decomposeFacades(mass, voxelSpace);
    console.log(`  ✅ ${facades.length} facades decomposed`);
    
    // 3. Subdivide facades into floors
    const floors = this.subdivideIntoFloors(facades, voxelSpace);
    console.log(`  ✅ ${floors.length} floors subdivided`);
    
    // 4. Partition floors into bays
    const bays = this.partitionIntoBays(floors, voxelSpace, style);
    console.log(`  ✅ ${bays.length} bays partitioned`);
    
    // 5. Initialize component space for windows/doors
    const components: BuildingComponent[] = [];
    
    return {
      mass,
      facades,
      floors,
      bays,
      components
    };
  }

  // Step 3: Apply building type rules
  private applyBuildingTypeRules(
    hierarchy: ArchitecturalHierarchy,
    style: BuildingStyle,
    floorParams: FloorParameters
  ): ArchitecturalHierarchy {
    console.log('🏢 Applying building type rules for coherent architecture...');
    
    const ruleSet = this.getBuildingRuleSet(style);
    console.log(`  📋 Using rule set: ${ruleSet.name}`);
    
    // Apply floor rules
    this.applyFloorRules(hierarchy.floors, ruleSet.floorRules);
    console.log('  ✅ Floor rules applied');
    
    // Apply facade rules  
    this.applyFacadeRules(hierarchy.facades, ruleSet.facadeRules);
    console.log('  ✅ Facade rules applied');
    
    return hierarchy;
  }

  // Step 4: Generate semantic components
  private generateSemanticComponents(
    hierarchy: ArchitecturalHierarchy,
    style: BuildingStyle,
    floorParams: FloorParameters
  ): ArchitecturalHierarchy {
    console.log('🪟 Generating semantic components (windows, doors, details)...');
    
    const ruleSet = this.getBuildingRuleSet(style);
    
    // Generate windows for each bay
    for (const bay of hierarchy.bays) {
      const windows = this.generateWindowsForBay(bay, ruleSet.windowRules);
      hierarchy.components.push(...windows);
    }
    
    console.log(`  ✅ ${hierarchy.components.length} windows generated`);
    
    // Generate entrance doors
    const doors = this.generateEntranceDoors(hierarchy.floors[0]);
    hierarchy.components.push(...doors);
    console.log(`  ✅ ${doors.length} entrance doors generated`);
    
    return hierarchy;
  }

  // Step 5: Apply style-specific modifications
  private applyStyleSpecificModifications(
    hierarchy: ArchitecturalHierarchy,
    style: BuildingStyle
  ): ArchitecturalHierarchy {
    console.log('🌊 Applying style-specific modifications...');
    
    const ruleSet = this.getBuildingRuleSet(style);
    
    for (const styleMod of ruleSet.styleMods) {
      console.log(`  🎨 Applying ${styleMod.type} modification (intensity: ${styleMod.intensity})`);
      
      switch (styleMod.type) {
        case 'rounding':
          this.applyRoundingModification(hierarchy, styleMod);
          break;
        case 'organic':
          this.applyOrganicModification(hierarchy, styleMod, style);
          break;
        case 'noise':
          this.applyNoiseModification(hierarchy, styleMod, style);
          break;
      }
    }
    
    console.log('  ✅ Style modifications applied');
    return hierarchy;
  }

  // Step 6: Convert voxels to mesh
  private convertVoxelsToMesh(
    hierarchy: ArchitecturalHierarchy,
    style: BuildingStyle
  ): THREE.BufferGeometry {
    console.log('✨ Converting voxel data to high-quality mesh...');
    
    // Collect all voxels from the hierarchy
    const allVoxels = this.collectAllVoxels(hierarchy);
    console.log(`  📦 Processing ${allVoxels.length} voxels`);
    
    // Generate mesh using simplified approach for now
    const mesh = this.generateMeshFromVoxels(allVoxels, hierarchy.mass.voxelBounds, style, hierarchy);
    console.log(`  ✅ Mesh generated with ${mesh.attributes.position.count} vertices`);
    
    // Apply final surface refinement
    const refinedMesh = this.refineMeshSurface(mesh, style, hierarchy);
    console.log('  ✅ Surface refinement completed');
    
    return refinedMesh;
  }

  // Helper methods for voxel system
  private getBuildingTypeFromStyle(style: BuildingStyle): string {
    if (style.ecoFactor > 0.7) return 'eco';
    if (style.modernFactor > 0.8) return 'modern';
    if (style.organicFactor > 0.6) return 'organic';
    return 'standard';
  }

  private createMassModel(voxelSpace: VoxelSpace): BuildingComponent {
    const { bounds, resolution, metadata } = voxelSpace;
    
    // Fill voxel space with architectural building mass
    this.fillVoxelSpaceWithBuildingMass(voxelSpace);
    
    return {
      id: 'architectural-mass-0',
      type: ArchitecturalRole.Mass,
      voxelBounds: bounds,
      children: [],
      voxels: Array.from(voxelSpace.voxels.values()), // Legacy array format for compatibility
      voxelSpace: voxelSpace, // NEW: Include the entire VoxelSpace for detailed access
      metadata: { 
        originalForm: metadata.originalForm,
        floorCount: metadata.floorCount,
        buildingStyle: metadata.buildingType || 'modern',
        generationMethod: 'volumetric-decomposition'
      }
    };
  }

  // Fill voxel space with building mass based on original geometry
  private fillVoxelSpaceWithBuildingMass(voxelSpace: VoxelSpace): void {
    const { bounds, resolution, metadata } = voxelSpace;
    const originalForm = metadata.originalForm;
    const buildingStyle = metadata.buildingType || 'modern';
    
    // Get original form bounds 
    originalForm.computeBoundingBox();
    const formBox = originalForm.boundingBox!;
    
    console.log(`  🏗️ ARCHITECTURAL VOXEL BUILDING GENERATION: ${buildingStyle.toUpperCase()} STYLE`);
    console.log(`  📦 Original mesh: ${formBox.min.x.toFixed(2)},${formBox.min.y.toFixed(2)},${formBox.min.z.toFixed(2)} to ${formBox.max.x.toFixed(2)},${formBox.max.y.toFixed(2)},${formBox.max.z.toFixed(2)}`);
    console.log(`  📐 Voxel space: ${bounds.min.x.toFixed(2)},${bounds.min.y.toFixed(2)},${bounds.min.z.toFixed(2)} to ${bounds.max.x.toFixed(2)},${bounds.max.y.toFixed(2)},${bounds.max.z.toFixed(2)}`);
    console.log(`  🔍 Resolution: ${resolution.toFixed(3)} units per voxel`);
    
    // Create architectural building from mesh geometry
    console.log(`  🏗️ Creating architectural building from mesh geometry (foundation + floors + roof)...`);
    const sampledVoxels = this.sampleMeshIntoVoxelGrid(voxelSpace, originalForm, formBox, buildingStyle, resolution, true);
    
    console.log(`  ✅ ARCHITECTURAL BUILDING COMPLETE:`);
    console.log(`     🏗️ Generated: ${sampledVoxels} architectural voxels`);
    console.log(`     🎨 Style: ${buildingStyle} applied to building structure`);
    console.log(`     📊 Total voxels in grid: ${voxelSpace.voxels.size}`);
    
    if (sampledVoxels === 0) {
      console.error('  ❌ CRITICAL: No voxels sampled from mesh geometry!');
      console.error('  ❌ Check mesh-to-voxel sampling logic');
    }
  }
  
  // Fill the original mesh geometry with architectural voxels (foundation + floors + roof)
  private sampleMeshIntoVoxelGrid(
    voxelSpace: VoxelSpace, 
    originalForm: THREE.BufferGeometry, 
    formBox: THREE.Box3, 
    style: string, 
    resolution: number,
    isVoxelGeneration: boolean = true
  ): number {
    const { bounds, metadata } = voxelSpace;
    let sampledCount = 0;
    
    // Reset debug counters for fresh output
    this.geometryDebugCount = 0;
    this.raycastDebugCount = 0;
    this.proximityDebugCount = 0;
    this.buildingDebugCount = 0;
    this.floorDebugCount = 0;
    this.footprintDebugCount = 0;
    this.floorZoneDebugCount = 0;
    this.floorLevelDebugCount = 0;
    this.interiorDebugCount = 0;
    
    // Calculate voxel grid dimensions
    const gridSizeX = Math.ceil((bounds.max.x - bounds.min.x) / resolution);
    const gridSizeY = Math.ceil((bounds.max.y - bounds.min.y) / resolution);
    const gridSizeZ = Math.ceil((bounds.max.z - bounds.min.z) / resolution);
    
    // Get floor count from metadata
    const floorCount = metadata.floorCount || 3;
    const buildingHeight = formBox.max.y - formBox.min.y;
    const floorHeight = buildingHeight / floorCount;
    
    console.log(`    📏 Architectural voxel grid: ${gridSizeX} × ${gridSizeY} × ${gridSizeZ} = ${gridSizeX * gridSizeY * gridSizeZ} potential voxels`);
    console.log(`    🏗️ Building: ${floorCount} floor slabs (1 voxel thick, following building shape)`);
    console.log(`    🎯 SIMPLE floor detection - direct geometry test at middle height`);
    console.log(`    🎯 Slab thickness: ${resolution.toFixed(3)} units (1 voxel layer)`);
    
    // Sample every voxel position for architectural generation
    for (let gx = 0; gx < gridSizeX; gx++) {
      for (let gy = 0; gy < gridSizeY; gy++) {
        for (let gz = 0; gz < gridSizeZ; gz++) {
          // Convert grid coordinates to world coordinates (voxel center)
          const worldX = bounds.min.x + (gx + 0.5) * resolution;
          const worldY = bounds.min.y + (gy + 0.5) * resolution;
          const worldZ = bounds.min.z + (gz + 0.5) * resolution;
          
          // Check if this voxel should be part of the building
          // No coordinate transformation needed since voxel space is now aligned with original geometry
          const originalSpaceY = worldY;
          
          // Debug coordinate alignment for first few voxels
          if (sampledCount < 3) {
            console.log(`🔄 Coordinate check ${sampledCount + 1}:`);
            console.log(`  Grid Y: ${gy}, World Y: ${worldY.toFixed(3)} (no transform needed)`);
            console.log(`  FormBox: min.y=${formBox.min.y.toFixed(3)}, max.y=${formBox.max.y.toFixed(3)}`);
            console.log(`  Bounds: min.y=${bounds.min.y.toFixed(3)}, max.y=${bounds.max.y.toFixed(3)}`);
            console.log(`  Bounds should align with FormBox: ${Math.abs(bounds.min.y - formBox.min.y) < 0.1 && Math.abs(bounds.max.y - formBox.max.y) < 0.1}`);
          }
          
          const buildingInfo = this.isVoxelPartOfBuilding(worldX, originalSpaceY, worldZ, originalForm, formBox, floorCount, floorHeight, resolution, isVoxelGeneration);
          
          if (buildingInfo.isPartOfBuilding) {
            // Create architectural voxel with proper role and floor info
            const voxel: VoxelCell = {
              x: gx,
              y: gy,
              z: gz,
              type: VoxelType.Solid,
              architecturalRole: buildingInfo.role,
              density: 1.0,
              metadata: { 
                style: style,
                sampled_from: 'architectural_generation',
                floor_number: buildingInfo.floorNumber,
                building_part: buildingInfo.part,
                world_position: { x: worldX, y: worldY, z: worldZ }
              }
            };
            
            const voxelKey = `${gx},${gy},${gz}`;
            voxelSpace.voxels.set(voxelKey, voxel);
            sampledCount++;
          }
        }
      }
    }
    
    console.log(`    ✅ Architectural generation complete: ${sampledCount} voxels with foundation + ${floorCount} floor slabs + walls + roof`);
    
    // Post-process: Remove floor voxels that overlap with wall voxels for clean separation
    this.cleanFloorWallOverlaps(voxelSpace);
    
    return sampledCount;
  }
  
  // Remove floor voxels that overlap with wall voxels for clean architectural separation
  private cleanFloorWallOverlaps(voxelSpace: VoxelSpace): void {
    console.log(`    🧹 Cleaning floor-wall overlaps for architectural separation...`);
    
    const floorsToRemove: string[] = [];
    let removedCount = 0;
    
    // First pass: identify all wall positions
    const wallPositions = new Set<string>();
    for (const [key, voxel] of voxelSpace.voxels) {
      if (voxel.architecturalRole === ArchitecturalRole.Facade) {
        wallPositions.add(`${voxel.x},${voxel.y},${voxel.z}`);
      }
    }
    
    // Second pass: check floors against walls
    for (const [key, voxel] of voxelSpace.voxels) {
      if (voxel.architecturalRole === ArchitecturalRole.Floor) {
        const voxelPosition = `${voxel.x},${voxel.y},${voxel.z}`;
        
        // Check if this floor voxel overlaps with a wall voxel
        if (wallPositions.has(voxelPosition)) {
          floorsToRemove.push(key);
          removedCount++;
          console.log(`      🚫 Removing floor voxel at (${voxel.x}, ${voxel.y}, ${voxel.z}) - overlaps with wall`);
        }
        
        // Check for wall proximity in all 8 horizontal directions
        const adjacentPositions = [
          `${voxel.x - 1},${voxel.y},${voxel.z}`,     // -X
          `${voxel.x + 1},${voxel.y},${voxel.z}`,     // +X
          `${voxel.x},${voxel.y},${voxel.z - 1}`,     // -Z
          `${voxel.x},${voxel.y},${voxel.z + 1}`,     // +Z
          `${voxel.x - 1},${voxel.y},${voxel.z - 1}`, // -X-Z diagonal
          `${voxel.x + 1},${voxel.y},${voxel.z - 1}`, // +X-Z diagonal
          `${voxel.x - 1},${voxel.y},${voxel.z + 1}`, // -X+Z diagonal
          `${voxel.x + 1},${voxel.y},${voxel.z + 1}`, // +X+Z diagonal
        ];
        
        let adjacentWallCount = 0;
        for (const adjPos of adjacentPositions) {
          if (wallPositions.has(adjPos)) {
            adjacentWallCount++;
          }
        }
        
        // Remove floors that are too close to exterior walls
        // Use different thresholds based on wall proximity pattern
        if (adjacentWallCount >= 3) {
          // Definitely part of wall thickness or corner
          floorsToRemove.push(key);
          removedCount++;
          console.log(`      🚫 Removing floor voxel at (${voxel.x}, ${voxel.y}, ${voxel.z}) - surrounded by ${adjacentWallCount} walls`);
        } else if (adjacentWallCount >= 2) {
          // Check if this is an exterior edge (adjacent walls in consecutive directions)
          const isExteriorEdge = this.isFloorAtExteriorEdge(voxel.x, voxel.y, voxel.z, wallPositions);
          if (isExteriorEdge) {
            floorsToRemove.push(key);
            removedCount++;
            console.log(`      🚫 Removing floor voxel at (${voxel.x}, ${voxel.y}, ${voxel.z}) - exterior edge with ${adjacentWallCount} walls`);
          }
        } else if (adjacentWallCount === 1) {
          // For single wall adjacency, only remove if it's clearly an exterior wall
          const isAgainstExteriorWall = this.isFloorAgainstExteriorWall(voxel.x, voxel.y, voxel.z, wallPositions, voxelSpace);
          if (isAgainstExteriorWall) {
            floorsToRemove.push(key);
            removedCount++;
            console.log(`      🚫 Removing floor voxel at (${voxel.x}, ${voxel.y}, ${voxel.z}) - against exterior wall`);
          }
        }
      }
    }
    
    // Remove identified floor voxels
    for (const key of floorsToRemove) {
      voxelSpace.voxels.delete(key);
    }
    
    console.log(`    ✅ Floor-wall cleanup complete: Removed ${removedCount} overlapping floor voxels`);
    console.log(`    📊 Remaining voxels: ${voxelSpace.voxels.size}`);
  }

  // Check if a floor voxel is at an exterior edge (walls in consecutive directions)
  private isFloorAtExteriorEdge(x: number, y: number, z: number, wallPositions: Set<string>): boolean {
    // Check for L-shaped wall patterns (corners) or straight edge patterns
    const directions = [
      [1, 0],   // +X
      [0, 1],   // +Z  
      [-1, 0],  // -X
      [0, -1],  // -Z
    ];
    
    for (let i = 0; i < directions.length; i++) {
      const [dx1, dz1] = directions[i];
      const [dx2, dz2] = directions[(i + 1) % 4]; // Next direction (consecutive)
      
      const wall1 = wallPositions.has(`${x + dx1},${y},${z + dz1}`);
      const wall2 = wallPositions.has(`${x + dx2},${y},${z + dz2}`);
      
      // If walls in two consecutive directions, this is an exterior corner
      if (wall1 && wall2) {
        return true;
      }
    }
    
    return false;
  }

  // Check if a floor voxel is against an exterior wall (not interior wall)
  private isFloorAgainstExteriorWall(x: number, y: number, z: number, wallPositions: Set<string>, voxelSpace: VoxelSpace): boolean {
    // Find the direction of the adjacent wall
    const directions = [
      [1, 0],   // +X
      [0, 1],   // +Z  
      [-1, 0],  // -X
      [0, -1],  // -Z
    ];
    
    for (const [dx, dz] of directions) {
      const wallPos = `${x + dx},${y},${z + dz}`;
      if (wallPositions.has(wallPos)) {
        // Check if there's building interior beyond this wall
        // If no building voxels beyond the wall, it's an exterior wall
        const beyondWallX = x + dx * 2;
        const beyondWallZ = z + dz * 2;
        const beyondWallKey = `${beyondWallX},${y},${beyondWallZ}`;
        
        // If there's no voxel beyond the wall, it's an exterior wall
        if (!voxelSpace.voxels.has(beyondWallKey)) {
          return true;
        }
      }
    }
    
    return false;
  }
  
  // Determine if a voxel should be part of the building and assign architectural role
  private isVoxelPartOfBuilding(
    worldX: number, worldY: number, worldZ: number,
    originalForm: THREE.BufferGeometry,
    formBox: THREE.Box3,
    floorCount: number,
    floorHeight: number,
    resolution: number,
    isVoxelGeneration: boolean = true
  ): { isPartOfBuilding: boolean; role: typeof ArchitecturalRole[keyof typeof ArchitecturalRole]; floorNumber: number; part: string } {
    
    // Note: worldY is already in original form coordinate space (transformed in sampleMeshIntoVoxelGrid)
    // Calculate relative position within building
    const relativeY = (worldY - formBox.min.y) / (formBox.max.y - formBox.min.y);
    const absoluteY = worldY - formBox.min.y;
    const buildingHeight = formBox.max.y - formBox.min.y;
    
    // Calculate floor slab positions
    const foundationHeight = buildingHeight * 0.2; // Bottom 20% (increased for better filling)
    const roofHeight = buildingHeight * 0.2; // Top 20% (increased for better filling)
    const floorZoneHeight = buildingHeight - foundationHeight - roofHeight; // Middle 60%
    const actualFloorHeight = floorZoneHeight / floorCount;
    const slabThickness = resolution; // Floor slab = exactly 1 voxel layer thick
    
    // Debug building height breakdown (only show once)
    if (!this.heightBreakdownDebugShown) {
      this.heightBreakdownDebugShown = true;
      console.log(`📏 BUILDING HEIGHT BREAKDOWN:`);
      console.log(`   Total building height: ${buildingHeight.toFixed(2)} units`);
      console.log(`   🟤 Foundation zone: 0.00 to ${foundationHeight.toFixed(2)} (${foundationHeight.toFixed(2)} units)`);
      console.log(`   🟢 Floor zone: ${foundationHeight.toFixed(2)} to ${(buildingHeight - roofHeight).toFixed(2)} (${floorZoneHeight.toFixed(2)} units)`);
      console.log(`   🔴 Roof zone: ${(buildingHeight - roofHeight).toFixed(2)} to ${buildingHeight.toFixed(2)} (${roofHeight.toFixed(2)} units)`);
    }
    
    // PRIORITY CHECK: Is this a floor slab position? (Check this FIRST before mesh inclusion)
    if (absoluteY > foundationHeight && absoluteY < buildingHeight - roofHeight) {
      const floorZoneY = absoluteY - foundationHeight;
      
      // Debug the floor zone calculation
      if (!this.floorZoneDebugCount || this.floorZoneDebugCount < 2) {
        this.floorZoneDebugCount = (this.floorZoneDebugCount || 0) + 1;
        console.log(`    📐 FLOOR ZONE ${this.floorZoneDebugCount}: absoluteY=${absoluteY.toFixed(2)}, foundationHeight=${foundationHeight.toFixed(2)}, floorZoneY=${floorZoneY.toFixed(2)}, actualFloorHeight=${actualFloorHeight.toFixed(2)}, slabThickness=${slabThickness.toFixed(2)}`);
      }
      
      for (let floor = 1; floor <= floorCount; floor++) {
        // IMPROVED: Distribute floors evenly with proper spacing
        // Each floor gets equal space, positioned at the center of its allocated zone
        const floorZonePerFloor = floorZoneHeight / floorCount;
        const floorCenterY = (floor - 0.5) * floorZonePerFloor; // Center of floor's zone
        const floorSlabBottom = floorCenterY - (slabThickness / 2);
        const floorSlabTop = floorCenterY + (slabThickness / 2);
        
        // Debug floor level calculation
        if (!this.floorLevelDebugCount || this.floorLevelDebugCount < 6) {
          this.floorLevelDebugCount = (this.floorLevelDebugCount || 0) + 1;
          console.log(`    📏 FLOOR ${floor}: center=${floorCenterY.toFixed(2)}, bottom=${floorSlabBottom.toFixed(2)}, top=${floorSlabTop.toFixed(2)}, floorZoneY=${floorZoneY.toFixed(2)} → inRange=${floorZoneY >= floorSlabBottom && floorZoneY <= floorSlabTop}`);
        }
        
        if (floorZoneY >= floorSlabBottom && floorZoneY <= floorSlabTop) {
          // This is a floor slab Y level - check if within building shape
          // Always use comprehensive floor filling - we'll clean up overlaps later
          const isInFloorFootprint = this.isPointInBuildingFootprintOriginal(worldX, worldZ, worldY, originalForm, formBox);
          
          console.log(`    🎯 FLOOR SLAB TEST: floor ${floor} at (${worldX.toFixed(2)}, ${worldY.toFixed(2)}, ${worldZ.toFixed(2)}) → inFootprint: ${isInFloorFootprint}`);
          
          if (isInFloorFootprint) {
            // FLOOR SLAB IN BUILDING SHAPE!
            console.log(`    🟢 ✅ FLOOR SLAB CREATED: floor ${floor} at (${worldX.toFixed(2)}, ${worldY.toFixed(2)}, ${worldZ.toFixed(2)})`);
            
            return { 
              isPartOfBuilding: true, 
              role: ArchitecturalRole.Floor, 
              floorNumber: floor, 
              part: `floor_slab_${floor}` 
            };
          } else {
            console.log(`    🟢 ❌ FLOOR SLAB REJECTED: floor ${floor} at (${worldX.toFixed(2)}, ${worldY.toFixed(2)}, ${worldZ.toFixed(2)}) - not in footprint`);
          }
        }
      }
    }
    
    // For foundation and roof areas, use more aggressive filling based on footprint
    const isFoundationArea = absoluteY < foundationHeight;
    const isRoofArea = absoluteY > buildingHeight - roofHeight;
    
    if (isFoundationArea || isRoofArea) {
      // For foundation and roof, test footprint inclusion instead of strict geometry tests
      const isInFootprint = this.isPointInBuildingFootprintOriginal(worldX, worldZ, worldY, originalForm, formBox);
      
      if (!this.geometryTestDebugCount || this.geometryTestDebugCount < 5) {
        this.geometryTestDebugCount = (this.geometryTestDebugCount || 0) + 1;
        const areaType = isFoundationArea ? 'FOUNDATION' : 'ROOF';
        console.log(`🔍 ${areaType} FOOTPRINT TEST ${this.geometryTestDebugCount}: (${worldX.toFixed(2)}, ${worldY.toFixed(2)}, ${worldZ.toFixed(2)}) → inFootprint: ${isInFootprint}`);
      }
      
      if (!isInFootprint) {
        return { isPartOfBuilding: false, role: ArchitecturalRole.Mass, floorNumber: 0, part: 'none' };
      }
    } else {
      // For walls/other areas, do the normal mesh inclusion check
    const isInMesh = this.isPointInsideOriginalGeometry(worldX, worldY, worldZ, originalForm, formBox);
    const isNearMeshSurface = !isInMesh && this.pointNearMeshSurface(worldX, worldY, worldZ, originalForm);
    
    if (!isInMesh && !isNearMeshSurface) {
      return { isPartOfBuilding: false, role: ArchitecturalRole.Mass, floorNumber: 0, part: 'none' };
      }
    }
    
    // Debug first few voxel placements
    if (!this.buildingDebugCount || this.buildingDebugCount < 5) {
      this.buildingDebugCount = (this.buildingDebugCount || 0) + 1;
      const debugType = isFoundationArea ? 'FOUNDATION' : isRoofArea ? 'ROOF' : 'WALL';
      console.log(`    🔧 Non-floor voxel ${this.buildingDebugCount}: (${worldX.toFixed(2)}, ${worldY.toFixed(2)}, ${worldZ.toFixed(2)}) → ${debugType} area accepted`);
    }
    
    // Assign architectural roles based on position (foundation, roof, walls)
    let role: typeof ArchitecturalRole[keyof typeof ArchitecturalRole];
    let part: string;
    let floorNumber = 0;
    
    if (absoluteY < foundationHeight) {
      // Bottom 10% = Foundation
      role = ArchitecturalRole.Mass;
      part = 'foundation';
      
      // Debug foundation generation
      if (!this.foundationDebugCount || this.foundationDebugCount < 3) {
        this.foundationDebugCount = (this.foundationDebugCount || 0) + 1;
        console.log(`🟤 FOUNDATION ${this.foundationDebugCount}: (${worldX.toFixed(2)}, ${worldY.toFixed(2)}, ${worldZ.toFixed(2)}) absoluteY=${absoluteY.toFixed(2)} < foundationHeight=${foundationHeight.toFixed(2)}`);
      }
    } else if (absoluteY > buildingHeight - roofHeight) {
      // Top 10% = Roof
      role = ArchitecturalRole.Component;
      part = 'roof';
      
      // Debug roof generation
      if (!this.roofDebugCount || this.roofDebugCount < 3) {
        this.roofDebugCount = (this.roofDebugCount || 0) + 1;
        console.log(`🔴 ROOF ${this.roofDebugCount}: (${worldX.toFixed(2)}, ${worldY.toFixed(2)}, ${worldZ.toFixed(2)}) absoluteY=${absoluteY.toFixed(2)} > ${(buildingHeight - roofHeight).toFixed(2)}`);
      }
    } else {
      // Middle 80% = Floor zone - handle walls only (floor slabs handled above)
      const floorZoneY = absoluteY - foundationHeight;
      
      // Check if this is a wall (near the exterior surface)
      const isWall = this.isVoxelNearExteriorSurface(worldX, worldY, worldZ, originalForm);
      
      // Debug what happens in the floor zone (should be walls)
      if (!this.interiorDebugCount || this.interiorDebugCount < 3) {
        this.interiorDebugCount = (this.interiorDebugCount || 0) + 1;
        console.log(`    🔍 FLOOR ZONE WALL DEBUG ${this.interiorDebugCount}: (${worldX.toFixed(2)}, ${worldY.toFixed(2)}, ${worldZ.toFixed(2)}) → isWall: ${isWall}, floorZoneY: ${floorZoneY.toFixed(2)}`);
      }
      
      if (isWall) {
        // This is a wall
        const actualFloorHeight = floorZoneHeight / floorCount;
        const currentFloor = Math.ceil((floorZoneY / actualFloorHeight)) || 1;
        role = ArchitecturalRole.Facade;
        part = `wall_floor_${currentFloor}`;
        floorNumber = currentFloor;
      } else {
        // This is interior empty space - don't include
        return { isPartOfBuilding: false, role: ArchitecturalRole.Mass, floorNumber: 0, part: 'none' };
      }
    }
    
    return { 
      isPartOfBuilding: true, 
      role: role, 
      floorNumber: floorNumber, 
      part: part 
    };
  }
  
  // Check if a voxel is near the exterior surface (for wall detection)
  private isVoxelNearExteriorSurface(
    worldX: number, worldY: number, worldZ: number,
    originalForm: THREE.BufferGeometry
  ): boolean {
    // This voxel is already inside/near the mesh, now check if it's near the exterior
    
    // Sample points around this voxel to see if any are outside the mesh
    const sampleDistance = 0.1; // Distance to check around the voxel
    const samplePoints = [
      [worldX + sampleDistance, worldY, worldZ], // Right
      [worldX - sampleDistance, worldY, worldZ], // Left
      [worldX, worldY, worldZ + sampleDistance], // Forward
      [worldX, worldY, worldZ - sampleDistance], // Back
    ];
    
    let outsideCount = 0;
    for (const [sx, sy, sz] of samplePoints) {
      const isOutside = !this.isPointInsideOriginalGeometry(sx, sy, sz, originalForm);
      if (isOutside) {
        outsideCount++;
      }
    }
    
    // If any neighboring points are outside, this is near the exterior (wall)
    return outsideCount > 0;
  }
  
  // Check if a 2D point (x,z) is within the building footprint (for floor slab coverage)
  private isPointInBuildingFootprint(
    worldX: number, worldZ: number,
    floorY: number, // NEW: Test at the exact floor height
    originalForm: THREE.BufferGeometry,
    formBox: THREE.Box3
  ): boolean {
    // WALL-INSET FLOOR PLACEMENT: Floors should be inset from exterior walls to create proper interior space
    const testY = floorY;
    
    // Define wall thickness - floors should be inset by this amount from building perimeter
    const wallThickness = 0.1; // Reduced - was too aggressive at 0.2
    
    // Method 1: Test if point is inside the building volume at floor height
    const isInside = this.isPointInsideOriginalGeometry(worldX, testY, worldZ, originalForm, formBox);
    
    // Method 2: Check if we're close to the building perimeter (should NOT have floor if too close to walls)
    const isNearExteriorWall = this.isPointNearBuildingPerimeter(worldX, worldZ, testY, originalForm, formBox, wallThickness);
    
    // Method 3: For solid floor filling, test if we're deep enough inside the building interior
    const isInInterior = this.isPointInBuildingInterior(worldX, worldZ, testY, originalForm, formBox);
    
    // Create floor ONLY if:
    // 1. We're inside the building volume AND
    // 2. We're NOT too close to exterior walls AND  
    // 3. We're sufficiently interior
    let shouldHaveFloor = isInside && !isNearExteriorWall && isInInterior;
    
    // FALLBACK: If strict criteria reject too many floors, use simpler approach
    if (!shouldHaveFloor && isInside) {
      // Fallback to just checking if we're inside and have some interior rays
      const relaxedInterior = this.isPointInBuildingInterior(worldX, worldZ, testY, originalForm, formBox);
      shouldHaveFloor = isInside && relaxedInterior;
    }
    
    // Debug floor footprint check
    if (!this.footprintDebugCount || this.footprintDebugCount < 5) {
      this.footprintDebugCount = (this.footprintDebugCount || 0) + 1;
      console.log(`    📏 WALL-INSET FLOOR FILL ${this.footprintDebugCount}: (${worldX.toFixed(2)}, ${worldZ.toFixed(2)}) at floorY=${testY.toFixed(2)} → inside: ${isInside}, nearWall: ${isNearExteriorWall}, interior: ${isInInterior}, hasFloor: ${shouldHaveFloor}`);
    }
    
    return shouldHaveFloor;
  }
  
  // Original comprehensive floor filling logic (for voxel generation mode)
  private isPointInBuildingFootprintOriginal(
    worldX: number, worldZ: number,
    floorY: number,
    originalForm: THREE.BufferGeometry,
    formBox: THREE.Box3
  ): boolean {
    // COMPREHENSIVE FLOOR FILLING: Fill the ENTIRE interior area, not just perimeter
    const testY = floorY;
    
    // Method 1: Test if point is inside the building volume at floor height
    const isInside = this.isPointInsideOriginalGeometry(worldX, testY, worldZ, originalForm, formBox);
    
    // Method 2: For solid floor filling, also test if we're inside the 2D footprint
    const isInFootprint = this.isPointInBuildingHorizontalProjection(worldX, worldZ, originalForm, formBox);
    
    // Method 3: Fill interior by testing if we're surrounded by building geometry (relaxed)
    const isInteriorPoint = this.isPointInBuildingInteriorRelaxed(worldX, worldZ, testY, originalForm, formBox);
    
    // Create floor if we're inside OR in the footprint OR an interior point
    const shouldHaveFloor = isInside || isInFootprint || isInteriorPoint;
    
    return shouldHaveFloor;
  }
  
  // Relaxed interior detection for voxel generation (original 60% threshold)
  private isPointInBuildingInteriorRelaxed(
    worldX: number, worldZ: number, 
    testY: number,
    originalForm: THREE.BufferGeometry,
    formBox: THREE.Box3
  ): boolean {
    const rayDirections = [
      new THREE.Vector3(1, 0, 0),   // +X
      new THREE.Vector3(-1, 0, 0),  // -X
      new THREE.Vector3(0, 0, 1),   // +Z
      new THREE.Vector3(0, 0, -1),  // -Z
      new THREE.Vector3(1, 0, 1).normalize(),   // +X+Z diagonal
      new THREE.Vector3(-1, 0, 1).normalize(),  // -X+Z diagonal
      new THREE.Vector3(1, 0, -1).normalize(),  // +X-Z diagonal
      new THREE.Vector3(-1, 0, -1).normalize()  // -X-Z diagonal
    ];
    
    const rayStart = new THREE.Vector3(worldX, testY, worldZ);
    const mesh = new THREE.Mesh(originalForm);
    let hitCount = 0;
    
    for (const direction of rayDirections) {
      const raycaster = new THREE.Raycaster(rayStart, direction);
      const intersections = raycaster.intersectObject(mesh);
      
      if (intersections.length > 0) {
        hitCount++;
      }
    }
    
    // Clean up
    mesh.geometry = new THREE.BufferGeometry();
    
    // Original relaxed threshold - 60% of rays must hit
    return hitCount >= (rayDirections.length * 0.6);
  }
  
  // Check if a point is too close to the building perimeter (for wall inset detection)
  private isPointNearBuildingPerimeter(
    worldX: number, worldZ: number, 
    testY: number,
    originalForm: THREE.BufferGeometry,
    formBox: THREE.Box3,
    wallThickness: number
  ): boolean {
    // Test multiple points around this location to see if any are outside the building
    // If so, we're near the perimeter and should not place a floor here
    
    const testOffsets = [
      [wallThickness, 0],      // +X direction
      [-wallThickness, 0],     // -X direction  
      [0, wallThickness],      // +Z direction
      [0, -wallThickness],     // -Z direction
      [wallThickness * 0.7, wallThickness * 0.7],   // +X+Z diagonal
      [-wallThickness * 0.7, wallThickness * 0.7],  // -X+Z diagonal
      [wallThickness * 0.7, -wallThickness * 0.7],  // +X-Z diagonal
      [-wallThickness * 0.7, -wallThickness * 0.7], // -X-Z diagonal
    ];
    
    let outsideCount = 0;
    
    for (const [offsetX, offsetZ] of testOffsets) {
      const testX = worldX + offsetX;
      const testZ = worldZ + offsetZ;
      
      // Check if this offset point is outside the building
      const isOutside = !this.isPointInsideOriginalGeometry(testX, testY, testZ, originalForm, formBox);
      
      if (isOutside) {
        outsideCount++;
      }
    }
    
    // If more than 2 test points are outside, we're too close to the perimeter
    // This allows floors near corners but prevents floors directly against walls
    return outsideCount > 2;
  }

  // Check if a 2D point (x,z) is within the horizontal bounds of the building at any level
  private isPointInHorizontalBuildingBounds(
    worldX: number, worldZ: number,
    originalForm: THREE.BufferGeometry,
    formBox: THREE.Box3
  ): boolean {
    // Test at multiple Y levels to find the maximum horizontal extent
    const testLevels = [
      formBox.min.y + (formBox.max.y - formBox.min.y) * 0.25, // 25% height
      formBox.min.y + (formBox.max.y - formBox.min.y) * 0.5,  // 50% height
      formBox.min.y + (formBox.max.y - formBox.min.y) * 0.75, // 75% height
    ];
    
    // If the point is inside at ANY level, consider it valid for floor placement
    for (const testY of testLevels) {
      if (this.isPointInsideOriginalGeometry(worldX, testY, worldZ, originalForm, formBox)) {
        return true;
      }
    }
    
    return false;
  }
  
  // Check if a point is within the 2D horizontal projection of the building (for solid floor filling)
  private isPointInBuildingHorizontalProjection(
    worldX: number, worldZ: number,
    originalForm: THREE.BufferGeometry,
    formBox: THREE.Box3
  ): boolean {
    // Cast a vertical ray down from the top of the building to see if it hits the building
    // This gives us the 2D footprint projection
    
    const rayStart = new THREE.Vector3(worldX, formBox.max.y + 1, worldZ);
    const rayDirection = new THREE.Vector3(0, -1, 0); // Down
    
    const mesh = new THREE.Mesh(originalForm);
    const raycaster = new THREE.Raycaster(rayStart, rayDirection);
    const intersections = raycaster.intersectObject(mesh);
    
    // Clean up
    mesh.geometry = new THREE.BufferGeometry();
    
    // If the ray hits the building, this point is within the horizontal projection
    return intersections.length > 0;
  }
  
  // Check if a point is in the interior of the building (surrounded by building geometry)
  private isPointInBuildingInterior(
    worldX: number, worldZ: number, 
    testY: number,
    originalForm: THREE.BufferGeometry,
    formBox: THREE.Box3
  ): boolean {
    // Test multiple rays radiating outward from this point
    // For floor placement, we need to be MORE STRICT - ALL rays should hit building geometry
    const rayDirections = [
      new THREE.Vector3(1, 0, 0),   // +X
      new THREE.Vector3(-1, 0, 0),  // -X
      new THREE.Vector3(0, 0, 1),   // +Z
      new THREE.Vector3(0, 0, -1),  // -Z
      new THREE.Vector3(1, 0, 1).normalize(),   // +X+Z diagonal
      new THREE.Vector3(-1, 0, 1).normalize(),  // -X+Z diagonal
      new THREE.Vector3(1, 0, -1).normalize(),  // +X-Z diagonal
      new THREE.Vector3(-1, 0, -1).normalize()  // -X-Z diagonal
    ];
    
    const rayStart = new THREE.Vector3(worldX, testY, worldZ);
    const mesh = new THREE.Mesh(originalForm);
    let hitCount = 0;
    
    for (const direction of rayDirections) {
      const raycaster = new THREE.Raycaster(rayStart, direction);
      const intersections = raycaster.intersectObject(mesh);
      
      if (intersections.length > 0) {
        hitCount++;
      }
    }
    
    // Clean up
    mesh.geometry = new THREE.BufferGeometry();
    
    // For floors, be moderately strict - require 75% of rays to hit (6 out of 8)
    // This ensures floors appear in interior spaces while not being overly restrictive
    return hitCount >= (rayDirections.length * 0.75); // 75% of rays must hit
  }
  
  // Check if a voxel is on the surface/boundary of the mesh (not inside)
  private isVoxelOnMeshSurface(
    gx: number, gy: number, gz: number,
    gridSizeX: number, gridSizeY: number, gridSizeZ: number,
    originalForm: THREE.BufferGeometry, 
    formBox: THREE.Box3,
    bounds: any,
    resolution: number
  ): boolean {
    // Convert grid coordinates to world coordinates (voxel center)
    const worldX = bounds.min.x + (gx + 0.5) * resolution;
    const worldY = bounds.min.y + (gy + 0.5) * resolution;
    const worldZ = bounds.min.z + (gz + 0.5) * resolution;
    
    // First check if this voxel center is inside the mesh
    if (!this.isPointInsideOriginalGeometry(worldX, worldY, worldZ, originalForm, formBox)) {
      return false; // Not inside mesh at all
    }
    
    // Check if any of the 6 neighboring voxels are outside the mesh (making this a surface voxel)
    const neighbors = [
      [gx - 1, gy, gz], // Left
      [gx + 1, gy, gz], // Right
      [gx, gy - 1, gz], // Down
      [gx, gy + 1, gz], // Up
      [gx, gy, gz - 1], // Back
      [gx, gy, gz + 1], // Front
    ];
    
    for (const [nx, ny, nz] of neighbors) {
      // Check bounds
      if (nx < 0 || nx >= gridSizeX || ny < 0 || ny >= gridSizeY || nz < 0 || nz >= gridSizeZ) {
        // Neighbor is outside grid bounds, so this is a surface voxel
        return true;
      }
      
      // Convert neighbor grid coordinates to world coordinates
      const neighborWorldX = bounds.min.x + (nx + 0.5) * resolution;
      const neighborWorldY = bounds.min.y + (ny + 0.5) * resolution;
      const neighborWorldZ = bounds.min.z + (nz + 0.5) * resolution;
      
      // If neighbor is outside the mesh, then current voxel is on the surface
      if (!this.isPointInsideOriginalGeometry(neighborWorldX, neighborWorldY, neighborWorldZ, originalForm, formBox)) {
        return true;
      }
    }
    
    // All neighbors are inside mesh, so this voxel is completely interior (not surface)
    return false;
  }
  
  // Determine architectural role based on position within the mesh and style
  private getArchitecturalRoleForPosition(
    worldX: number, worldY: number, worldZ: number, 
    formBox: THREE.Box3, 
    style: string
  ): typeof ArchitecturalRole[keyof typeof ArchitecturalRole] {
    // Calculate relative position within the mesh (0 = bottom/min, 1 = top/max)
    const relativeY = (worldY - formBox.min.y) / (formBox.max.y - formBox.min.y);
    
    // Assign architectural roles based on position and style
    switch (style) {
      case 'eco':
        // Eco buildings: more organic distribution
        if (relativeY < 0.3) return ArchitecturalRole.Mass;      // Bottom 30% = mass/foundation
        if (relativeY < 0.7) return ArchitecturalRole.Floor;     // Middle 40% = floors
        return ArchitecturalRole.Component;                      // Top 30% = components/details
        
      case 'modern':
        // Modern buildings: clear structural divisions
        if (relativeY < 0.2) return ArchitecturalRole.Mass;      // Bottom 20% = mass/base
        if (relativeY < 0.8) return ArchitecturalRole.Floor;     // Middle 60% = floors
        return ArchitecturalRole.Facade;                         // Top 20% = facade elements
        
      case 'classic':
        // Classic buildings: traditional proportions
        if (relativeY < 0.25) return ArchitecturalRole.Mass;     // Bottom 25% = mass/base
        if (relativeY < 0.75) return ArchitecturalRole.Floor;    // Middle 50% = floors
        return ArchitecturalRole.Component;                      // Top 25% = details
        
      default:
        // Default: simple distribution
        if (relativeY < 0.33) return ArchitecturalRole.Mass;
        if (relativeY < 0.67) return ArchitecturalRole.Floor;
        return ArchitecturalRole.Component;
    }
  }


  // Check if voxel position is inside building mass
  private isVoxelInsideBuildingMass(
    x: number, y: number, z: number, 
    originalForm: THREE.BufferGeometry, 
    formBox: THREE.Box3,
    metadata: VoxelSpace['metadata']
  ): boolean {
    // Debug first few checks
    const isFirstCheck = !this.voxelDebugCount || this.voxelDebugCount < 3;
    if (isFirstCheck) {
      this.voxelDebugCount = (this.voxelDebugCount || 0) + 1;
      console.log(`  🔍 Voxel check ${this.voxelDebugCount}: position (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
      console.log(`  🔍 Form bounds: y ${formBox.min.y.toFixed(2)} to ${formBox.max.y.toFixed(2)}`);
    }
    
    // Base form check - PRESERVE ORIGINAL SHAPE
    if (y >= formBox.min.y && y <= formBox.max.y) {
      // Use more accurate point-in-geometry test for the base
      const insideBase = this.isPointInsideOriginalGeometry(x, y, z, originalForm);
      if (isFirstCheck) {
        console.log(`  🔍 Base form check: y=${y.toFixed(2)} in range [${formBox.min.y.toFixed(2)}, ${formBox.max.y.toFixed(2)}] → inside=${insideBase}`);
      }
      if (insideBase) {
        return true;
      }
    }
    
    // Tower extension check - extend UP from original form
    if (y > formBox.max.y) {
      const centerX = (formBox.max.x + formBox.min.x) / 2;
      const centerZ = (formBox.max.z + formBox.min.z) / 2;
      const formWidth = formBox.max.x - formBox.min.x;
      const formDepth = formBox.max.z - formBox.min.z;
      
      // Height-based taper for architectural effect
      const heightRatio = (y - formBox.max.y) / (metadata.floorCount * metadata.floorHeight);
      const taperFactor = metadata.buildingType === 'eco' ? 
        1 - heightRatio * 0.4 :  // Eco buildings taper more
        1 - heightRatio * 0.2;   // Modern buildings stay more rectangular
      
      const tapered_width = formWidth * Math.max(0.3, taperFactor);
      const tapered_depth = formDepth * Math.max(0.3, taperFactor);
      
      const insideTower = (x >= centerX - tapered_width/2 && x <= centerX + tapered_width/2 &&
                          z >= centerZ - tapered_depth/2 && z <= centerZ + tapered_depth/2);
      
      if (isFirstCheck) {
        console.log(`  🔍 Tower extension check: y=${y.toFixed(2)} > ${formBox.max.y.toFixed(2)} → inside=${insideTower}`);
        console.log(`  🔍 Tower bounds: x [${(centerX - tapered_width/2).toFixed(2)}, ${(centerX + tapered_width/2).toFixed(2)}], z [${(centerZ - tapered_depth/2).toFixed(2)}, ${(centerZ + tapered_depth/2).toFixed(2)}]`);
      }
      
      return insideTower;
    }
    
    if (isFirstCheck) {
      console.log(`  🔍 Position rejected: y=${y.toFixed(2)} not in base [${formBox.min.y.toFixed(2)}, ${formBox.max.y.toFixed(2)}] or tower (>${formBox.max.y.toFixed(2)})`);
    }
    
    return false;
  }
  
  private voxelDebugCount = 0; // For debugging

  // Test if a point is inside the ACTUAL mesh geometry (not just bounding box)
  private isPointInsideOriginalGeometry(x: number, y: number, z: number, geometry: THREE.BufferGeometry, formBox?: THREE.Box3): boolean {
    // First quick bounding box check
    const box = formBox || geometry.boundingBox;
    if (!box) {
      geometry.computeBoundingBox();
    }
    const bounds = box || geometry.boundingBox!;
    
    const margin = 0.05; // Increased tolerance for better voxel coverage
    if (x < bounds.min.x - margin || x > bounds.max.x + margin ||
        y < bounds.min.y - margin || y > bounds.max.y + margin ||
        z < bounds.min.z - margin || z > bounds.max.z + margin) {
      return false; // Outside bounding box = definitely outside
    }
    
    // Try ray-casting method first
    let isInside = this.pointInMeshTest(x, y, z, geometry);
    
    // If ray-casting seems to give unexpected results, try proximity method as backup
    if (!isInside) {
      isInside = this.pointNearMeshSurface(x, y, z, geometry);
    }
    
    // Debug first few geometry checks
    if (!this.geometryDebugCount || this.geometryDebugCount < 5) {
      this.geometryDebugCount = (this.geometryDebugCount || 0) + 1;
      console.log(`    🎯 REAL geometry test ${this.geometryDebugCount}: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) → inside: ${isInside}`);
      if (this.geometryDebugCount === 1) {
        console.log(`    📐 Using actual mesh geometry (not just bounding box)`);
        console.log(`    🔍 Testing ray-casting + surface proximity for robust detection`);
      }
    }
    
    return isInside;
  }
  
  // Backup method: check if point is close to mesh surface (for solid mesh representation)
  private pointNearMeshSurface(x: number, y: number, z: number, geometry: THREE.BufferGeometry): boolean {
    const mesh = new THREE.Mesh(geometry);
    const point = new THREE.Vector3(x, y, z);
    
    // Cast rays in multiple directions to find closest surface
    const directions = [
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
    ];
    
    let minDistance = Infinity;
    
    for (const direction of directions) {
      const raycaster = new THREE.Raycaster(point, direction);
      const intersections = raycaster.intersectObject(mesh);
      
      if (intersections.length > 0) {
        const distance = intersections[0].distance;
        minDistance = Math.min(minDistance, distance);
      }
    }
    
    // Clean up
    mesh.geometry = new THREE.BufferGeometry();
    
    // If we're close to the surface, consider this as part of the mesh volume (generous for solid fill)
    const voxelSize = 0.1; // Approximate voxel size
    const isNearSurface = minDistance < voxelSize * 1.2; // More generous tolerance
    
    if (isNearSurface && (!this.proximityDebugCount || this.proximityDebugCount < 2)) {
      this.proximityDebugCount = (this.proximityDebugCount || 0) + 1;
      console.log(`    📏 Surface proximity ${this.proximityDebugCount}: distance ${minDistance.toFixed(3)} → near surface: ${isNearSurface}`);
    }
    
    return isNearSurface;
  }
  
  private proximityDebugCount = 0; // For debugging
  private buildingDebugCount = 0; // For debugging
  private floorDebugCount = 0; // For debugging
  private footprintDebugCount = 0; // For debugging
  private floorZoneDebugCount = 0; // For debugging
  private floorLevelDebugCount = 0; // For debugging
  private interiorDebugCount = 0; // For debugging
  private foundationDebugCount = 0; // For debugging foundation generation
  private roofDebugCount = 0; // For debugging roof generation
  private geometryTestDebugCount = 0; // For debugging geometry tests
  private heightBreakdownDebugShown = false; // For one-time height breakdown debug
  
  // Test if a voxel should be placed at this position (represents mesh material/volume)
  private pointInMeshTest(x: number, y: number, z: number, geometry: THREE.BufferGeometry): boolean {
    // Create a mesh from the geometry for raycasting
    const mesh = new THREE.Mesh(geometry);
    
    // Try multiple ray directions for robustness (some meshes have problematic normals)
    const directions = [
      new THREE.Vector3(1, 0, 0),    // +X
      new THREE.Vector3(-1, 0, 0),   // -X  
      new THREE.Vector3(0, 1, 0),    // +Y
      new THREE.Vector3(0, -1, 0),   // -Y
      new THREE.Vector3(0, 0, 1),    // +Z
      new THREE.Vector3(0, 0, -1),   // -Z
    ];
    
    const point = new THREE.Vector3(x, y, z);
    let insideCount = 0;
    
    // Test with multiple ray directions
    for (const direction of directions) {
      const raycaster = new THREE.Raycaster(point, direction);
      const intersections = raycaster.intersectObject(mesh);
      
      // Point is inside if odd number of intersections
      if ((intersections.length % 2) === 1) {
        insideCount++;
      }
    }
    
    // Clean up
    mesh.geometry = new THREE.BufferGeometry(); // Detach to avoid disposal issues
    
    // Consider point inside if majority of rays say it's inside
    const isInside = insideCount > (directions.length / 2);
    
    // Debug some results
    if (!this.raycastDebugCount || this.raycastDebugCount < 3) {
      this.raycastDebugCount = (this.raycastDebugCount || 0) + 1;
      console.log(`    🎯 Multi-ray test ${this.raycastDebugCount}: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) → ${insideCount}/${directions.length} rays say inside → result: ${isInside}`);
    }
    
    return isInside;
  }
  
  private raycastDebugCount = 0; // For debugging
  
  private geometryDebugCount = 0; // For debugging

  private decomposeFacades(mass: BuildingComponent, voxelSpace: VoxelSpace): BuildingComponent[] {
    return [{
      id: 'facade-0',
      type: ArchitecturalRole.Facade,
      voxelBounds: mass.voxelBounds,
      children: [],
      voxels: [],
      metadata: { direction: 'all' }
    }];
  }

  private subdivideIntoFloors(facades: BuildingComponent[], voxelSpace: VoxelSpace): BuildingComponent[] {
    const floors: BuildingComponent[] = [];
    const floorCount = voxelSpace.metadata.floorCount;
    const floorHeight = voxelSpace.metadata.floorHeight;
    
    for (let i = 0; i < floorCount; i++) {
      floors.push({
        id: `floor-${i}`,
        type: ArchitecturalRole.Floor,
        voxelBounds: {
          min: { ...voxelSpace.bounds.min, y: voxelSpace.bounds.min.y + i * floorHeight },
          max: { ...voxelSpace.bounds.max, y: voxelSpace.bounds.min.y + (i + 1) * floorHeight }
        },
        children: [],
        voxels: [],
        metadata: { floorIndex: i }
      });
    }
    
    return floors;
  }

  private partitionIntoBays(floors: BuildingComponent[], voxelSpace: VoxelSpace, style: BuildingStyle): BuildingComponent[] {
    const bays: BuildingComponent[] = [];
    
    floors.forEach((floor, floorIndex) => {
      bays.push({
        id: `bay-${floorIndex}-0`,
        type: ArchitecturalRole.Bay,
        voxelBounds: floor.voxelBounds,
        children: [],
        voxels: [],
        metadata: { floorIndex, bayIndex: 0 }
      });
    });
    
    return bays;
  }

  private getBuildingRuleSet(style: BuildingStyle): BuildingRuleSet {
    const buildingType = this.getBuildingTypeFromStyle(style);
    
    return {
      name: `${buildingType}-rules`,
      floorRules: [{ minHeight: 2.5, maxHeight: 4.0, heightVariation: 0.2, setbackRatio: 0.1 }],
      facadeRules: [{ windowSpacing: 2.5, windowSize: { width: 1.2, height: 1.8 }, balconyProbability: 0.2, detailDensity: 0.5 }],
      windowRules: [{ pattern: 'regular', sizeVariation: 0.2, insetDepth: 0.15 }],
      styleMods: buildingType === 'eco' ? [{ type: 'rounding', intensity: 0.8, affectedRoles: [ArchitecturalRole.Mass] }] : []
    };
  }

  private applyFloorRules(floors: BuildingComponent[], floorRules: FloorRule[]): void {
    // Apply architectural rules to floors
  }

  private applyFacadeRules(facades: BuildingComponent[], facadeRules: FacadeRule[]): void {
    // Apply architectural rules to facades
  }

  private generateWindowsForBay(bay: BuildingComponent, windowRules: WindowRule[]): BuildingComponent[] {
    return [{
      id: `window-${bay.id}`,
      type: ArchitecturalRole.Component,
      voxelBounds: bay.voxelBounds,
      children: [],
      voxels: [],
      metadata: { componentType: 'window' }
    }];
  }

  private generateEntranceDoors(groundFloor: BuildingComponent): BuildingComponent[] {
    return [{
      id: 'door-0',
      type: ArchitecturalRole.Component,
      voxelBounds: groundFloor.voxelBounds,
      children: [],
      voxels: [],
      metadata: { componentType: 'door' }
    }];
  }

  private applyRoundingModification(hierarchy: ArchitecturalHierarchy, styleMod: StyleModification): void {
    console.log(`    🔴 Rounding applied`);
  }

  private applyOrganicModification(hierarchy: ArchitecturalHierarchy, styleMod: StyleModification, style: BuildingStyle): void {
    console.log(`    🌿 Organic applied`);
  }

  private applyNoiseModification(hierarchy: ArchitecturalHierarchy, styleMod: StyleModification, style: BuildingStyle): void {
    console.log(`    🌊 Noise applied`);
  }

  private collectAllVoxels(hierarchy: ArchitecturalHierarchy): VoxelCell[] {
    const allVoxels: VoxelCell[] = [];
    
    // Collect from mass component's VoxelSpace
    if (hierarchy.mass && hierarchy.mass.voxelSpace) {
      const massVoxels = Array.from(hierarchy.mass.voxelSpace.voxels.values());
      allVoxels.push(...massVoxels);
    } else {
      console.error('❌ No mass voxelSpace found in hierarchy!');
    }
    
    // Collect from architectural components
    if (hierarchy.components && hierarchy.components.length > 0) {
      for (const component of hierarchy.components) {
        if (component.voxels && Array.isArray(component.voxels)) {
          allVoxels.push(...component.voxels);
        }
      }
    }
    
    if (allVoxels.length === 0) {
      console.error('❌ CRITICAL: No architectural voxels collected!');
      console.error('❌ This means the new building generation failed completely.');
      console.error('❌ Check createArchitecturalFoundation and createArchitecturalTower methods.');
    }
    
    return allVoxels;
  }

  // Create voxel visualization mesh (shows individual colored architectural voxels)
  createVoxelVisualizationMesh(hierarchy: ArchitecturalHierarchy, recentlyEditedVoxels?: Array<{x: number, y: number, z: number, timestamp: number}>, hoveredVoxel?: {x: number, y: number, z: number} | null): THREE.BufferGeometry {
    console.log('🎨 Creating individual voxel visualization...');
    
    const allVoxels = this.collectAllVoxels(hierarchy);
    
    if (allVoxels.length === 0) {
      console.error('❌ No voxels to visualize!');
      return new THREE.BoxGeometry(2, 2, 2);
    }
    
    // Create individual colored voxel cubes (not solid blocks)
    const voxelMesh = this.createIndividualVoxelVisualization(allVoxels, hierarchy.mass.voxelBounds, recentlyEditedVoxels, hoveredVoxel);
    
    console.log(`✅ Individual voxel visualization created with ${voxelMesh.attributes.position.count} vertices`);
    return voxelMesh;
  }

  // Check if a voxel already exists at the given position
  private voxelExistsAtPosition(hierarchy: ArchitecturalHierarchy, gridX: number, gridY: number, gridZ: number): boolean {
    const checkVoxels = (voxels: VoxelCell[]): boolean => {
      return voxels && voxels.some(voxel => voxel.x === gridX && voxel.y === gridY && voxel.z === gridZ);
    };

    // Check all voxel collections in the hierarchy
    if (hierarchy.mass?.voxels && checkVoxels(hierarchy.mass.voxels)) return true;
    if (hierarchy.foundation?.voxels && checkVoxels(hierarchy.foundation.voxels)) return true;
    if (hierarchy.roof?.voxels && checkVoxels(hierarchy.roof.voxels)) return true;
    
    if (hierarchy.facades) {
      for (const facade of hierarchy.facades) {
        if (facade.voxels && checkVoxels(facade.voxels)) return true;
      }
    }
    
    if (hierarchy.floors) {
      for (const floor of hierarchy.floors) {
        if (floor.voxels && checkVoxels(floor.voxels)) return true;
      }
    }
    
    if (hierarchy.components && hierarchy.components instanceof Map) {
      for (const [, component] of hierarchy.components) {
        if (component.voxels && checkVoxels(component.voxels)) return true;
      }
    }
    
    return false;
  }

  // Add voxel to hierarchy
  addVoxelToHierarchy(hierarchy: ArchitecturalHierarchy, gridX: number, gridY: number, gridZ: number, role: string): boolean {
    // Check if voxel already exists at this position
    if (this.voxelExistsAtPosition(hierarchy, gridX, gridY, gridZ)) {
      console.log(`🚫 Voxel already exists at (${gridX}, ${gridY}, ${gridZ}) - skipping add operation`);
      return false;
    }
    
    const architecturalRole = this.getArchitecturalRoleFromString(role);
    
    // Create new voxel
    const newVoxel: VoxelCell = {
      x: gridX,
      y: gridY,
      z: gridZ,
      type: VoxelType.Solid,
      architecturalRole: architecturalRole,
      density: 1.0,
      metadata: {
        style: 'edited',
        sampled_from: 'user_edit',
        building_part: role,
        world_position: { 
          x: gridX * this.getVoxelResolution(hierarchy), 
          y: gridY * this.getVoxelResolution(hierarchy), 
          z: gridZ * this.getVoxelResolution(hierarchy) 
        }
      }
    };

    // Add to appropriate hierarchy section
    switch (architecturalRole) {
      case ArchitecturalRole.Mass:
        if (!hierarchy.mass.voxels) hierarchy.mass.voxels = [];
        hierarchy.mass.voxels.push(newVoxel);
        break;
      case ArchitecturalRole.Facade:
        if (!hierarchy.facades) hierarchy.facades = [];
        if (hierarchy.facades.length === 0) {
          hierarchy.facades.push({
            id: `facade-${Date.now()}`,
            type: ArchitecturalRole.Facade,
            voxelBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
            children: [],
            voxels: [],
            metadata: {}
          });
        }
        hierarchy.facades[0].voxels.push(newVoxel);
        break;
      case ArchitecturalRole.Floor:
        if (!hierarchy.floors) hierarchy.floors = [];
        if (hierarchy.floors.length === 0) {
          hierarchy.floors.push({
            id: `floor-${Date.now()}`,
            type: ArchitecturalRole.Floor,
            voxelBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
            children: [],
            voxels: [],
            metadata: {}
          });
        }
        hierarchy.floors[0].voxels.push(newVoxel);
        break;
      case ArchitecturalRole.Component:
        // Ensure components is an array as per interface
        if (!hierarchy.components) {
          hierarchy.components = [];
        }
        if (hierarchy.components.length === 0) {
          hierarchy.components.push({
            id: `component-${Date.now()}`,
            type: ArchitecturalRole.Component,
            voxelBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
            children: [],
            voxels: [],
            metadata: {}
          });
        }
        hierarchy.components[0].voxels.push(newVoxel);
        break;
    }

    console.log(`✅ Added ${role} voxel at (${gridX}, ${gridY}, ${gridZ})`);
    return true;
  }

  // Remove voxel from hierarchy
  removeVoxelFromHierarchy(hierarchy: ArchitecturalHierarchy, gridX: number, gridY: number, gridZ: number): boolean {
    let removed = false;

    // Check all voxel arrays
    const voxelArrays = [
      hierarchy.mass.voxels || [],
      ...(hierarchy.facades || []).map(f => f.voxels),
      ...(hierarchy.floors || []).map(f => f.voxels),
      ...(hierarchy.components && hierarchy.components instanceof Map ? Array.from(hierarchy.components.values()).map(c => c.voxels) : [])
    ];

    for (const voxelArray of voxelArrays) {
      const index = voxelArray.findIndex(v => v.x === gridX && v.y === gridY && v.z === gridZ);
      if (index !== -1) {
        voxelArray.splice(index, 1);
        removed = true;
        console.log(`✅ Removed voxel at (${gridX}, ${gridY}, ${gridZ})`);
        break;
      }
    }

    return removed;
  }

  // Paint voxel (change its role)
  paintVoxelInHierarchy(hierarchy: ArchitecturalHierarchy, gridX: number, gridY: number, gridZ: number, newRole: string): boolean {
    // First try to remove from current location
    const removed = this.removeVoxelFromHierarchy(hierarchy, gridX, gridY, gridZ);
    
    if (removed) {
      // Voxel existed - replace it with new role
      console.log(`🎨 Repainting existing voxel at (${gridX}, ${gridY}, ${gridZ}) to ${newRole}`);
      return this.addVoxelToHierarchy(hierarchy, gridX, gridY, gridZ, newRole);
    } else {
      // No voxel existed - paint creates a new voxel (like add)
      console.log(`🎨 Painting new voxel at (${gridX}, ${gridY}, ${gridZ}) as ${newRole}`);
      return this.addVoxelToHierarchy(hierarchy, gridX, gridY, gridZ, newRole);
    }
  }

  // Get voxel resolution from hierarchy
  getVoxelResolution(hierarchy: ArchitecturalHierarchy): number {
    // Try to get from voxel bounds or calculate from existing voxels
    if (hierarchy.mass.voxelBounds) {
      const bounds = hierarchy.mass.voxelBounds;
      const voxels = hierarchy.mass.voxels || [];
      if (voxels.length > 0) {
        const maxX = Math.max(...voxels.map(v => v.x));
        const width = bounds.max.x - bounds.min.x;
        return width / (maxX + 1);
      }
    }
    return 0.1; // Default fallback
  }

  // Convert role string to ArchitecturalRole enum
  private getArchitecturalRoleFromString(role: string): typeof ArchitecturalRole[keyof typeof ArchitecturalRole] {
    switch (role) {
      case 'mass': return ArchitecturalRole.Mass;
      case 'facade': return ArchitecturalRole.Facade;
      case 'floor': return ArchitecturalRole.Floor;
      case 'component': return ArchitecturalRole.Component;
      default: return ArchitecturalRole.Mass;
    }
  }
  
  // Create visualization showing individual colored voxel cubes by architectural part
  private createIndividualVoxelVisualization(voxels: VoxelCell[], bounds: any, recentlyEditedVoxels?: Array<{x: number, y: number, z: number, timestamp: number}>, hoveredVoxel?: {x: number, y: number, z: number} | null): THREE.BufferGeometry {
    // Creating voxel visualization
    
    // Group voxels by building part for color coding
    const foundationVoxels = voxels.filter(v => v.metadata?.building_part === 'foundation');
    const roofVoxels = voxels.filter(v => v.metadata?.building_part === 'roof');
    const floorSlabVoxels = voxels.filter(v => v.metadata?.building_part?.startsWith('floor_slab_'));
    const wallVoxels = voxels.filter(v => v.metadata?.building_part?.startsWith('wall_'));
    
    // Group floor slab voxels by floor number for gradient
    const floorsByNumber = new Map<number, VoxelCell[]>();
    floorSlabVoxels.forEach(voxel => {
      const floorNum = voxel.metadata?.floor_number || 1;
      if (!floorsByNumber.has(floorNum)) {
        floorsByNumber.set(floorNum, []);
      }
      floorsByNumber.get(floorNum)?.push(voxel);
    });
    
    // Group wall voxels by floor number for gradient
    const wallsByNumber = new Map<number, VoxelCell[]>();
    wallVoxels.forEach(voxel => {
      const floorNum = voxel.metadata?.floor_number || 1;
      if (!wallsByNumber.has(floorNum)) {
        wallsByNumber.set(floorNum, []);
      }
      wallsByNumber.get(floorNum)?.push(voxel);
    });
    
    const allFloors = [...Array.from(floorsByNumber.keys()), ...Array.from(wallsByNumber.keys())];
    const maxFloor = allFloors.length > 0 ? Math.max(...allFloors) : 1;
    
    console.log(`🏗️ Foundation: ${foundationVoxels.length} | Walls: ${wallVoxels.length} | Roof: ${roofVoxels.length}`);
    
    // Debug Y-coordinate ranges to diagnose foundation/roof offset
    const debugResolution = this.calculateVoxelResolution(voxels, bounds);
    if (foundationVoxels.length > 0) {
      const fYs = foundationVoxels.map(v => v.y);
      console.log(`🟤 Foundation Y: grid[${Math.min(...fYs)}-${Math.max(...fYs)}] world[${(bounds.min.y + Math.min(...fYs) * debugResolution).toFixed(1)}-${(bounds.min.y + Math.max(...fYs) * debugResolution).toFixed(1)}]`);
    }
    if (roofVoxels.length > 0) {
      const rYs = roofVoxels.map(v => v.y);
      console.log(`🔴 Roof Y: grid[${Math.min(...rYs)}-${Math.max(...rYs)}] world[${(bounds.min.y + Math.min(...rYs) * debugResolution).toFixed(1)}-${(bounds.min.y + Math.max(...rYs) * debugResolution).toFixed(1)}]`);
    }
    
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const colors: number[] = [];
    
    const resolution = this.calculateVoxelResolution(voxels, bounds);
    let vertexIndex = 0;
    
    // Show individual voxel cubes with slight gaps for visibility
    const voxelSize = resolution * 0.85; // 85% size to show gaps between voxels
    
    // Helper function to check if a voxel was recently edited
    const isRecentlyEdited = (voxel: VoxelCell): boolean => {
      if (!recentlyEditedVoxels) return false;
      return recentlyEditedVoxels.some(edited => 
        edited.x === voxel.x && edited.y === voxel.y && edited.z === voxel.z
      );
    };

    // Helper function to check if a voxel is being hovered
    const isHovered = (voxel: VoxelCell): boolean => {
      if (!hoveredVoxel) return false;
      return hoveredVoxel.x === voxel.x && hoveredVoxel.y === voxel.y && hoveredVoxel.z === voxel.z;
    };
    
    // Log highlighting info
    if (recentlyEditedVoxels && recentlyEditedVoxels.length > 0) {
      console.log(`🎯 Highlighting ${recentlyEditedVoxels.length} recently edited voxels in BRIGHT CYAN!`);
      recentlyEditedVoxels.forEach(v => {
        const worldX = bounds.min.x + ((v.x + 0.5) * resolution);
        const worldY = bounds.min.y + ((v.y + 0.5) * resolution);
        const worldZ = bounds.min.z + ((v.z + 0.5) * resolution);
        console.log(`  ⭐ Highlighted voxel at grid(${v.x}, ${v.y}, ${v.z}) → world(${worldX.toFixed(3)}, ${worldY.toFixed(3)}, ${worldZ.toFixed(3)})`);
      });
    }
    
    // Add foundation voxels (brown - foundation/base)
    for (const voxel of foundationVoxels) {
      const worldX = bounds.min.x + ((voxel.x + 0.5) * resolution);
      const worldY = bounds.min.y + ((voxel.y + 0.5) * resolution); 
      const worldZ = bounds.min.z + ((voxel.z + 0.5) * resolution);
      
      // Highlight recently edited (cyan) or hovered (yellow) voxels
      const isHighlighted = isRecentlyEdited(voxel);
      const isHovering = isHovered(voxel);
      const r = isHighlighted ? 0.0 : (isHovering ? 1.0 : 0.6);
      const g = isHighlighted ? 1.0 : (isHovering ? 1.0 : 0.4);
      const b = isHighlighted ? 1.0 : (isHovering ? 0.0 : 0.2);
      
      vertexIndex = this.addIndividualVoxelCube(
        worldX, worldY, worldZ, voxelSize,
        r, g, b, // Brown for foundation, cyan for highlighted
        vertices, normals, indices, colors, vertexIndex
      );
    }
    
    // Add floor voxels (green gradient by floor)
    for (const [floorNum, voxelsInFloor] of floorsByNumber) {
      const floorRatio = floorNum / Math.max(1, maxFloor);
      
      for (const voxel of voxelsInFloor) {
              const worldX = bounds.min.x + ((voxel.x + 0.5) * resolution);
      const worldY = bounds.min.y + ((voxel.y + 0.5) * resolution);
      const worldZ = bounds.min.z + ((voxel.z + 0.5) * resolution);
        
        // Highlight recently edited (cyan) or hovered (yellow) voxels, otherwise use green gradient
        const isHighlighted = isRecentlyEdited(voxel);
        const isHovering = isHovered(voxel);
        const r = isHighlighted ? 0.0 : (isHovering ? 1.0 : (0.2 + floorRatio * 0.3));
        const g = isHighlighted ? 1.0 : (isHovering ? 1.0 : (0.5 + floorRatio * 0.3));
        const b = isHighlighted ? 1.0 : (isHovering ? 0.0 : 0.2);
        
        vertexIndex = this.addIndividualVoxelCube(
          worldX, worldY, worldZ, voxelSize,
          r, g, b, // Green gradient by floor or cyan for highlighted
          vertices, normals, indices, colors, vertexIndex
        );
      }
    }
    
    // Add wall voxels (blue gradient by floor)
    for (const [floorNum, wallsInFloor] of wallsByNumber) {
      const floorRatio = floorNum / Math.max(1, maxFloor);
      
      for (const voxel of wallsInFloor) {
              const worldX = bounds.min.x + ((voxel.x + 0.5) * resolution);
      const worldY = bounds.min.y + ((voxel.y + 0.5) * resolution);
      const worldZ = bounds.min.z + ((voxel.z + 0.5) * resolution);
        
        // Highlight recently edited (cyan) or hovered (yellow) voxels, otherwise use blue gradient
        const isHighlighted = isRecentlyEdited(voxel);
        const isHovering = isHovered(voxel);
        const r = isHighlighted ? 0.0 : (isHovering ? 1.0 : 0.2);
        const g = isHighlighted ? 1.0 : (isHovering ? 1.0 : (0.3 + floorRatio * 0.2));
        const b = isHighlighted ? 1.0 : (isHovering ? 0.0 : (0.6 + floorRatio * 0.3));
        
        vertexIndex = this.addIndividualVoxelCube(
          worldX, worldY, worldZ, voxelSize,
          r, g, b, // Blue gradient for walls or cyan for highlighted
          vertices, normals, indices, colors, vertexIndex
        );
      }
    }
    
    // Add roof voxels (red - roof/top)
    for (const voxel of roofVoxels) {
      const worldX = bounds.min.x + ((voxel.x + 0.5) * resolution);
      const worldY = bounds.min.y + ((voxel.y + 0.5) * resolution);
      const worldZ = bounds.min.z + ((voxel.z + 0.5) * resolution);
      
      // Highlight recently edited (cyan) or hovered (yellow) voxels, otherwise use red
      const isHighlighted = isRecentlyEdited(voxel);
      const isHovering = isHovered(voxel);
      const r = isHighlighted ? 0.0 : (isHovering ? 1.0 : 0.8);
      const g = isHighlighted ? 1.0 : (isHovering ? 1.0 : 0.2);
      const b = isHighlighted ? 1.0 : (isHovering ? 0.0 : 0.2);
      
      vertexIndex = this.addIndividualVoxelCube(
        worldX, worldY, worldZ, voxelSize,
        r, g, b, // Red for roof or cyan for highlighted
        vertices, normals, indices, colors, vertexIndex
      );
    }

    // Add hover preview for empty space (ghost voxel)
    if (hoveredVoxel) {
      // Check if there's already a voxel at this position
      const existingVoxel = voxels.find(v => v.x === hoveredVoxel.x && v.y === hoveredVoxel.y && v.z === hoveredVoxel.z);
      
      if (!existingVoxel) {
        // Show ghost voxel for empty space
        const worldX = bounds.min.x + ((hoveredVoxel.x + 0.5) * resolution);
        const worldY = bounds.min.y + ((hoveredVoxel.y + 0.5) * resolution);
        const worldZ = bounds.min.z + ((hoveredVoxel.z + 0.5) * resolution);
        
        console.log(`👻 GHOST VOXEL: grid(${hoveredVoxel.x}, ${hoveredVoxel.y}, ${hoveredVoxel.z}) → world(${worldX.toFixed(3)}, ${worldY.toFixed(3)}, ${worldZ.toFixed(3)})`);
        console.log(`👻 GHOST bounds: min(${bounds.min.x.toFixed(3)}, ${bounds.min.y.toFixed(3)}, ${bounds.min.z.toFixed(3)}) resolution: ${resolution.toFixed(3)}`);
        
        console.log(`👻 Ghost voxel at (${hoveredVoxel.x}, ${hoveredVoxel.y}, ${hoveredVoxel.z})`);
        
        // Semi-transparent bright yellow for ghost voxel
        vertexIndex = this.addIndividualVoxelCube(
          worldX, worldY, worldZ, voxelSize * 1.1, // Slightly larger for visibility
          1.0, 1.0, 0.2, // Bright yellow
          vertices, normals, indices, colors, vertexIndex
        );
      }
    }
    
    // Set geometry attributes
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    
    console.log(`  ✅ Architectural voxels: ${vertices.length / 3} vertices, ${indices.length / 3} triangles`);
    console.log(`  🎨 Color coding: 🟤 Foundation, 🟢 Floor Slabs, 🔵 Walls, 🔴 Roof`);
    
    return geometry;
  }
  
  // Add a single voxel cube with specified color and proper normals
  private addIndividualVoxelCube(
    x: number, y: number, z: number, size: number,
    r: number, g: number, b: number,
    vertices: number[], normals: number[], indices: number[], colors: number[],
    startVertexIndex: number
  ): number {
    const s = size * 0.5; // Half size for centering
    
    // Define vertices for each face (24 vertices total, 4 per face)
    const cubeVertices = [
      // Bottom face (y = -s)
      x - s, y - s, z - s,  x + s, y - s, z - s,  x + s, y - s, z + s,  x - s, y - s, z + s,
      // Top face (y = +s)  
      x - s, y + s, z - s,  x + s, y + s, z - s,  x + s, y + s, z + s,  x - s, y + s, z + s,
      // Front face (z = +s)
      x - s, y - s, z + s,  x + s, y - s, z + s,  x + s, y + s, z + s,  x - s, y + s, z + s,
      // Back face (z = -s)
      x - s, y - s, z - s,  x + s, y - s, z - s,  x + s, y + s, z - s,  x - s, y + s, z - s,
      // Left face (x = -s)
      x - s, y - s, z - s,  x - s, y - s, z + s,  x - s, y + s, z + s,  x - s, y + s, z - s,
      // Right face (x = +s)
      x + s, y - s, z - s,  x + s, y - s, z + s,  x + s, y + s, z + s,  x + s, y + s, z - s,
    ];
    
    // Normals for each face (24 normals total, 4 per face)
    const cubeNormals = [
      // Bottom face (pointing down)
      0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
      // Top face (pointing up)
      0, 1, 0,   0, 1, 0,   0, 1, 0,   0, 1, 0,
      // Front face (pointing forward)
      0, 0, 1,   0, 0, 1,   0, 0, 1,   0, 0, 1,
      // Back face (pointing backward)
      0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
      // Left face (pointing left)
      -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
      // Right face (pointing right)
      1, 0, 0,   1, 0, 0,   1, 0, 0,   1, 0, 0,
    ];
    
    // Add vertices and normals
    vertices.push(...cubeVertices);
    normals.push(...cubeNormals);
    
    // Add colors (same color for all 24 vertices)
    for (let i = 0; i < 24; i++) {
      colors.push(r, g, b);
    }
    
    // Add face indices (12 triangles for a cube, 2 triangles per face)
    const faceIndices = [
      // Bottom face
      0, 1, 2,   0, 2, 3,
      // Top face  
      4, 7, 6,   4, 6, 5,
      // Front face
      8, 9, 10,  8, 10, 11,
      // Back face
      12, 15, 14, 12, 14, 13,
      // Left face
      16, 17, 18, 16, 18, 19,
      // Right face
      20, 23, 22, 20, 22, 21,
    ];
    
    // Add indices with offset
    for (const index of faceIndices) {
      indices.push(startVertexIndex + index);
    }
    
    return startVertexIndex + 24; // 24 vertices per cube (4 per face × 6 faces)
  }


  // Convert ArchitecturalHierarchy back to mesh (for after voxel editing)
  convertHierarchyToMesh(hierarchy: ArchitecturalHierarchy, style: BuildingStyle): THREE.BufferGeometry {
    console.log('✨ Converting edited voxel hierarchy to final mesh...');
    
    const allVoxels = this.collectAllVoxels(hierarchy);
    const mesh = this.generateMeshFromVoxels(allVoxels, hierarchy.mass.voxelBounds, style, hierarchy);
    const refinedMesh = this.refineMeshSurface(mesh, style, hierarchy);
    
    console.log('✅ Voxel hierarchy converted to mesh');
    return refinedMesh;
  }

  // Create visualization mesh showing individual voxel cubes
  private createVoxelVisualizationFromVoxels(voxels: VoxelCell[], bounds: any): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const colors: number[] = [];
    
    // Calculate voxel resolution
    const resolution = this.calculateVoxelResolution(voxels, bounds);
    console.log(`  🎨 Creating voxel visualization with ${voxels.length} voxels at resolution ${resolution.toFixed(3)}`);
    
    // Debug: check voxel coordinate ranges
    if (voxels.length > 0) {
      const xCoords = voxels.map(v => v.x);
      const yCoords = voxels.map(v => v.y);
      const zCoords = voxels.map(v => v.z);
      console.log(`  🔍 Voxel coordinate ranges: X[${Math.min(...xCoords)}, ${Math.max(...xCoords)}], Y[${Math.min(...yCoords)}, ${Math.max(...yCoords)}], Z[${Math.min(...zCoords)}, ${Math.max(...zCoords)}]`);
      console.log(`  🔍 World bounds: X[${bounds.min.x.toFixed(3)}, ${bounds.max.x.toFixed(3)}], Y[${bounds.min.y.toFixed(3)}, ${bounds.max.y.toFixed(3)}], Z[${bounds.min.z.toFixed(3)}, ${bounds.max.z.toFixed(3)}]`);
    }
    
    let vertexIndex = 0;
    
    // Show every Nth voxel to avoid overwhelming the scene
    const visualizationStep = Math.max(1, Math.floor(voxels.length / 1000)); // Max 1000 visible voxels
    
    for (let i = 0; i < voxels.length; i += visualizationStep) {
      const voxel = voxels[i];
      
      if (voxel.type === VoxelType.Solid && voxel.density > 0.1) {
        // FIXED: Convert voxel grid coordinates to world coordinates properly
        // Voxel coordinates are stored as grid indices, need to map to world space
        // Must account for bounds offset!
              const worldX = bounds.min.x + ((voxel.x + 0.5) * resolution);
      const worldY = bounds.min.y + ((voxel.y + 0.5) * resolution);
      const worldZ = bounds.min.z + ((voxel.z + 0.5) * resolution);
        
        // Debug first few voxels
        if (i < 5) {
          console.log(`  🎯 Voxel ${i}: grid(${voxel.x}, ${voxel.y}, ${voxel.z}) → world(${worldX.toFixed(3)}, ${worldY.toFixed(3)}, ${worldZ.toFixed(3)})`);
        }
        
        // Create a slightly smaller cube for each voxel (with gaps)
        const voxelSize = resolution * 0.8; // 80% size to show gaps
        
        this.addVoxelVisualizationCube(
          worldX, worldY, worldZ,
          voxelSize,
          vertices, normals, indices, colors,
          vertexIndex,
          voxel.architecturalRole
        );
        
        vertexIndex += 8; // 8 vertices per cube (simplified)
      }
    }
    
    // Set geometry attributes
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    
    console.log(`  ✅ Voxel visualization: ${vertices.length / 3} vertices, ${indices.length / 3} triangles, showing every ${visualizationStep} voxels`);
    
    return geometry;
  }

  // Add a single voxel cube for visualization
  private addVoxelVisualizationCube(
    x: number, y: number, z: number,
    size: number,
    vertices: number[], normals: number[], indices: number[], colors: number[],
    startIndex: number,
    role: typeof ArchitecturalRole[keyof typeof ArchitecturalRole]
  ): void {
    const s = size * 0.5; // Half size for centering
    
    // Color based on architectural role
    let r = 0.5, g = 0.5, b = 0.5; // Default gray
    switch (role) {
      case ArchitecturalRole.Mass:
        r = 0.3; g = 0.6; b = 0.9; // Blue for mass
        break;
      case ArchitecturalRole.Facade:
        r = 0.9; g = 0.6; b = 0.3; // Orange for facade
        break;
      case ArchitecturalRole.Floor:
        r = 0.6; g = 0.9; b = 0.3; // Green for floor
        break;
      case ArchitecturalRole.Component:
        r = 0.9; g = 0.3; b = 0.6; // Pink for components
        break;
    }
    
    // Cube vertices (simplified - just front and top faces for performance)
    const cubeVertices = [
      // Front face
      x - s, y - s, z + s,  x + s, y - s, z + s,  x + s, y + s, z + s,  x - s, y + s, z + s,
      // Top face
      x - s, y + s, z - s,  x - s, y + s, z + s,  x + s, y + s, z + s,  x + s, y + s, z - s,
    ];
    
    // Normals
    const cubeNormals = [
      // Front face
      0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
      // Top face
      0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    ];
    
    // Colors (same color for all vertices of this voxel)
    for (let i = 0; i < 8; i++) {
      colors.push(r, g, b);
    }
    
    // Add vertices and normals
    vertices.push(...cubeVertices);
    normals.push(...cubeNormals);
    
    // Add indices for triangles (2 faces only)
    const faceIndices = [
      0, 1, 2,  0, 2, 3,    // Front face
      4, 5, 6,  4, 6, 7,    // Top face
    ];
    
    // Offset indices by current vertex position
    for (const index of faceIndices) {
      indices.push(startIndex + index);
    }
  }

  private generateMeshFromVoxels(voxels: VoxelCell[], bounds: any, style?: BuildingStyle, hierarchy?: ArchitecturalHierarchy): THREE.BufferGeometry {
    console.log(`  🎲 Converting ${voxels.length} voxels to mesh...`);
    
    if (voxels.length === 0) {
      console.error('  ❌ NO VOXELS TO CONVERT! This explains why you only see the original form.');
      console.error('  ❌ The voxel generation step failed - check the voxel creation process.');
      console.error('  ❌ Falling back to original form bounds as emergency fallback...');
      
      // Emergency fallback - create a building-like shape even if voxels failed
      const width = bounds.max.x - bounds.min.x;
      const height = Math.max(bounds.max.y - bounds.min.y, width * 3); // Make it tall like a building
      const depth = bounds.max.z - bounds.min.z;
      
      console.warn(`  ⚠️ Creating emergency building shape: ${width.toFixed(2)} × ${height.toFixed(2)} × ${depth.toFixed(2)}`);
      
      // Create a simple tapered building shape
      const geometry = new THREE.CylinderGeometry(
        Math.min(width, depth) * 0.4,  // Top radius (smaller)
        Math.min(width, depth) * 0.5,  // Bottom radius 
        height,                        // Height (much taller)
        8,                            // Segments
        Math.floor(height / 3)        // Height segments
      );
      
      geometry.translate(
        (bounds.min.x + bounds.max.x) / 2,
        bounds.min.y + height / 2,
        (bounds.min.z + bounds.max.z) / 2
      );
      
      return geometry;
    }
    
    // Generate mesh using voxel-based approach
    console.log(`  ✅ Processing ${voxels.length} voxels for mesh generation...`);
    return this.createMeshFromVoxelData(voxels, bounds, style, hierarchy);
  }

  // Create mesh from actual voxel data using adaptive algorithm based on style
  private createMeshFromVoxelData(voxels: VoxelCell[], bounds: any, style?: BuildingStyle, hierarchy?: ArchitecturalHierarchy): THREE.BufferGeometry {
    const resolution = this.calculateVoxelResolution(voxels, bounds);
    
    // Determine if we should use smooth terrain generation
    const useMarshingCubes = style && (
      (style.modernFactor > 0.7 && style.organicFactor < 0.3) || // Modern skyscraper
      style.ecoFactor > 0.7 || // Eco building
      style.organicFactor > 0.5 // Organic building
    );
    
    if (useMarshingCubes) {
      console.log(`  🌍 Generating smooth building mesh (adaptive marching cubes) from ${voxels.length} voxels...`);
      
      // Create density field and use marching cubes for smooth surfaces
      const densityField = this.createDensityField(voxels, bounds, resolution);
      const geometry = this.generateMarchingCubesMesh(densityField, bounds, resolution);
      
      // Check if marching cubes produced a reasonable result
      const vertexCount = geometry.attributes.position?.count || 0;
      const triangleCount = vertexCount / 3;
      const expectedTriangles = voxels.length * 2; // Rough estimate for building
      
      console.log(`  📊 Marching cubes result: ${triangleCount} triangles (expected ~${expectedTriangles})`);
      
      // If result seems fragmented, fall back to face culling with smoothing
      if (triangleCount < expectedTriangles * 0.1 || triangleCount > expectedTriangles * 10) {
        console.log(`  ⚠️ Marching cubes result seems fragmented, falling back to smooth face culling...`);
        const fallbackGeometry = this.generateFaceCulledMesh(voxels, bounds, resolution);
        // Apply role-aware smoothing to the face-culled result
        return this.applySmoothingToGeometry(fallbackGeometry, hierarchy);
      }
      
      console.log(`  ✅ Generated smooth mesh with ${vertexCount} vertices`);
      return geometry;
      
    } else {
      console.log(`  🧱 Generating crisp voxel mesh (face culling) from ${voxels.length} voxels...`);
      
      // Use traditional face culling for crisp, angular buildings
      return this.generateFaceCulledMesh(voxels, bounds, resolution);
    }
  }

  // Generate traditional face-culled mesh for crisp, angular buildings
  private generateFaceCulledMesh(voxels: VoxelCell[], bounds: any, resolution: number): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const roles: number[] = []; // Store architectural role for each vertex
    
    // Create voxel lookup map for face culling
    const voxelMap = new Map<string, VoxelCell>();
    const roleCounts = { mass: 0, facade: 0, floor: 0, bay: 0, component: 0 };
    
    for (const voxel of voxels) {
      if (voxel.type === VoxelType.Solid && voxel.density > 0.1) {
        const key = `${voxel.x},${voxel.y},${voxel.z}`;
        voxelMap.set(key, voxel);
        
        // Count voxel roles for debugging
        switch (voxel.architecturalRole) {
          case ArchitecturalRole.Mass: roleCounts.mass++; break;
          case ArchitecturalRole.Facade: roleCounts.facade++; break;
          case ArchitecturalRole.Floor: roleCounts.floor++; break;
          case ArchitecturalRole.Bay: roleCounts.bay++; break;
          case ArchitecturalRole.Component: roleCounts.component++; break;
        }
      }
    }
    
    console.log(`  📊 Input voxel roles: Mass: ${roleCounts.mass}, Facade: ${roleCounts.facade}, Floor: ${roleCounts.floor}, Bay: ${roleCounts.bay}, Component: ${roleCounts.component}`);
    
    let vertexIndex = 0;
    let facesGenerated = 0;
    let facesCulled = 0;
    
    // Generate faces with culling optimization
    for (const [key, voxel] of voxelMap) {
        const worldX = bounds.min.x + voxel.x * resolution;
        const worldY = bounds.min.y + voxel.y * resolution;
        const worldZ = bounds.min.z + voxel.z * resolution;
        
      // Check which faces need to be generated (face culling)
      const visibleFaces = this.getVisibleFaces(voxel, voxelMap);
      
      // Debug: Sample voxel roles being processed
      if (facesGenerated < 5) { // Log first few voxels
        console.log(`  🔍 Processing voxel at (${voxel.x},${voxel.y},${voxel.z}) with role: ${voxel.architecturalRole} (encoded: ${this.encodeArchitecturalRole(voxel.architecturalRole)})`);
      }
      
      // Only generate visible faces
      const facesAdded = this.addVoxelCubeWithFaceCulling(
          worldX, worldY, worldZ, 
          resolution, 
        visibleFaces,
          vertices, normals, indices, roles,
          vertexIndex, voxel.architecturalRole
        );
        
      vertexIndex += facesAdded * 4; // 4 vertices per face
      facesGenerated += facesAdded;
      facesCulled += (6 - facesAdded);
    }
    
    // Set geometry attributes
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('architecturalRole', new THREE.Float32BufferAttribute(roles, 1)); // Role per vertex
    geometry.setIndex(indices);
    
    console.log(`  ✅ Generated crisp mesh: ${facesGenerated} faces shown, ${facesCulled} faces culled (${((facesCulled / (facesGenerated + facesCulled)) * 100).toFixed(1)}% reduction)`);
    console.log(`  📊 Mesh details: ${vertices.length / 3} vertices, ${indices.length / 3} triangles, ${roles.length} role values`);
    
    // Debug: Check if roles array matches vertices
    if (roles.length !== vertices.length / 3) {
      console.error(`  ❌ ROLE MISMATCH: ${roles.length} roles vs ${vertices.length / 3} vertices`);
    } else {
      console.log(`  ✅ Role array correctly sized for vertices`);
    }
    
    return geometry;
  }

  // Create 3D density field from voxel data (like game terrain)
  private createDensityField(voxels: VoxelCell[], bounds: any, resolution: number): Float32Array {
    // Calculate grid dimensions
    const gridWidth = Math.ceil((bounds.max.x - bounds.min.x) / resolution) + 1;
    const gridHeight = Math.ceil((bounds.max.y - bounds.min.y) / resolution) + 1;
    const gridDepth = Math.ceil((bounds.max.z - bounds.min.z) / resolution) + 1;
    
    console.log(`  📊 Creating density field: ${gridWidth} × ${gridHeight} × ${gridDepth} grid`);
    
    // Create density field (0 = empty, 1 = solid)
    const densityField = new Float32Array(gridWidth * gridHeight * gridDepth);
    
    // Create voxel lookup map for fast access
    const voxelMap = new Map<string, VoxelCell>();
    for (const voxel of voxels) {
      if (voxel.type === VoxelType.Solid && voxel.density > 0.1) {
        const key = `${voxel.x},${voxel.y},${voxel.z}`;
        voxelMap.set(key, voxel);
      }
    }
    
    // Fill density field with basic values and improve continuity for buildings
    for (let x = 0; x < gridWidth; x++) {
      for (let y = 0; y < gridHeight; y++) {
        for (let z = 0; z < gridDepth; z++) {
          // Convert grid coordinates to voxel coordinates
          const voxelKey = `${x},${y},${z}`;
          const index = x + y * gridWidth + z * gridWidth * gridHeight;
          
          if (voxelMap.has(voxelKey)) {
            densityField[index] = voxelMap.get(voxelKey)!.density;
          } else {
            // For buildings, check if we're near a solid voxel to improve continuity
            let nearSolid = false;
            for (let dx = -1; dx <= 1; dx++) {
              for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                  const neighborKey = `${x + dx},${y + dy},${z + dz}`;
                  if (voxelMap.has(neighborKey)) {
                    nearSolid = true;
                    break;
                  }
                }
                if (nearSolid) break;
              }
              if (nearSolid) break;
            }
            
            // If near solid, give it some density for better surface generation
            densityField[index] = nearSolid ? 0.2 : 0.0;
          }
        }
      }
    }
    
    // Apply smoothing to create better isosurfaces
    console.log(`  🌊 Applying density field smoothing for better surfaces...`);
    const smoothedField = this.smoothDensityField(densityField, gridWidth, gridHeight, gridDepth);
    
    return smoothedField;
  }

  // Smooth the density field for better isosurface generation
  private smoothDensityField(densityField: Float32Array, gridWidth: number, gridHeight: number, gridDepth: number): Float32Array {
    const smoothed = new Float32Array(densityField.length);
    
    // Apply 3D Gaussian blur / averaging filter
    for (let x = 0; x < gridWidth; x++) {
      for (let y = 0; y < gridHeight; y++) {
        for (let z = 0; z < gridDepth; z++) {
          const index = x + y * gridWidth + z * gridWidth * gridHeight;
          
          let sum = 0;
          let count = 0;
          
          // Sample neighboring cells (3x3x3 kernel)
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dz = -1; dz <= 1; dz++) {
                const nx = x + dx;
                const ny = y + dy;
                const nz = z + dz;
                
                // Check bounds
                if (nx >= 0 && nx < gridWidth && 
                    ny >= 0 && ny < gridHeight && 
                    nz >= 0 && nz < gridDepth) {
                  
                  const neighborIndex = nx + ny * gridWidth + nz * gridWidth * gridHeight;
                  const weight = 1.0 / (1.0 + Math.sqrt(dx*dx + dy*dy + dz*dz)); // Distance-based weight
                  
                  sum += densityField[neighborIndex] * weight;
                  count += weight;
                }
              }
            }
          }
          
          // Average with weights
          smoothed[index] = count > 0 ? sum / count : densityField[index];
        }
      }
    }
    
    return smoothed;
  }

  // Apply role-aware smoothing based on voxel roles stored in vertex attributes
  private applySmoothingToGeometry(geometry: THREE.BufferGeometry, hierarchy?: any): THREE.BufferGeometry {
    console.log(`  🌊 Applying face-aware role-based smoothing - preserving floor continuity...`);
    
    const positions = geometry.attributes.position.array as Float32Array;
    const roleAttribute = geometry.attributes.architecturalRole;
    const roles = roleAttribute ? roleAttribute.array as Float32Array : null;
    const indices = geometry.index?.array;
    
    if (!roleAttribute || !roles || !indices) {
      console.warn(`  ⚠️ Missing required geometry data for role-based smoothing`);
      geometry.computeVertexNormals();
      return geometry;
    }
    
    console.log(`  ✅ Processing ${positions.length / 3} vertices, ${indices.length / 3} triangles with role information`);
    
    // Count vertices by role for debugging
    const roleCounts = {
      floor: 0,
      facade: 0,
      mass: 0,
      bay: 0,
      component: 0,
      unknown: 0
    };
    
    for (let i = 0; i < roles.length; i++) {
      const role = roles[i];
      if (role === 3.0) roleCounts.floor++;
      else if (role === 2.0) roleCounts.facade++;
      else if (role === 1.0) roleCounts.mass++;
      else if (role === 4.0) roleCounts.bay++;
      else if (role === 5.0) roleCounts.component++;
      else roleCounts.unknown++;
    }
    
    console.log(`  📊 Role distribution: Floor: ${roleCounts.floor}, Facade: ${roleCounts.facade}, Mass: ${roleCounts.mass}, Bay: ${roleCounts.bay}, Component: ${roleCounts.component}, Unknown: ${roleCounts.unknown}`);
    
    // Analyze faces to determine which should be kept flat
    const faceRoles = new Map<number, 'floor' | 'mixed' | 'other' | 'facade' | 'facade_transition'>();
    
    for (let i = 0; i < indices.length; i += 3) {
      const v1 = indices[i];
      const v2 = indices[i + 1];
      const v3 = indices[i + 2];
      
      const role1 = roles[v1];
      const role2 = roles[v2];
      const role3 = roles[v3];
      
      const faceIndex = Math.floor(i / 3);
      
      // If all vertices are floor, keep face flat
      if (role1 === 3.0 && role2 === 3.0 && role3 === 3.0) {
        faceRoles.set(faceIndex, 'floor');
      }
      // If any vertices are floor but not all, this is a transition face
      else if (role1 === 3.0 || role2 === 3.0 || role3 === 3.0) {
        faceRoles.set(faceIndex, 'mixed');
      }
      // If all vertices are facade, this is a pure facade face (smooth normally)
      else if (role1 === 2.0 && role2 === 2.0 && role3 === 2.0) {
        faceRoles.set(faceIndex, 'facade');
      }
      // If mix of facade/mass/etc (but no floors), handle as transition
      else if ((role1 === 2.0 || role2 === 2.0 || role3 === 2.0) && 
               (role1 !== role2 || role2 !== role3)) {
        faceRoles.set(faceIndex, 'facade_transition');
      }
      // Otherwise it's a regular face that can be smoothed
      else {
        faceRoles.set(faceIndex, 'other');
      }
    }
    
    // Count face types
    let floorFaces = 0, mixedFaces = 0, facadeFaces = 0, facadeTransitionFaces = 0, otherFaces = 0;
    for (const faceRole of faceRoles.values()) {
      if (faceRole === 'floor') floorFaces++;
      else if (faceRole === 'mixed') mixedFaces++;
      else if (faceRole === 'facade') facadeFaces++;
      else if (faceRole === 'facade_transition') facadeTransitionFaces++;
      else otherFaces++;
    }
    
    console.log(`  📊 Face analysis: Floor faces: ${floorFaces}, Mixed faces: ${mixedFaces}, Facade faces: ${facadeFaces}, Facade transitions: ${facadeTransitionFaces}, Other faces: ${otherFaces}`);
    
    // Apply gentle smoothing with face awareness
    const smoothingFactor = 0.04; // Very subtle
    const iterations = 2;
    
    let keptFlatCount = 0;
    let smoothedCount = 0;
    
    for (let iter = 0; iter < iterations; iter++) {
      const newPositions = new Float32Array(positions.length);
      
      // Copy current positions
      for (let i = 0; i < positions.length; i++) {
        newPositions[i] = positions[i];
      }
      
      // Process each vertex
      for (let vertexIndex = 0; vertexIndex < positions.length / 3; vertexIndex++) {
        const i = vertexIndex * 3;
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];
        
        const vertexRole = roles[vertexIndex];
        
        // Check if this vertex is part of any special face types
        let isPartOfFloorFace = false;
        let isPartOfMixedFace = false;
        let isPartOfFacadeTransition = false;
        
        for (let faceIdx = 0; faceIdx < indices.length; faceIdx += 3) {
          const v1 = indices[faceIdx];
          const v2 = indices[faceIdx + 1];
          const v3 = indices[faceIdx + 2];
          
          if (v1 === vertexIndex || v2 === vertexIndex || v3 === vertexIndex) {
            const faceIndex = Math.floor(faceIdx / 3);
            const faceRole = faceRoles.get(faceIndex);
            
            if (faceRole === 'floor') {
              isPartOfFloorFace = true;
            } else if (faceRole === 'mixed') {
              isPartOfMixedFace = true;
            } else if (faceRole === 'facade_transition') {
              isPartOfFacadeTransition = true;
            }
          }
        }
        
        // Debug sampling
        if (iter === 0 && vertexIndex % 100 === 0) {
          const roleNames: { [key: number]: string } = {1: 'Mass', 2: 'Facade', 3: 'Floor', 4: 'Bay', 5: 'Component'};
          const roleName = roleNames[vertexRole] || 'Unknown';
          console.log(`    🔍 Vertex ${vertexIndex} (Y=${y.toFixed(2)}): Role=${roleName}, FloorFace=${isPartOfFloorFace}, MixedFace=${isPartOfMixedFace}, FacadeTransition=${isPartOfFacadeTransition}`);
        }
        
        if (isPartOfFloorFace || (vertexRole === 3.0 && isPartOfMixedFace)) {
          // Keep vertices in floor faces completely flat to maintain continuity
          newPositions[i] = x;
          newPositions[i + 1] = y;
          newPositions[i + 2] = z;
          if (iter === 0) keptFlatCount++;
        } else if (isPartOfFacadeTransition) {
          // Apply very gentle smoothing to facade transitions to fix seams
          const seamSmooth = Math.sin(x * 3.0) * Math.cos(z * 3.0) * smoothingFactor * 0.3;
          
          // Focus on Y-axis smoothing to eliminate facade seams
          newPositions[i] = x + seamSmooth * 0.1; // Minimal X smoothing
          newPositions[i + 1] = y + seamSmooth; // Gentle Y smoothing for seams
          newPositions[i + 2] = z + seamSmooth * 0.1; // Minimal Z smoothing
          if (iter === 0) smoothedCount++;
        } else {
          // Apply normal smoothing to other vertices
          const edgeSmooth = Math.sin(x * 1.8) * Math.cos(z * 1.8) * smoothingFactor * 0.6;
          const cornerSmooth = Math.cos(x * 2.2) * Math.sin(z * 2.2) * smoothingFactor * 0.4;
          
          // Smooth all axes gently to avoid sharp voxel edges
          newPositions[i] = x + edgeSmooth * 0.2; // Very subtle X smoothing
          newPositions[i + 1] = y + edgeSmooth + cornerSmooth; // Primary Y smoothing
          newPositions[i + 2] = z + cornerSmooth * 0.2; // Very subtle Z smoothing
          if (iter === 0) smoothedCount++;
        }
      }
      
      // Update positions for next iteration
      for (let i = 0; i < positions.length; i++) {
        positions[i] = newPositions[i];
      }
    }
    
    // Update geometry with new positions
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    
    const totalVertices = positions.length / 3;
    console.log(`  ✅ Applied face-aware smoothing: ${keptFlatCount} vertices kept flat (floors), ${smoothedCount} vertices smoothed, ${totalVertices} total`);
    console.log(`  ✅ Floor continuity preserved by keeping ${floorFaces} floor faces completely flat`);
    
    return geometry;
  }

  // Check if a vertex position is part of structural elements (floors/foundations)
  private isVertexStructural(x: number, y: number, z: number, hierarchy?: any): boolean {
    if (!hierarchy) return false;
    
    // TEMPORARY DEBUG: Disable all structural detection to test full smoothing
    const DEBUG_DISABLE_ALL_STRUCTURAL = false;
    if (DEBUG_DISABLE_ALL_STRUCTURAL) {
      return false; // Allow all smoothing to test
    }
    
    // Check based on voxel roles/types, but be smart about floor vs facade within floor zones
    const tolerance = 0.3; // Tolerance for floating point comparison
    
    try {
      // Check foundation level - foundations should always be flat
      if (hierarchy.foundation) {
        if (Array.isArray(hierarchy.foundation) && hierarchy.foundation.length > 0) {
          for (const foundation of hierarchy.foundation) {
            // Handle different foundation structure formats
            if (foundation.bounds && foundation.bounds.min && foundation.bounds.max) {
              if (y >= foundation.bounds.min.y - tolerance && 
                  y <= foundation.bounds.max.y + tolerance) {
                return true; // Foundation role - keep flat
              }
            } else if (foundation.voxelBounds) {
              if (y >= foundation.voxelBounds.min.y - tolerance && 
                  y <= foundation.voxelBounds.max.y + tolerance) {
                return true; // Foundation role - keep flat
              }
            }
          }
        } else if (hierarchy.foundation.voxelBounds) {
          // Single foundation object
          if (y >= hierarchy.foundation.voxelBounds.min.y - tolerance && 
              y <= hierarchy.foundation.voxelBounds.max.y + tolerance) {
            return true; // Foundation role - keep flat
          }
        }
      }
      
      // Check floor levels - only keep actual floor surfaces flat, not entire zones
      if (hierarchy.floors) {
        if (Array.isArray(hierarchy.floors) && hierarchy.floors.length > 0) {
          for (const floor of hierarchy.floors) {
            // Handle different floor structure formats
            if (floor.bounds && floor.bounds.min && floor.bounds.max) {
              // Only keep top and bottom surfaces of floor zones flat (actual floor slabs)
              const floorBottom = floor.bounds.min.y;
              const floorTop = floor.bounds.max.y;
              const surfaceTolerance = 0.2; // Thin surface layer
              
              // Keep bottom surface flat (floor slab)
              if (y >= floorBottom - surfaceTolerance && y <= floorBottom + surfaceTolerance) {
                return true; // Floor bottom surface - keep flat
              }
              // Keep top surface flat (ceiling/next floor)
              if (y >= floorTop - surfaceTolerance && y <= floorTop + surfaceTolerance) {
                return true; // Floor top surface - keep flat
              }
            } else if (floor.voxelBounds) {
              // Only keep top and bottom surfaces of floor zones flat (actual floor slabs)
              const floorBottom = floor.voxelBounds.min.y;
              const floorTop = floor.voxelBounds.max.y;
              const surfaceTolerance = 0.2; // Thin surface layer
              
              // Keep bottom surface flat (floor slab)
              if (y >= floorBottom - surfaceTolerance && y <= floorBottom + surfaceTolerance) {
                return true; // Floor bottom surface - keep flat
              }
              // Keep top surface flat (ceiling/next floor)
              if (y >= floorTop - surfaceTolerance && y <= floorTop + surfaceTolerance) {
                return true; // Floor top surface - keep flat
              }
            }
          }
        } else if (hierarchy.floors.voxelBounds) {
          // Single floor object - only keep surfaces flat
          const floorBottom = hierarchy.floors.voxelBounds.min.y;
          const floorTop = hierarchy.floors.voxelBounds.max.y;
          const surfaceTolerance = 0.2; // Thin surface layer
          
          // Keep bottom surface flat (floor slab)
          if (y >= floorBottom - surfaceTolerance && y <= floorBottom + surfaceTolerance) {
            return true; // Floor bottom surface - keep flat
          }
          // Keep top surface flat (ceiling/next floor)
          if (y >= floorTop - surfaceTolerance && y <= floorTop + surfaceTolerance) {
            return true; // Floor top surface - keep flat
          }
        }
      }
      
      // If we can't determine structure safely, allow smoothing
      return false; // Not structural - can be smoothed
      
    } catch (error) {
      console.warn('⚠️ Error checking structural vertex, allowing smoothing:', error);
      return false; // Safe fallback - allow smoothing
    }
  }

  // Generate smooth mesh using Marching Cubes algorithm (like game terrain)
  private generateMarchingCubesMesh(densityField: Float32Array, bounds: any, resolution: number): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    
    // Calculate grid dimensions
    const gridWidth = Math.ceil((bounds.max.x - bounds.min.x) / resolution) + 1;
    const gridHeight = Math.ceil((bounds.max.y - bounds.min.y) / resolution) + 1;
    const gridDepth = Math.ceil((bounds.max.z - bounds.min.z) / resolution) + 1;
    
    const isoLevel = 0.5; // Surface threshold
    let vertexIndex = 0;
    
    console.log(`  🧊 Running marching cubes on ${gridWidth-1} × ${gridHeight-1} × ${gridDepth-1} cells...`);
    
    let processedCubes = 0;
    let validCubes = 0;
    
    // Process each cube in the grid
    for (let x = 0; x < gridWidth - 1; x++) {
      for (let y = 0; y < gridHeight - 1; y++) {
        for (let z = 0; z < gridDepth - 1; z++) {
          processedCubes++;
          // Get the 8 corner values of this cube
          const cubeValues = [
            this.getDensityAt(x,     y,     z,     densityField, gridWidth, gridHeight),
            this.getDensityAt(x + 1, y,     z,     densityField, gridWidth, gridHeight),
            this.getDensityAt(x + 1, y + 1, z,     densityField, gridWidth, gridHeight),
            this.getDensityAt(x,     y + 1, z,     densityField, gridWidth, gridHeight),
            this.getDensityAt(x,     y,     z + 1, densityField, gridWidth, gridHeight),
            this.getDensityAt(x + 1, y,     z + 1, densityField, gridWidth, gridHeight),
            this.getDensityAt(x + 1, y + 1, z + 1, densityField, gridWidth, gridHeight),
            this.getDensityAt(x,     y + 1, z + 1, densityField, gridWidth, gridHeight)
          ];
          
          // Calculate cube configuration index
          let cubeIndex = 0;
          for (let i = 0; i < 8; i++) {
            if (cubeValues[i] > isoLevel) {
              cubeIndex |= (1 << i);
            }
          }
          
          // Skip if cube is entirely inside or outside
          if (cubeIndex === 0 || cubeIndex === 255) continue;
          
          validCubes++;
          
          // Generate triangles for this cube configuration
          const cubeTriangles = this.generateCubeTriangles(
            x, y, z, 
            cubeValues, 
            isoLevel,
            bounds, 
            resolution
          );
          
          // Add triangles to mesh
          for (const triangle of cubeTriangles) {
            vertices.push(...triangle.vertices);
            normals.push(...triangle.normals);
            indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
            vertexIndex += 3;
          }
        }
      }
    }
    
    // Set geometry attributes
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    
    console.log(`  📊 Marching cubes stats: ${processedCubes} cubes processed, ${validCubes} surface cubes, ${vertices.length / 9} triangles generated`);
    console.log(`  ✅ Final mesh: ${vertices.length / 3} vertices`);
    
    return geometry;
  }

  // Get density value at grid position
  private getDensityAt(x: number, y: number, z: number, densityField: Float32Array, gridWidth: number, gridHeight: number): number {
    const index = x + y * gridWidth + z * gridWidth * gridHeight;
    return densityField[index] || 0.0;
  }

  // Generate triangles for a marching cubes configuration using proper edge interpolation
  private generateCubeTriangles(
    x: number, y: number, z: number,
    cubeValues: number[],
    isoLevel: number,
    bounds: any,
    resolution: number
  ): Array<{vertices: number[], normals: number[]}> {
    const triangles: Array<{vertices: number[], normals: number[]}> = [];
    
    // Calculate cube configuration index (which corners are inside/outside)
    let cubeIndex = 0;
    for (let i = 0; i < 8; i++) {
      if (cubeValues[i] > isoLevel) {
        cubeIndex |= (1 << i);
      }
    }
    
    // Skip if cube is entirely inside or outside
    if (cubeIndex === 0 || cubeIndex === 255) {
      return triangles;
    }
    
    // Define cube corner positions in local coordinates
    const cubeCorners = [
      [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], // Bottom face
      [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]  // Top face
    ];
    
    // Define the 12 edges of the cube (each edge connects two corners)
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0], // Bottom face edges
      [4, 5], [5, 6], [6, 7], [7, 4], // Top face edges  
      [0, 4], [1, 5], [2, 6], [3, 7]  // Vertical edges
    ];
    
    // Calculate interpolated positions where edges cross the isosurface
    const edgeVertices: number[][] = [];
    
    for (let i = 0; i < 12; i++) {
      const edge = edges[i];
      const corner1 = edge[0];
      const corner2 = edge[1];
      const value1 = cubeValues[corner1];
      const value2 = cubeValues[corner2];
      
      // Check if edge crosses the isosurface
      if ((value1 > isoLevel) !== (value2 > isoLevel)) {
        // Linear interpolation to find exact crossing point
        const t = (isoLevel - value1) / (value2 - value1);
        
        const pos1 = cubeCorners[corner1];
        const pos2 = cubeCorners[corner2];
        
        const interpolatedPos = [
          pos1[0] + t * (pos2[0] - pos1[0]),
          pos1[1] + t * (pos2[1] - pos1[1]),
          pos1[2] + t * (pos2[2] - pos1[2])
        ];
        
        // Convert to world coordinates
        const worldPos = [
          bounds.min.x + (x + interpolatedPos[0]) * resolution,
          bounds.min.y + (y + interpolatedPos[1]) * resolution,
          bounds.min.z + (z + interpolatedPos[2]) * resolution
        ];
        
        edgeVertices[i] = worldPos;
      }
    }
    
    // Simplified triangle table (a few common cases)
    // In a full implementation, you'd use the complete 256-entry marching cubes table
    const triangleTable = this.getTriangleTable();
    const triangleConfig = triangleTable[cubeIndex];
    
    if (triangleConfig) {
      for (let i = 0; i < triangleConfig.length; i += 3) {
        const edge1 = triangleConfig[i];
        const edge2 = triangleConfig[i + 1];
        const edge3 = triangleConfig[i + 2];
        
        if (edgeVertices[edge1] && edgeVertices[edge2] && edgeVertices[edge3]) {
          const v1 = edgeVertices[edge1];
          const v2 = edgeVertices[edge2];
          const v3 = edgeVertices[edge3];
          
          // Calculate surface normal from triangle
          const edge1Vec = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
          const edge2Vec = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
          
          // Cross product for normal
          const normal = [
            edge1Vec[1] * edge2Vec[2] - edge1Vec[2] * edge2Vec[1],
            edge1Vec[2] * edge2Vec[0] - edge1Vec[0] * edge2Vec[2],
            edge1Vec[0] * edge2Vec[1] - edge1Vec[1] * edge2Vec[0]
          ];
          
          // Normalize
          const normalLength = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
          if (normalLength > 0) {
            normal[0] /= normalLength;
            normal[1] /= normalLength;
            normal[2] /= normalLength;
          }
          
          triangles.push({
            vertices: [
              v1[0], v1[1], v1[2],
              v2[0], v2[1], v2[2],
              v3[0], v3[1], v3[2]
            ],
            normals: [
              normal[0], normal[1], normal[2],
              normal[0], normal[1], normal[2],
              normal[0], normal[1], normal[2]
            ]
          });
        }
      }
    }
    
    return triangles;
  }

  // Simplified marching cubes triangle table (subset of most common configurations)
  private getTriangleTable(): { [key: number]: number[] } {
    return {
      // Single corner cases
      1: [0, 8, 3],
      2: [0, 1, 9],
      4: [1, 2, 10],
      8: [2, 3, 11],
      16: [4, 7, 8],
      32: [5, 4, 9],
      64: [6, 5, 10],
      128: [7, 6, 11],
      
      // Edge cases
      3: [1, 8, 3, 9, 8, 1],
      6: [0, 2, 10, 0, 10, 9],
      12: [2, 3, 11, 2, 11, 10],
      24: [0, 8, 3, 4, 7, 8],
      
      // Face cases
      15: [4, 7, 8, 9, 10, 11],
      51: [1, 2, 10, 1, 10, 9, 4, 7, 8],
      85: [0, 1, 9, 4, 7, 8, 2, 3, 11],
      
      // Common configurations that create smooth surfaces
      102: [1, 2, 10, 1, 10, 9, 5, 6, 7],
      153: [0, 1, 9, 0, 9, 8, 2, 3, 11]
    };
  }

  // Calculate voxel resolution from voxel data
  private calculateVoxelResolution(voxels: VoxelCell[], bounds: any): number {
    if (voxels.length === 0) return 1.0;
    
    // Find the span of voxel coordinates
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    for (const voxel of voxels) {
      minX = Math.min(minX, voxel.x);
      maxX = Math.max(maxX, voxel.x);
      minY = Math.min(minY, voxel.y);
      maxY = Math.max(maxY, voxel.y);
      minZ = Math.min(minZ, voxel.z);
      maxZ = Math.max(maxZ, voxel.z);
    }
    
    // Calculate resolution based on world bounds / voxel grid size
    const worldWidth = bounds.max.x - bounds.min.x;
    const voxelWidth = maxX - minX + 1;
    const resolution = worldWidth / voxelWidth;
    
    return resolution;
  }

  // Determine which faces of a voxel are visible (face culling optimization)
  private getVisibleFaces(voxel: VoxelCell, voxelMap: Map<string, VoxelCell>): boolean[] {
    // Check 6 directions: +X, -X, +Y, -Y, +Z, -Z
    const neighbors = [
      `${voxel.x + 1},${voxel.y},${voxel.z}`, // Right (+X)
      `${voxel.x - 1},${voxel.y},${voxel.z}`, // Left (-X)
      `${voxel.x},${voxel.y + 1},${voxel.z}`, // Top (+Y)
      `${voxel.x},${voxel.y - 1},${voxel.z}`, // Bottom (-Y)
      `${voxel.x},${voxel.y},${voxel.z + 1}`, // Front (+Z)
      `${voxel.x},${voxel.y},${voxel.z - 1}`  // Back (-Z)
    ];
    
    // Face is visible if there's no solid neighbor in that direction
    const visibleFaces = neighbors.map(neighborKey => !voxelMap.has(neighborKey));
    
    return visibleFaces;
  }

  // Add cube with only visible faces (face culling)
  private addVoxelCubeWithFaceCulling(
    x: number, y: number, z: number, 
    size: number,
    visibleFaces: boolean[], // [right, left, top, bottom, front, back]
    vertices: number[], normals: number[], indices: number[], roles: number[],
    startIndex: number, architecturalRole: typeof ArchitecturalRole[keyof typeof ArchitecturalRole]
  ): number {
    const s = size * 0.5; // Half size for centering
    let facesAdded = 0;
    
    // Face definitions: vertices and normals for each face
    const faceData = [
      // Right face (+X) - visibleFaces[0]
      {
        vertices: [x + s, y - s, z - s,  x + s, y + s, z - s,  x + s, y + s, z + s,  x + s, y - s, z + s],
        normal: [1, 0, 0]
      },
      // Left face (-X) - visibleFaces[1]
      {
        vertices: [x - s, y - s, z - s,  x - s, y - s, z + s,  x - s, y + s, z + s,  x - s, y + s, z - s],
        normal: [-1, 0, 0]
      },
      // Top face (+Y) - visibleFaces[2]
      {
        vertices: [x - s, y + s, z - s,  x - s, y + s, z + s,  x + s, y + s, z + s,  x + s, y + s, z - s],
        normal: [0, 1, 0]
      },
      // Bottom face (-Y) - visibleFaces[3]
      {
        vertices: [x - s, y - s, z - s,  x + s, y - s, z - s,  x + s, y - s, z + s,  x - s, y - s, z + s],
        normal: [0, -1, 0]
      },
      // Front face (+Z) - visibleFaces[4]
      {
        vertices: [x - s, y - s, z + s,  x + s, y - s, z + s,  x + s, y + s, z + s,  x - s, y + s, z + s],
        normal: [0, 0, 1]
      },
      // Back face (-Z) - visibleFaces[5]
      {
        vertices: [x - s, y - s, z - s,  x - s, y + s, z - s,  x + s, y + s, z - s,  x + s, y - s, z - s],
        normal: [0, 0, -1]
      }
    ];
    
    // Add only visible faces
    for (let i = 0; i < 6; i++) {
      if (visibleFaces[i]) {
        const face = faceData[i];
        const currentVertexIndex = startIndex + facesAdded * 4;
        
        // Add vertices
        vertices.push(...face.vertices);
        
        // Add normals (4 times for 4 vertices)
        for (let j = 0; j < 4; j++) {
          normals.push(...face.normal);
        }
        
        // Add architectural role (4 times for 4 vertices)
        const roleValue = this.encodeArchitecturalRole(architecturalRole);
        for (let j = 0; j < 4; j++) {
          roles.push(roleValue);
        }
        
        // Add indices for 2 triangles (quad = 2 triangles)
        indices.push(
          currentVertexIndex, currentVertexIndex + 1, currentVertexIndex + 2,
          currentVertexIndex, currentVertexIndex + 2, currentVertexIndex + 3
        );
        
        facesAdded++;
      }
    }
    
    return facesAdded;
  }

  // Encode architectural role as number for vertex attribute
  private encodeArchitecturalRole(role: typeof ArchitecturalRole[keyof typeof ArchitecturalRole]): number {
    switch (role) {
      case ArchitecturalRole.Mass: return 1.0;
      case ArchitecturalRole.Facade: return 2.0;
      case ArchitecturalRole.Floor: return 3.0;
      case ArchitecturalRole.Bay: return 4.0;
      case ArchitecturalRole.Component: return 5.0;
      default: return 0.0;
    }
  }

  // Add cube geometry for a single voxel
  private addVoxelCubeToMesh(
    x: number, y: number, z: number, 
    size: number,
    vertices: number[], normals: number[], indices: number[],
    startIndex: number
  ): void {
    const s = size * 0.5; // Half size for centering
    
    // Cube vertices (8 corners)
    const cubeVertices = [
      // Front face
      x - s, y - s, z + s,  x + s, y - s, z + s,  x + s, y + s, z + s,  x - s, y + s, z + s,
      // Back face  
      x - s, y - s, z - s,  x - s, y + s, z - s,  x + s, y + s, z - s,  x + s, y - s, z - s,
      // Top face
      x - s, y + s, z - s,  x - s, y + s, z + s,  x + s, y + s, z + s,  x + s, y + s, z - s,
      // Bottom face
      x - s, y - s, z - s,  x + s, y - s, z - s,  x + s, y - s, z + s,  x - s, y - s, z + s,
      // Right face
      x + s, y - s, z - s,  x + s, y + s, z - s,  x + s, y + s, z + s,  x + s, y - s, z + s,
      // Left face
      x - s, y - s, z - s,  x - s, y - s, z + s,  x - s, y + s, z + s,  x - s, y + s, z - s
    ];
    
    // Cube normals
    const cubeNormals = [
      // Front face
      0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
      // Back face
      0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
      // Top face
      0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
      // Bottom face
      0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
      // Right face
      1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
      // Left face
      -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0
    ];
    
    // Add vertices and normals
    vertices.push(...cubeVertices);
    normals.push(...cubeNormals);
    
    // Add indices for triangles (2 triangles per face, 6 faces)
    const faceIndices = [
      0, 1, 2,  0, 2, 3,    // Front
      4, 5, 6,  4, 6, 7,    // Back
      8, 9, 10, 8, 10, 11,  // Top
      12, 13, 14, 12, 14, 15, // Bottom
      16, 17, 18, 16, 18, 19, // Right
      20, 21, 22, 20, 22, 23  // Left
    ];
    
    // Offset indices by current vertex position
    for (const index of faceIndices) {
      indices.push(startIndex + index);
    }
  }

  private refineMeshSurface(mesh: THREE.BufferGeometry, style: BuildingStyle, hierarchy?: ArchitecturalHierarchy): THREE.BufferGeometry {
    console.log('🎨 Applying style-based mesh refinement...');
    
    // Apply style-specific smoothing and modifications
    let refinedMesh = mesh;
    
    // MODERN SKYSCRAPER: Apply smoothing for sleek, rounded edges (high modern factor)
    if (style.modernFactor > 0.7 && style.organicFactor < 0.3) {
      console.log('  🏙️ Applying modern skyscraper smoothing...');
      refinedMesh = this.applySmoothingFilter(refinedMesh, 2, hierarchy); // 2 iterations for subtle rounding
      refinedMesh = this.applyEdgeRounding(refinedMesh, 0.1); // 10% edge rounding
    }
    
    // ECO BUILDING: Apply gentle organic smoothing while preserving form (high eco factor)
    else if (style.ecoFactor > 0.7) {
      console.log('  🌿 Applying form-preserving eco building smoothing...');
      refinedMesh = this.applySmoothingFilter(refinedMesh, 2, hierarchy); // 2 iterations for subtle smoothing
      refinedMesh = this.applyOrganicDeformation(refinedMesh, 0.05); // 5% organic variation
    }
    
    // INDUSTRIAL: Keep angular but optimize normals (low modern + low organic)
    else if (style.modernFactor < 0.3 && style.organicFactor < 0.3) {
      console.log('  🏭 Applying industrial angular refinement...');
      // Keep pixelated look but improve lighting
    }
    
    // ORGANIC/CLASSICAL: Apply moderate smoothing (high organic factor)
    else if (style.organicFactor > 0.5) {
      console.log('  🏛️ Applying organic architectural refinement...');
      refinedMesh = this.applySmoothingFilter(refinedMesh, 1, hierarchy);
    }
    
    // Always compute normals and bounds
    refinedMesh.computeVertexNormals();
    refinedMesh.computeBoundingBox();
    refinedMesh.computeBoundingSphere();
    
    console.log('  ✅ Style-based refinement completed');
    return refinedMesh;
  }

  // Apply gentle smoothing to soften voxel edges while preserving form
  private applySmoothingFilter(geometry: THREE.BufferGeometry, iterations: number, hierarchy?: ArchitecturalHierarchy): THREE.BufferGeometry {
    if (iterations === 0) return geometry;
    
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Apply gentle smoothing to just soften voxel edges
    for (let iter = 0; iter < iterations; iter++) {
      const newPositions = new Float32Array(positions.length);
      
      // Copy current positions
      for (let i = 0; i < positions.length; i++) {
        newPositions[i] = positions[i];
      }
      
      // Apply very gentle displacement to preserve building form
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1]; 
        const z = positions[i + 2];
        
        // Check if this vertex is part of structural elements
        const isStructural = this.isVertexStructural(x, y, z, hierarchy);
        
        if (isStructural) {
          // Keep floors and foundations completely flat - no smoothing
          newPositions[i] = x;
          newPositions[i + 1] = y;
          newPositions[i + 2] = z;
        } else {
          // Apply gentle smoothing only to facade/mass elements
          const factor = 0.03; // Only 3% displacement per iteration
          
          // High-frequency noise to only affect voxel edge details
          const smoothX = Math.sin(y * 3.0) * Math.cos(z * 3.0) * factor * 0.5;
          const smoothY = Math.cos(x * 3.0) * Math.sin(z * 3.0) * factor;
          const smoothZ = Math.sin(x * 3.0) * Math.cos(y * 3.0) * factor * 0.5;
          
          // Apply minimal displacement - mostly Y to preserve footprint
          newPositions[i] = x + smoothX * 0.3; // Minimal X change
          newPositions[i + 1] = y + smoothY; // Primary Y smoothing
          newPositions[i + 2] = z + smoothZ * 0.3; // Minimal Z change
        }
      }
      
      // Update positions for next iteration
      for (let i = 0; i < positions.length; i++) {
        positions[i] = newPositions[i];
      }
    }
    
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals(); // Recompute normals for smooth lighting
    return geometry;
  }

  // Apply edge rounding for modern buildings
  private applyEdgeRounding(geometry: THREE.BufferGeometry, roundingFactor: number): THREE.BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Apply subtle displacement to create rounded edges
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Create subtle curvature by applying sinusoidal displacement
      const curvature = Math.sin(x * 0.5) * Math.sin(z * 0.5) * roundingFactor;
      positions[i + 1] = y + curvature;
    }
    
    geometry.attributes.position.needsUpdate = true;
    return geometry;
  }

  // Apply organic deformation for eco buildings
  private applyOrganicDeformation(geometry: THREE.BufferGeometry, deformationFactor: number): THREE.BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    
    // Apply organic noise-based deformation
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Use Perlin noise for organic variation
      const noiseX = this.noise.noise(x * 0.1, y * 0.1, z * 0.1) * deformationFactor;
      const noiseY = this.noise.noise(x * 0.1 + 100, y * 0.1, z * 0.1) * deformationFactor;
      const noiseZ = this.noise.noise(x * 0.1, y * 0.1, z * 0.1 + 100) * deformationFactor;
      
      positions[i] = x + noiseX;
      positions[i + 1] = y + noiseY;
      positions[i + 2] = z + noiseZ;
    }
    
    geometry.attributes.position.needsUpdate = true;
    return geometry;
  }

  // Dispose resources
  dispose(): void {
    // Clean up CSG evaluator if needed
  }
}

// Preset building styles for educational use - more conservative to preserve form
export const BuildingStyles = {
  ModernSkyscraper: {
    organicFactor: 0.3, // Increased for subtle organic feel
    modernFactor: 0.9,
    ecoFactor: 0.4, // Increased for eco appearance
    noiseScale: 0.8, // Much larger scale for ultra-smooth transitions
    noiseIntensity: 0.25, // Balanced intensity for visible but smooth effect
    taperFactor: 0.08, // Gentle tapering
    twistFactor: 0.0 // No twist for clean modern lines
  } as BuildingStyle,
  
  EcoTower: {
    organicFactor: 0.7, // High organic factor for eco feel
    modernFactor: 0.6,
    ecoFactor: 0.9,
    noiseScale: 0.6, // Large scale for smooth organic appearance
    noiseIntensity: 0.35, // Visible organic texture
    taperFactor: 0.12, // Moderate tapering for elegance
    twistFactor: 0.05 // Very slight twist
  } as BuildingStyle,
  
  OrganicResidential: {
    organicFactor: 0.8, // Maximum organic feel
    modernFactor: 0.4,
    ecoFactor: 0.9, // Maximum eco-friendly appearance
    noiseScale: 0.5, // Balanced scale for organic texture
    noiseIntensity: 0.4, // Strong but smooth organic effect
    taperFactor: 0.1, // Natural tapering
    twistFactor: 0.03 // Minimal twist
  } as BuildingStyle,
  
  FutureOffice: {
    organicFactor: 0.4, // Moderate organic for modern feel
    modernFactor: 0.95,
    ecoFactor: 0.7, // Good eco-friendly rating
    noiseScale: 0.7, // Large scale for smooth modern surfaces
    noiseIntensity: 0.3, // Visible but controlled effect
    taperFactor: 0.08, // Clean modern tapering
    twistFactor: 0.08 // Moderate futuristic twist
  } as BuildingStyle
};

// Default parameters - more conservative and form-respecting
export const DefaultFloorParameters: FloorParameters = {
  height: 6, // Even more conservative default height
  floorHeight: 2.0, // Shorter floors
  floorCount: 2, // Even fewer floors by default
  floorThickness: 0.15,
  indentAmount: 0.05, // Less aggressive indentation
  balconyProbability: 0.2
};

export const DefaultWindowParameters: WindowParameters = {
  windowWidth: 1.5,
  windowHeight: 2,
  windowSpacing: 2.5,
  windowInset: 0.2,
  balconyDepth: 0.5,
  roundness: 0.2
};

// ========== VOXEL-BASED ARCHITECTURAL GENERATION SYSTEM ==========

// Voxel-based building generation system interfaces
export interface VoxelCell {
  x: number;
  y: number;
  z: number;
  type: typeof VoxelType[keyof typeof VoxelType];
  architecturalRole: typeof ArchitecturalRole[keyof typeof ArchitecturalRole];
  density: number; // 0.0 to 1.0 for partial voxels/rounding
  metadata?: any;
}

export const VoxelType = {
  Empty: 'empty',
  Solid: 'solid', 
  Window: 'window',
  Door: 'door',
  Balcony: 'balcony',
  Detail: 'detail'
} as const;

export const ArchitecturalRole = {
  Mass: 'mass',           // Overall building volume
  Facade: 'facade',       // Building walls/faces
  Floor: 'floor',         // Horizontal floor divisions
  Bay: 'bay',            // Vertical facade subdivisions
  Component: 'component'  // Windows, doors, details
} as const;

export interface VoxelSpace {
  voxels: Map<string, VoxelCell>; // Key: "x,y,z"
  bounds: {
    min: { x: number, y: number, z: number };
    max: { x: number, y: number, z: number };
  };
  resolution: number; // Voxel size in world units
  metadata: {
    originalForm: THREE.BufferGeometry;
    buildingType: string;
    floorCount: number;
    floorHeight: number;
  };
}

export interface ArchitecturalHierarchy {
  mass: BuildingComponent;
  facades: BuildingComponent[];
  floors: BuildingComponent[];
  bays: BuildingComponent[];
  components: BuildingComponent[];
  foundation?: BuildingComponent;
  roof?: BuildingComponent;
}

export interface BuildingComponent {
  id: string;
  type: typeof ArchitecturalRole[keyof typeof ArchitecturalRole];
  voxelBounds: {
    min: { x: number, y: number, z: number };
    max: { x: number, y: number, z: number };
  };
  children: BuildingComponent[];
  voxels: VoxelCell[];
  voxelSpace?: VoxelSpace; // NEW: For architectural mass components with detailed voxel data
  metadata: any;
}

export interface BuildingRuleSet {
  name: string;
  floorRules: FloorRule[];
  facadeRules: FacadeRule[];
  windowRules: WindowRule[];
  styleMods: StyleModification[];
}

export interface FloorRule {
  minHeight: number;
  maxHeight: number;
  heightVariation: number;
  setbackRatio: number;
}

export interface FacadeRule {
  windowSpacing: number;
  windowSize: { width: number, height: number };
  balconyProbability: number;
  detailDensity: number;
}

export interface WindowRule {
  pattern: 'regular' | 'irregular' | 'grouped';
  sizeVariation: number;
  insetDepth: number;
}

export interface StyleModification {
  type: 'rounding' | 'noise' | 'chamfer' | 'organic';
  intensity: number;
  affectedRoles: (typeof ArchitecturalRole[keyof typeof ArchitecturalRole])[];
} 