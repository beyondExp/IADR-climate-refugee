import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Generate unique identifier
export function generateUID(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Format timestamp to readable date
export function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

// Validate QR data
export function isValidQRData(data: string): boolean {
  try {
    const parsed = JSON.parse(data);
    return parsed.type === 'construction-anchor' && parsed.projectUID && parsed.anchorUID;
  } catch {
    return false;
  }
}

// Calculate distance between two 3D points
export function calculateDistance(point1: { x: number; y: number; z: number }, point2: { x: number; y: number; z: number }): number {
  return Math.sqrt(
    Math.pow(point2.x - point1.x, 2) + 
    Math.pow(point2.y - point1.y, 2) + 
    Math.pow(point2.z - point1.z, 2)
  );
}

// Convert hex color to Three.js color
export function hexToThreeColor(hex: number): number {
  return hex;
}

// Debounce function for performance
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: number;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => func.apply(null, args), delay);
  };
} 