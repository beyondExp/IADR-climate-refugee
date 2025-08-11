import { useState, useEffect } from 'react';
import type { RevolutionaryBrick } from '../../utils/brickConnectionSystem';
import { BrickConnectionSystem } from '../../utils/brickConnectionSystem';
import * as THREE from 'three';

export default function BrickConnectionDemo() {
  const [connectionSystem] = useState(() => new BrickConnectionSystem());
  const [bricks, setBricks] = useState<RevolutionaryBrick[]>([]);
  const [connections, setConnections] = useState<string[]>([]);
  const [selectedBrick1, setSelectedBrick1] = useState<string>('');
  const [selectedBrick2, setSelectedBrick2] = useState<string>('');
  const [selectedConnection1, setSelectedConnection1] = useState<string>('');
  const [selectedConnection2, setSelectedConnection2] = useState<string>('');

  useEffect(() => {
    // Create some demo bricks with different connection configurations
    const brick1 = connectionSystem.createRevolutionaryBrick(
      'demo-brick-1',
      new THREE.Vector3(0, 0, 0),
      new THREE.Euler(0, 0, 0),
      'clay-sustainable',
      { male: 2, female: 2, neutral: 2 } // Default configuration
    );

    const brick2 = connectionSystem.createRevolutionaryBrick(
      'demo-brick-2', 
      new THREE.Vector3(0.5, 0, 0),
      new THREE.Euler(0, 0, 0),
      'bio-composite',
      { male: 1, female: 1, neutral: 4 } // More neutral connections
    );

    const brick3 = connectionSystem.createRevolutionaryBrick(
      'demo-brick-3',
      new THREE.Vector3(0, 0.5, 0),
      new THREE.Euler(0, 0, 0),
      'recycled-aggregate',
      { male: 3, female: 3, neutral: 0 } // Traditional male/female only
    );

    setBricks([brick1, brick2, brick3]);
  }, [connectionSystem]);

  const attemptConnection = () => {
    if (!selectedBrick1 || !selectedBrick2 || !selectedConnection1 || !selectedConnection2) {
      alert('Please select two bricks and their connection points');
      return;
    }

    const success = connectionSystem.connectBricks(
      selectedBrick1,
      selectedConnection1,
      selectedBrick2,
      selectedConnection2
    );

    if (success) {
      setConnections(prev => [
        ...prev, 
        `${selectedConnection1} ⟷ ${selectedConnection2}`
      ]);
    } else {
      alert('Connection failed! Check console for details.');
    }
  };

  const getConnectionTypeColor = (type: string) => {
    switch (type) {
      case 'male': return 'text-blue-400 bg-blue-900/30';
      case 'female': return 'text-pink-400 bg-pink-900/30';
      case 'neutral': return 'text-yellow-400 bg-yellow-900/30';
      default: return 'text-gray-400 bg-gray-900/30';
    }
  };

  return (
    <div className="brick-connection-demo bg-gray-900 text-white min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-green-400 mb-2">
            🧱 Revolutionary Brick Connection System Demo
          </h1>
          <p className="text-gray-300">
            Test the new neutral connection points that can connect to both male and female connections!
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Brick Information */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-green-400">Available Bricks</h2>
            
            {bricks.map(brick => (
              <div key={brick.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-semibold text-lg">{brick.id}</h3>
                  <span className="text-sm bg-gray-700 px-2 py-1 rounded">
                    {brick.brickType}
                  </span>
                </div>

                <div className="mb-3">
                  <div className="text-sm text-gray-400 mb-2">
                    Connection Points ({brick.connections.length}):
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {brick.connections.map(conn => (
                      <div
                        key={conn.id}
                        className={`p-2 rounded text-xs border ${getConnectionTypeColor(conn.type)} ${
                          conn.isConnected ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="font-medium">
                          {conn.type.toUpperCase()} - {conn.axis.toUpperCase()}
                        </div>
                        <div className="text-xs opacity-75">
                          {conn.isConnected ? '🔗 Connected' : '🔓 Available'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-xs text-gray-500">
                  Structural Integrity: {(brick.structuralIntegrity * 100).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>

          {/* Connection Interface */}
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-green-400">Make Connection</h2>
            
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              {/* Brick Selection */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Brick 1</label>
                  <select
                    value={selectedBrick1}
                    onChange={(e) => setSelectedBrick1(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  >
                    <option value="">Select Brick</option>
                    {bricks.map(brick => (
                      <option key={brick.id} value={brick.id}>{brick.id}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-2">Brick 2</label>
                  <select
                    value={selectedBrick2}
                    onChange={(e) => setSelectedBrick2(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  >
                    <option value="">Select Brick</option>
                    {bricks.map(brick => (
                      <option key={brick.id} value={brick.id}>{brick.id}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Connection Point Selection */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Connection Point 1</label>
                  <select
                    value={selectedConnection1}
                    onChange={(e) => setSelectedConnection1(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    disabled={!selectedBrick1}
                  >
                    <option value="">Select Connection</option>
                    {selectedBrick1 && bricks.find(b => b.id === selectedBrick1)?.connections
                      .filter(c => !c.isConnected)
                      .map(conn => (
                        <option key={conn.id} value={conn.id}>
                          {conn.type.toUpperCase()} - {conn.axis.toUpperCase()}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-2">Connection Point 2</label>
                  <select
                    value={selectedConnection2}
                    onChange={(e) => setSelectedConnection2(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    disabled={!selectedBrick2}
                  >
                    <option value="">Select Connection</option>
                    {selectedBrick2 && bricks.find(b => b.id === selectedBrick2)?.connections
                      .filter(c => !c.isConnected)
                      .map(conn => (
                        <option key={conn.id} value={conn.id}>
                          {conn.type.toUpperCase()} - {conn.axis.toUpperCase()}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <button
                onClick={attemptConnection}
                disabled={!selectedBrick1 || !selectedBrick2 || !selectedConnection1 || !selectedConnection2}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded font-medium"
              >
                🔗 Attempt Connection
              </button>
            </div>

            {/* Active Connections */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h3 className="font-semibold text-green-400 mb-3">Active Connections</h3>
              {connections.length === 0 ? (
                <p className="text-gray-400 text-sm">No connections made yet</p>
              ) : (
                <div className="space-y-2">
                  {connections.map((conn, index) => (
                    <div key={index} className="bg-gray-700 rounded px-3 py-2 text-sm">
                      {conn}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Connection Rules Guide */}
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h3 className="font-semibold text-green-400 mb-3">Connection Rules</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-blue-500 rounded"></span>
                  <span>Male ⟷ Female: Strongest connections (1.0x strength)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-yellow-500 rounded"></span>
                  <span>Neutral ⟷ Male/Female: Moderate connections (0.6-0.7x strength)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-yellow-500 rounded"></span>
                  <span>Neutral ⟷ Neutral: Flexible but weaker (0.4-0.5x strength)</span>
                </div>
                <div className="text-gray-400 text-xs mt-3">
                  * Connections must be on the same axis and within tolerance distance
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}