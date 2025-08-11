# 🔄 Database Migration: Add User Roles

## Issue
The admin tools need a `role` field in the users table to control access, but the current database schema doesn't have this field.

## Solution

### Step 1: Run the Migration
In your **Supabase Dashboard** → **SQL Editor**, run this migration:

```sql
-- Copy and paste the contents of: src/lib/migrations/add_user_role.sql
```

Or copy this directly:

```sql
-- Migration: Add role field to users table
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
After running the migration, make your user an admin:

```sql
-- Replace 'your-email@example.com' with your actual email
UPDATE public.users 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```

### Step 3: Verify the Migration
Check that it worked:

```sql
-- See all users and their roles
SELECT email, role, created_at FROM public.users;
```

You should see your email with `role = 'admin'`.

## Testing Admin Access

1. **Refresh your app** (hard refresh: Ctrl/Cmd+Shift+R)
2. **Login** with your account
3. **Go to Creator mode**
4. **Look for 🔧 Admin Tools** button (should now be visible)

## Alternative: Manual Role Assignment

If you want to assign roles manually in the database:

```sql
-- Make specific users admin
UPDATE public.users SET role = 'admin' 
WHERE email IN (
  'admin1@example.com',
  'admin2@example.com'
);

-- Check who has admin access
SELECT email, role FROM public.users WHERE role = 'admin';
```

## For Development/Testing

During development, you can temporarily make ALL users admin:

```sql
-- DEVELOPMENT ONLY - Make all users admin
UPDATE public.users SET role = 'admin';
```

Don't do this in production! 🚨

---

## Next Steps

After running the migration:
1. ✅ **Test admin access** - Admin tools should appear
2. ✅ **Test non-admin access** - Create another account to verify normal users don't see admin tools
3. ✅ **Verify the import error is fixed** (see the ConnectionAxis fix below)