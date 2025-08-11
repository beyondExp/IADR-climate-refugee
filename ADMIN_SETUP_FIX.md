# 🔧 Admin Tools Setup Fix

## Issues Fixed

1. ✅ **ConnectionAxis import error** - Vite cache cleared
2. ✅ **Missing user role field** - Database migration created  
3. ✅ **User interface updated** - Added role field to TypeScript types

## 🚀 Quick Fix Steps

### Step 1: Database Migration

**In Supabase Dashboard → SQL Editor**, run this migration:

```sql
-- Add role field to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- Add check constraint for valid roles
ALTER TABLE public.users 
ADD CONSTRAINT users_role_check 
CHECK (role IN ('user', 'admin'));

-- Create index for role lookups
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
```

### Step 2: Make Yourself Admin

**Replace with your actual email:**

```sql
UPDATE public.users 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```

### Step 3: Clear Cache & Restart

**In your terminal (PowerShell):**

```powershell
# Clear Vite cache
Remove-Item -Recurse -Force node_modules\.vite -ErrorAction SilentlyContinue

# Restart dev server
npm run dev
```

### Step 4: Test Admin Access

1. **Refresh browser** (Ctrl+Shift+R for hard refresh)
2. **Login** with your account  
3. **Go to Creator mode**
4. **Look for 🔧 Admin Tools** button in header

## ✅ Verification Checklist

- [ ] **Migration ran successfully** (no SQL errors)
- [ ] **Your user has admin role** (check with `SELECT email, role FROM public.users WHERE email = 'your-email@example.com';`)
- [ ] **No import errors** (ConnectionAxis imports correctly)
- [ ] **Admin button visible** in creator interface
- [ ] **Admin tools load** when clicked

## 🔍 Troubleshooting

### Admin Button Not Showing?

Check your user role in Supabase:
```sql
SELECT email, role FROM public.users;
```

If your role is `user`, update it:
```sql
UPDATE public.users SET role = 'admin' WHERE email = 'your-email@example.com';
```

### Still Getting Import Errors?

1. **Hard refresh** browser: `Ctrl+Shift+R`
2. **Clear all caches**: 
   ```powershell
   Remove-Item -Recurse -Force node_modules\.vite
   Remove-Item -Recurse -Force dist
   npm run dev
   ```

### TypeScript Errors?

The `User` interface now includes the `role` field. If you get TypeScript errors, make sure:
- Your editor reloaded the types
- Restart TypeScript service in VS Code: `Ctrl+Shift+P` → "TypeScript: Restart TS Server"

## 🎯 What's Changed

### Database Schema
```sql
-- New field in users table
role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'))
```

### TypeScript Interface
```typescript
export interface User {
  id: string
  email: string
  username?: string
  avatar_url?: string
  role: 'user' | 'admin'  // ← NEW
  created_at: string
  updated_at: string
}
```

### Admin Access Logic
```typescript
// Only shows admin tools if:
user.role === 'admin' || process.env.NODE_ENV === 'development'
```

## 🎉 Ready to Use!

After completing these steps, your admin tools should work perfectly:

- **🔧 Connection Point Editor** - Design custom brick sockets
- **🧪 Connection Demo** - Test brick compatibility
- **📋 Admin Dashboard** - System overview

The revolutionary brick connection system with neutral connections is now ready for building climate shelter components! 🏗️🌍

---

## 🚨 For Development/Testing

During development, admin tools automatically show for all users. In production, only users with `role = 'admin'` will see them.