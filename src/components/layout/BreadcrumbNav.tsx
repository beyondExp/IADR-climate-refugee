import { ChevronRight, Home, FolderOpen, FileText } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  icon?: React.ReactNode;
  path?: string;
  action?: () => void;
}

interface BreadcrumbNavProps {
  items: BreadcrumbItem[];
  onNavigate?: (path: string) => void;
}

export default function BreadcrumbNav({ items, onNavigate }: BreadcrumbNavProps) {
  const handleItemClick = (item: BreadcrumbItem, index: number) => {
    if (index === items.length - 1) return; // Don't navigate to current item
    
    if (item.action) {
      item.action();
    } else if (item.path && onNavigate) {
      onNavigate(item.path);
    }
  };

  return (
    <nav className="breadcrumb-nav">
      {items.map((item, index) => (
        <div key={index} className="flex items-center">
          <div
            className={`breadcrumb-item ${
              index === items.length - 1 ? 'active' : 'cursor-pointer'
            }`}
            onClick={() => handleItemClick(item, index)}
          >
            {item.icon && (
              <span className="breadcrumb-icon">
                {item.icon}
              </span>
            )}
            <span className="breadcrumb-label">{item.label}</span>
          </div>
          
          {index < items.length - 1 && (
            <ChevronRight className="w-3 h-3 breadcrumb-separator mx-2" />
          )}
        </div>
      ))}
    </nav>
  );
} 