import React from 'react';
import { CalendarClock, ArrowUpRight, BookOpen, Sparkles, Milestone, CalendarDays, Trophy, MessageCircle, GripVertical } from 'lucide-react';
import { useLYFEOS } from '@/lib/context';
import { MissionPage, CalendarEvent, Quest } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useLocation } from 'wouter';

// Define all the different types of timeline items
type TimelineItemType = 'mission' | 'quest' | 'event' | 'achievement' | 'chat' | 'life' | 'journal' | 'ritual' | 'knowledge' | 'goal';

interface TimelineItem {
  id: string;
  date: string;
  title: string;
  description: string;
  category: string;
  color: string;
  type: TimelineItemType;
  icon: React.ReactNode;
}

// Helper function to get color based on category
function getCategoryColor(category: string): string {
  switch(category.toLowerCase()) {
    case 'mission':
      return 'cyan-400';
    case 'journal':
      return 'primary';
    case 'ritual':
      return 'secondary';
    case 'knowledge':
      return 'accent';
    case 'goal':
      return 'emerald-400';
    case 'quest':
      return 'yellow-400';
    case 'event':
      return 'violet-400';
    case 'achievement':
      return 'amber-400';
    case 'chat':
      return 'blue-400';
    case 'life':
      return 'red-400';
    default:
      return 'primary';
  }
}

// Helper function to get actual color values
function getNodeColor(category: string): string {
  switch(category.toLowerCase()) {
    case 'mission':
      return '#22d3ee'; // cyan-400
    case 'journal':
      return 'var(--primary)';
    case 'ritual':
      return 'var(--secondary)';
    case 'knowledge':
      return 'var(--accent)';
    case 'goal':
      return '#34d399'; // emerald-400
    case 'quest':
      return '#facc15'; // yellow-400
    case 'event':
      return '#a78bfa'; // violet-400
    case 'achievement':
      return '#fbbf24'; // amber-400
    case 'chat':
      return '#60a5fa'; // blue-400
    case 'life':
      return '#f87171'; // red-400
    default:
      return 'var(--primary)';
  }
}

// Extract a short description from the markdown content
function getDescriptionFromContent(content: string): string {
  if (!content) return 'No description available';
  
  // Remove markdown formatting
  const cleanContent = content
    .replace(/#{1,6}\s+/g, '') // Remove headings
    .replace(/\*\*|__/g, '')   // Remove bold
    .replace(/\*|_/g, '')      // Remove italic
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Replace links with just their text
    .replace(/^\s*[\-\*]\s+/gm, '') // Remove list markers
    .replace(/`{1,3}[^`]*`{1,3}/g, ''); // Remove code blocks and inline code

  // Get the first two sentences or up to 150 characters
  const sentences = cleanContent.split(/[.!?]+/);
  const firstSentences = sentences.slice(0, 2).join('. ');
  
  if (firstSentences.length <= 150) {
    return firstSentences.trim() || 'No description available';
  }
  
  return firstSentences.substring(0, 147).trim() + '...';
}

// Derive a category from tags
function getCategoryFromTags(tags: string[]): string {
  if (!tags || tags.length === 0) {
    return 'mission';
  }
  
  const tagMap: Record<string, string> = {
    journal: 'journal',
    diary: 'journal',
    reflection: 'journal',
    routine: 'ritual',
    ritual: 'ritual',
    habit: 'ritual',
    knowledge: 'knowledge',
    learning: 'knowledge',
    book: 'knowledge',
    course: 'knowledge',
    goal: 'goal',
    vision: 'goal',
    aspiration: 'goal',
    objective: 'goal',
    mission: 'mission',
    task: 'mission',
    project: 'mission',
    quest: 'quest',
    adventure: 'quest',
    challenge: 'quest',
    event: 'event',
    meeting: 'event',
    appointment: 'event',
    achievement: 'achievement',
    milestone: 'achievement',
    success: 'achievement',
    chat: 'chat',
    conversation: 'chat',
    discussion: 'chat',
    life: 'life',
    personal: 'life',
    memory: 'life'
  };
  
  // Check if any tags match our categories
  for (const tag of tags) {
    const lowerTag = tag.toLowerCase();
    if (tagMap[lowerTag]) {
      return tagMap[lowerTag];
    }
  }
  
  return 'mission'; // Default category
}

// Get icon based on item type
function getItemIcon(type: TimelineItemType): React.ReactNode {
  switch(type) {
    case 'mission':
      return <Milestone className="h-4 w-4" />;
    case 'quest':
      return <Sparkles className="h-4 w-4" />;
    case 'event':
      return <CalendarDays className="h-4 w-4" />;
    case 'achievement':
      return <Trophy className="h-4 w-4" />;
    case 'chat':
      return <MessageCircle className="h-4 w-4" />;
    case 'journal':
      return <BookOpen className="h-4 w-4" />;
    case 'ritual':
      return <CalendarClock className="h-4 w-4" />;
    case 'knowledge':
      return <BookOpen className="h-4 w-4" />;
    case 'goal':
      return <Trophy className="h-4 w-4" />;
    case 'life':
      return <CalendarClock className="h-4 w-4" />;
    default:
      return <CalendarClock className="h-4 w-4" />;
  }
}

const TimelineWidget = () => {
  const { missionPages, events, quests, messages } = useLYFEOS();
  
  // Combine different data sources into timeline items
  const timelineItems: TimelineItem[] = [
    // Mission pages
    ...missionPages.map(page => {
      const category = getCategoryFromTags(page.tags);
      return {
        id: `mission-${page.id}`,
        date: new Date(page.createdAt).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric',
          year: 'numeric'
        }),
        title: page.title,
        description: getDescriptionFromContent(page.content),
        category,
        color: getCategoryColor(category),
        type: 'mission' as TimelineItemType,
        icon: <Milestone className="h-4 w-4" />
      };
    }),
    
    // Events
    ...events.map(event => ({
      id: `event-${event.id}`,
      date: new Date(event.startTime).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      title: event.title,
      description: event.description,
      category: 'event',
      color: getCategoryColor('event'),
      type: 'event' as TimelineItemType,
      icon: <CalendarDays className="h-4 w-4" />
    })),
    
    // Quests
    ...quests.map(quest => ({
      id: `quest-${quest.id}`,
      date: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      title: quest.title,
      description: quest.description,
      category: 'quest',
      color: getCategoryColor('quest'),
      type: 'quest' as TimelineItemType,
      icon: <Sparkles className="h-4 w-4" />
    })),
    
    // Add some life events (simulated for now)
    {
      id: 'life-1',
      date: 'Apr 10, 2025',
      title: 'Started Reading "Atomic Habits"',
      description: 'Began reading James Clear\'s book on habit formation and improvement',
      category: 'knowledge',
      color: getCategoryColor('knowledge'),
      type: 'life' as TimelineItemType,
      icon: <BookOpen className="h-4 w-4" />
    },
    {
      id: 'achievement-1',
      date: 'Apr 5, 2025',
      title: '7-Day Meditation Streak',
      description: 'Completed a full week of daily meditation practice',
      category: 'achievement',
      color: getCategoryColor('achievement'),
      type: 'achievement' as TimelineItemType,
      icon: <Trophy className="h-4 w-4" />
    }
  ];

  // Sort items by date (most recent first)
  const sortedItems = [...timelineItems].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  }).slice(0, 10); // Limit to 10 most recent items

  const [, navigate] = useLocation();
  const navigateToFullTimeline = () => {
    // This would navigate to a full timeline view page when implemented
    navigate('/chronolog/timeline');
  };

  return (
    <div 
      className={cn(
        "glassmorphic rounded-xl p-6 neon-border hover:shadow-[0_0_10px_var(--primary-glow-medium)] hover:border-primary/60 transition-all duration-300 cursor-pointer"
      )}
      onClick={navigateToFullTimeline}
    >
      <div className="flex items-center mb-3">
        <div className="cursor-move mr-2">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mr-4">
          <span className="material-icons text-2xl text-primary">history</span>
        </div>
        <div>
          <h3 className="text-lg font-orbitron text-[#D6F4FF]">Life Timeline</h3>
          <p className="text-xs text-[#7DAAB2]">Your journey through time</p>
        </div>
      </div>
      
      <div className="space-y-6 relative mt-6">
        {/* Vertical timeline line */}
        <div className="absolute left-4 top-2 bottom-2 w-px bg-primary/30" />
        
        {sortedItems.length > 0 ? (
          sortedItems.map((item, index) => (
            <div key={item.id} className="flex items-start ml-2 group">
              {/* Timeline node */}
              <div 
                className={`w-6 h-6 rounded-full border-2 mt-0.5 z-10 flex items-center justify-center mr-3 transition-all group-hover:scale-110`}
                style={{ 
                  borderColor: getNodeColor(item.category),
                  backgroundColor: `${getNodeColor(item.category)}30`
                }}
              >
                <div className="flex items-center justify-center w-full h-full" style={{ color: getNodeColor(item.category) }}>
                  {item.icon}
                </div>
              </div>
              
              {/* Content */}
              <div className="flex-1 bg-background/10 p-3 rounded-lg border border-primary/10 group-hover:border-primary/30 transition-all">
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <span className="text-xs text-muted-foreground">{item.date}</span>
                    <h4 className="text-sm font-medium text-foreground">{item.title}</h4>
                  </div>
                  <span 
                    className="text-xs px-2 py-0.5 rounded flex items-center"
                    style={{ 
                      backgroundColor: `${getNodeColor(item.category)}20`,
                      color: getNodeColor(item.category)
                    }}
                  >
                    {item.type}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <p>No entries yet. Start creating entries to build your life timeline.</p>
          </div>
        )}
        
        {/* View more button */}
        <div className="flex justify-end mt-4">
          <button 
            className="text-xs font-medium px-3 py-1 rounded-md bg-primary/10 text-primary hover:bg-opacity-20 transition"
            onClick={(e) => {
              e.stopPropagation(); // Prevent the parent div's onClick from firing
              navigateToFullTimeline();
            }}
          >
            OPEN
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimelineWidget;