import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Database, Project } from '../types';
import { generateUID } from '../lib/utils';

interface DatabaseStore {
  database: Database;
  
  // Actions
  saveProject: (project: Omit<Project, 'id' | 'uid' | 'timestamp'>) => void;
  updateProject: (id: string, project: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  getProject: (id: string) => Project | undefined;
  getAllProjects: () => Project[];
  clearDatabase: () => void;
  importDatabase: (importedDB: Database) => void;
  exportDatabase: () => Database;
  
  // Computed values
  getProjectCount: () => number;
  getTotalAnchors: () => number;
  getDatabaseSize: () => number;
}

const createInitialDatabase = (): Database => ({
  projects: [],
  metadata: {
    version: "1.0",
    created: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  }
});

export const useDatabaseStore = create<DatabaseStore>()(
  persist(
    (set, get) => ({
      database: createInitialDatabase(),

      saveProject: (projectData) => {
        set((state) => {
          const newProject: Project = {
            ...projectData,
            id: generateUID(),
            uid: generateUID(),
            timestamp: new Date().toISOString()
          };

          const updatedDatabase: Database = {
            ...state.database,
            projects: [...state.database.projects, newProject],
            metadata: {
              ...state.database.metadata,
              lastUpdated: new Date().toISOString()
            }
          };

          return { database: updatedDatabase };
        });
      },

      updateProject: (id, updates) => {
        set((state) => {
          const projectIndex = state.database.projects.findIndex(p => p.id === id);
          if (projectIndex === -1) return state;

          const updatedProjects = [...state.database.projects];
          updatedProjects[projectIndex] = {
            ...updatedProjects[projectIndex],
            ...updates
          };

          const updatedDatabase: Database = {
            ...state.database,
            projects: updatedProjects,
            metadata: {
              ...state.database.metadata,
              lastUpdated: new Date().toISOString()
            }
          };

          return { database: updatedDatabase };
        });
      },

      deleteProject: (id) => {
        set((state) => {
          const updatedDatabase: Database = {
            ...state.database,
            projects: state.database.projects.filter(p => p.id !== id),
            metadata: {
              ...state.database.metadata,
              lastUpdated: new Date().toISOString()
            }
          };

          return { database: updatedDatabase };
        });
      },

      getProject: (id) => {
        return get().database.projects.find(p => p.id === id);
      },

      getAllProjects: () => {
        return get().database.projects;
      },

      clearDatabase: () => {
        set({ database: createInitialDatabase() });
      },

      importDatabase: (importedDB) => {
        set({ database: importedDB });
      },

      exportDatabase: () => {
        return get().database;
      },

      getProjectCount: () => {
        return get().database.projects.length;
      },

      getTotalAnchors: () => {
        return get().database.projects.reduce((sum, project) => 
          sum + project.anchors.length, 0);
      },

      getDatabaseSize: () => {
        const dbString = JSON.stringify(get().database);
        return Math.round(dbString.length / 1024 * 100) / 100; // Size in KB
      }
    }),
    {
      name: 'climate-refuge-db',
      version: 1,
    }
  )
);

// Sample data for testing
export const sampleProjects: Omit<Project, 'id' | 'uid' | 'timestamp'>[] = [
  {
    name: "Sustainable Pavilion Wall",
    description: "Climate-responsive wall structure using local clay bricks with thermal mass properties",
    brickType: "clay-sustainable",
    type: "modular-construction",
    anchors: [
      {
        purpose: "foundation",
        name: "West Foundation Corner",
        position: { x: 0, y: 0, z: 0 },
        constructionType: "wall",
        notes: "Ground level foundation point"
      },
      {
        purpose: "foundation", 
        name: "East Foundation Corner",
        position: { x: 3, y: 0, z: 0 },
        constructionType: "wall",
        notes: "3 meters east of west corner"
      },
      {
        purpose: "height-marker",
        name: "Wall Height Marker",
        position: { x: 1.5, y: 2, z: 0 },
        constructionType: "wall",
        notes: "2 meter height reference"
      }
    ]
  },
  {
    name: "Bio-Composite Shelter Frame",
    description: "Lightweight shelter framework using bio-composite modular components",
    brickType: "bio-composite",
    type: "modular-construction",
    anchors: [
      {
        purpose: "column-base",
        name: "NW Column Base",
        position: { x: 0, y: 0, z: 0 },
        constructionType: "column",
        notes: "Northwest support column"
      },
      {
        purpose: "column-base",
        name: "NE Column Base", 
        position: { x: 4, y: 0, z: 0 },
        constructionType: "column",
        notes: "Northeast support column"
      },
      {
        purpose: "column-base",
        name: "SW Column Base",
        position: { x: 0, y: 0, z: 3 },
        constructionType: "column",
        notes: "Southwest support column"
      },
      {
        purpose: "roof-point",
        name: "Roof Apex",
        position: { x: 2, y: 3, z: 1.5 },
        constructionType: "beam",
        notes: "Central roof support point"
      }
    ]
  }
]; 