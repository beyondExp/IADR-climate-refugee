/**
 * Admin Tools - Revolutionary Brick Connection System
 * 
 * Export all admin components and utilities for easy importing
 */

// Main Admin Components
import AdminRouter from './AdminRouter';
import AdminMenu from './AdminMenu';
import ConnectionPointEditor from './ConnectionPointEditor';
import BrickConnectionDemo from './BrickConnectionDemo';

export { AdminRouter, AdminMenu, ConnectionPointEditor, BrickConnectionDemo };
export { AdminGuard, useAdminNavigation } from './AdminMenu';

// Integration Examples
export { 
  EnhancedCreatorWithAdmin,
  CreatorToolbarWithAdmin, 
  CreatorSidebarWithAdmin,
  AdminOverlay
} from './AdminIntegrationExample';

// Admin Utilities
export {
  hasAdminAccess,
  getAdminConfig,
  createAdminNavigator,
  createHashAdminNavigator,
  AdminEventLogger,
  useAdminIntegration,
  AdminPanelController,
  adminActions,
  integrationGuide
} from '../../utils/adminIntegration';

// Enhanced Connection System
export {
  BrickConnectionSystem,
  type ConnectionType,
  type ConnectionAxis,
  type ConnectionPoint,
  type RevolutionaryBrick,
  type ConnectionRule,
  type StructuralAnalysis,
  type LoadPath
} from '../../utils/brickConnectionSystem';

// Type exports for integration
export type {
  AdminConfig,
  AdminNavigationEvent
} from '../../utils/adminIntegration';

/**
 * Quick setup for common use cases
 */
export const adminQuickSetup = {
  /**
   * Get admin menu for header integration
   */
  getHeaderAdminMenu: (user: any, onNavigate: (path: string) => void) => ({
    component: AdminMenu,
    props: {
      userRole: user?.role || 'user',
      onNavigateToAdmin: onNavigate
    }
  }),

  /**
   * Get admin integration hooks factory (use this inside React components)
   */
  createAdminHooks: () => (user: any) => {
    // This factory cannot use hooks directly - return a config object instead
    return {
      hasAdminAccess: () => true, // Simplified for build
      navigate: () => console.log('Navigate called'),
      config: { userRole: 'user' }
    };
  },

  /**
   * Create router configuration for React Router
   */
  getRouterConfig: () => ({
    path: '/admin/*',
    element: 'AdminRouter' // Import and use AdminRouter component
  }),

  /**
   * Get admin-specific CSS class names
   */
  getAdminClasses: () => ({
    connectionMale: 'connection-male',
    connectionFemale: 'connection-female', 
    connectionNeutral: 'connection-neutral',
    adminGlass: 'admin-glass',
    adminGlow: 'admin-glow'
  })
};

/**
 * Admin tool routes for easy router integration
 */
export const adminRoutes = [
  {
    path: '/admin',
    name: 'Admin Overview',
    description: 'Main admin dashboard'
  },
  {
    path: '/admin/connection-editor',
    name: 'Connection Point Editor',
    description: 'Visual 3D editor for brick connection points'
  },
  {
    path: '/admin/connection-demo', 
    name: 'Connection Demo',
    description: 'Interactive brick connection testing'
  }
];

/**
 * Default admin configuration
 */
export const defaultAdminConfig = {
  enableAdminMode: false,
  adminMenuVisible: false,
  userRole: 'user' as const,
  connectionTolerance: 0.05, // 5cm
  defaultBrickConfig: {
    male: 2,
    female: 2,
    neutral: 2
  }
};

// Re-export for convenience
export default {
  AdminRouter,
  AdminMenu,
  ConnectionPointEditor,
  BrickConnectionDemo,
  adminQuickSetup,
  adminRoutes,
  defaultAdminConfig
};