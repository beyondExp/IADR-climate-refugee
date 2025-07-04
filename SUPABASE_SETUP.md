# Supabase Integration Setup for Climate Refuge AR

This guide will help you set up the complete Supabase backend for your Climate Refuge AR application.

## 🚀 Quick Setup

### 1. Environment Variables

Create a `.env.local` file in your project root with these variables (replace with your actual Supabase values):

```env
# Required for Vite frontend (these are the only two you need!)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

> **Note**: In Vite, only environment variables prefixed with `VITE_` are exposed to the frontend. The anon key is safe to expose as it's designed for client-side use.

### 2. Database Schema Setup

1. **Open your Supabase Dashboard** → SQL Editor
2. **Copy and paste** the entire contents of `src/lib/database-schema.sql`
3. **Run the SQL** to create all tables, indexes, policies, and triggers

This will create:
- ✅ **Users table** (extends Supabase auth)
- ✅ **Projects table** with user ownership
- ✅ **Anchors table** for construction points
- ✅ **QR Codes table** for AR markers
- ✅ **Shared Projects table** for collaboration
- ✅ **Row Level Security (RLS)** policies
- ✅ **Automatic triggers** for timestamps
- ✅ **Performance indexes**

### 3. Authentication Configuration

In your Supabase Dashboard:

1. **Authentication** → Settings
2. **Site URL**: `http://localhost:5173` (for development)
3. **Redirect URLs**: Add your production domain when deploying
4. **Email Templates**: Customize signup/reset emails (optional)

## 📊 Database Schema Overview

### Core Tables

```sql
📁 users (extends auth.users)
├── id (UUID, primary key)
├── email (TEXT)
├── username (TEXT, unique)
├── avatar_url (TEXT)
└── timestamps

📁 projects
├── id (UUID, primary key)
├── user_id (FK to users)
├── name, description
├── brick_type, type
├── is_public (for sharing)
└── timestamps

📁 anchors
├── id (UUID, primary key)
├── project_id (FK to projects)
├── name, purpose, construction_type
├── position_x, position_y, position_z
├── notes
└── timestamps

📁 qr_codes
├── id (UUID, primary key)
├── anchor_id (FK to anchors)
├── project_id (FK to projects)
├── user_id (FK to users)
├── qr_data (JSONB)
├── qr_code_url
└── timestamps

📁 shared_projects
├── id (UUID, primary key)
├── project_id (FK to projects)
├── shared_by, shared_with (FK to users)
├── share_token (unique)
├── permissions (view/edit)
├── expires_at
└── timestamps
```

## 🔐 Security Features

### Row Level Security (RLS)
- **Users**: Can only access their own profile
- **Projects**: Users see own + public + shared projects
- **Anchors**: Follow parent project permissions
- **QR Codes**: Follow parent project permissions
- **Shared Projects**: Only accessible by owner and recipients

### Automatic Features
- **User Creation**: New users automatically get a profile
- **UUID Generation**: All primary keys use UUID v4
- **Timestamps**: Auto-updating `created_at` and `updated_at`
- **Cascading Deletes**: Deleting projects removes all related data

## 🎯 Features Enabled

### ✅ Authentication System
- Email/password signup and login
- User profiles with avatars
- Session management
- Protected routes

### ✅ Project Management
- Create, read, update, delete projects
- Project templates and types
- Public/private visibility
- User ownership

### ✅ Construction System
- Anchor point management
- 3D position tracking
- Construction type categorization
- Project relationships

### ✅ QR Code Pair System
- **Dual QR code positioning** for precise AR tracking
- **Automatic distance calculation** between anchor points
- **Real-world scale establishment** (distance between QR codes = known measurement)
- **Coordinate system creation** (position + orientation + scale)
- **JSON data embedding** with pair metadata
- **AR viewer integration** with enhanced positioning

### ✅ Collaboration Features
- Project sharing via tokens
- Permission-based access (view/edit)
- Public project discovery
- Expiring share links

### ✅ Performance Optimizations
- Database indexes on foreign keys
- Efficient query patterns
- Connection pooling
- Optimized RLS policies

## 🚀 Usage Examples

### Creating a Project
```typescript
const newProject = await createProject({
  user_id: user.id,
  name: "Sustainable Shelter",
  description: "Emergency climate refuge",
  brick_type: "clay-sustainable",
  type: "emergency-shelter",
  is_public: false
})
```

### Adding Anchors
```typescript
const anchor = await createAnchor({
  project_id: project.id,
  name: "Foundation Corner",
  purpose: "foundation",
  construction_type: "foundation",
  position_x: 0,
  position_y: 0,
  position_z: 0
})
```

### Creating QR Code Pairs
```typescript
const qrPair = await createQRCodePair(
  project.id,
  primaryAnchorId,   // Foundation corner
  secondaryAnchorId, // Opposite corner  
  2.5               // 2.5 meters apart
)
// Returns: { pairId, primaryQR, secondaryQR }
```

### Sharing Projects
```typescript
const shareToken = await shareProject(
  project.id, 
  'view', 
  '2024-12-31T23:59:59Z' // expires
)
```

## 🔧 Development Tips

1. **Use the Supabase Dashboard** for real-time data viewing
2. **Check RLS policies** if data isn't appearing
3. **Monitor performance** with the built-in analytics
4. **Test permissions** with different user accounts
5. **Use transaction blocks** for complex operations

## 🌐 Production Deployment

1. Update environment variables with production URLs
2. Configure production redirect URLs in Supabase
3. Set up database backups
4. Enable email confirmations
5. Monitor usage and performance

---

🎉 **You're all set!** Your Climate Refuge AR application now has a complete backend with authentication, real-time data, and collaboration features. 