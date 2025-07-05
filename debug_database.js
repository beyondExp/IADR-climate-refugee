// Supabase Database Diagnostic Script
// Copy and paste this entire script into your browser console while on your app

console.log('🔍 Starting Supabase Database Diagnostic...');

async function diagnoseDatabaseIssue() {
  try {
    // Get the Supabase client from the global scope or import it
    const supabase = window.supabase || (await import('./src/lib/supabase.js')).supabase;
    
    console.log('✅ Supabase client found');
    
    // Test 1: Check authentication
    console.log('\n🔍 Test 1: Checking authentication...');
    const { data: authData, error: authError } = await supabase.auth.getUser();
    console.log('Auth result:', { user: authData.user?.id, email: authData.user?.email, error: authError });
    
    if (!authData.user) {
      console.log('❌ User not authenticated. Please log in first.');
      return;
    }
    
    // Test 2: Check if projects table exists (simple select)
    console.log('\n🔍 Test 2: Testing projects table access...');
    const { data: selectData, error: selectError } = await supabase
      .from('projects')
      .select('count')
      .limit(1);
    
    console.log('Select test result:', { data: selectData, error: selectError });
    
    if (selectError) {
      if (selectError.code === '42P01') {
        console.log('❌ ISSUE FOUND: projects table does not exist!');
        console.log('💡 SOLUTION: Run the SQL schema in your Supabase dashboard');
        return;
      } else if (selectError.code === '42501') {
        console.log('❌ ISSUE FOUND: Insufficient privileges (RLS policy issue)');
        console.log('💡 SOLUTION: Check your Row Level Security policies');
        return;
      } else {
        console.log('❌ ISSUE FOUND: Unknown select error:', selectError);
        return;
      }
    }
    
    // Test 3: Test insert permissions (with a test record)
    console.log('\n🔍 Test 3: Testing insert permissions...');
    const testProject = {
      user_id: authData.user.id,
      name: 'Database Test Project',
      description: 'Test project for debugging',
      brick_type: 'test',
      type: 'test',
      is_public: false
    };
    
    const { data: insertData, error: insertError } = await supabase
      .from('projects')
      .insert(testProject)
      .select()
      .single();
    
    console.log('Insert test result:', { data: insertData, error: insertError });
    
    if (insertError) {
      console.log('❌ ISSUE FOUND: Insert failed with error:', insertError);
      console.log('Error code:', insertError.code);
      console.log('Error message:', insertError.message);
      console.log('Error details:', insertError.details);
      console.log('Error hint:', insertError.hint);
      
      if (insertError.code === '23503') {
        console.log('💡 SOLUTION: Foreign key constraint issue - check user_id references');
      } else if (insertError.code === '42501') {
        console.log('💡 SOLUTION: RLS policy blocking insert - check your policies');
      }
      return;
    }
    
    // Test 4: Clean up test record
    if (insertData) {
      console.log('\n🔍 Test 4: Cleaning up test record...');
      const { error: deleteError } = await supabase
        .from('projects')
        .delete()
        .eq('id', insertData.id);
      
      if (deleteError) {
        console.log('⚠️ Could not delete test record:', deleteError);
      } else {
        console.log('✅ Test record cleaned up successfully');
      }
    }
    
    console.log('\n✅ ALL TESTS PASSED! Database is working correctly.');
    console.log('🤔 The issue might be elsewhere. Check your network or try refreshing.');
    
  } catch (error) {
    console.log('❌ DIAGNOSTIC ERROR:', error);
    console.log('💡 Make sure you\'re on the app page with Supabase loaded');
  }
}

// Run the diagnostic
diagnoseDatabaseIssue(); 