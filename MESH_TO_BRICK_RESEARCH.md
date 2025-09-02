# Mesh to Brick Building Research

## Problem
Current implementation only uses bounding box, creating rectangular structures that don't follow the original mesh form.

## Best Approaches from Research

### 1. **Voxelization + Surface Extraction**
Most reliable approach for complex meshes:
- Convert mesh to voxel grid
- Extract only surface voxels
- Replace surface voxels with bricks

**Pros:**
- Handles any mesh complexity
- Preserves form accurately
- Can control resolution

**Cons:**
- Memory intensive for high resolution
- May need optimization for large meshes

### 2. **Ray Casting / Mesh Sampling**
Direct approach using Three.js capabilities:
- Sample points on mesh surface
- Use raycasting to determine inside/outside
- Place bricks at sampled locations

**Pros:**
- Memory efficient
- Works directly with mesh
- Good for organic shapes

**Cons:**
- Complex to ensure brick connectivity
- Harder to maintain regular patterns

### 3. **Mesh Surface Walking**
Traverse mesh faces directly:
- Walk along mesh triangles
- Place bricks at regular intervals
- Align to surface normals

**Pros:**
- Perfect surface following
- Efficient for simple meshes
- Natural brick orientation

**Cons:**
- Complex implementation
- Difficult for concave shapes

## Recommended Implementation for Three.js

### Phase 1: Basic Voxelization
```javascript
// 1. Create voxel grid from mesh
const voxelSize = brickWidth; // Match brick dimensions
const voxels = voxelizeMesh(geometry, voxelSize);

// 2. Extract surface voxels
const surfaceVoxels = extractSurfaceVoxels(voxels);

// 3. Convert to bricks
const bricks = surfaceVoxels.map(voxel => createBrick(voxel));
```

### Phase 2: Raycasting Approach
```javascript
// 1. Create grid of test points
const gridPoints = createGrid(bounds, brickSize);

// 2. Test each point with raycasting
const surfacePoints = gridPoints.filter(point => {
  // Cast ray from outside to point
  const intersections = raycaster.intersectObject(mesh);
  return isOnSurface(intersections);
});

// 3. Place bricks at surface points
```

### Phase 3: Hybrid Approach (Recommended)
Combine voxelization with raycasting:
1. Low-res voxelization for general structure
2. Raycasting for precise surface detection
3. Connection-aware placement

## Implementation Strategy

### Step 1: Simple Voxelization
- Create 3D grid encompassing mesh
- Test center of each voxel against mesh
- Mark voxels as inside/outside/surface

### Step 2: Surface Detection
- For each voxel, check neighbors
- If has both inside and outside neighbors = surface
- Alternative: raycast from voxel center

### Step 3: Brick Placement
- Place bricks only at surface voxels
- Use connection logic for proper alignment
- Optimize by merging adjacent bricks

## Three.js Specific Tools

1. **BufferGeometry.computeBoundingBox()** - Get mesh bounds
2. **Raycaster** - Test point-mesh intersection
3. **Mesh.geometry.index** - Access face data
4. **Vector3.distanceTo()** - Distance calculations
5. **Box3.containsPoint()** - Point-in-box tests

## Code Example: Basic Surface Detection

```javascript
function isPointOnMeshSurface(point, mesh, threshold = 0.1) {
  const raycaster = new THREE.Raycaster();
  const directions = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1)
  ];
  
  let insideCount = 0;
  let outsideCount = 0;
  
  for (const dir of directions) {
    raycaster.set(point, dir);
    const intersections = raycaster.intersectObject(mesh);
    
    if (intersections.length > 0 && intersections[0].distance < threshold) {
      insideCount++;
    } else {
      outsideCount++;
    }
  }
  
  // Surface if has both inside and outside neighbors
  return insideCount > 0 && outsideCount > 0;
}
```

## Next Steps
1. Implement basic voxelization
2. Add surface detection
3. Integrate with connection system
4. Optimize for performance
5. Add form complexity handling

