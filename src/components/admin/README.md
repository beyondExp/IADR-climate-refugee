# 🔧 Admin Tools for Brick Connection System

Revolutionary brick connection system admin tools with visual 3D editing and testing capabilities.

## 🚀 Quick Start

### 1. Add Admin Routing

**React Router Integration:**
```tsx
// App.tsx or your main router file
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
```

**Hash-based Routing:**
```tsx
import { createHashAdminNavigator } from './utils/adminIntegration';

const adminNav = createHashAdminNavigator();
// Use adminNav.navigateToConnectionEditor() etc.
```

### 2. Add Admin Menu to Your Interface

```tsx
import { AdminMenu } from './components/admin';

function YourComponent({ user }) {
  return (
    <div className="your-header">
      {/* Your existing content */}
      <AdminMenu 
        userRole={user?.role} 
        onNavigateToAdmin={(path) => navigate(path)}
      />
    </div>
  );
}
```

### 3. Include Admin Styles

```tsx
// In your main CSS or component
import './styles/admin.css';
```

## 🛠️ Available Tools

### Connection Point Editor
- **Path:** `/admin/connection-editor`
- **Purpose:** Visual 3D editing of brick connection points
- **Features:**
  - Real-time 3D positioning
  - Type switching (male/female/neutral)
  - Strength adjustment
  - Axis configuration

### Connection Demo
- **Path:** `/admin/connection-demo` 
- **Purpose:** Interactive testing of brick connections
- **Features:**
  - Test different brick configurations
  - Validate connection rules
  - Structural integrity analysis
  - Live connection attempts

### Admin Overview
- **Path:** `/admin`
- **Purpose:** Dashboard and system information
- **Features:**
  - System status
  - Quick access to tools
  - Connection rules reference

## 🔐 User Access Control

```tsx
import { hasAdminAccess, getAdminConfig } from './utils/adminIntegration';

// Check if user has admin access
const isAdmin = hasAdminAccess(user?.role);

// Get full admin configuration
const adminConfig = getAdminConfig(user);
```

## 🎨 Styling & Theming

The admin tools use a dark theme with these CSS custom properties:

```css
:root {
  --admin-primary: #10b981;    /* Green */
  --admin-secondary: #374151;  /* Gray */
  --admin-accent: #3b82f6;     /* Blue */
  --admin-danger: #ef4444;     /* Red */
  --admin-warning: #f59e0b;    /* Yellow */
}
```

## 🔌 Integration Examples

### Adding to Existing Creator Interface

```tsx
import { AdminMenu, useAdminIntegration } from './components/admin';

function EnhancedCreatorInterface({ user }) {
  const { hasAdminAccess, navigate } = useAdminIntegration(user);
  
  return (
    <div className="creator">
      <header className="creator-header">
        <h1>Creator</h1>
        {hasAdminAccess() && (
          <AdminMenu 
            userRole={user?.role}
            onNavigateToAdmin={navigate}
          />
        )}
      </header>
      {/* rest of interface */}
    </div>
  );
}
```

### Toolbar Integration

```tsx
function CreatorToolbar({ user }) {
  return (
    <div className="toolbar">
      <button>Add Brick</button>
      <button>Transform</button>
      <div className="separator" />
      <AdminMenu userRole={user?.role} />
    </div>
  );
}
```

## 🧱 Connection System Features

### Connection Types
- **Male:** Protruding connections (blue)
- **Female:** Receiving connections (pink) 
- **Neutral:** Universal connections (yellow)

### Connection Rules
- Male ↔ Female: 1.0x strength (strongest)
- Neutral ↔ Male/Female: 0.6-0.7x strength (moderate)
- Neutral ↔ Neutral: 0.4-0.5x strength (flexible)

### Brick Configuration
```tsx
// Create brick with custom connection layout
const brick = connectionSystem.createRevolutionaryBrick(
  'custom-brick',
  position,
  rotation,
  'clay-sustainable',
  { 
    male: 2,     // 2 male connections
    female: 2,   // 2 female connections  
    neutral: 2   // 2 neutral connections
  }
);
```

## 🚨 Security Notes

- Admin tools are only accessible to users with `role: 'admin'`
- In development mode, admin access is automatically enabled
- Production builds should verify admin access server-side
- Connection configurations can modify structural integrity

## 🐛 Troubleshooting

### Admin Menu Not Showing
```tsx
// Check user role
console.log('User role:', user?.role);

// Force admin mode for testing
const config = getAdminConfig({ role: 'admin' });
```

### 3D Editor Not Loading
- Ensure Three.js and React Three Fiber are installed
- Check browser WebGL support
- Verify GLTF model paths are correct

### Connection Rules Not Working
- Check connection types match exactly
- Verify axis alignment
- Ensure spatial tolerance (5cm default)

## 📚 API Reference

### BrickConnectionSystem
```tsx
// Create revolutionary brick
createRevolutionaryBrick(id, position, rotation, type, config)

// Connect two bricks  
connectBricks(brick1Id, conn1Id, brick2Id, conn2Id)

// Check connection validity
isValidConnection(conn1, conn2, brick1, brick2)
```

### Admin Navigation
```tsx
// Navigate to admin tools
navigate('/admin/connection-editor')
navigate('/admin/connection-demo')
navigate('/admin')
```

## 🔄 Updates & Maintenance

To update the connection system:

1. Modify `src/utils/brickConnectionSystem.ts`
2. Update connection rules in `initializeConnectionRules()`
3. Test changes in Connection Demo
4. Update documentation

## 📄 License

Part of the IADR Climate Refugee Shelter project.