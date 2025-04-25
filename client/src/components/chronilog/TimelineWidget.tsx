import React from 'react';
import { CalendarClock, ArrowUpRight } from 'lucide-react';
import { useLYFEOS } from '@/lib/context';

interface TimelineItem {
  id: string;
  date: string;
  title: string;
  description: string;
  category: string;
  color: string;
}

const TimelineWidget = () => {
  const { missionPages } = useLYFEOS();
  
  // Convert missionPages to timeline items
  const timelineItems: TimelineItem[] = missionPages.map(page => ({
    id: page.id.toString(),
    date: new Date(page.createdAt).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric'
    }),
    title: page.title,
    description: page.description || 'No description',
    category: page.category,
    color: getCategoryColor(page.category)
  }));

  // Sort items by date (most recent first)
  const sortedItems = [...timelineItems].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  }).slice(0, 6); // Limit to 6 most recent items

  return (
    <div className="glassmorphic rounded-xl p-6 neon-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <CalendarClock className="h-5 w-5 text-primary mr-2" />
          <h3 className="text-lg font-orbitron text-[#D6F4FF]">Recent Timeline</h3>
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
      </div>
      
      <div className="space-y-6 relative">
        {/* Vertical timeline line */}
        <div className="absolute left-4 top-2 bottom-2 w-px bg-primary/30" />
        
        {sortedItems.length > 0 ? (
          sortedItems.map((item, index) => (
            <div key={item.id} className="flex items-start ml-2">
              {/* Timeline node */}
              <div 
                className={`w-6 h-6 rounded-full border-2 mt-0.5 z-10 flex items-center justify-center mr-3`}
                style={{ 
                  borderColor: getNodeColor(item.category),
                  backgroundColor: `${getNodeColor(item.category)}30`
                }}
              >
                <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: getNodeColor(item.category) }} />
              </div>
              
              {/* Content */}
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs text-muted-foreground">{item.date}</span>
                    <h4 className="text-sm font-medium text-foreground">{item.title}</h4>
                  </div>
                  <span 
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ 
                      backgroundColor: `${getNodeColor(item.category)}20`,
                      color: getNodeColor(item.category)
                    }}
                  >
                    {item.category}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <p>No entries yet. Start creating mission logs to build your timeline.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper function to get color based on category
function getCategoryColor(category: string): string {
  switch(category.toLowerCase()) {
    case 'missions':
      return 'cyan-400';
    case 'journal':
      return 'primary';
    case 'rituals':
      return 'secondary';
    case 'knowledge':
      return 'accent';
    case 'goals':
      return 'emerald-400';
    default:
      return 'primary';
  }
}

// Helper function to get actual color values
function getNodeColor(category: string): string {
  switch(category.toLowerCase()) {
    case 'missions':
      return '#22d3ee'; // cyan-400
    case 'journal':
      return 'var(--primary)';
    case 'rituals':
      return 'var(--secondary)';
    case 'knowledge':
      return 'var(--accent)';
    case 'goals':
      return '#34d399'; // emerald-400
    default:
      return 'var(--primary)';
  }
}

export default TimelineWidget;