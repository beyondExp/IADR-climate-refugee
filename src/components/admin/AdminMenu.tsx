import React, { useState } from 'react';
import { Settings, ChevronDown, Wrench, TestTube2, Shield } from 'lucide-react';

interface AdminMenuProps {
  onNavigateToAdmin?: (path: string) => void;
  userRole?: 'admin' | 'user';
  className?: string;
}

export default function AdminMenu({ 
  onNavigateToAdmin, 
  userRole = 'user',
  className = ''
}: AdminMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Only show admin menu for admin users
  if (userRole !== 'admin') {
    return null;
  }

  const menuItems = [
    {
      id: 'overview',
      label: 'Admin Overview',
      icon: Settings,
      path: '/admin',
      description: 'System dashboard and overview'
    },
    {
      id: 'connection-editor', 
      label: 'Connection Editor',
      icon: Wrench,
      path: '/admin/connection-editor',
      description: 'Edit brick connection points'
    },
    {
      id: 'connection-demo',
      label: 'Connection Demo', 
      icon: TestTube2,
      path: '/admin/connection-demo',
      description: 'Test brick connections'
    }
  ];

  const handleItemClick = (path: string) => {
    onNavigateToAdmin?.(path);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      {/* Admin Menu Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg transition-colors text-sm"
        title="Admin Tools"
      >
        <Shield className="w-4 h-4 text-red-400" />
        <span className="text-gray-300">Admin</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${
          isOpen ? 'rotate-180' : ''
        }`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Menu Content */}
          <div className="absolute top-full left-0 mt-2 w-80 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-50">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-400" />
                <h3 className="font-semibold text-white">Admin Tools</h3>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Brick connection system configuration
              </p>
            </div>

            {/* Menu Items */}
            <div className="py-2">
              {menuItems.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item.path)}
                    className="w-full px-4 py-3 hover:bg-gray-700 transition-colors text-left group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-gray-700 group-hover:bg-gray-600 rounded-lg flex items-center justify-center mt-0.5">
                        <Icon className="w-4 h-4 text-gray-400 group-hover:text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white group-hover:text-green-400">
                          {item.label}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {item.description}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-700 bg-gray-900/50">
              <div className="text-xs text-gray-500">
                ⚠️ Admin tools modify the brick connection system
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Simple admin access checker component
export function AdminGuard({ 
  children, 
  userRole = 'user',
  fallback = null 
}: {
  children: React.ReactNode;
  userRole?: 'admin' | 'user';
  fallback?: React.ReactNode;
}) {
  if (userRole !== 'admin') {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}

// Hook for admin navigation
export function useAdminNavigation() {
  const navigateToAdmin = (path: string) => {
    // This would integrate with your router
    // For now, just log the navigation intent
    console.log(`🔧 Admin Navigation: ${path}`);
    
    // You could replace this with your actual navigation method:
    // navigate(path);
    // or window.location.href = path;
    // or trigger your app's routing system
  };

  return { navigateToAdmin };
}