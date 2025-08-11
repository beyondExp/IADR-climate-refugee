import { useState } from 'react';
import { ArrowLeft, Settings, TestTube2, Wrench } from 'lucide-react';
import ConnectionPointEditor from './ConnectionPointEditor';
import BrickConnectionDemo from './BrickConnectionDemo';

interface AdminRouterProps {
  onBack?: () => void;
}

export default function AdminRouter({ onBack }: AdminRouterProps) {
  const [currentAdminView, setCurrentAdminView] = useState<'overview' | 'connection-editor' | 'connection-demo'>('overview');

  const renderAdminContent = () => {
    switch (currentAdminView) {
      case 'connection-editor':
        return <ConnectionPointEditor brickId="octa2" />;
      case 'connection-demo':
        return <BrickConnectionDemo />;
      default:
        return <AdminOverview onNavigate={setCurrentAdminView} />;
    }
  };

  return (
    <div className="admin-router bg-gray-900 text-white min-h-screen">
      {/* Admin Header */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Creator
            </button>
            <div className="h-6 w-px bg-gray-600"></div>
            <h1 className="text-xl font-bold text-green-400 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Admin Tools
            </h1>
          </div>
          <div className="text-sm text-gray-400">
            IADR Climate Refugee • Admin Panel
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-t border-gray-700">
          <button
            onClick={() => setCurrentAdminView('overview')}
            className={`flex items-center gap-2 px-6 py-3 transition-colors ${
              currentAdminView === 'overview' 
                ? 'bg-green-900/50 text-green-400 border-b-2 border-green-400' 
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            <Settings className="w-4 h-4" />
            Overview
          </button>
          <button
            onClick={() => setCurrentAdminView('connection-editor')}
            className={`flex items-center gap-2 px-6 py-3 transition-colors ${
              currentAdminView === 'connection-editor' 
                ? 'bg-green-900/50 text-green-400 border-b-2 border-green-400' 
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            <Wrench className="w-4 h-4" />
            Connection Editor
          </button>
          <button
            onClick={() => setCurrentAdminView('connection-demo')}
            className={`flex items-center gap-2 px-6 py-3 transition-colors ${
              currentAdminView === 'connection-demo' 
                ? 'bg-green-900/50 text-green-400 border-b-2 border-green-400' 
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            <TestTube2 className="w-4 h-4" />
            Connection Demo
          </button>
        </div>
      </div>

      {/* Admin Content */}
      {renderAdminContent()}
    </div>
  );
}

// Admin Overview Component
function AdminOverview({ onNavigate }: { onNavigate: (view: 'overview' | 'connection-editor' | 'connection-demo') => void }) {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-green-400 mb-4">
          🏗️ Climate Refugee Shelter Admin Dashboard
        </h2>
        <p className="text-gray-300 max-w-3xl">
          Configure and test the revolutionary brick connection system for building climate-resilient shelters. 
          Use these tools to design custom connection points and validate structural integrity.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Connection Editor Card */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-900/50 rounded-lg flex items-center justify-center">
              <Wrench className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Connection Point Editor</h3>
              <p className="text-sm text-gray-400">Visual 3D editor for brick sockets</p>
            </div>
          </div>
          <p className="text-gray-300 mb-4">
            Design and position male, female, and neutral connection points on brick models. 
            Real-time 3D editing with visual feedback.
          </p>
          <button
            onClick={() => onNavigate('connection-editor')}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium transition-colors"
          >
            <Wrench className="w-4 h-4" />
            Open Editor
          </button>
        </div>

        {/* Connection Demo Card */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-green-900/50 rounded-lg flex items-center justify-center">
              <TestTube2 className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Connection Demo</h3>
              <p className="text-sm text-gray-400">Test brick connections interactively</p>
            </div>
          </div>
          <p className="text-gray-300 mb-4">
            Test how different brick types connect together. Validate structural integrity 
            and experiment with neutral connection points.
          </p>
          <button
            onClick={() => onNavigate('connection-demo')}
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-medium transition-colors"
          >
            <TestTube2 className="w-4 h-4" />
            Run Demo
          </button>
        </div>
      </div>

      {/* System Information */}
      <div className="mt-8 bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-green-400 mb-4">🔧 System Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-gray-400">Connection Types</div>
            <div className="text-white font-medium">Male, Female, Neutral</div>
          </div>
          <div>
            <div className="text-gray-400">Supported Axes</div>
            <div className="text-white font-medium">X, Y, Z axis alignment</div>
          </div>
          <div>
            <div className="text-gray-400">Strength Range</div>
            <div className="text-white font-medium">0.3x - 1.0x multiplier</div>
          </div>
        </div>
      </div>

      {/* Connection Rules Quick Reference */}
      <div className="mt-6 bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-green-400 mb-4">📋 Connection Rules Quick Reference</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-white mb-3">Connection Compatibility</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-blue-500 rounded"></div>
                <span className="text-gray-300">Male ↔ Female: Perfect fit (1.0x strength)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                <span className="text-gray-300">Neutral ↔ Male/Female: Universal (0.6-0.7x)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                <span className="text-gray-300">Neutral ↔ Neutral: Flexible (0.4-0.5x)</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="font-medium text-white mb-3">Design Guidelines</h4>
            <div className="space-y-1 text-sm text-gray-300">
              <div>• Vertical connections (Y-axis) provide maximum strength</div>
              <div>• Neutral points enable complex architectural forms</div>
              <div>• Connection tolerance: 5cm spatial alignment</div>
              <div>• Multiple connections increase structural integrity</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}