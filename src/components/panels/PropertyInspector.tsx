import { useState } from 'react';
import type { ReactNode } from 'react';
import DockablePanel from './DockablePanel';
import type { PanelConfig } from './DockablePanel';
import { 
  Move3D, 
  RotateCw, 
  Scale3D, 
  Palette, 
  Layers3,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  Copy,
  RefreshCw
} from 'lucide-react';

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface ObjectProperties {
  id: string;
  name: string;
  type: 'brick' | 'anchor' | 'group';
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  visible: boolean;
  locked: boolean;
  material?: string;
  color?: string;
  opacity?: number;
  metadata?: Record<string, any>;
}

interface PropertyInspectorProps {
  selectedObject?: ObjectProperties;
  isVisible?: boolean;
  onPropertyChange?: (property: string, value: any) => void;
  onClose?: () => void;
}

const panelConfig: PanelConfig = {
  id: 'property-inspector',
  title: 'Properties',
  defaultWidth: 300,
  defaultHeight: 600,
  minWidth: 250,
  resizable: true,
  closable: true,
  collapsible: true,
  pinnable: true,
  position: 'right'
};

export default function PropertyInspector({
  selectedObject,
  isVisible = true,
  onPropertyChange,
  onClose
}: PropertyInspectorProps) {
  
  const [expandedSections, setExpandedSections] = useState({
    transform: true,
    appearance: true,
    metadata: false
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleVectorChange = (property: string, axis: 'x' | 'y' | 'z', value: number) => {
    if (!selectedObject) return;
    
    const currentValue = selectedObject[property as keyof ObjectProperties] as Vector3;
    const newValue = { ...currentValue, [axis]: value };
    onPropertyChange?.(property, newValue);
  };

  const handlePropertyChange = (property: string, value: any) => {
    onPropertyChange?.(property, value);
  };

  const resetTransform = (type: 'position' | 'rotation' | 'scale') => {
    const defaultValues = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    };
    onPropertyChange?.(type, defaultValues[type]);
  };

  const copyValues = (property: string) => {
    if (!selectedObject) return;
    const value = selectedObject[property as keyof ObjectProperties];
    navigator.clipboard.writeText(JSON.stringify(value));
  };

  const renderVectorProperty = (
    label: string,
    property: string,
    value: Vector3,
    step: number = 0.1,
    icon?: ReactNode
  ) => (
    <div className="panel-section">
      <div className="panel-section-header">
        <div className="flex items-center gap-2">
          {icon}
          <span className="panel-section-title">{label}</span>
        </div>
        <div className="panel-section-actions">
          <button 
            className="panel-section-btn"
            onClick={() => copyValues(property)}
            title="Copy Values"
          >
            <Copy className="w-3 h-3" />
          </button>
          <button 
            className="panel-section-btn"
            onClick={() => resetTransform(property as any)}
            title="Reset"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>
      
      <div className="property-grid">
        {(['x', 'y', 'z'] as const).map(axis => (
          <div key={axis} className="property-row">
            <label className="property-label">{axis.toUpperCase()}</label>
            <input
              type="number"
              className="property-input"
              value={value[axis]}
              step={step}
              onChange={(e) => handleVectorChange(property, axis, parseFloat(e.target.value) || 0)}
            />
          </div>
        ))}
      </div>
    </div>
  );

  const renderCollapsibleSection = (
    title: string,
    icon: ReactNode,
    isExpanded: boolean,
    onToggle: () => void,
    children: ReactNode
  ) => (
    <div className="panel-section">
      <div 
        className="panel-section-header cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {icon}
          <span className="panel-section-title">{title}</span>
        </div>
      </div>
      
      {isExpanded && children}
    </div>
  );

  if (!selectedObject) {
    return (
      <DockablePanel config={panelConfig} isVisible={isVisible} onClose={onClose}>
        <div className="text-center text-gray-400 py-8">
          <Layers3 className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No object selected</p>
          <p className="text-xs mt-1">Select an object to edit its properties</p>
        </div>
      </DockablePanel>
    );
  }

  return (
    <DockablePanel config={panelConfig} isVisible={isVisible} onClose={onClose}>
      
      {/* Object Info */}
      <div className="panel-section">
        <div className="property-grid">
          <label className="property-label">Name</label>
          <input
            type="text"
            className="property-input"
            value={selectedObject.name}
            onChange={(e) => handlePropertyChange('name', e.target.value)}
          />
          
          <label className="property-label">Type</label>
          <div className="property-input bg-gray-700 cursor-not-allowed">
            {selectedObject.type}
          </div>
          
          <label className="property-label">ID</label>
          <div className="property-input bg-gray-700 cursor-not-allowed text-xs">
            {selectedObject.id}
          </div>
        </div>
      </div>

      {/* Visibility and Lock */}
      <div className="panel-section">
        <div className="flex gap-2">
          <button
            className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-md transition-colors ${
              selectedObject.visible 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-600 text-gray-300'
            }`}
            onClick={() => handlePropertyChange('visible', !selectedObject.visible)}
          >
            {selectedObject.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span className="text-sm">Visible</span>
          </button>
          
          <button
            className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-md transition-colors ${
              selectedObject.locked 
                ? 'bg-red-600 text-white' 
                : 'bg-gray-600 text-gray-300'
            }`}
            onClick={() => handlePropertyChange('locked', !selectedObject.locked)}
          >
            {selectedObject.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            <span className="text-sm">Locked</span>
          </button>
        </div>
      </div>

      {/* Transform Properties */}
      {renderCollapsibleSection(
        'Transform',
        <Move3D className="w-4 h-4" />,
        expandedSections.transform,
        () => toggleSection('transform'),
        <>
          {renderVectorProperty(
            'Position',
            'position',
            selectedObject.position,
            0.1,
            <Move3D className="w-4 h-4" />
          )}
          
          {renderVectorProperty(
            'Rotation',
            'rotation',
            selectedObject.rotation,
            1,
            <RotateCw className="w-4 h-4" />
          )}
          
          {renderVectorProperty(
            'Scale',
            'scale',
            selectedObject.scale,
            0.1,
            <Scale3D className="w-4 h-4" />
          )}
        </>
      )}

      {/* Appearance Properties */}
      {renderCollapsibleSection(
        'Appearance',
        <Palette className="w-4 h-4" />,
        expandedSections.appearance,
        () => toggleSection('appearance'),
        <div className="property-grid">
          {selectedObject.material && (
            <>
              <label className="property-label">Material</label>
              <select
                className="property-input"
                value={selectedObject.material}
                onChange={(e) => handlePropertyChange('material', e.target.value)}
              >
                <option value="clay-sustainable">Sustainable Clay</option>
                <option value="hemp-crete">Hemp-crete</option>
                <option value="recycled-plastic">Recycled Plastic</option>
                <option value="bamboo-fiber">Bamboo Fiber</option>
              </select>
            </>
          )}
          
          {selectedObject.color && (
            <>
              <label className="property-label">Color</label>
              <input
                type="color"
                className="property-input h-8"
                value={selectedObject.color}
                onChange={(e) => handlePropertyChange('color', e.target.value)}
              />
            </>
          )}
          
          {typeof selectedObject.opacity === 'number' && (
            <>
              <label className="property-label">Opacity</label>
              <input
                type="range"
                className="property-input"
                min="0"
                max="1"
                step="0.1"
                value={selectedObject.opacity}
                onChange={(e) => handlePropertyChange('opacity', parseFloat(e.target.value))}
              />
            </>
          )}
        </div>
      )}

      {/* Metadata */}
      {selectedObject.metadata && Object.keys(selectedObject.metadata).length > 0 && 
        renderCollapsibleSection(
          'Metadata',
          <Layers3 className="w-4 h-4" />,
          expandedSections.metadata,
          () => toggleSection('metadata'),
          <div className="property-grid">
            {Object.entries(selectedObject.metadata).map(([key, value]) => (
              <div key={key} className="property-row">
                <label className="property-label">{key}</label>
                <div className="property-input bg-gray-700 cursor-not-allowed text-xs">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </div>
              </div>
            ))}
          </div>
        )
      }
    </DockablePanel>
  );
} 