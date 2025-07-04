import { useState } from 'react';
import type { ReactNode } from 'react';
import DockablePanel from './DockablePanel';
import type { PanelConfig } from './DockablePanel';
import { 
  Search,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Box,
  MapPin,
  Layers,
  Plus,
  MoreHorizontal,
  Filter
} from 'lucide-react';

interface SceneObject {
  id: string;
  name: string;
  type: 'brick' | 'anchor' | 'group' | 'light' | 'camera';
  visible: boolean;
  locked: boolean;
  children?: SceneObject[];
  parent?: string;
}

interface SceneOutlinerProps {
  objects: SceneObject[];
  selectedObjects: string[];
  isVisible?: boolean;
  onObjectSelect?: (objectId: string, multiSelect?: boolean) => void;
  onObjectToggleVisibility?: (objectId: string) => void;
  onObjectToggleLock?: (objectId: string) => void;
  onCreateGroup?: (objectIds: string[]) => void;
  onClose?: () => void;
}

const panelConfig: PanelConfig = {
  id: 'scene-outliner',
  title: 'Scene Outliner',
  defaultWidth: 280,
  defaultHeight: 500,
  minWidth: 220,
  resizable: true,
  closable: true,
  collapsible: true,
  pinnable: true,
  position: 'left'
};

export default function SceneOutliner({
  objects,
  selectedObjects,
  isVisible = true,
  onObjectSelect,
  onObjectToggleVisibility,
  onObjectToggleLock,
  onCreateGroup,
  onClose
}: SceneOutlinerProps) {
  
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedObjects, setExpandedObjects] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<'all' | 'visible' | 'locked' | 'brick' | 'anchor'>('all');

  const toggleExpanded = (objectId: string) => {
    setExpandedObjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(objectId)) {
        newSet.delete(objectId);
      } else {
        newSet.add(objectId);
      }
      return newSet;
    });
  };

  const getObjectIcon = (type: string) => {
    switch (type) {
      case 'brick': return <Box className="w-4 h-4" />;
      case 'anchor': return <MapPin className="w-4 h-4" />;
      case 'group': return <Layers className="w-4 h-4" />;
      default: return <Box className="w-4 h-4" />;
    }
  };

  const filterObjects = (objects: SceneObject[]): SceneObject[] => {
    return objects.filter(obj => {
      // Search filter
      if (searchTerm && !obj.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      
      // Type filter
      switch (filterType) {
        case 'visible': return obj.visible;
        case 'locked': return obj.locked;
        case 'brick': return obj.type === 'brick';
        case 'anchor': return obj.type === 'anchor';
        default: return true;
      }
    });
  };

  const handleObjectClick = (objectId: string, event: React.MouseEvent) => {
    const multiSelect = event.ctrlKey || event.metaKey;
    onObjectSelect?.(objectId, multiSelect);
  };

  const renderObjectItem = (obj: SceneObject, level: number = 0): ReactNode => {
    const isSelected = selectedObjects.includes(obj.id);
    const isExpanded = expandedObjects.has(obj.id);
    const hasChildren = obj.children && obj.children.length > 0;

    return (
      <div key={obj.id} className="tree-item-container">
        <div
          className={`tree-item ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${level * 1}rem` }}
          onClick={(e) => handleObjectClick(obj.id, e)}
        >
          {/* Expand/Collapse Button */}
          <div className="tree-expand-area" onClick={(e) => e.stopPropagation()}>
            {hasChildren ? (
              <button
                className="tree-expand-btn"
                onClick={() => toggleExpanded(obj.id)}
              >
                {isExpanded ? 
                  <ChevronDown className="w-3 h-3 tree-expand-icon" /> : 
                  <ChevronRight className="w-3 h-3 tree-expand-icon" />
                }
              </button>
            ) : (
              <div className="w-3 h-3" />
            )}
          </div>

          {/* Object Icon */}
          <div className="tree-icon">
            {getObjectIcon(obj.type)}
          </div>

          {/* Object Name */}
          <span className="tree-label flex-1">{obj.name}</span>

          {/* Object Controls */}
          <div className="tree-controls" onClick={(e) => e.stopPropagation()}>
            <button
              className={`tree-control-btn ${obj.visible ? 'active' : ''}`}
              onClick={() => onObjectToggleVisibility?.(obj.id)}
              title={obj.visible ? 'Hide Object' : 'Show Object'}
            >
              {obj.visible ? 
                <Eye className="w-3 h-3" /> : 
                <EyeOff className="w-3 h-3 opacity-50" />
              }
            </button>
            
            <button
              className={`tree-control-btn ${obj.locked ? 'active' : ''}`}
              onClick={() => onObjectToggleLock?.(obj.id)}
              title={obj.locked ? 'Unlock Object' : 'Lock Object'}
            >
              {obj.locked ? 
                <Lock className="w-3 h-3" /> : 
                <Unlock className="w-3 h-3 opacity-50" />
              }
            </button>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="tree-children">
            {obj.children!.map(child => renderObjectItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const filteredObjects = filterObjects(objects);

  return (
    <DockablePanel config={panelConfig} isVisible={isVisible} onClose={onClose}>
      
      {/* Search and Filter */}
      <div className="panel-section">
        <div className="panel-search">
          <Search className="w-4 h-4 panel-search-icon" />
          <input
            type="text"
            className="panel-search-input"
            placeholder="Search objects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex gap-2 mt-3">
          <select
            className="flex-1 text-xs bg-gray-700 border border-gray-600 rounded-md p-1 text-white"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
          >
            <option value="all">All Objects</option>
            <option value="visible">Visible Only</option>
            <option value="locked">Locked Only</option>
            <option value="brick">Bricks Only</option>
            <option value="anchor">Anchors Only</option>
          </select>
          
          <button
            className="p-1 bg-gray-700 border border-gray-600 rounded-md hover:bg-gray-600 transition-colors"
            title="Filter Options"
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Object Count */}
      <div className="panel-section">
        <div className="text-xs text-gray-400 mb-2">
          {filteredObjects.length} objects • {selectedObjects.length} selected
        </div>
      </div>

      {/* Scene Tree */}
      <div className="panel-section flex-1 min-h-0">
        <div className="tree-view overflow-auto h-full">
          {filteredObjects.length > 0 ? (
            filteredObjects.map(obj => renderObjectItem(obj))
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Layers className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No objects in scene</p>
              {searchTerm && (
                <p className="text-xs mt-1">Try adjusting your search</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="panel-section border-t border-gray-600 pt-3">
        <div className="flex gap-2">
          <button
            className="flex-1 flex items-center justify-center gap-2 p-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white text-xs transition-colors"
            onClick={() => onCreateGroup?.(selectedObjects)}
            disabled={selectedObjects.length < 2}
            title="Create Group from Selected"
          >
            <Plus className="w-3 h-3" />
            Group
          </button>
          
          <button
            className="p-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
            title="More Actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
    </DockablePanel>
  );
} 