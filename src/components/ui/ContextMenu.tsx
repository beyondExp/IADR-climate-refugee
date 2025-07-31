import React, { useState, useEffect, useRef } from 'react';

export interface ContextMenuOption {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  submenu?: ContextMenuOption[];
  action?: () => void;
}

export interface ContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  options: ContextMenuOption[];
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  visible,
  x,
  y,
  options,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [submenuState, setSubmenuState] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) {
      setSubmenuState({});
    }
  }, [visible]);

  if (!visible) return null;

  const handleOptionClick = (option: ContextMenuOption, event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (option.disabled) return;
    
    if (option.submenu) {
      setSubmenuState(prev => ({
        ...prev,
        [option.id]: !prev[option.id]
      }));
      return;
    }

    if (option.action) {
      option.action();
    }
    onClose();
  };

  const renderOption = (option: ContextMenuOption, depth = 0) => {
    if (option.separator) {
      return (
        <div
          key={`separator-${option.id}`}
          className="context-menu-separator"
        />
      );
    }

    return (
      <div key={option.id} className="context-menu-item-wrapper">
        <div
          className={`context-menu-item ${option.disabled ? 'disabled' : ''} ${depth > 0 ? 'submenu-item' : ''}`}
          onClick={(e) => handleOptionClick(option, e)}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          <div className="context-menu-item-content">
            {option.icon && (
              <span className="context-menu-icon">{option.icon}</span>
            )}
            <span className="context-menu-label">{option.label}</span>
            {option.shortcut && (
              <span className="context-menu-shortcut">{option.shortcut}</span>
            )}
            {option.submenu && (
              <span className="context-menu-arrow">▶</span>
            )}
          </div>
        </div>
        
        {option.submenu && submenuState[option.id] && (
          <div className="context-submenu">
            {option.submenu.map(subOption => renderOption(subOption, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Calculate menu position to keep it within viewport
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 200), // Prevent overflow
    top: Math.min(y, window.innerHeight - (options.length * 32)), // Prevent overflow
    zIndex: 10000,
  };

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={menuStyle}
    >
      {options.map(option => renderOption(option))}
    </div>
  );
};

export default ContextMenu; 