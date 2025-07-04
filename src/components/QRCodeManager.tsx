import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import QRCodePairGenerator from './QRCodePairGenerator';
import { useDatabaseStore } from '../stores/database';
import type { QRCode } from '../lib/supabase';

interface QRCodeManagerProps {
  isVisible: boolean;
  onClose: () => void;
  projectId: string;
}

export default function QRCodeManager({ isVisible, onClose, projectId }: QRCodeManagerProps) {
  const { qrCodes, loadQRCodes, loadQRCodePairs, loading } = useDatabaseStore();
  const [qrPairs, setQrPairs] = useState<Record<string, { primary?: QRCode, secondary?: QRCode }>>({});
  const [showGenerator, setShowGenerator] = useState(false);

  useEffect(() => {
    if (isVisible && projectId) {
      loadQRCodes(projectId);
      loadQRCodePairs(projectId).then(pairs => setQrPairs(pairs));
    }
  }, [isVisible, projectId, loadQRCodes, loadQRCodePairs]);

  const handleDownloadQR = (qrCode: QRCode) => {
    // Create download link
    const link = document.createElement('a');
    link.href = qrCode.qr_code_url;
    link.download = `QR_${qrCode.qr_position}_${qrCode.id.slice(0, 8)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyQRData = (qrCode: QRCode) => {
    navigator.clipboard.writeText(JSON.stringify(qrCode.qr_data, null, 2));
    alert('QR data copied to clipboard!');
  };

  const singleQRs = qrCodes.filter(qr => !qr.qr_pair_id);
  const pairQRs = Object.values(qrPairs);

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
        {/* Header */}
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
              📱 QR Code Manager
            </h2>
            <p style={{ 
              margin: '0.25rem 0 0 0', 
              color: 'var(--text-secondary)', 
              fontSize: '0.875rem' 
            }}>
              View, download, and generate QR codes for your project
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button
              onClick={() => setShowGenerator(true)}
              style={{
                background: 'var(--gradient-primary)',
                border: 'none',
                color: 'white',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600'
              }}
            >
              ✨ Generate New QR Pair
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

        {/* Content */}
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
              height: '300px',
              color: 'var(--text-secondary)'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
                <p>Loading QR codes...</p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* QR Code Pairs */}
              {pairQRs.length > 0 && (
                <div>
                  <h3 style={{ 
                    margin: '0 0 1rem 0', 
                    color: 'var(--text-primary)',
                    fontSize: '1.25rem',
                    fontWeight: '600'
                  }}>
                    🔗 QR Code Pairs ({pairQRs.length})
                  </h3>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
                    gap: '1.5rem'
                  }}>
                    {pairQRs.map((pair, index) => (
                      <Card 
                        key={index}
                        style={{
                          background: 'var(--surface-glass)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '12px',
                          overflow: 'hidden'
                        }}
                      >
                        <CardHeader style={{ padding: '1rem' }}>
                          <CardTitle style={{ 
                            fontSize: '1rem', 
                            color: 'var(--text-primary)',
                            margin: '0 0 0.5rem 0'
                          }}>
                            Pair {pair.primary?.qr_pair_id?.slice(0, 8) || 'Unknown'}
                          </CardTitle>
                          <CardDescription style={{ 
                            color: 'var(--text-secondary)', 
                            fontSize: '0.75rem'
                          }}>
                            Reference Distance: {pair.primary?.reference_distance || pair.secondary?.reference_distance || 'N/A'}m
                          </CardDescription>
                        </CardHeader>

                        <CardContent style={{ padding: '0 1rem 1rem 1rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            
                            {/* Primary QR */}
                            {pair.primary && (
                              <div style={{
                                background: 'var(--surface-elevated)',
                                borderRadius: '8px',
                                padding: '1rem',
                                textAlign: 'center'
                              }}>
                                <div style={{ 
                                  fontSize: '0.75rem', 
                                  fontWeight: '600', 
                                  color: 'var(--accent-cyan)',
                                  marginBottom: '0.5rem' 
                                }}>
                                  🔵 PRIMARY
                                </div>
                                <div style={{
                                  width: '80px',
                                  height: '80px',
                                  background: 'white',
                                  borderRadius: '4px',
                                  margin: '0 auto 0.75rem auto',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '2rem'
                                }}>
                                  📱
                                </div>
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                  <Button
                                    onClick={() => handleDownloadQR(pair.primary!)}
                                    style={{
                                      flex: 1,
                                      background: 'var(--accent-cyan)',
                                      border: 'none',
                                      color: 'white',
                                      padding: '0.25rem',
                                      borderRadius: '4px',
                                      fontSize: '0.625rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    📥
                                  </Button>
                                  <Button
                                    onClick={() => handleCopyQRData(pair.primary!)}
                                    style={{
                                      flex: 1,
                                      background: 'var(--surface-glass)',
                                      border: '1px solid var(--border-subtle)',
                                      color: 'var(--text-secondary)',
                                      padding: '0.25rem',
                                      borderRadius: '4px',
                                      fontSize: '0.625rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    📋
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Secondary QR */}
                            {pair.secondary && (
                              <div style={{
                                background: 'var(--surface-elevated)',
                                borderRadius: '8px',
                                padding: '1rem',
                                textAlign: 'center'
                              }}>
                                <div style={{ 
                                  fontSize: '0.75rem', 
                                  fontWeight: '600', 
                                  color: 'var(--accent-orange)',
                                  marginBottom: '0.5rem' 
                                }}>
                                  🟠 SECONDARY
                                </div>
                                <div style={{
                                  width: '80px',
                                  height: '80px',
                                  background: 'white',
                                  borderRadius: '4px',
                                  margin: '0 auto 0.75rem auto',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '2rem'
                                }}>
                                  📱
                                </div>
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                  <Button
                                    onClick={() => handleDownloadQR(pair.secondary!)}
                                    style={{
                                      flex: 1,
                                      background: 'var(--accent-orange)',
                                      border: 'none',
                                      color: 'white',
                                      padding: '0.25rem',
                                      borderRadius: '4px',
                                      fontSize: '0.625rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    📥
                                  </Button>
                                  <Button
                                    onClick={() => handleCopyQRData(pair.secondary!)}
                                    style={{
                                      flex: 1,
                                      background: 'var(--surface-glass)',
                                      border: '1px solid var(--border-subtle)',
                                      color: 'var(--text-secondary)',
                                      padding: '0.25rem',
                                      borderRadius: '4px',
                                      fontSize: '0.625rem',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    📋
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Single QR Codes */}
              {singleQRs.length > 0 && (
                <div>
                  <h3 style={{ 
                    margin: '0 0 1rem 0', 
                    color: 'var(--text-primary)',
                    fontSize: '1.25rem',
                    fontWeight: '600'
                  }}>
                    📱 Individual QR Codes ({singleQRs.length})
                  </h3>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '1rem'
                  }}>
                    {singleQRs.map((qr) => (
                      <Card 
                        key={qr.id}
                        style={{
                          background: 'var(--surface-glass)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          padding: '1rem',
                          textAlign: 'center'
                        }}
                      >
                        <div style={{
                          width: '100px',
                          height: '100px',
                          background: 'white',
                          borderRadius: '4px',
                          margin: '0 auto 1rem auto',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '2rem'
                        }}>
                          📱
                        </div>
                        <div style={{ 
                          fontSize: '0.875rem', 
                          fontWeight: '600', 
                          color: 'var(--text-primary)',
                          marginBottom: '0.5rem' 
                        }}>
                          QR {qr.id.slice(0, 8)}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Button
                            onClick={() => handleDownloadQR(qr)}
                            style={{
                              flex: 1,
                              background: 'var(--accent-blue)',
                              border: 'none',
                              color: 'white',
                              padding: '0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              cursor: 'pointer'
                            }}
                          >
                            📥 Download
                          </Button>
                          <Button
                            onClick={() => handleCopyQRData(qr)}
                            style={{
                              background: 'var(--surface-glass)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-secondary)',
                              padding: '0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              cursor: 'pointer'
                            }}
                          >
                            📋
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {pairQRs.length === 0 && singleQRs.length === 0 && !loading && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  height: '300px',
                  color: 'var(--text-secondary)'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📱</div>
                    <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>
                      No QR codes yet
                    </h3>
                    <p style={{ margin: '0 0 1.5rem 0', maxWidth: '300px' }}>
                      Generate QR code pairs to enable AR positioning for your project
                    </p>
                    <Button
                      onClick={() => setShowGenerator(true)}
                      style={{
                        background: 'var(--gradient-primary)',
                        border: 'none',
                        color: 'white',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      ✨ Generate First QR Pair
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* QR Generator Modal */}
        {showGenerator && (
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
            onClick={(e) => e.target === e.currentTarget && setShowGenerator(false)}
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
                  ✨ Generate QR Code Pairs
                </h3>
                <Button
                  onClick={() => setShowGenerator(false)}
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
                  projectId={projectId}
                  onClose={() => {
                    setShowGenerator(false);
                    // Refresh QR codes
                    loadQRCodes(projectId);
                    loadQRCodePairs(projectId).then(pairs => setQrPairs(pairs));
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 