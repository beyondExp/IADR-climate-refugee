// Service to load brick connection points for use in the creator interface
import * as THREE from 'three';
import { BrickConfigurationService } from '../lib/brickConfigurationService';
import type { ConnectionPoint } from './brickConnectionSystem';

export class BrickConnectionLoader {
  private static connectionCache = new Map<string, ConnectionPoint[]>();
  private static defaultConnections: ConnectionPoint[] = [];

  /**
   * Load connection points for a specific brick type from database
   */
  static async loadConnectionsForBrickType(brickType: string): Promise<ConnectionPoint[]> {
    try {
      console.log(`🔗 Loading connection points for brick type: ${brickType}`);
      
      // Check cache first
      if (this.connectionCache.has(brickType)) {
        console.log(`✅ Found cached connections for ${brickType}`);
        return this.connectionCache.get(brickType)!;
      }

      console.log(`📋 Attempting to load from database...`);
      // Try to load from database
      const connections = await BrickConfigurationService.loadConfiguration(brickType);
      console.log(`📋 Database load result:`, connections);
      
      if (connections && connections.length > 0) {
        console.log(`✅ Loaded ${connections.length} connection points for ${brickType} from database`);
        this.connectionCache.set(brickType, connections);
        return connections;
      }

      // Fall back to default connections if none found in database
      console.log(`⚠️ No connection points found for ${brickType}, using defaults`);
      return this.getDefaultConnections();

    } catch (error) {
      console.error(`❌ Failed to load connection points for ${brickType}:`, error);
      return this.getDefaultConnections();
    }
  }

  /**
   * Get default connection points (fallback when database has no configuration)
   */
  static getDefaultConnections(): ConnectionPoint[] {
    if (this.defaultConnections.length === 0) {
      // Create default connection points for octa2 brick
      this.defaultConnections = [
        {
          id: 'octa2_male_1',
          type: 'male',
          axis: 'y',
          localPosition: new THREE.Vector3(0.5, 0.5, 0),
          localRotation: new THREE.Euler(0, 0, 0),
          strength: 1.0,
          isConnected: false
        },
        {
          id: 'octa2_female_1',
          type: 'female',
          axis: 'y',
          localPosition: new THREE.Vector3(-0.5, 0.5, 0),
          localRotation: new THREE.Euler(0, 0, 0),
          strength: 1.0,
          isConnected: false
        },
        {
          id: 'octa2_neutral_1',
          type: 'neutral',
          axis: 'z',
          localPosition: new THREE.Vector3(0, 0.5, 0.5),
          localRotation: new THREE.Euler(0, 0, 0),
          strength: 0.8,
          isConnected: false
        },
        {
          id: 'octa2_neutral_2',
          type: 'neutral',
          axis: 'z',
          localPosition: new THREE.Vector3(0, 0.5, -0.5),
          localRotation: new THREE.Euler(0, 0, 0),
          strength: 0.8,
          isConnected: false
        }
      ];
    }
    return this.defaultConnections;
  }

  /**
   * Clear cache (useful for development/testing)
   */
  static clearCache(): void {
    this.connectionCache.clear();
    console.log('🗑️ Connection cache cleared');
  }

  /**
   * Preload connections for common brick types
   */
  static async preloadConnections(): Promise<void> {
    try {
      console.log('🚀 Preloading brick connection configurations...');
      
      // Load octa2 connections (the main brick type)
      await this.loadConnectionsForBrickType('octa2');
      
      console.log('✅ Brick connection configurations preloaded');
    } catch (error) {
      console.error('❌ Failed to preload connections:', error);
    }
  }

  /**
   * Get connection points for a specific brick instance
   */
  static async getConnectionsForBrick(brickId: string, brickType: string): Promise<ConnectionPoint[]> {
    const baseConnections = await this.loadConnectionsForBrickType(brickType);
    
    // Clone and customize for specific brick instance
    return baseConnections.map(conn => ({
      ...conn,
      id: `${brickId}_${conn.type}_${conn.id.split('_').pop()}`, // Make unique per brick instance
      isConnected: false // Reset connection state for new instances
    }));
  }
}

// Export convenience function for easy usage
export const loadBrickConnections = (brickType: string) => 
  BrickConnectionLoader.loadConnectionsForBrickType(brickType);