import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileIcon, 
  Settings, 
  HelpCircle, 
  Save,
  FolderOpen,
  Download,
  Upload,
  Undo,
  Redo,
  Copy,
  Scissors,
  Clipboard,
  ChevronDown,
  Building2
} from 'lucide-react';

interface MenuItem {
  label?: string;
  icon?: React.ReactNode;
  action?: () => void;
  shortcut?: string;
  submenu?: MenuItem[];
  divider?: boolean;
}

interface TopMenuBarProps {
  currentProject?: string;
  onAction?: (action: string, data?: any) => void;
}

export default function TopMenuBar({ currentProject, onAction }: TopMenuBarProps) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const menuItems: Record<string, MenuItem[]> = {
    file: [
      { label: 'New Project', icon: <FileIcon className="w-4 h-4" />, action: () => onAction?.('new-project'), shortcut: 'Ctrl+N' },
      { label: 'Open Project', icon: <FolderOpen className="w-4 h-4" />, action: () => onAction?.('open-project'), shortcut: 'Ctrl+O' },
      { label: 'Save Project', icon: <Save className="w-4 h-4" />, action: () => onAction?.('save-project'), shortcut: 'Ctrl+S' },
      { divider: true },
      { label: 'Import Model', icon: <Upload className="w-4 h-4" />, action: () => onAction?.('import-model') },
      { label: 'Export Project', icon: <Download className="w-4 h-4" />, action: () => onAction?.('export-project'), shortcut: 'Ctrl+E' },
      { divider: true },
      { label: 'Recent Projects', submenu: [
        { label: 'Climate Shelter Demo', action: () => onAction?.('open-recent', 'demo') },
        { label: 'Sustainable Housing', action: () => onAction?.('open-recent', 'housing') },
        { label: 'Emergency Shelter', action: () => onAction?.('open-recent', 'emergency') }
      ]},
    ],
    edit: [
      { label: 'Undo', icon: <Undo className="w-4 h-4" />, action: () => onAction?.('undo'), shortcut: 'Ctrl+Z' },
      { label: 'Redo', icon: <Redo className="w-4 h-4" />, action: () => onAction?.('redo'), shortcut: 'Ctrl+Y' },
      { divider: true },
      { label: 'Cut', icon: <Scissors className="w-4 h-4" />, action: () => onAction?.('cut'), shortcut: 'Ctrl+X' },
      { label: 'Copy', icon: <Copy className="w-4 h-4" />, action: () => onAction?.('copy'), shortcut: 'Ctrl+C' },
      { label: 'Paste', icon: <Clipboard className="w-4 h-4" />, action: () => onAction?.('paste'), shortcut: 'Ctrl+V' },
      { divider: true },
      { label: 'Select All', action: () => onAction?.('select-all'), shortcut: 'Ctrl+A' },
      { label: 'Deselect All', action: () => onAction?.('deselect-all'), shortcut: 'Ctrl+D' },
    ],
    view: [
      { label: 'Viewport', action: () => onAction?.('view-viewport'), shortcut: 'F11' },
      { label: 'Properties Panel', action: () => onAction?.('toggle-properties'), shortcut: 'F4' },
      { label: 'Material Library', action: () => onAction?.('toggle-materials'), shortcut: 'F3' },
      { label: 'Scene Outliner', action: () => onAction?.('toggle-outliner'), shortcut: 'F2' },
      { divider: true },
      { label: 'Fullscreen', action: () => onAction?.('fullscreen'), shortcut: 'F11' },
      { label: 'Reset Layout', action: () => onAction?.('reset-layout') },
    ],
    tools: [
      { label: 'Material Editor', action: () => onAction?.('open-material-editor') },
      { label: 'Anchor Generator', action: () => onAction?.('open-anchor-generator') },
      { label: 'QR Code Manager', action: () => onAction?.('open-qr-manager') },
      { label: 'Construction Planner', action: () => onAction?.('open-construction-planner') },
      { divider: true },
      { label: 'Climate Analysis', action: () => onAction?.('run-climate-analysis') },
      { label: 'Structural Validation', action: () => onAction?.('run-structural-validation') },
      { divider: true },
      { label: 'Preferences', icon: <Settings className="w-4 h-4" />, action: () => onAction?.('open-preferences') },
    ],
    help: [
      { label: 'Documentation', icon: <HelpCircle className="w-4 h-4" />, action: () => onAction?.('open-docs') },
      { label: 'Video Tutorials', action: () => onAction?.('open-tutorials') },
      { label: 'Keyboard Shortcuts', action: () => onAction?.('show-shortcuts'), shortcut: 'Ctrl+?' },
      { divider: true },
      { label: 'Report Bug', action: () => onAction?.('report-bug') },
      { label: 'Feature Request', action: () => onAction?.('feature-request') },
      { divider: true },
      { label: 'About Climate Refuge AR', action: () => onAction?.('about') },
    ]
  };

  const handleMenuClick = (menuKey: string) => {
    setActiveMenu(activeMenu === menuKey ? null : menuKey);
  };

  const handleMenuItemClick = (item: MenuItem) => {
    if (item.action) {
      item.action();
      setActiveMenu(null);
    }
  };

  const renderMenuItem = (item: MenuItem, index: number) => {
    if (item.divider) {
      return <hr key={index} className="my-1 border-gray-600" />;
    }

    return (
      <div
        key={index}
        className="menu-item"
        onClick={() => handleMenuItemClick(item)}
      >
        <div className="flex items-center gap-3 flex-1">
          {item.icon}
          <span>{item.label}</span>
        </div>
        
        {item.shortcut && (
          <span className="shortcut">{item.shortcut}</span>
        )}
        
        {item.submenu && (
          <ChevronDown className="w-4 h-4" />
        )}
      </div>
    );
  };

  return (
    <div className="top-menu-bar">
      {/* Logo and Project Info */}
      <div className="menu-section">
        <div className="flex items-center gap-3">
          <div className="app-icon">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="project-info">
            <span className="project-name">{currentProject || 'No Project'}</span>
          </div>
        </div>
      </div>

      {/* Main Menu Items */}
      <div className="menu-section flex items-center">
        {Object.entries(menuItems).map(([key, items]) => (
          <div key={key} className="menu-dropdown">
            <button
              className={`menu-button ${activeMenu === key ? 'active' : ''}`}
              onClick={() => handleMenuClick(key)}
            >
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </button>

            <AnimatePresence>
              {activeMenu === key && (
                <motion.div
                  className="dropdown-menu"
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  {items.map((item, index) => renderMenuItem(item, index))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* Right Section - Status and Actions */}
      <div className="menu-section">
        <div className="flex items-center gap-3">
          <div className="status-indicator">
            <div className="status-dot online"></div>
            <span className="status-text">Online</span>
          </div>
          
          <button className="icon-button" onClick={() => onAction?.('open-settings')}>
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Overlay to close menu when clicking outside */}
      {activeMenu && (
        <div
          className="menu-overlay"
          onClick={() => setActiveMenu(null)}
        />
      )}
    </div>
  );
} 