import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useDatabaseStore } from '../stores/database'
import QRCode from 'qrcode'

interface SimpleQRGeneratorProps {
  projectId: string
  onClose: () => void
}

export default function SimpleQRGenerator({ projectId, onClose }: SimpleQRGeneratorProps) {
  const { user } = useAuth()
  const { projects } = useDatabaseStore()
  
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')
  const [projectUrl, setProjectUrl] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get the current project
  const project = projects.find(p => p.id === projectId)

  useEffect(() => {
    if (projectId) {
      generateProjectQR()
    }
  }, [projectId])

  const generateProjectQR = async () => {
    if (!projectId) return

    setLoading(true)
    setError(null)

    try {
      // Create the project URL
      const baseUrl = window.location.origin
      const url = `${baseUrl}/viewer?project=${projectId}`
      setProjectUrl(url)

      console.log('🔗 Generating QR code for URL:', url)

      // Generate QR code for the URL
      const qrDataURL = await QRCode.toDataURL(url, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      })

      setQrCodeUrl(qrDataURL)
      console.log('✅ QR code generated successfully')
      
    } catch (err: any) {
      console.error('❌ Failed to generate QR code:', err)
      setError('Failed to generate QR code: ' + (err.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!qrCodeUrl) return

    const link = document.createElement('a')
    link.href = qrCodeUrl
    link.download = `${project?.name || 'Project'}_QR_Code.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(projectUrl)
    alert('Project URL copied to clipboard!')
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>QR Code - ${project?.name}</title>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                text-align: center; 
                padding: 20px;
                margin: 0;
              }
              .qr-container {
                max-width: 400px;
                margin: 0 auto;
                padding: 20px;
                border: 2px solid #000;
                border-radius: 10px;
              }
              h1 { 
                color: #333; 
                margin-bottom: 10px;
                font-size: 24px;
              }
              .project-info {
                margin-bottom: 20px;
                color: #666;
              }
              img { 
                max-width: 300px; 
                height: auto;
                border: 1px solid #ddd;
              }
              .url {
                margin-top: 15px;
                word-break: break-all;
                font-size: 12px;
                color: #888;
              }
              .instructions {
                margin-top: 20px;
                font-size: 14px;
                color: #555;
              }
            </style>
          </head>
          <body>
            <div class="qr-container">
              <h1>${project?.name || 'AR Project'}</h1>
              <div class="project-info">
                <p><strong>Description:</strong> ${project?.description || 'Climate Refuge AR Experience'}</p>
              </div>
              <img src="${qrCodeUrl}" alt="Project QR Code" />
              <div class="url">${projectUrl}</div>
              <div class="instructions">
                <p><strong>Instructions:</strong></p>
                <p>Scan this QR code with your phone to view the AR project</p>
              </div>
            </div>
          </body>
        </html>
      `)
      printWindow.document.close()
      printWindow.print()
    }
  }

  return (
    <div 
      style={{
        padding: '2rem',
        background: 'var(--surface-elevated)',
        borderRadius: '12px',
        border: '1px solid var(--border-subtle)',
        height: '100%',
        overflow: 'auto'
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.5rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid var(--border-subtle)'
      }}>
        <div>
          <h2 style={{
            margin: 0,
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            📱 Share Project
          </h2>
          <p style={{
            margin: '0.25rem 0 0 0',
            fontSize: '0.875rem',
            color: 'var(--text-secondary)'
          }}>
            Generate a QR code to share your AR project
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            padding: '0.5rem'
          }}
        >
          ×
        </button>
      </div>

      {/* Project Info */}
      {project && (
        <div style={{
          background: 'var(--surface-subtle)',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem'
        }}>
          <h3 style={{
            margin: '0 0 0.5rem 0',
            fontSize: '1rem',
            color: 'var(--text-primary)'
          }}>
            {project.name}
          </h3>
          <p style={{
            margin: '0 0 0.5rem 0',
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.4
          }}>
            {project.description}
          </p>
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)'
          }}>
            Project ID: {projectId}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{
          textAlign: 'center',
          padding: '2rem'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid var(--border-subtle)',
            borderTop: '3px solid var(--accent-primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Generating QR code...</p>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div style={{
          background: 'var(--status-error-bg)',
          border: '1px solid var(--status-error-border)',
          color: 'var(--status-error-text)',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem'
        }}>
          <p style={{ margin: 0 }}>❌ {error}</p>
          <button
            onClick={generateProjectQR}
            style={{
              marginTop: '0.5rem',
              background: 'var(--status-error-text)',
              color: 'var(--status-error-bg)',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* QR Code Display */}
      {qrCodeUrl && !loading && (
        <div style={{ textAlign: 'center' }}>
          {/* QR Code */}
          <div style={{
            background: 'white',
            padding: '1rem',
            borderRadius: '12px',
            display: 'inline-block',
            border: '2px solid var(--border-subtle)',
            marginBottom: '1.5rem'
          }}>
            <img 
              src={qrCodeUrl} 
              alt="Project QR Code"
              style={{
                width: '300px',
                height: '300px',
                display: 'block'
              }}
            />
          </div>

          {/* URL Display */}
          <div style={{
            background: 'var(--surface-subtle)',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1.5rem'
          }}>
            <p style={{
              margin: '0 0 0.5rem 0',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--text-primary)'
            }}>
              Share this URL:
            </p>
            <div style={{
              background: 'var(--surface-base)',
              padding: '0.75rem',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              wordBreak: 'break-all',
              fontFamily: 'monospace'
            }}>
              {projectUrl}
            </div>
            <button
              onClick={handleCopyUrl}
              style={{
                marginTop: '0.5rem',
                background: 'var(--accent-primary)',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              📋 Copy URL
            </button>
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={handleDownload}
              style={{
                background: 'var(--surface-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              💾 Download QR
            </button>
            
            <button
              onClick={handlePrint}
              style={{
                background: 'var(--surface-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              🖨️ Print QR
            </button>
          </div>

          {/* Instructions */}
          <div style={{
            marginTop: '2rem',
            padding: '1rem',
            background: 'var(--accent-cyan-bg)',
            border: '1px solid var(--accent-cyan-border)',
            borderRadius: '8px'
          }}>
            <h4 style={{
              margin: '0 0 0.5rem 0',
              fontSize: '0.875rem',
              color: 'var(--accent-cyan-text)',
              fontWeight: 600
            }}>
              📱 How to use:
            </h4>
            <ol style={{
              margin: 0,
              paddingLeft: '1.25rem',
              fontSize: '0.875rem',
              color: 'var(--accent-cyan-text)',
              lineHeight: 1.4
            }}>
              <li>Share the QR code or URL with others</li>
              <li>They can scan the QR code with their phone camera</li>
              <li>Or open the URL directly in their browser</li>
              <li>The AR project will load automatically in the viewer</li>
              <li>They can then tap "View in AR" to see it in augmented reality</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  )
}
