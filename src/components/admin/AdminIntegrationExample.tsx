/**
 * Example integration of Admin Tools with existing Creator Interface
 * This shows how to add the admin menu to your existing components
 */

// import React from 'react';
import AdminMenu from './AdminMenu';
import { useAdminIntegration } from '../../utils/adminIntegration';

// Example: Enhanced Creator Interface with Admin Tools
interface EnhancedCreatorWithAdminProps {
  onBack?: () => void;
  user?: any; // Your user object
}

export function EnhancedCreatorWithAdmin({ user }: EnhancedCreatorWithAdminProps) {
  const { config, navigate, hasAdminAccess } = useAdminIntegration(user);

  return (
    <div className="enhanced-creator-with-admin">
      {/* Header with Admin Menu */}
      <div className="creator-header bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-green-400">
              🏗️ Climate Shelter Creator
            </h1>
            {/* Add other header content */}
          </div>
          
          {/* Admin Menu - Only shows for admin users */}
          {hasAdminAccess() && (
            <AdminMenu
              userRole={config.userRole}
              onNavigateToAdmin={navigate}
              className="ml-4"
            />
          )}
        </div>
      </div>

      {/* Rest of your creator interface */}
      <div className="creator-content">
        {/* Your existing creator content goes here */}
        <div className="p-4 text-gray-300">
          <p>Your existing Enhanced Creator Interface content...</p>
          {hasAdminAccess() && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-700 rounded">
              <p className="text-red-300 text-sm">
                🔧 Admin mode active - Advanced tools available
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Example: Adding admin menu to toolbar
export function CreatorToolbarWithAdmin({ user }: { user?: any }) {
  const { config, navigate } = useAdminIntegration(user);

  return (
    <div className="creator-toolbar flex items-center gap-2 p-2 bg-gray-800">
      {/* Your existing toolbar buttons */}
      <button className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">
        🧱 Add Brick
      </button>
      <button className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">
        📐 Transform
      </button>
      
      {/* Separator */}
      <div className="h-6 w-px bg-gray-600 mx-2"></div>
      
      {/* Admin Menu */}
      <AdminMenu
        userRole={config.userRole}
        onNavigateToAdmin={navigate}
      />
    </div>
  );
}

// Example: Admin quick actions in sidebar
export function CreatorSidebarWithAdmin({ user }: { user?: any }) {
  const { config, navigate, hasAdminAccess } = useAdminIntegration(user);
  console.log('Admin config loaded:', config); // Using config to prevent error

  return (
    <div className="creator-sidebar w-80 bg-gray-800 border-r border-gray-700">
      {/* Your existing sidebar content */}
      <div className="p-4">
        <h3 className="text-lg font-semibold text-white mb-4">Tools</h3>
        
        {/* Regular tools */}
        <div className="space-y-2 mb-6">
          <button className="w-full p-3 bg-gray-700 hover:bg-gray-600 rounded text-left">
            🧱 Brick Library
          </button>
          <button className="w-full p-3 bg-gray-700 hover:bg-gray-600 rounded text-left">
            📏 Measurements
          </button>
        </div>

        {/* Admin section */}
        {hasAdminAccess() && (
          <div className="border-t border-gray-700 pt-4">
            <h4 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
              🔧 Admin Tools
            </h4>
            <div className="space-y-1">
              <button
                onClick={() => navigate('/admin/connection-editor')}
                className="w-full p-2 text-sm bg-gray-700 hover:bg-gray-600 rounded text-left text-gray-300"
              >
                Edit Connection Points
              </button>
              <button
                onClick={() => navigate('/admin/connection-demo')}
                className="w-full p-2 text-sm bg-gray-700 hover:bg-gray-600 rounded text-left text-gray-300"
              >
                Test Connections
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Example: Full-page admin overlay
export function AdminOverlay({ 
  isVisible, 
  onClose, 
  user 
}: { 
  isVisible: boolean; 
  onClose: () => void; 
  user?: any; 
}) {
  const { config } = useAdminIntegration(user);

  if (!isVisible || config.userRole !== 'admin') {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50">
      <div className="absolute inset-4 bg-gray-900 rounded-lg border border-gray-700">
        {/* Admin interface would go here */}
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-green-400">Admin Panel</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          
          {/* Admin content */}
          <div className="text-gray-300">
            <p>Admin interface content would go here...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default {
  EnhancedCreatorWithAdmin,
  CreatorToolbarWithAdmin,
  CreatorSidebarWithAdmin,
  AdminOverlay
};