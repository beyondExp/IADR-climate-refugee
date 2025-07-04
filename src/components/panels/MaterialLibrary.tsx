import { useState } from 'react';
import DockablePanel from './DockablePanel';
import type { PanelConfig } from './DockablePanel';
import { 
  Search,
  Grid3X3,
  List,
  Star,
  Download,
  Eye,
  Palette,
  Recycle,
  Leaf,
  Thermometer,
  Droplets,
  Shield
} from 'lucide-react';

interface Material {
  id: string;
  name: string;
  category: 'sustainable' | 'recycled' | 'bio-based' | 'traditional';
  description: string;
  sustainability: number; // 1-5 rating
  thermalRating: number; // 1-5 rating
  waterResistance: number; // 1-5 rating
  durability: number; // 1-5 rating
  cost: 'low' | 'medium' | 'high';
  thumbnailUrl?: string;
  properties: {
    density?: string;
    compressiveStrength?: string;
    thermalConductivity?: string;
    carbonFootprint?: string;
  };
  tags: string[];
  isDownloaded?: boolean;
  isFavorite?: boolean;
}

interface MaterialLibraryProps {
  materials?: Material[];
  selectedMaterial?: string;
  isVisible?: boolean;
  onMaterialSelect?: (materialId: string) => void;
  onMaterialDownload?: (materialId: string) => void;
  onMaterialFavorite?: (materialId: string) => void;
  onClose?: () => void;
}

const panelConfig: PanelConfig = {
  id: 'material-library',
  title: 'Material Library',
  defaultWidth: 350,
  defaultHeight: 600,
  minWidth: 280,
  resizable: true,
  closable: true,
  collapsible: true,
  pinnable: true,
  position: 'right'
};

// Sample sustainable materials
const defaultMaterials: Material[] = [
  {
    id: 'clay-sustainable',
    name: 'Sustainable Clay Brick',
    category: 'sustainable',
    description: 'High-performance clay brick made from locally sourced materials with minimal processing.',
    sustainability: 5,
    thermalRating: 4,
    waterResistance: 4,
    durability: 5,
    cost: 'medium',
    properties: {
      density: '1.8 g/cm³',
      compressiveStrength: '25-35 MPa',
      thermalConductivity: '0.6-0.8 W/mK',
      carbonFootprint: '0.15 kg CO₂/kg'
    },
    tags: ['local', 'traditional', 'thermal-mass'],
    isDownloaded: true,
    isFavorite: true
  },
  {
    id: 'hemp-crete',
    name: 'Hemp-Crete Blocks',
    category: 'bio-based',
    description: 'Lightweight bio-composite made from hemp hurds and lime binder.',
    sustainability: 5,
    thermalRating: 5,
    waterResistance: 3,
    durability: 4,
    cost: 'medium',
    properties: {
      density: '0.4-0.6 g/cm³',
      compressiveStrength: '0.4-1.0 MPa',
      thermalConductivity: '0.06-0.12 W/mK',
      carbonFootprint: '-0.1 kg CO₂/kg (carbon negative)'
    },
    tags: ['insulation', 'renewable', 'breathable'],
    isDownloaded: true
  },
  {
    id: 'recycled-plastic',
    name: 'Recycled Plastic Brick',
    category: 'recycled',
    description: 'Durable bricks made from 100% recycled plastic waste.',
    sustainability: 4,
    thermalRating: 2,
    waterResistance: 5,
    durability: 4,
    cost: 'low',
    properties: {
      density: '1.2-1.4 g/cm³',
      compressiveStrength: '15-20 MPa',
      thermalConductivity: '0.2-0.3 W/mK',
      carbonFootprint: '0.8 kg CO₂/kg'
    },
    tags: ['recycled', 'lightweight', 'moisture-resistant'],
    isDownloaded: false
  },
  {
    id: 'bamboo-fiber',
    name: 'Bamboo Fiber Composite',
    category: 'bio-based',
    description: 'Strong and flexible composite made from bamboo fibers and bio-resin.',
    sustainability: 5,
    thermalRating: 3,
    waterResistance: 4,
    durability: 4,
    cost: 'high',
    properties: {
      density: '0.8-1.0 g/cm³',
      compressiveStrength: '40-60 MPa',
      thermalConductivity: '0.15-0.25 W/mK',
      carbonFootprint: '0.05 kg CO₂/kg'
    },
    tags: ['fast-growing', 'flexible', 'strong'],
    isDownloaded: false
  }
];

export default function MaterialLibrary({
  materials = defaultMaterials,
  selectedMaterial,
  isVisible = true,
  onMaterialSelect,
  onMaterialDownload,
  onMaterialFavorite,
  onClose
}: MaterialLibraryProps) {
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'sustainability' | 'cost'>('name');

  const categories = [
    { id: 'all', name: 'All Materials', count: materials.length },
    { id: 'sustainable', name: 'Sustainable', count: materials.filter(m => m.category === 'sustainable').length },
    { id: 'bio-based', name: 'Bio-Based', count: materials.filter(m => m.category === 'bio-based').length },
    { id: 'recycled', name: 'Recycled', count: materials.filter(m => m.category === 'recycled').length },
    { id: 'traditional', name: 'Traditional', count: materials.filter(m => m.category === 'traditional').length }
  ];

  const filteredMaterials = materials
    .filter(material => {
      const matchesSearch = material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           material.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = selectedCategory === 'all' || material.category === selectedCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'sustainability': return b.sustainability - a.sustainability;
        case 'cost': 
          const costOrder = { low: 1, medium: 2, high: 3 };
          return costOrder[a.cost] - costOrder[b.cost];
        default: return a.name.localeCompare(b.name);
      }
    });

  const getRatingStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star 
        key={i} 
        className={`w-3 h-3 ${i < rating ? 'text-yellow-400 fill-current' : 'text-gray-400'}`} 
      />
    ));
  };

  const getCostColor = (cost: string) => {
    switch (cost) {
      case 'low': return 'text-green-400';
      case 'medium': return 'text-yellow-400';
      case 'high': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const renderMaterialCard = (material: Material) => (
    <div
      key={material.id}
      className={`material-preview ${selectedMaterial === material.id ? 'ring-2 ring-cyan-400' : ''} cursor-pointer`}
      onClick={() => onMaterialSelect?.(material.id)}
    >
      {/* Thumbnail */}
      <div className="material-preview-image bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
        <Palette className="w-8 h-8 text-gray-400" />
      </div>
      
      {/* Overlay Info */}
      <div className="material-preview-overlay">
        <div className="flex items-center justify-between mb-1">
          <span className="font-medium text-xs">{material.name}</span>
          <div className="flex gap-1">
            {material.isFavorite && (
              <Star className="w-3 h-3 text-yellow-400 fill-current" />
            )}
            {material.isDownloaded && (
              <Download className="w-3 h-3 text-green-400" />
            )}
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {getRatingStars(material.sustainability).slice(0, 3)}
          </div>
          <span className={`text-xs ${getCostColor(material.cost)}`}>
            {material.cost}
          </span>
        </div>
      </div>
    </div>
  );

  const renderMaterialListItem = (material: Material) => (
    <div
      key={material.id}
      className={`p-3 border border-gray-600 rounded-lg cursor-pointer transition-all hover:border-cyan-400 ${
        selectedMaterial === material.id ? 'border-cyan-400 bg-cyan-400/10' : ''
      }`}
      onClick={() => onMaterialSelect?.(material.id)}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h4 className="font-medium text-sm text-white">{material.name}</h4>
          <p className="text-xs text-gray-400 mt-1">{material.description}</p>
        </div>
        <div className="flex gap-1 ml-2">
          <button
            className="p-1 hover:bg-gray-700 rounded"
            onClick={(e) => {
              e.stopPropagation();
              onMaterialFavorite?.(material.id);
            }}
          >
            <Star className={`w-3 h-3 ${material.isFavorite ? 'text-yellow-400 fill-current' : 'text-gray-400'}`} />
          </button>
          {!material.isDownloaded && (
            <button
              className="p-1 hover:bg-gray-700 rounded"
              onClick={(e) => {
                e.stopPropagation();
                onMaterialDownload?.(material.id);
              }}
            >
              <Download className="w-3 h-3 text-gray-400" />
            </button>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <Leaf className="w-3 h-3 text-green-400" />
          <div className="flex">{getRatingStars(material.sustainability)}</div>
        </div>
        <div className="flex items-center gap-1">
          <Thermometer className="w-3 h-3 text-blue-400" />
          <div className="flex">{getRatingStars(material.thermalRating)}</div>
        </div>
        <span className={getCostColor(material.cost)}>{material.cost}</span>
      </div>
    </div>
  );

  return (
    <DockablePanel config={panelConfig} isVisible={isVisible} onClose={onClose}>
      
      {/* Search and Controls */}
      <div className="panel-section">
        <div className="panel-search">
          <Search className="w-4 h-4 panel-search-icon" />
          <input
            type="text"
            className="panel-search-input"
            placeholder="Search materials..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-1">
            <button
              className={`p-1 rounded ${viewMode === 'grid' ? 'bg-cyan-600' : 'bg-gray-700'} hover:bg-gray-600 transition-colors`}
              onClick={() => setViewMode('grid')}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              className={`p-1 rounded ${viewMode === 'list' ? 'bg-cyan-600' : 'bg-gray-700'} hover:bg-gray-600 transition-colors`}
              onClick={() => setViewMode('list')}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          
          <select
            className="text-xs bg-gray-700 border border-gray-600 rounded-md p-1 text-white"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="name">Sort by Name</option>
            <option value="sustainability">Sort by Sustainability</option>
            <option value="cost">Sort by Cost</option>
          </select>
        </div>
      </div>

      {/* Categories */}
      <div className="panel-section">
        <div className="grid grid-cols-2 gap-1 text-xs">
          {categories.map(category => (
            <button
              key={category.id}
              className={`p-2 rounded text-left transition-colors ${
                selectedCategory === category.id 
                  ? 'bg-cyan-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              onClick={() => setSelectedCategory(category.id)}
            >
              <div className="font-medium">{category.name}</div>
              <div className="text-xs opacity-75">{category.count} items</div>
            </button>
          ))}
        </div>
      </div>

      {/* Materials */}
      <div className="panel-section flex-1 min-h-0">
        <div className="text-xs text-gray-400 mb-3">
          {filteredMaterials.length} materials found
        </div>
        
        <div className={`overflow-auto h-full ${
          viewMode === 'grid' 
            ? 'grid grid-cols-2 gap-3' 
            : 'space-y-3'
        }`}>
          {filteredMaterials.length > 0 ? (
            filteredMaterials.map(material => 
              viewMode === 'grid' 
                ? renderMaterialCard(material)
                : renderMaterialListItem(material)
            )
          ) : (
            <div className="text-center text-gray-400 py-8">
              <Palette className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No materials found</p>
              <p className="text-xs mt-1">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </div>

      {/* Selected Material Info */}
      {selectedMaterial && (
        <div className="panel-section border-t border-gray-600 pt-3">
          {(() => {
            const material = materials.find(m => m.id === selectedMaterial);
            if (!material) return null;
            
            return (
              <div>
                <h4 className="font-medium text-sm text-white mb-2">{material.name}</h4>
                <div className="text-xs text-gray-400 space-y-1">
                  {Object.entries(material.properties).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span>{key.replace(/([A-Z])/g, ' $1').toLowerCase()}:</span>
                      <span className="text-white">{value}</span>
                    </div>
                  ))}
                </div>
                
                <div className="flex gap-2 mt-3">
                  <button
                    className="flex-1 flex items-center justify-center gap-2 p-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white text-xs transition-colors"
                    onClick={() => onMaterialSelect?.(material.id)}
                  >
                    <Eye className="w-3 h-3" />
                    Apply
                  </button>
                  
                  {!material.isDownloaded && (
                    <button
                      className="p-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
                      onClick={() => onMaterialDownload?.(material.id)}
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </DockablePanel>
  );
} 