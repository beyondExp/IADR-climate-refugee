import { useState } from 'react';
import ProfessionalLayout from './layout/ProfessionalLayout';
import Viewport3D from './viewport/Viewport3D';
import PropertyInspector from './panels/PropertyInspector';
import SceneOutliner from './panels/SceneOutliner';
import MaterialLibrary from './panels/MaterialLibrary';

interface ProfessionalCreatorInterfaceProps {
  onBack?: () => void;
}

interface SceneObject {
  id: string;
  name: string;
  type: 'brick' | 'anchor' | 'group';
  visible: boolean;
  locked: boolean;
  children?: SceneObject[];
}

interface ObjectProperties {
  id: string;
  name: string;
  type: 'brick' | 'anchor' | 'group';
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  visible: boolean;
  locked: boolean;
  material?: string;
  color?: string;
  opacity?: number;
  metadata?: Record<string, any>;
}

export default function ProfessionalCreatorInterface({ onBack }: ProfessionalCreatorInterfaceProps) {
  // Panel visibility state
  const [panelVisibility, setPanelVisibility] = useState({
    properties: true,
    outliner: true,
    materials: true
  });

  // Viewport settings
  const [viewportSettings, setViewportSettings] = useState({
    gridVisible: true,
    snapEnabled: true,
    viewMode: 'solid' as 'wireframe' | 'solid' | 'textured'
  });

  // Selection state
  const [selectedObjects, setSelectedObjects] = useState<string[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<string>('clay-sustainable');

  // Scene state - Demo scene with some objects
  const [sceneObjects] = useState<SceneObject[]>([
    {
      id: 'brick-0',
      name: 'Foundation Brick 1',
      type: 'brick',
      visible: true,
      locked: false
    },
    {
      id: 'brick-1', 
      name: 'Foundation Brick 2',
      type: 'brick',
      visible: true,
      locked: false
    },
    {
      id: 'brick-2',
      name: 'Foundation Brick 3', 
      type: 'brick',
      visible: true,
      locked: false
    },
    {
      id: 'brick-3',
      name: 'Wall Brick 1',
      type: 'brick',
      visible: true,
      locked: false
    },
    {
      id: 'brick-4',
      name: 'Wall Brick 2',
      type: 'brick',
      visible: true,
      locked: false
    },
    {
      id: 'brick-5',
      name: 'Cap Brick',
      type: 'brick',
      visible: true,
      locked: false
    },
    {
      id: 'anchor-foundation',
      name: 'Foundation Anchor',
      type: 'anchor',
      visible: true,
      locked: false
    }
  ]);

  // Current selection properties
  const selectedObjectProperties: ObjectProperties | undefined = selectedObjects.length === 1 ? {
    id: selectedObjects[0],
    name: sceneObjects.find(obj => obj.id === selectedObjects[0])?.name || 'Unknown',
    type: sceneObjects.find(obj => obj.id === selectedObjects[0])?.type || 'brick',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: sceneObjects.find(obj => obj.id === selectedObjects[0])?.visible || true,
    locked: sceneObjects.find(obj => obj.id === selectedObjects[0])?.locked || false,
    material: selectedMaterial,
    color: '#8B4513',
    opacity: 1.0,
    metadata: {
      brickType: selectedMaterial,
      sustainability: 'High',
      thermalRating: '4/5'
    }
  } : undefined;

  const handleLayoutAction = (action: string, data?: any) => {
    console.log('Layout action:', action, data);
    
    switch (action) {
      case 'toggle-panel':
        setPanelVisibility(prev => ({
          ...prev,
          [data.panel]: !prev[data.panel as keyof typeof prev]
        }));
        break;
      case 'new-project':
        console.log('Creating new project...');
        break;
      case 'save-project':
        console.log('Saving project...');
        break;
      case 'toggle-grid':
        setViewportSettings(prev => ({
          ...prev,
          gridVisible: !prev.gridVisible
        }));
        break;
      case 'toggle-snap':
        setViewportSettings(prev => ({
          ...prev,
          snapEnabled: !prev.snapEnabled
        }));
        break;
      case 'start-construction':
        console.log('Starting construction animation...');
        break;
      case 'pause-construction':
        console.log('Pausing construction...');
        break;
      case 'stop-construction':
        console.log('Stopping construction...');
        break;
      default:
        console.log('Unhandled action:', action);
    }
  };

  const handleSelectionChange = (selection: string[]) => {
    setSelectedObjects(selection);
  };

  const handleObjectSelect = (objectId: string, multiSelect = false) => {
    if (multiSelect) {
      setSelectedObjects(prev => 
        prev.includes(objectId) 
          ? prev.filter(id => id !== objectId)
          : [...prev, objectId]
      );
    } else {
      setSelectedObjects([objectId]);
    }
  };

  const handleObjectToggleVisibility = (objectId: string) => {
    console.log('Toggle visibility for:', objectId);
    // In a real implementation, this would update the scene
  };

  const handleObjectToggleLock = (objectId: string) => {
    console.log('Toggle lock for:', objectId);
    // In a real implementation, this would update the scene
  };

  const handleCreateGroup = (objectIds: string[]) => {
    console.log('Creating group from objects:', objectIds);
    // In a real implementation, this would create a group in the scene
  };

  const handlePropertyChange = (property: string, value: any) => {
    console.log('Property change:', property, value);
    // In a real implementation, this would update the selected object
  };

  const handleMaterialSelect = (materialId: string) => {
    setSelectedMaterial(materialId);
    console.log('Selected material:', materialId);
  };

  const handleNavigate = (path: string) => {
    if (path === '/') {
      onBack?.();
    }
  };

  return (
    <ProfessionalLayout
      currentProject="Climate Shelter Demo"
      currentMode="creator"
      onNavigate={handleNavigate}
      onAction={handleLayoutAction}
    >
      <div className="flex h-full">
        
        {/* Left Panel - Scene Outliner */}
        {panelVisibility.outliner && (
          <div className="w-80 border-r border-gray-600 flex-shrink-0">
            <SceneOutliner
              objects={sceneObjects}
              selectedObjects={selectedObjects}
              onObjectSelect={handleObjectSelect}
              onObjectToggleVisibility={handleObjectToggleVisibility}
              onObjectToggleLock={handleObjectToggleLock}
              onCreateGroup={handleCreateGroup}
            />
          </div>
        )}

        {/* Center - 3D Viewport */}
        <div className="flex-1 relative">
          <Viewport3D
            onSelectionChange={handleSelectionChange}
            gridVisible={viewportSettings.gridVisible}
            snapEnabled={viewportSettings.snapEnabled}
            viewMode={viewportSettings.viewMode}
          />
        </div>

        {/* Right Panels */}
        <div className="w-96 border-l border-gray-600 flex flex-col">
          
          {/* Property Inspector */}
          {panelVisibility.properties && (
            <div className="flex-1 border-b border-gray-600">
              <PropertyInspector
                selectedObject={selectedObjectProperties}
                onPropertyChange={handlePropertyChange}
              />
            </div>
          )}

          {/* Material Library */}
          {panelVisibility.materials && (
            <div className="flex-1">
              <MaterialLibrary
                selectedMaterial={selectedMaterial}
                onMaterialSelect={handleMaterialSelect}
                onMaterialDownload={(materialId) => console.log('Download material:', materialId)}
                onMaterialFavorite={(materialId) => console.log('Favorite material:', materialId)}
              />
            </div>
          )}
        </div>
      </div>
    </ProfessionalLayout>
  );
} 