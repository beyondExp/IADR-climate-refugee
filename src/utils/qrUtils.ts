import QRCode from 'qrcode';
import type { AnchorQRData } from '../types';

// QR Code Generation
export async function generateQRCode(data: AnchorQRData, size = 200): Promise<string> {
  try {
    const qrDataString = JSON.stringify(data);
    
    const qrCodeDataURL = await QRCode.toDataURL(qrDataString, {
      width: size,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    });
    
    return qrCodeDataURL;
  } catch (error) {
    console.error('QR Generation Error:', error);
    throw new Error('Failed to generate QR code');
  }
}

export async function generateQRCodeToCanvas(
  canvas: HTMLCanvasElement, 
  data: AnchorQRData, 
  size = 200
): Promise<void> {
  try {
    const qrDataString = JSON.stringify(data);
    
    await QRCode.toCanvas(canvas, qrDataString, {
      width: size,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    });
  } catch (error) {
    console.error('QR Canvas Generation Error:', error);
    throw new Error('Failed to generate QR code to canvas');
  }
}

// External QR Generation Fallback
export function generateExternalQRURL(data: AnchorQRData): string {
  const qrDataString = JSON.stringify(data);
  const encodedData = encodeURIComponent(qrDataString);
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodedData}`;
}

// QR Code Validation
export function validateQRData(qrString: string): { isValid: boolean; data?: AnchorQRData; error?: string } {
  try {
    const parsed = JSON.parse(qrString);
    
    // Check if it's a construction anchor QR
    if (parsed.type !== 'construction-anchor') {
      return {
        isValid: false,
        error: 'Not a construction anchor QR code'
      };
    }
    
    // Check required fields
    const requiredFields = ['projectId', 'projectUID', 'anchorIndex', 'anchorUID', 'anchor', 'brickType'];
    const missingFields = requiredFields.filter(field => !parsed[field]);
    
    if (missingFields.length > 0) {
      return {
        isValid: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      };
    }
    
    return {
      isValid: true,
      data: parsed as AnchorQRData
    };
    
  } catch (error) {
    return {
      isValid: false,
      error: 'Invalid JSON format'
    };
  }
}

// Download QR Code
export function downloadQRCode(dataURL: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataURL;
  link.download = filename;
  link.click();
}

// Batch QR Generation
export async function generateBatchQRCodes(
  anchorsData: AnchorQRData[], 
  size = 200
): Promise<Array<{ data: AnchorQRData; qrCodeURL: string }>> {
  const results = await Promise.allSettled(
    anchorsData.map(async (data) => ({
      data,
      qrCodeURL: await generateQRCode(data, size)
    }))
  );
  
  return results
    .filter((result): result is PromiseFulfilledResult<{ data: AnchorQRData; qrCodeURL: string }> => 
      result.status === 'fulfilled')
    .map(result => result.value);
}

// QR Scanner using getUserMedia
export class QRScanner {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private stream: MediaStream | null = null;
  private isScanning = false;
  private animationId: number | null = null;

  constructor(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement) {
    this.video = videoElement;
    this.canvas = canvasElement;
    const context = canvasElement.getContext('2d');
    if (!context) {
      throw new Error('Could not get canvas 2d context');
    }
    this.context = context;
  }

  async startCamera(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 }
        }
      });

      this.video.srcObject = this.stream;
      this.video.play();
      
      this.video.addEventListener('loadedmetadata', () => {
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
      });

    } catch (error) {
      console.error('Camera access error:', error);
      throw new Error('Failed to access camera');
    }
  }

  stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.stopScanning();
  }

  startScanning(onQRDetected: (data: AnchorQRData) => void, onError?: (error: string) => void): void {
    if (this.isScanning) return;
    
    this.isScanning = true;
    
    const scan = () => {
      if (!this.isScanning || this.video.readyState !== this.video.HAVE_ENOUGH_DATA) {
        if (this.isScanning) {
          this.animationId = requestAnimationFrame(scan);
        }
        return;
      }

      this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      const imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
      
      // Basic QR detection simulation (in a real implementation, you'd use jsQR or similar)
      this.detectQRInImageData(imageData, onQRDetected, onError);
      
      this.animationId = requestAnimationFrame(scan);
    };

    scan();
  }

  stopScanning(): void {
    this.isScanning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private detectQRInImageData(
    imageData: ImageData, 
    onQRDetected: (data: AnchorQRData) => void, 
    onError?: (error: string) => void
  ): void {
    // This is a placeholder for QR detection
    // In a real implementation, you would use jsQR library:
    // const code = jsQR(imageData.data, imageData.width, imageData.height);
    // if (code) {
    //   const validation = validateQRData(code.data);
    //   if (validation.isValid && validation.data) {
    //     onQRDetected(validation.data);
    //   }
    // }
    
    // For now, this is just a simulation
    console.log('QR scanning active - would detect QR codes here');
  }

  isCameraActive(): boolean {
    return this.stream !== null;
  }

  isCurrentlyScanning(): boolean {
    return this.isScanning;
  }
} 