import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Minimize2, 
  Maximize2, 
  X, 
  GripVertical,
  MoreVertical,
  Pin,
  PinOff
} from 'lucide-react';

export interface PanelConfig {
  id: string;
  title: string;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  resizable?: boolean;
  closable?: boolean;
  collapsible?: boolean;
  pinnable?: boolean;
  position?: 'left' | 'right' | 'bottom' | 'floating';
}

interface DockablePanelProps {
  config: PanelConfig;
  children: ReactNode;
  isVisible?: boolean;
  isCollapsed?: boolean;
  isPinned?: boolean;
  onClose?: () => void;
  onCollapse?: (collapsed: boolean) => void;
  onPin?: (pinned: boolean) => void;
  onResize?: (width: number, height: number) => void;
}

export default function DockablePanel({
  config,
  children,
  isVisible = true,
  isCollapsed = false,
  isPinned = false,
  onClose,
  onCollapse,
  onPin,
  onResize
}: DockablePanelProps) {
  
  const [dimensions, setDimensions] = useState({
    width: config.defaultWidth || 300,
    height: config.defaultHeight || 400
  });
  
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);

  // Handle resizing
  useEffect(() => {
    if (!config.resizable) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !panelRef.current) return;

      const rect = panelRef.current.getBoundingClientRect();
      const newWidth = Math.max(
        config.minWidth || 200,
        Math.min(config.maxWidth || 600, e.clientX - rect.left)
      );
      const newHeight = Math.max(
        config.minHeight || 200,
        Math.min(config.maxHeight || 800, e.clientY - rect.top)
      );

      setDimensions({ width: newWidth, height: newHeight });
      onResize?.(newWidth, newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, config, onResize]);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={panelRef}
        className={`dockable-panel ${config.position || 'floating'} ${isCollapsed ? 'collapsed' : ''} ${isPinned ? 'pinned' : ''}`}
        style={{
          width: isCollapsed ? 'auto' : dimensions.width,
          height: isCollapsed ? 'auto' : dimensions.height
        }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {/* Panel Header */}
        <div className="panel-header">
          <div className="panel-title-section">
            <GripVertical className="w-4 h-4 panel-grip" />
            <span className="panel-title">{config.title}</span>
          </div>
          
          <div className="panel-controls">
            {config.pinnable && (
              <button
                className={`panel-control-btn ${isPinned ? 'active' : ''}`}
                onClick={() => onPin?.(!isPinned)}
                title={isPinned ? 'Unpin Panel' : 'Pin Panel'}
              >
                {isPinned ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
              </button>
            )}
            
            {config.collapsible && (
              <button
                className="panel-control-btn"
                onClick={() => onCollapse?.(!isCollapsed)}
                title={isCollapsed ? 'Expand Panel' : 'Collapse Panel'}
              >
                {isCollapsed ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
              </button>
            )}
            
            <button
              className="panel-control-btn"
              title="Panel Options"
            >
              <MoreVertical className="w-3 h-3" />
            </button>
            
            {config.closable && (
              <button
                className="panel-control-btn close"
                onClick={onClose}
                title="Close Panel"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Panel Content */}
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              className="panel-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Resize Handle */}
        {config.resizable && !isCollapsed && (
          <div
            ref={resizeHandleRef}
            className="resize-handle"
            onMouseDown={() => setIsResizing(true)}
          >
            <div className="resize-indicator" />
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
} 