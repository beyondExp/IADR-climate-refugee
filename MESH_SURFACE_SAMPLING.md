# Mesh Surface Sampling Approach

## Problem with Current Voxelization
- Creates a cube instead of following the form
- Raycasting isn't accurately detecting the mesh surface
- Too many false positives creating filled cubes

## New Approach: Direct Surface Sampling

### Method 1: Triangle-based Sampling
1. Iterate through all triangles in the mesh
2. Sample points uniformly on each triangle
3. Place bricks at sampled points

### Method 2: Vertex + Normal Projection
1. Use mesh vertices as base points
2. Project along normals to find surface
3. Fill gaps between vertices

### Method 3: Grid Projection (Recommended)
1. Create a 3D grid around the mesh
2. For each grid point, find nearest point on mesh surface
3. If distance < threshold, place a brick there

## Implementation Plan

```javascript
// Get mesh triangles
const positions = geometry.attributes.position;
const indices = geometry.index;

// Sample points on triangles
for (let i = 0; i < indices.count; i += 3) {
  const a = getVertex(indices[i]);
  const b = getVertex(indices[i+1]);
  const c = getVertex(indices[i+2]);
  
  // Sample points on this triangle
  const samples = sampleTriangle(a, b, c, density);
  
  // Place bricks at samples
  samples.forEach(point => placeBrick(point));
}
```

## Advantages
- Guaranteed to follow mesh surface
- No false positives
- Works with any mesh shape
- More efficient than voxelization

