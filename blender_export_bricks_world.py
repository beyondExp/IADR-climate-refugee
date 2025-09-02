import bpy
import json
import math

# Get selected objects (or all objects matching a pattern)
selected_objects = bpy.context.selected_objects

# Filter for brick objects if needed
brick_objects = [obj for obj in selected_objects if 'brick' in obj.name.lower()]

print(f"=== STARTING BRICK EXPORT ===")
print(f"Found {len(brick_objects)} selected objects")

brick_data = []

for obj in brick_objects:
    # Get the world matrix
    world_matrix = obj.matrix_world
    
    # Extract world position
    world_location = world_matrix.translation
    
    # Extract world rotation (as Euler angles in degrees)
    world_rotation = world_matrix.to_euler()
    
    # Extract world scale
    world_scale = world_matrix.to_scale()
    
    # Also get decomposed matrix values for verification
    loc, rot, scale = world_matrix.decompose()
    
    brick_info = {
        "name": obj.name,
        "position": [
            round(world_location.x, 3),
            round(world_location.y, 3),
            round(world_location.z, 3)
        ],
        "rotation": [
            round(math.degrees(world_rotation.x), 3),
            round(math.degrees(world_rotation.y), 3),
            round(math.degrees(world_rotation.z), 3)
        ],
        "rotation_quaternion": [
            round(rot.w, 3),
            round(rot.x, 3),
            round(rot.y, 3),
            round(rot.z, 3)
        ],
        "scale": [
            round(world_scale.x, 3),
            round(world_scale.y, 3),
            round(world_scale.z, 3)
        ],
        "local_rotation": [
            round(math.degrees(obj.rotation_euler.x), 3),
            round(math.degrees(obj.rotation_euler.y), 3),
            round(math.degrees(obj.rotation_euler.z), 3)
        ]
    }
    
    brick_data.append(brick_info)
    print(f"Added: {obj.name}")
    
    # Print if there's a difference between local and world rotation
    if (abs(world_rotation.x - obj.rotation_euler.x) > 0.001 or 
        abs(world_rotation.y - obj.rotation_euler.y) > 0.001 or 
        abs(world_rotation.z - obj.rotation_euler.z) > 0.001):
        print(f"  → World rotation differs from local: World={brick_info['rotation']}, Local={brick_info['local_rotation']}")

# Sort by name for consistent output
brick_data.sort(key=lambda x: x['name'])

# Output as JSON
print("\n=== JSON OUTPUT ===")
print(json.dumps(brick_data, indent=2))
print("=== END ===")

# Also copy to clipboard if possible
try:
    bpy.context.window_manager.clipboard = json.dumps(brick_data, indent=2)
    print("\n✓ JSON copied to clipboard!")
except:
    print("\n✗ Could not copy to clipboard")

