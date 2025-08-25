#!/usr/bin/env node

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n🧱 BRICK DIMENSION CHECKER\n');

// Check if the brick file exists
const brickPath = path.join(__dirname, '..', 'public', 'Octa2.glb');
if (!fs.existsSync(brickPath)) {
    console.error('❌ Brick file not found at:', brickPath);
    process.exit(1);
}

// Get file size
const stats = fs.statSync(brickPath);
console.log(`📁 File: ${brickPath}`);
console.log(`📏 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB\n`);

// Load and analyze the GLB
const loader = new GLTFLoader();
const data = fs.readFileSync(brickPath);
const blob = new Blob([data]);
const url = URL.createObjectURL(blob);

loader.load(url, (gltf) => {
    console.log('✅ GLB loaded successfully\n');
    
    let meshCount = 0;
    let totalVertices = 0;
    
    gltf.scene.traverse((child) => {
        if (child.isMesh) {
            meshCount++;
            const geometry = child.geometry;
            
            // Calculate bounding box
            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox;
            const width = bbox.max.x - bbox.min.x;
            const height = bbox.max.y - bbox.min.y;
            const depth = bbox.max.z - bbox.min.z;
            
            // Count vertices
            const vertexCount = geometry.attributes.position.count;
            totalVertices += vertexCount;
            
            console.log(`📊 Mesh ${meshCount}:`);
            console.log(`   - Dimensions: ${width.toFixed(2)} x ${height.toFixed(2)} x ${depth.toFixed(2)} units`);
            console.log(`   - Vertices: ${vertexCount.toLocaleString()}`);
            console.log(`   - Scale in GLTF: ${child.scale.x}, ${child.scale.y}, ${child.scale.z}`);
            console.log(`   - Effective size: ${(width * child.scale.x).toFixed(2)} x ${(height * child.scale.y).toFixed(2)} x ${(depth * child.scale.z).toFixed(2)} units\n`);
        }
    });
    
    console.log('📋 SUMMARY:');
    console.log(`   - Total meshes: ${meshCount}`);
    console.log(`   - Total vertices: ${totalVertices.toLocaleString()}`);
    console.log(`   - Scene scale: ${gltf.scene.scale.x}, ${gltf.scene.scale.y}, ${gltf.scene.scale.z}\n`);
    
    console.log('🎯 RECOMMENDATIONS:');
    console.log('   1. Your bricks are currently spaced 3 units apart');
    console.log('   2. To prevent overlap, brick width should be < 3 units');
    console.log('   3. Recommended brick size: ~2.5 units wide');
    console.log('   4. In Blender:');
    console.log('      - Scale your brick to 2.5 units (0.025m if using meters)');
    console.log('      - Apply all transforms (Ctrl+A → Apply → All Transforms)');
    console.log('      - Export with scale 1.0 (no scaling in export settings)');
    console.log('   5. For better performance, reduce vertices to < 1,000 if possible\n');
    
    URL.revokeObjectURL(url);
}, (error) => {
    console.error('❌ Error loading GLB:', error);
    URL.revokeObjectURL(url);
});
