# Brick Building Generation Plan

## Current Status ✅
1. Basic brick building generation function implemented
2. UI button added in building mode
3. ~~Simple grid-based brick placement working~~
4. **Mesh-aware surface detection with raycasting implemented!**
5. Bricks now follow the actual form surface, not just bounding box

## Next Steps 🚀

### Phase 1: Connection-Aware Placement ✅
- [x] Add connection mode state
- [x] Load brick connection configurations
- [x] Basic connection-aware placement
- [x] Analyze brick dimensions from connection points
- [x] Only place bricks on outer shell

### Phase 2: Proper Voxelization ✅
- [x] Implement proper voxelization algorithm
- [x] Extract surface voxels only
- [x] Convert voxels to bricks
- [x] Preserve original mesh form accurately

### Phase 3: Form Preservation ✅
- [x] Add raycasting to detect form boundaries
- [x] Implement surface detection for brick placement
- [x] Only place bricks on the shell/surface
- [x] Maintain original form shape
- [x] Handle cavities, bridges, and overhangs in Z-axis
- [x] Hybrid approach: triangle sampling + voxel scanning
- [x] Complete coverage of walls and roofs

### Phase 4: Connection System ✅
- [x] Implement angle constraint system (±5° tolerance)
- [x] Improve rotation logic for male/female alignment
- [x] Add intersection detection and prevention
- [x] Debug output for rotation patterns and intersections
- [x] Smart rotation based on brick position (edge/corner/interior)

### Phase 5: Optimization
- [ ] Minimize brick count while maintaining structure
- [ ] Add windows and door openings
- [ ] Optimize connection searching
- [ ] Fine-tune connection angles for better interlocking

### Phase 6: Polish
- [ ] Add cloth wrap option checkbox
- [ ] Visual feedback during generation
- [ ] Progress indicator
- [ ] Better error handling

## Key Functions to Implement

1. **Connection System**
   ```typescript
   - connectionMode: boolean
   - connectionConfigs: Record<string, ConnectionConfig>
   - findBestConnectionPoint()
   - calculateConnectedPosition()
   - findSnapPosition()
   ```

2. **Building Algorithm**
   ```typescript
   - Layer-by-layer placement
   - Surface detection
   - Connection validation
   - Form boundary checking
   ```

## Testing Checklist
- [ ] Works with simple box form
- [ ] Works with complex merged forms
- [ ] Bricks connect properly
- [ ] Form shape is preserved
- [ ] No floating/disconnected bricks
