import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import QRCodePairGenerator from './QRCodePairGenerator';
import { useDatabaseStore } from '../stores/database';
import type { Project } from '../types';
import type { User } from '@supabase/supabase-js';

interface ProjectModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSelectProject: (project: Project) => void;
  onNewProject: () => void;
  user: User | null;
}

export default function ProjectModal({ isVisible, onClose, onSelectProject, onNewProject, user }: ProjectModalProps) {
  const { projects, loadProjects, deleteProject: deleteProjectFromStore, loading, error, recoverOperationState } = useDatabaseStore();
  const [selectedProjectForQR, setSelectedProjectForQR] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

    // Load projects when modal opens
  useEffect(() => {
    console.log('🔍 ProjectModal useEffect triggered:', { isVisible, userId: user?.id, hasUser: !!user, currentProjects: projects.length });
    if (isVisible && user) {
      console.log('📞 ProjectModal calling loadProjects for user:', user.id, '(force refresh)');
      loadProjects(user.id, true); // Force refresh when opening modal
      
      // Fallback: if loading takes too long and we have projects, recover operation state
      const fallbackTimer = setTimeout(() => {
        if (projects.length > 0 && loading) {
          console.log('⚠️ Loading timeout - recovering operation state');
          recoverOperationState();
        }
      }, 15000);
      
      return () => clearTimeout(fallbackTimer);
    }
  }, [isVisible, user, loadProjects]);

  // Log project data whenever projects change
  useEffect(() => {
    console.log('📊 Projects in store updated:', {
      count: projects.length,
      loading: loading,
      error: error
    });
    
    if (projects.length > 0) {
      console.log('📋 Project data details:');
      projects.forEach((project, index) => {
        console.log(`   Project ${index + 1}:`, {
          id: project.id,
          name: project.name,
          description: project.description,
          user_id: (project as any).user_id,
          created_at: (project as any).created_at,
          anchors: project.anchors?.length || 0,
          fullData: project
        });
      });
      
      // If we have projects, clear any stale errors that might be showing
      if (error && projects.length > 0) {
        console.log('🧹 Clearing error since we have valid projects loaded');
        setTimeout(() => {
          recoverOperationState(); // This clears errors and operation states
        }, 100);
      }
    } else {
      console.log('📋 No projects in store');
    }
  }, [projects, loading, error, recoverOperationState]);

  // Filter projects based on search term
  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    // More informative confirmation
    const confirmMessage = `⚠️ Delete Project: "${projectName}"?\n\n` +
      `This will permanently delete:\n` +
      `• Project data and settings\n` +
      `• All anchors and QR codes\n` +
      `• Project structure data\n\n` +
      `This action cannot be undone.\n\n` +
      `Type "DELETE" to confirm:`;
    
    const userInput = prompt(confirmMessage);
    
    if (userInput === 'DELETE') {
      console.log('🗑️ Starting project deletion:', { projectId, projectName });
      
      // Show loading state for the delete operation
      const success = await deleteProjectFromStore(projectId);
      
      if (success) {
        console.log('✅ Project deleted successfully');
        // Better success feedback
        alert(`✅ Project "${projectName}" has been deleted successfully!`);
        
        // Optionally refresh the project list to ensure consistency
        if (user) {
          setTimeout(() => {
            loadProjects(user.id, true);
          }, 1000);
        }
      } else {
        console.error('❌ Project deletion failed');
        // Better error feedback
        alert(`❌ Failed to delete "${projectName}".\n\nThis could be due to:\n• Network connectivity issues\n• Database timeout\n• Permission restrictions\n\nPlease try again or contact support if the issue persists.`);
      }
    } else if (userInput !== null) {
      // User typed something but not "DELETE"
      alert('❌ Deletion cancelled. You must type "DELETE" exactly to confirm.');
    }
    // If userInput is null, user pressed Cancel - do nothing
  };

  const renderProjectPreview = (project: Project) => {
    // Generate a simple visual preview based on project data
    const colors = ['#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
    const anchorCount = 3; // Default placeholder since anchors are in separate table
    const colorIndex = anchorCount % colors.length;
    
    return (
      <div 
        style={{
          width: '100%',
          height: '120px',
          background: `linear-gradient(135deg, ${colors[colorIndex]}20, ${colors[colorIndex]}40)`,
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Abstract construction visualization */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'end' }}>
          {Array.from({ length: Math.min(anchorCount, 5) }).map((_, index) => (
            <div
              key={index}
              style={{
                width: '12px',
                height: `${30 + (index * 15)}px`,
                background: colors[colorIndex],
                borderRadius: '2px',
                opacity: 0.8
              }}
            />
          ))}
        </div>
        
        {/* Project stats overlay */}
        <div 
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: '600'
          }}
        >
          {(project as any).brick_type || (project as any).brickType || 'clay-sustainable'}
        </div>
      </div>
    );
  };

  const generateQRCode = (project: Project) => {
    setSelectedProjectForQR(project.id);
  };



  const handleProjectClick = (project: Project) => {
    onSelectProject(project)
    onClose()
  }

  const handleProjectLoad = (project: Project) => {
    onSelectProject(project)
  }

  if (!isVisible) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        style={{
          background: 'var(--surface-elevated)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '1200px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--border-strong)'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--surface-secondary)'
        }}>
          <div>
            <h2 style={{ 
              margin: 0, 
              fontSize: '1.5rem', 
              fontWeight: '700',
              color: 'var(--text-primary)',
              background: 'var(--gradient-primary)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              🏗️ Project Library
            </h2>
            <p style={{ 
              margin: '0.25rem 0 0 0', 
              color: 'var(--text-secondary)', 
              fontSize: '0.875rem' 
            }}>
              Load existing projects or create new sustainable constructions
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button
              onClick={onNewProject}
              style={{
                background: 'var(--gradient-primary)',
                border: 'none',
                color: 'white',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = 'var(--glow-cyan)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              ✨ New Project
            </Button>
            
            <Button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                padding: '0.75rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1.25rem'
              }}
            >
              ✕
            </Button>
          </div>
        </div>

        {/* Search and Filter */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <input
            type="text"
            placeholder="🔍 Search projects by name or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--surface-glass)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-primary)',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.875rem'
            }}
          />
        </div>

        {/* Projects Grid */}
        <div style={{ 
          flex: 1, 
          overflow: 'auto', 
          padding: '1.5rem'
        }}>
          {loading ? (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '200px',
              color: 'var(--text-secondary)'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
                <p>Loading projects...</p>
                <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', opacity: 0.7 }}>
                  Loading state: {loading.toString()}, Projects count: {projects.length}
                </p>
              </div>
            </div>
          ) : error ? (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '200px',
              color: 'var(--accent-red)'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>❌</div>
                <p>Error loading projects: {error}</p>
              </div>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '200px',
              color: 'var(--text-secondary)'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏗️</div>
                <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>
                  {searchTerm ? 'No projects found' : 'No projects yet'}
                </h3>
                <p style={{ margin: 0, maxWidth: '300px' }}>
                  {searchTerm 
                    ? 'Try adjusting your search terms' 
                    : 'Create your first sustainable construction project'
                  }
                </p>
                {!searchTerm && (
                  <Button
                    onClick={onNewProject}
                    style={{
                      marginTop: '1rem',
                      background: 'var(--gradient-primary)',
                      border: 'none',
                      color: 'white',
                      padding: '0.75rem 1.5rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    ✨ Create First Project
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '1.5rem'
            }}>
              {filteredProjects.map((project) => (
                <Card 
                  key={project.id}
                  style={{
                    background: 'var(--surface-glass)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
                    e.currentTarget.style.borderColor = 'var(--accent-cyan)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                  }}
                >
                  {/* Project Preview */}
                  <div onClick={() => handleProjectClick(project)}>
                    {renderProjectPreview(project)}
                  </div>

                  <CardHeader style={{ padding: '1rem' }}>
                    <CardTitle 
                      style={{ 
                        fontSize: '1.125rem', 
                        color: 'var(--text-primary)',
                        margin: '0 0 0.5rem 0',
                        cursor: 'pointer'
                      }}
                      onClick={() => handleProjectClick(project)}
                    >
                      <div style={{ marginBottom: '0.75rem' }}>
                        <h3 style={{ 
                          margin: '0 0 0.25rem 0', 
                          fontSize: '1.125rem', 
                          fontWeight: '600',
                          color: 'var(--text-primary)'
                        }}>
                          {project.name}
                        </h3>
                        <p style={{ 
                          margin: 0, 
                          fontSize: '0.875rem', 
                          color: 'var(--text-secondary)',
                          lineHeight: '1.4'
                        }}>
                          {project.description}
                        </p>
                      </div>
                      
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.75rem',
                        color: 'var(--text-tertiary)',
                        marginBottom: '1rem'
                      }}>
                        <div className="text-sm text-gray-600 mb-2">
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                            {(project as any).brick_type || (project as any).brickType || 'clay-sustainable'}
                          </span>
                          <span className="ml-2 text-gray-500">
                            {(project as any).created_at ? new Date((project as any).created_at).toLocaleDateString() : 
                             (project as any).timestamp ? new Date((project as any).timestamp).toLocaleDateString() : 'No date'}
                          </span>
                        </div>
                      </div>
                    </CardTitle>
                  </CardHeader>

                  <CardContent style={{ padding: '0 1rem 1rem 1rem' }}>
                    {/* Project Stats */}
                    <div style={{ 
                      display: 'flex', 
                      gap: '1rem', 
                      marginBottom: '1rem',
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)'
                    }}>
                      <span>📐 {project.anchors?.length || 0} anchors</span>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ 
                      display: 'flex', 
                      gap: '0.75rem', 
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      {/* Primary Actions */}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => generateQRCode(project)}
                          style={{
                            padding: '0.5rem 0.75rem',
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--accent-blue)',
                            color: 'var(--accent-blue)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            transition: 'all 0.3s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                          title="Generate QR Code"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--accent-blue)';
                            e.currentTarget.style.color = 'white';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--surface-elevated)';
                            e.currentTarget.style.color = 'var(--accent-blue)';
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          📱 QR
                        </button>
                        
                        <button
                          onClick={() => handleProjectLoad(project)}
                          style={{
                            padding: '0.5rem 0.75rem',
                            background: 'var(--surface-elevated)',
                            border: '1px solid var(--accent-green)',
                            color: 'var(--accent-green)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            transition: 'all 0.3s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                          title="Load Project Data"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--accent-green)';
                            e.currentTarget.style.color = 'white';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(34, 197, 94, 0.3)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--surface-elevated)';
                            e.currentTarget.style.color = 'var(--accent-green)';
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          📥 Load
                        </button>
                        
                        <button
                          onClick={() => handleProjectClick(project)}
                          style={{
                            padding: '0.5rem 1rem',
                            background: 'var(--gradient-primary)',
                            border: 'none',
                            color: 'white',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            transition: 'all 0.3s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                            boxShadow: '0 2px 8px rgba(0, 255, 136, 0.2)'
                          }}
                          title="Open Project"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 255, 136, 0.4)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 255, 136, 0.2)';
                          }}
                        >
                          🚀 Open
                        </button>
                      </div>
                      
                      {/* Danger Zone */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProject(project.id, project.name);
                        }}
                        style={{
                          padding: '0.5rem 0.75rem',
                          background: 'transparent',
                          border: '1px solid var(--accent-red)',
                          color: 'var(--accent-red)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          transition: 'all 0.3s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}
                        title="Delete Project"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--accent-red)';
                          e.currentTarget.style.color = 'white';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--accent-red)';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* QR Code Generator Modal */}
        {selectedProjectForQR && (
          <div 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem'
            }}
            onClick={(e) => e.target === e.currentTarget && setSelectedProjectForQR(null)}
          >
            <div 
              style={{
                background: 'var(--surface-elevated)',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '800px',
                maxHeight: '90%',
                overflow: 'hidden',
                border: '1px solid var(--border-strong)'
              }}
            >
              <div style={{
                padding: '1.5rem',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <h3 style={{ 
                  margin: 0, 
                  fontSize: '1.25rem', 
                  color: 'var(--text-primary)' 
                }}>
                  📱 Generate QR Code Pairs
                </h3>
                <Button
                  onClick={() => setSelectedProjectForQR(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '1.25rem'
                  }}
                >
                  ✕
                </Button>
              </div>
              
              <div style={{ height: '500px', overflow: 'auto' }}>
                <QRCodePairGenerator 
                  projectId={selectedProjectForQR}
                  onClose={() => setSelectedProjectForQR(null)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 