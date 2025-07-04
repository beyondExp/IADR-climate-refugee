import { Cpu, HardDrive, Wifi, Clock, Users, Activity } from 'lucide-react';

interface StatusBarProps {
  fps?: number;
  memoryUsage?: number;
  renderTime?: number;
  isOnline?: boolean;
  constructionProgress?: number;
  selectedObjects?: number;
  totalObjects?: number;
  activeUsers?: number;
  currentTime?: string;
}

export default function StatusBar({
  fps = 60,
  memoryUsage = 45,
  renderTime = 16.7,
  isOnline = true,
  constructionProgress = 0,
  selectedObjects = 0,
  totalObjects = 0,
  activeUsers = 1,
  currentTime
}: StatusBarProps) {
  
  const formatTime = () => {
    if (currentTime) return currentTime;
    return new Date().toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatMemory = (usage: number) => {
    return `${usage.toFixed(1)}%`;
  };

  const formatFPS = (fps: number) => {
    const color = fps >= 55 ? 'text-green-400' : fps >= 30 ? 'text-yellow-400' : 'text-red-400';
    return { value: `${fps} FPS`, color };
  };

  const connectionStatus = isOnline ? {
    text: 'Online',
    color: 'text-green-400',
    icon: <Wifi className="w-3 h-3" />
  } : {
    text: 'Offline',
    color: 'text-red-400',
    icon: <Wifi className="w-3 h-3 opacity-50" />
  };

  return (
    <div className="status-bar">
      {/* Left Section - Selection Info */}
      <div className="status-section">
        <div className="status-item">
          <span>Selected: {selectedObjects}</span>
        </div>
        
        {totalObjects > 0 && (
          <div className="status-item">
            <span>Total: {totalObjects}</span>
          </div>
        )}

        {constructionProgress > 0 && (
          <div className="progress-indicator">
            <span className="text-xs">Building:</span>
            <div className="progress-bar-mini">
              <div 
                className="progress-fill-mini"
                style={{ width: `${constructionProgress}%` }}
              />
            </div>
            <span className="text-xs">{Math.round(constructionProgress)}%</span>
          </div>
        )}
      </div>

      {/* Center Section - Performance */}
      <div className="status-section">
        <div className="status-item">
          <Activity className="w-3 h-3" />
          <span className={formatFPS(fps).color}>{formatFPS(fps).value}</span>
        </div>

        <div className="status-item">
          <Cpu className="w-3 h-3" />
          <span>{renderTime.toFixed(1)}ms</span>
        </div>

        <div className="status-item">
          <HardDrive className="w-3 h-3" />
          <span className={memoryUsage > 80 ? 'text-red-400' : memoryUsage > 60 ? 'text-yellow-400' : 'text-green-400'}>
            {formatMemory(memoryUsage)}
          </span>
        </div>
      </div>

      {/* Right Section - Connection & Time */}
      <div className="status-section">
        {activeUsers > 1 && (
          <div className="status-item">
            <Users className="w-3 h-3" />
            <span>{activeUsers}</span>
          </div>
        )}

        <div className="status-item">
          {connectionStatus.icon}
          <span className={connectionStatus.color}>{connectionStatus.text}</span>
        </div>

        <div className="status-item">
          <Clock className="w-3 h-3" />
          <span>{formatTime()}</span>
        </div>
      </div>
    </div>
  );
} 