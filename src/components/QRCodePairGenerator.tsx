import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { useDatabaseStore } from '../stores/database';
import { useAuth } from '../contexts/AuthContext';
import type { Anchor } from '../lib/supabase';

interface QRCodePairGeneratorProps {
  projectId: string
  onClose?: () => void
}

export default function QRCodePairGenerator({ projectId, onClose }: QRCodePairGeneratorProps) {
  const { user } = useAuth()
  const { 
    anchors, 
    loadAnchors, 
    createQRCodePair, 
    loadQRCodePairs, 
    loading, 
    error, 
    clearError 
  } = useDatabaseStore()

  const [primaryAnchor, setPrimaryAnchor] = useState<string>('')
  const [secondaryAnchor, setSecondaryAnchor] = useState<string>('')
  const [referenceDistance, setReferenceDistance] = useState<number>(1.0)
  const [generatedPairs, setGeneratedPairs] = useState<any[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  // Load anchors and existing QR pairs when component mounts
  useEffect(() => {
    if (projectId) {
      loadAnchors(projectId)
      loadQRCodePairs(projectId).then(pairs => {
        setGeneratedPairs(Object.values(pairs))
      })
    }
  }, [projectId, loadAnchors, loadQRCodePairs])

  const handleGeneratePair = async () => {
    if (!primaryAnchor || !secondaryAnchor || !user) {
      return
    }

    clearError()
    
    const result = await createQRCodePair(
      projectId, 
      primaryAnchor, 
      secondaryAnchor, 
      referenceDistance
    )

    if (result) {
      // Refresh the pairs list
      const pairs = await loadQRCodePairs(projectId)
      setGeneratedPairs(Object.values(pairs))
      
      // Reset form
      setPrimaryAnchor('')
      setSecondaryAnchor('')
      setReferenceDistance(1.0)
    }
  }

  const getAnchorName = (anchorId: string) => {
    const anchor = anchors.find(a => a.id === anchorId)
    return anchor?.name || 'Unknown Anchor'
  }

  const calculateDistance = (anchor1Id: string, anchor2Id: string) => {
    const anchor1 = anchors.find(a => a.id === anchor1Id)
    const anchor2 = anchors.find(a => a.id === anchor2Id)
    
    if (!anchor1 || !anchor2) return 0
    
    const dx = Number(anchor1.position_x) - Number(anchor2.position_x)
    const dy = Number(anchor1.position_y) - Number(anchor2.position_y)
    const dz = Number(anchor1.position_z) - Number(anchor2.position_z)
    
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  const suggestDistance = () => {
    if (primaryAnchor && secondaryAnchor) {
      const calculatedDistance = calculateDistance(primaryAnchor, secondaryAnchor)
      if (calculatedDistance > 0) {
        setReferenceDistance(Math.round(calculatedDistance * 100) / 100)
      }
    }
  }

  // Auto-suggest distance when anchors change
  useEffect(() => {
    if (primaryAnchor && secondaryAnchor) {
      suggestDistance()
    }
  }, [primaryAnchor, secondaryAnchor])

  return (
    <div style={{
      background: 'linear-gradient(145deg, rgba(10, 10, 10, 0.95), rgba(26, 26, 46, 0.95))',
      backdropFilter: 'blur(20px)',
      borderRadius: '16px',
      padding: '2rem',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      color: 'white',
      maxWidth: '600px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <span className="text-lg">📍</span>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: 'white' }}>
            Generate QR Code Pair
          </h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              fontSize: '1.5rem',
              cursor: 'pointer',
              opacity: 0.7,
              transition: 'opacity 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
          >
            ✕
          </button>
        )}
      </div>

      {/* Info Box */}
      <div style={{
        background: 'rgba(0, 255, 136, 0.1)',
        border: '1px solid rgba(0, 255, 136, 0.3)',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '2rem'
      }}>
        <h3 style={{ 
          color: '#00ff88', 
          fontSize: '1rem', 
          fontWeight: '600', 
          marginBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <span className="text-lg">📍</span>
          AR Positioning with QR Pairs
        </h3>
        <p style={{ 
          color: 'rgba(255, 255, 255, 0.8)', 
          fontSize: '0.875rem', 
          lineHeight: '1.4',
          margin: 0 
        }}>
          Two QR codes provide precise AR positioning: <strong>position</strong>, <strong>scale</strong>, and <strong>orientation</strong>. 
          The distance between QR codes establishes real-world scale for accurate construction visualization.
        </p>
      </div>

      {/* Anchor Selection Form */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          {/* Primary Anchor */}
          <div>
            <label style={{
              display: 'block',
              color: 'white',
              fontSize: '0.875rem',
              marginBottom: '0.5rem',
              fontWeight: '500'
            }}>
              📍 Primary Anchor (Origin)
            </label>
            <select
              value={primaryAnchor}
              onChange={(e) => setPrimaryAnchor(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                fontSize: '0.875rem'
              }}
            >
              <option value="">Select primary anchor...</option>
              {anchors.map(anchor => (
                <option key={anchor.id} value={anchor.id} style={{ background: '#1a1a2e' }}>
                  {anchor.name} ({anchor.purpose})
                </option>
              ))}
            </select>
          </div>

          {/* Secondary Anchor */}
          <div>
            <label style={{
              display: 'block',
              color: 'white',
              fontSize: '0.875rem',
              marginBottom: '0.5rem',
              fontWeight: '500'
            }}>
              📍 Secondary Anchor (Reference)
            </label>
            <select
              value={secondaryAnchor}
              onChange={(e) => setSecondaryAnchor(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                fontSize: '0.875rem'
              }}
            >
              <option value="">Select secondary anchor...</option>
              {anchors.filter(a => a.id !== primaryAnchor).map(anchor => (
                <option key={anchor.id} value={anchor.id} style={{ background: '#1a1a2e' }}>
                  {anchor.name} ({anchor.purpose})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Distance Configuration */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            color: 'white',
            fontSize: '0.875rem',
            marginBottom: '0.5rem',
            fontWeight: '500',
            gap: '0.5rem'
          }}>
            <span className="text-lg">📐</span>
            Reference Distance (meters)
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="50"
              value={referenceDistance}
              onChange={(e) => setReferenceDistance(parseFloat(e.target.value) || 1.0)}
              style={{
                flex: 1,
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                fontSize: '0.875rem'
              }}
              placeholder="1.0"
            />
            <button
              onClick={suggestDistance}
              disabled={!primaryAnchor || !secondaryAnchor}
              style={{
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid rgba(0, 153, 255, 0.3)',
                background: 'rgba(0, 153, 255, 0.1)',
                color: '#0099ff',
                fontSize: '0.875rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
              title="Calculate distance from anchor positions"
            >
              Auto-calc
            </button>
          </div>
          {primaryAnchor && secondaryAnchor && (
            <p style={{ 
              fontSize: '0.75rem', 
              color: 'rgba(255, 255, 255, 0.6)', 
              marginTop: '0.25rem' 
            }}>
              Calculated distance: {calculateDistance(primaryAnchor, secondaryAnchor).toFixed(2)}m
            </p>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div style={{
            padding: '0.75rem',
            borderRadius: '8px',
            background: 'rgba(255, 107, 107, 0.1)',
            border: '1px solid rgba(255, 107, 107, 0.3)',
            color: '#ff6b6b',
            fontSize: '0.875rem',
            marginBottom: '1rem'
          }}>
            {error}
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGeneratePair}
          disabled={!primaryAnchor || !secondaryAnchor || loading}
          style={{
            width: '100%',
            padding: '0.875rem',
            borderRadius: '8px',
            border: 'none',
            background: (!primaryAnchor || !secondaryAnchor || loading)
              ? 'rgba(255, 255, 255, 0.1)'
              : 'linear-gradient(45deg, #00ff88, #0099ff)',
            color: (!primaryAnchor || !secondaryAnchor || loading) 
              ? 'rgba(255, 255, 255, 0.5)' 
              : 'white',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: (!primaryAnchor || !secondaryAnchor || loading) 
              ? 'not-allowed' 
              : 'pointer',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem'
          }}
        >
          <span className="text-sm">📱</span>
          {loading ? 'Generating QR Pair...' : 'Generate QR Code Pair'}
        </button>
      </div>

      {/* Generated Pairs List */}
      {generatedPairs.length > 0 && (
        <div>
          <h3 style={{
            color: 'white',
            fontSize: '1.125rem',
            fontWeight: '600',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span className="text-xs">👁️</span>
            Generated QR Pairs ({generatedPairs.length})
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {generatedPairs.map((pair, index) => (
              <div key={index} style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '1rem'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ 
                    color: 'white', 
                    fontWeight: '500',
                    fontSize: '0.875rem'
                  }}>
                    QR Pair #{index + 1}
                  </span>
                  <span style={{ 
                    color: '#00ff88', 
                    fontSize: '0.75rem',
                    background: 'rgba(0, 255, 136, 0.1)',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px'
                  }}>
                    {pair.primary?.reference_distance || 1.0}m distance
                  </span>
                </div>
                
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr', 
                  gap: '0.5rem',
                  fontSize: '0.75rem',
                  color: 'rgba(255, 255, 255, 0.7)'
                }}>
                  <div>
                    <strong style={{ color: '#00ff88' }}>Primary:</strong> {getAnchorName(pair.primary?.anchor_id || '')}
                  </div>
                  <div>
                    <strong style={{ color: '#0099ff' }}>Secondary:</strong> {getAnchorName(pair.secondary?.anchor_id || '')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
} 