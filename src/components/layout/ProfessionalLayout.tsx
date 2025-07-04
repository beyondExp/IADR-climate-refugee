import { type ReactNode, useState } from 'react';
import TopMenuBar from './TopMenuBar';
import ProfessionalToolbar from './ProfessionalToolbar';
import BreadcrumbNav from './BreadcrumbNav';
import StatusBar from './StatusBar';
import { Home, FolderOpen, FileText } from 'lucide-react';

interface ProfessionalLayoutProps {
  children: ReactNode;
  currentProject?: string;
  currentMode?: 'creator' | 'viewer';
  onNavigate?: (path: string) => void;
  onAction?: (action: string, data?: any) => void;
}

export default function ProfessionalLayout({
  children,
  currentProject = 'Climate Shelter Demo',
  currentMode = 'creator',
  onNavigate,
  onAction
}: ProfessionalLayoutProps) {
  
  const [toolMode, setToolMode] = useState<'select' | 'move' | 'rotate' | 'scale'>('select');
  const [viewMode, setViewMode] = useState<'wireframe' | 'solid' | 'textured'>('solid');
  const [isGridVisible, setIsGridVisible] = useState(true);
  const [isSnapEnabled, setIsSnapEnabled] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  // Mock real-time data
  const [statusData] = useState({
    fps: 58,
    memoryUsage: 42,
    renderTime: 17.2,
    isOnline: true,
    constructionProgress: 0,
    selectedObjects: 2,
    totalObjects: 47,
    activeUsers: 1
  });

  // Breadcrumb items based on current mode
  const breadcrumbItems = [
    { 
      label: 'Home', 
      icon: <Home className="w-4 h-4" />, 
      path: '/',
      action: () => { onNavigate?.('/'); }
    },
    { 
      label: 'Projects', 
      icon: <FolderOpen className="w-4 h-4" />, 
      path: '/projects' 
    },
    { 
      label: currentProject, 
      icon: <FileText className="w-4 h-4" /> 
    }
  ];

  if (currentMode === 'creator') {
    breadcrumbItems.push({ 
      label: 'Creator', 
      icon: <FileText className="w-4 h-4" />,
      path: '/creator' 
    });
  } else {
    breadcrumbItems.push({ 
      label: 'AR Viewer', 
      icon: <FileText className="w-4 h-4" />,
      path: '/viewer' 
    });
  }

  const handleMenuAction = (action: string, data?: any) => {
    console.log('Menu action:', action, data);
    
    switch (action) {
      case 'new-project':
        onAction?.('new-project');
        break;
      case 'save-project':
        onAction?.('save-project');
        break;
      case 'toggle-properties':
        onAction?.('toggle-panel', { panel: 'properties' });
        break;
      case 'toggle-materials':
        onAction?.('toggle-panel', { panel: 'materials' });
        break;
      case 'toggle-outliner':
        onAction?.('toggle-panel', { panel: 'outliner' });
        break;
      case 'fullscreen':
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen();
        }
        break;
      default:
        onAction?.(action, data);
    }
  };

  const handleToolbarAction = (action: string) => {
    console.log('Toolbar action:', action);
    
    switch (action) {
      case 'play':
        setIsPlaying(true);
        onAction?.('start-construction');
        break;
      case 'pause':
        setIsPlaying(false);
        onAction?.('pause-construction');
        break;
      case 'stop':
        setIsPlaying(false);
        onAction?.('stop-construction');
        break;
      default:
        onAction?.(action);
    }
  };

  return (
    <div className="professional-layout">
      {/* Top Menu Bar */}
      <TopMenuBar 
        currentProject={currentProject}
        onAction={handleMenuAction}
      />

      {/* Professional Toolbar */}
      <ProfessionalToolbar
        activeMode={toolMode}
        viewMode={viewMode}
        isGridVisible={isGridVisible}
        isSnapEnabled={isSnapEnabled}
        isPlaying={isPlaying}
        onModeChange={setToolMode}
        onViewModeChange={setViewMode}
        onToggleGrid={() => setIsGridVisible(!isGridVisible)}
        onToggleSnap={() => setIsSnapEnabled(!isSnapEnabled)}
        onAction={handleToolbarAction}
      />

      {/* Breadcrumb Navigation */}
      <BreadcrumbNav 
        items={breadcrumbItems}
        onNavigate={onNavigate}
      />

      {/* Main Content Area */}
      <div className="content-area">
        {children}
      </div>

      {/* Status Bar */}
      <StatusBar {...statusData} />
    </div>
  );
} 