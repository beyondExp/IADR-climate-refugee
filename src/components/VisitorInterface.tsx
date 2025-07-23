import ARViewer from './ARViewer'
import { useAuth } from '../contexts/AuthContext'

interface VisitorInterfaceProps {
  onBack?: () => void;
}

export default function VisitorInterface({ onBack }: VisitorInterfaceProps) {
  const { user } = useAuth()

  // Directly show AR viewer - no complex tabs or interfaces
  return (
    <ARViewer 
      user={user}
      onBack={onBack}
    />
  )
} 