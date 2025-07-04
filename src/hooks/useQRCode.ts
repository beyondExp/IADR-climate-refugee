import { useState, useCallback, useRef } from 'react';
import type { AnchorQRData } from '../types';
import { 
  generateQRCode, 
  generateBatchQRCodes, 
  downloadQRCode, 
  QRScanner,
  validateQRData 
} from '../utils/qrUtils';

// Hook for QR Code Generation
export function useQRCodeGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateSingleQR = useCallback(async (data: AnchorQRData, size = 200) => {
    setIsGenerating(true);
    setError(null);
    
    try {
      const qrCodeURL = await generateQRCode(data, size);
      return qrCodeURL;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate QR code';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const generateBatchQR = useCallback(async (anchorsData: AnchorQRData[], size = 200) => {
    setIsGenerating(true);
    setError(null);
    
    try {
      const results = await generateBatchQRCodes(anchorsData, size);
      return results;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate batch QR codes';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const downloadQR = useCallback((dataURL: string, filename: string) => {
    try {
      downloadQRCode(dataURL, filename);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to download QR code';
      setError(errorMsg);
    }
  }, []);

  return {
    generateSingleQR,
    generateBatchQR,
    downloadQR,
    isGenerating,
    error,
    clearError: () => setError(null)
  };
}

// Hook for QR Code Scanner
export function useQRScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedData, setScannedData] = useState<AnchorQRData | null>(null);
  
  const scannerRef = useRef<QRScanner | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const initializeScanner = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) {
      setError('Video or canvas element not available');
      return false;
    }

    try {
      scannerRef.current = new QRScanner(videoRef.current, canvasRef.current);
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to initialize scanner';
      setError(errorMsg);
      return false;
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (!scannerRef.current && !initializeScanner()) {
      return;
    }

    try {
      setError(null);
      await scannerRef.current!.startCamera();
      setIsCameraActive(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start camera';
      setError(errorMsg);
      setIsCameraActive(false);
    }
  }, [initializeScanner]);

  const stopCamera = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stopCamera();
      setIsCameraActive(false);
      setIsScanning(false);
    }
  }, []);

  const startScanning = useCallback(() => {
    if (!scannerRef.current || !isCameraActive) {
      setError('Camera not active');
      return;
    }

    setIsScanning(true);
    setError(null);
    
    scannerRef.current.startScanning(
      (data: AnchorQRData) => {
        setScannedData(data);
        setIsScanning(false);
      },
      (errorMsg: string) => {
        setError(errorMsg);
      }
    );
  }, [isCameraActive]);

  const stopScanning = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stopScanning();
      setIsScanning(false);
    }
  }, []);

  const clearScannedData = useCallback(() => {
    setScannedData(null);
  }, []);

  const validateManualQR = useCallback((qrString: string) => {
    setError(null);
    const validation = validateQRData(qrString);
    
    if (validation.isValid && validation.data) {
      setScannedData(validation.data);
      return true;
    } else {
      setError(validation.error || 'Invalid QR code');
      return false;
    }
  }, []);

  return {
    // State
    isScanning,
    isCameraActive,
    error,
    scannedData,
    
    // Actions
    startCamera,
    stopCamera,
    startScanning,
    stopScanning,
    clearScannedData,
    validateManualQR,
    
    // Refs for components
    videoRef,
    canvasRef,
    
    // Utils
    clearError: () => setError(null)
  };
}

// Hook for QR Data Management
export function useQRDataManager() {
  const [qrCodes, setQRCodes] = useState<Array<{ data: AnchorQRData; qrCodeURL: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  const addQRCode = useCallback((data: AnchorQRData, qrCodeURL: string) => {
    setQRCodes(prev => [...prev, { data, qrCodeURL }]);
  }, []);

  const removeQRCode = useCallback((anchorUID: string) => {
    setQRCodes(prev => prev.filter(qr => qr.data.anchorUID !== anchorUID));
  }, []);

  const clearQRCodes = useCallback(() => {
    setQRCodes([]);
  }, []);

  const findQRCode = useCallback((anchorUID: string) => {
    return qrCodes.find(qr => qr.data.anchorUID === anchorUID);
  }, [qrCodes]);

  const exportQRCodes = useCallback(() => {
    const exportData = {
      timestamp: new Date().toISOString(),
      qrCodes: qrCodes.map(qr => ({
        ...qr.data,
        qrCodeURL: qr.qrCodeURL
      }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `climate-refuge-qr-codes-${new Date().getTime()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [qrCodes]);

  return {
    qrCodes,
    isLoading,
    addQRCode,
    removeQRCode,
    clearQRCodes,
    findQRCode,
    exportQRCodes,
    count: qrCodes.length
  };
} 