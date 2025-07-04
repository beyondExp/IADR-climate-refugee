import { 
  MousePointer, 
  Move, 
  RotateCw, 
  Scale, 
  Grid3X3, 
  Magnet, 
  Ruler, 
  Eye, 
  EyeOff,
  Play,
  Pause,
  Square,
  MoreHorizontal,
  Undo,
  Redo,
  Save
} from 'lucide-react';

type ToolMode = 'select' | 'move' | 'rotate' | 'scale';
type ViewMode = 'wireframe' | 'solid' | 'textured';

interface ProfessionalToolbarProps {
  activeMode?: ToolMode;
  viewMode?: ViewMode;
  isGridVisible?: boolean;
  isSnapEnabled?: boolean;
  isPlaying?: boolean;
  onModeChange?: (mode: ToolMode) => void;
  onViewModeChange?: (mode: ViewMode) => void;
  onToggleGrid?: () => void;
  onToggleSnap?: () => void;
  onAction?: (action: string) => void;
}

export default function ProfessionalToolbar({
  activeMode = 'select',
  viewMode = 'solid',
  isGridVisible = true,
  isSnapEnabled = true,
  isPlaying = false,
  onModeChange,
  onViewModeChange,
  onToggleGrid,
  onToggleSnap,
  onAction
}: ProfessionalToolbarProps) {

  const transformTools = [
    { mode: 'select' as ToolMode, icon: MousePointer, tooltip: 'Select (Q)' },
    { mode: 'move' as ToolMode, icon: Move, tooltip: 'Move (W)' },
    { mode: 'rotate' as ToolMode, icon: RotateCw, tooltip: 'Rotate (E)' },
    { mode: 'scale' as ToolMode, icon: Scale, tooltip: 'Scale (R)' }
  ];

  const viewModes = [
    { mode: 'wireframe' as ViewMode, label: 'Wire', tooltip: 'Wireframe View' },
    { mode: 'solid' as ViewMode, label: 'Solid', tooltip: 'Solid View' },
    { mode: 'textured' as ViewMode, label: 'Tex', tooltip: 'Textured View' }
  ];

  return (
    <div className="professional-toolbar">
      
      {/* File Operations */}
      <div className="toolbar-section">
        <button 
          className="toolbar-button"
          onClick={() => onAction?.('undo')}
          title="Undo (Ctrl+Z)"
        >
          <Undo className="w-4 h-4" />
        </button>
        <button 
          className="toolbar-button"
          onClick={() => onAction?.('redo')}
          title="Redo (Ctrl+Y)"
        >
          <Redo className="w-4 h-4" />
        </button>
        <button 
          className="toolbar-button"
          onClick={() => onAction?.('save')}
          title="Save (Ctrl+S)"
        >
          <Save className="w-4 h-4" />
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Transform Tools */}
      <div className="toolbar-section">
        {transformTools.map(({ mode, icon: Icon, tooltip }) => (
          <button
            key={mode}
            className={`toolbar-button ${activeMode === mode ? 'active' : ''}`}
            onClick={() => onModeChange?.(mode)}
            title={tooltip}
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      {/* Viewport Controls */}
      <div className="toolbar-section">
        <button
          className={`toolbar-button ${isGridVisible ? 'active' : ''}`}
          onClick={onToggleGrid}
          title="Toggle Grid (G)"
        >
          <Grid3X3 className="w-4 h-4" />
        </button>
        <button
          className={`toolbar-button ${isSnapEnabled ? 'active' : ''}`}
          onClick={onToggleSnap}
          title="Toggle Snap (S)"
        >
          <Magnet className="w-4 h-4" />
        </button>
        <button
          className="toolbar-button"
          onClick={() => onAction?.('measure')}
          title="Measure Tool (M)"
        >
          <Ruler className="w-4 h-4" />
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* View Modes */}
      <div className="toolbar-section">
        <div className="view-mode-selector">
          {viewModes.map(({ mode, label, tooltip }) => (
            <button
              key={mode}
              className={`view-mode-button ${viewMode === mode ? 'active' : ''}`}
              onClick={() => onViewModeChange?.(mode)}
              title={tooltip}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="toolbar-divider" />

      {/* Playback Controls */}
      <div className="toolbar-section">
        <button
          className={`toolbar-button ${isPlaying ? 'active' : ''}`}
          onClick={() => onAction?.(isPlaying ? 'pause' : 'play')}
          title={isPlaying ? 'Pause Construction' : 'Play Construction'}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          className="toolbar-button"
          onClick={() => onAction?.('stop')}
          title="Stop Construction"
        >
          <Square className="w-4 h-4" />
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Visibility Controls */}
      <div className="toolbar-section">
        <button
          className="toolbar-button"
          onClick={() => onAction?.('toggle-visibility')}
          title="Toggle Visibility"
        >
          <Eye className="w-4 h-4" />
        </button>
        <button
          className="toolbar-button"
          onClick={() => onAction?.('hide-selected')}
          title="Hide Selected"
        >
          <EyeOff className="w-4 h-4" />
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Additional Tools */}
      <div className="toolbar-section">
        <button
          className="toolbar-button"
          onClick={() => onAction?.('more-tools')}
          title="More Tools"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
} 