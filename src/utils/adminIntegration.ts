/**
 * Admin Integration Utilities
 * Helpers for integrating admin tools with the main application
 */

export interface AdminConfig {
  userRole: 'admin' | 'user';
  enableAdminMode: boolean;
  adminMenuVisible: boolean;
}

export interface AdminNavigationEvent {
  path: string;
  timestamp: Date;
  userRole: string;
}

/**
 * Check if user has admin privileges
 */
export function hasAdminAccess(userRole?: string): boolean {
  return userRole === 'admin';
}

/**
 * Get admin configuration based on user and environment
 */
export function getAdminConfig(user?: any): AdminConfig {
  const userRole = user?.role || 'user';
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return {
    userRole: userRole as 'admin' | 'user',
    enableAdminMode: hasAdminAccess(userRole) || isDevelopment,
    adminMenuVisible: hasAdminAccess(userRole) || isDevelopment // Show in dev mode for testing
  };
}

/**
 * Admin navigation handler for React Router
 */
export function createAdminNavigator(navigate: (path: string) => void) {
  return {
    navigateToAdmin: (path: string) => {
      console.log(`🔧 Admin Navigation: ${path}`);
      navigate(path);
    },
    
    navigateToConnectionEditor: () => {
      navigate('/admin/connection-editor');
    },
    
    navigateToConnectionDemo: () => {
      navigate('/admin/connection-demo');
    },
    
    navigateToAdminOverview: () => {
      navigate('/admin');
    }
  };
}

/**
 * Admin navigation handler for hash-based routing
 */
export function createHashAdminNavigator() {
  return {
    navigateToAdmin: (path: string) => {
      console.log(`🔧 Admin Navigation: ${path}`);
      window.location.hash = `#${path}`;
    },
    
    navigateToConnectionEditor: () => {
      window.location.hash = '#/admin/connection-editor';
    },
    
    navigateToConnectionDemo: () => {
      window.location.hash = '#/admin/connection-demo';
    },
    
    navigateToAdminOverview: () => {
      window.location.hash = '#/admin';
    }
  };
}

/**
 * Admin event logger
 */
export class AdminEventLogger {
  private events: AdminNavigationEvent[] = [];
  
  logNavigation(path: string, userRole: string) {
    const event: AdminNavigationEvent = {
      path,
      timestamp: new Date(),
      userRole
    };
    
    this.events.push(event);
    console.log('🔧 Admin Event:', event);
    
    // Keep only last 50 events
    if (this.events.length > 50) {
      this.events = this.events.slice(-50);
    }
  }
  
  getRecentEvents(limit: number = 10): AdminNavigationEvent[] {
    return this.events.slice(-limit);
  }
  
  clearEvents() {
    this.events = [];
  }
}

/**
 * Integration hook for admin tools
 */
export function useAdminIntegration(user?: any) {
  const config = getAdminConfig(user);
  const logger = new AdminEventLogger();
  
  const navigate = (path: string) => {
    logger.logNavigation(path, config.userRole);
    
    // You can customize this based on your routing solution:
    // For React Router: navigate(path)
    // For Next.js: router.push(path)
    // For hash routing: window.location.hash = path
    console.log(`🔧 Navigate to: ${path}`);
  };
  
  return {
    config,
    logger,
    navigate,
    hasAdminAccess: () => hasAdminAccess(config.userRole),
    createNavigator: () => createAdminNavigator(navigate)
  };
}

/**
 * Admin panel visibility controller
 */
export class AdminPanelController {
  private isVisible = false;
  private callbacks: Array<(visible: boolean) => void> = [];
  
  show() {
    this.isVisible = true;
    this.notifyCallbacks();
  }
  
  hide() {
    this.isVisible = false;
    this.notifyCallbacks();
  }
  
  toggle() {
    this.isVisible = !this.isVisible;
    this.notifyCallbacks();
  }
  
  getVisibility(): boolean {
    return this.isVisible;
  }
  
  onVisibilityChange(callback: (visible: boolean) => void) {
    this.callbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }
  
  private notifyCallbacks() {
    this.callbacks.forEach(callback => callback(this.isVisible));
  }
}

/**
 * Admin quick actions
 */
export const adminActions = {
  openConnectionEditor: () => {
    console.log('🔧 Opening Connection Editor...');
    // Trigger navigation to connection editor
  },
  
  openConnectionDemo: () => {
    console.log('🧪 Opening Connection Demo...');
    // Trigger navigation to connection demo
  },
  
  exportBrickConfiguration: () => {
    console.log('📤 Exporting brick configuration...');
    // Export current brick configuration
  },
  
  importBrickConfiguration: () => {
    console.log('📥 Importing brick configuration...');
    // Import brick configuration
  },
  
  resetToDefaults: () => {
    console.log('🔄 Resetting to default configuration...');
    // Reset brick connection system to defaults
  }
};

/**
 * Integration instructions for different routing systems
 */
export const integrationGuide = {
  reactRouter: `
// App.tsx - Add admin routes to your React Router setup
import AdminRouter from './components/admin/AdminRouter';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/admin/*" element={<AdminRouter />} />
        {/* your existing routes */}
      </Routes>
    </Router>
  );
}
  `,
  
  nextjs: `
// pages/admin/[...slug].tsx - Create dynamic admin route in Next.js
import AdminRouter from '../../components/admin/AdminRouter';

export default function AdminPage() {
  return <AdminRouter />;
}
  `,
  
  hashRouting: `
// Add hash-based routing for admin tools
const adminNavigator = createHashAdminNavigator();

// Listen for hash changes
window.addEventListener('hashchange', () => {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('/admin')) {
    // Show admin interface
  }
});
  `
};

export default {
  hasAdminAccess,
  getAdminConfig,
  createAdminNavigator,
  createHashAdminNavigator,
  AdminEventLogger,
  useAdminIntegration,
  AdminPanelController,
  adminActions,
  integrationGuide
};