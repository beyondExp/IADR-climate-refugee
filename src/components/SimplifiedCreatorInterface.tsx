import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

interface SimplifiedCreatorInterfaceProps {
  onBack?: () => void;
}

export default function SimplifiedCreatorInterface({ onBack }: SimplifiedCreatorInterfaceProps) {
  const [selectedTool, setSelectedTool] = useState('select');
  const [selectedObject, setSelectedObject] = useState<string | null>(null);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#111827', color: 'white' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#1f2937', borderBottom: '1px solid #374151', padding: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {onBack && (
              <Button 
                onClick={onBack} 
                variant="outline" 
                size="sm"
                style={{ borderColor: '#4b5563', color: 'white' }}
              >
                ← Back to Landing
              </Button>
            )}
            <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>AR Construction Creator</h1>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 80px)' }}>
        {/* Left Sidebar */}
        <div style={{ width: '320px', backgroundColor: '#1f2937', borderRight: '1px solid #374151', padding: '1rem' }}>
          <Card style={{ backgroundColor: '#374151', borderColor: '#4b5563', marginBottom: '1rem' }}>
            <CardHeader>
              <CardTitle style={{ color: 'white', fontSize: '0.875rem' }}>Tools</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <Button
                  onClick={() => setSelectedTool('select')}
                  variant={selectedTool === 'select' ? "default" : "outline"}
                  size="sm"
                  style={{ 
                    backgroundColor: selectedTool === 'select' ? '#2563eb' : 'transparent',
                    borderColor: '#4b5563',
                    color: 'white'
                  }}
                >
                  Select
                </Button>
                <Button
                  onClick={() => setSelectedTool('move')}
                  variant={selectedTool === 'move' ? "default" : "outline"}
                  size="sm"
                  style={{ 
                    backgroundColor: selectedTool === 'move' ? '#2563eb' : 'transparent',
                    borderColor: '#4b5563',
                    color: 'white'
                  }}
                >
                  Move
                </Button>
                <Button
                  onClick={() => setSelectedTool('rotate')}
                  variant={selectedTool === 'rotate' ? "default" : "outline"}
                  size="sm"
                  style={{ 
                    backgroundColor: selectedTool === 'rotate' ? '#2563eb' : 'transparent',
                    borderColor: '#4b5563',
                    color: 'white'
                  }}
                >
                  Rotate
                </Button>
                <Button
                  onClick={() => setSelectedTool('scale')}
                  variant={selectedTool === 'scale' ? "default" : "outline"}
                  size="sm"
                  style={{ 
                    backgroundColor: selectedTool === 'scale' ? '#2563eb' : 'transparent',
                    borderColor: '#4b5563',
                    color: 'white'
                  }}
                >
                  Scale
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card style={{ backgroundColor: '#374151', borderColor: '#4b5563' }}>
            <CardHeader>
              <CardTitle style={{ color: 'white', fontSize: '0.875rem' }}>Objects</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ marginBottom: '0.5rem' }}>
                <Button 
                  size="sm"
                  style={{ backgroundColor: '#16a34a', color: 'white', width: '100%' }}
                  onClick={() => console.log('Add object')}
                >
                  + Add Object
                </Button>
              </div>
              <div 
                style={{ 
                  padding: '0.5rem', 
                  backgroundColor: selectedObject === '1' ? '#2563eb' : '#4b5563', 
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  marginBottom: '0.5rem'
                }}
                onClick={() => setSelectedObject('1')}
              >
                <div style={{ fontSize: '0.875rem' }}>Foundation Block</div>
                <div style={{ fontSize: '0.75rem', color: '#d1d5db' }}>Clay Sustainable</div>
              </div>
              <div 
                style={{ 
                  padding: '0.5rem', 
                  backgroundColor: selectedObject === '2' ? '#2563eb' : '#4b5563', 
                  borderRadius: '0.375rem',
                  cursor: 'pointer'
                }}
                onClick={() => setSelectedObject('2')}
              >
                <div style={{ fontSize: '0.875rem' }}>Wall Segment</div>
                <div style={{ fontSize: '0.75rem', color: '#d1d5db' }}>Hemp-crete</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Viewport */}
        <div style={{ flex: 1, padding: '1rem' }}>
          <Card style={{ height: '100%', backgroundColor: '#1f2937', borderColor: '#374151' }}>
            <CardContent style={{ height: '100%', padding: '0' }}>
              <div style={{ 
                height: '100%', 
                backgroundColor: '#000', 
                borderRadius: '0.5rem', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <div style={{ textAlign: 'center', color: '#9ca3af' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏗️</div>
                  <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>3D Construction Viewport</p>
                  <p style={{ fontSize: '0.875rem' }}>
                    Selected Tool: <span style={{ color: '#60a5fa' }}>{selectedTool}</span>
                  </p>
                  {selectedObject && (
                    <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                      Selected Object: <span style={{ color: '#34d399' }}>
                        {selectedObject === '1' ? 'Foundation Block' : 'Wall Segment'}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar */}
        <div style={{ width: '320px', backgroundColor: '#1f2937', borderLeft: '1px solid #374151', padding: '1rem' }}>
          {selectedObject ? (
            <Card style={{ backgroundColor: '#374151', borderColor: '#4b5563' }}>
              <CardHeader>
                <CardTitle style={{ color: 'white', fontSize: '0.875rem' }}>Properties</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#d1d5db', marginBottom: '0.25rem' }}>
                    Position
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                    <input
                      type="number"
                      placeholder="X"
                      style={{
                        backgroundColor: '#4b5563',
                        border: '1px solid #6b7280',
                        borderRadius: '0.375rem',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        color: 'white'
                      }}
                    />
                    <input
                      type="number"
                      placeholder="Y"
                      style={{
                        backgroundColor: '#4b5563',
                        border: '1px solid #6b7280',
                        borderRadius: '0.375rem',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        color: 'white'
                      }}
                    />
                    <input
                      type="number"
                      placeholder="Z"
                      style={{
                        backgroundColor: '#4b5563',
                        border: '1px solid #6b7280',
                        borderRadius: '0.375rem',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        color: 'white'
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#d1d5db', marginBottom: '0.25rem' }}>
                    Material
                  </label>
                  <select
                    style={{
                      width: '100%',
                      backgroundColor: '#4b5563',
                      border: '1px solid #6b7280',
                      borderRadius: '0.375rem',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      color: 'white'
                    }}
                  >
                    <option value="clay">Sustainable Clay</option>
                    <option value="hemp">Hemp-crete</option>
                    <option value="bamboo">Bamboo Composite</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button 
                    size="sm"
                    style={{ flex: 1, backgroundColor: '#2563eb', color: 'white' }}
                  >
                    Apply
                  </Button>
                  <Button 
                    size="sm"
                    variant="outline"
                    style={{ flex: 1, borderColor: '#6b7280', color: 'white' }}
                  >
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card style={{ backgroundColor: '#374151', borderColor: '#4b5563' }}>
              <CardContent style={{ textAlign: 'center', padding: '2rem' }}>
                <div style={{ color: '#9ca3af' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎯</div>
                  <p>Select an object to edit properties</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
} 