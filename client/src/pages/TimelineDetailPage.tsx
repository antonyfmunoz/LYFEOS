import React, { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { ArrowLeft, CalendarClock, BookOpen, Sparkles, Milestone, CalendarDays, Trophy, MessageCircle, Pencil } from 'lucide-react';
import { useLYFEOS } from '@/lib/context';
import { usePageTitle } from '@/hooks/use-page-title';
import EditTimelineItemDialog from '@/components/timeline/EditTimelineItemDialog';

// Define all the different types of timeline items
type TimelineItemType = 'mission' | 'quest' | 'event' | 'achievement' | 'chat' | 'life' | 'journal' | 'ritual' | 'knowledge' | 'goal';

interface TimelineItem {
  id: string;
  date: string;
  title: string;
  description: string;
  content?: string; // Full content for detailed view
  category: string;
  color: string;
  type: TimelineItemType;
  icon: React.ReactNode;
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

// Get icon based on item type
function getItemIcon(type: TimelineItemType): React.ReactNode {
  switch(type) {
    case 'mission':
      return <Milestone className="h-5 w-5" />;
    case 'quest':
      return <Sparkles className="h-5 w-5" />;
    case 'event':
      return <CalendarDays className="h-5 w-5" />;
    case 'achievement':
      return <Trophy className="h-5 w-5" />;
    case 'chat':
      return <MessageCircle className="h-5 w-5" />;
    case 'journal':
      return <BookOpen className="h-5 w-5" />;
    case 'ritual':
      return <CalendarClock className="h-5 w-5" />;
    case 'knowledge':
      return <BookOpen className="h-5 w-5" />;
    case 'goal':
      return <Trophy className="h-5 w-5" />;
    case 'life':
      return <CalendarClock className="h-5 w-5" />;
    default:
      return <CalendarClock className="h-5 w-5" />;
  }
}

// Derive content for the detail page
function getItemContent(item: TimelineItem): string {
  // Return specific content if available
  if (item.content) return item.content;
  
  // Otherwise generate some simulated content based on item type
  switch(item.type) {
    case 'mission':
      return `
# ${item.title}
*Created on ${item.date}*

${item.description}

## Mission Details
This mission represents a significant task or project in your life journey. Missions are the key components that help you move forward toward your goals and aspirations.

## Related Items
- Connect to your quests
- Link to relevant events
- Associate with achievements
      `;
    case 'quest':
      return `
# ${item.title}
*Started on ${item.date}*

${item.description}

## Quest Progress
Quests are smaller objectives that contribute to larger missions. Tracking your quests helps you maintain progress and stay motivated.

## Related Items
- Part of mission: "Life Development"
- Expected completion: 1 week
      `;
    case 'event':
      return `
# ${item.title}
*Scheduled for ${item.date}*

${item.description}

## Event Details
Events mark specific occurrences in time that are significant to your journey. They provide structure and milestones to your calendar.

## Location
Virtual / Home Office

## Participants
- You
- Team members
      `;
    case 'achievement':
      return `
# ${item.title}
*Achieved on ${item.date}*

${item.description}

## Achievement Details
This achievement represents a milestone in your personal growth journey. Achievements are the recognition of your accomplishments and provide motivation to continue your journey.

## Rewards
- Experience: +100 XP
- Confidence boost
- New skill unlocked
      `;
    case 'knowledge':
      return `
# ${item.title}
*Added on ${item.date}*

${item.description}

## Knowledge Details
This knowledge entry represents valuable information and insights you've gathered on your journey. Knowledge items help you build your personal database of wisdom and expertise.

## Key Takeaways
- Build tiny habits for sustainable change
- Focus on systems rather than goals
- Identity-based habits are stronger than outcome-based ones
- The 1% rule for continuous improvement

## Related Resources
- Book: "Atomic Habits" by James Clear
- [Author's website](https://jamesclear.com/)
- Related habit trackers in your system
      `;
    default:
      return `
# ${item.title}
*Recorded on ${item.date}*

${item.description}

## Details
This item represents an important entry in your life timeline. Each item in your timeline contributes to the larger story of your journey.

## Next Steps
- Review related items
- Update with new information
- Connect to your broader goals
      `;
  }
}

export default function TimelineDetailPage() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/chronolog/timeline/:id");
  const { missionPages, events, quests, messages } = useLYFEOS();
  const [item, setItem] = useState<TimelineItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Set page title when item changes
  usePageTitle(item?.title || 'Timeline Item');
  
  useEffect(() => {
    if (!match || !params) {
      navigate('/chronolog/timeline');
      return;
    }
    
    const itemId = params.id;
    
    // Collect all possible timeline items
    const allItems: TimelineItem[] = [
      // Mission pages
      ...missionPages.map(page => {
        return {
          id: `mission-${page.id}`,
          date: new Date(page.createdAt).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
          }),
          title: page.title,
          description: page.content.substring(0, 150) + (page.content.length > 150 ? '...' : ''),
          content: page.content,
          category: 'mission',
          color: 'cyan-400',
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
        color: 'violet-400',
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
        color: 'yellow-400',
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
        color: 'accent',
        type: 'knowledge' as TimelineItemType,
        icon: <BookOpen className="h-4 w-4" />
      },
      {
        id: 'achievement-1',
        date: 'Apr 5, 2025',
        title: '7-Day Meditation Streak',
        description: 'Completed a full week of daily meditation practice',
        category: 'achievement',
        color: 'amber-400',
        type: 'achievement' as TimelineItemType,
        icon: <Trophy className="h-4 w-4" />
      }
    ];
    
    // Find the item with the matching ID
    const foundItem = allItems.find(item => item.id === itemId);
    
    if (foundItem) {
      // Set item state
      setItem(foundItem);
    } else {
      // If item not found, redirect back to timeline
      navigate('/chronolog/timeline');
    }
  }, [match, params, navigate, missionPages, events, quests, messages]);
  
  // Improved back navigation with history state handling
  const goBack = () => {
    // Check if there's an entry in the history to go back to
    if (window.history.state && window.history.state.previous === '/chronolog/timeline') {
      window.history.back();
    } else {
      // Otherwise navigate directly to ensure consistent behavior
      navigate('/chronolog/timeline');
    }
  };
  
  // Set up history state when component mounts
  useEffect(() => {
    // Update the history state to track where we came from
    window.history.replaceState(
      { previous: '/chronolog/timeline' }, 
      '', 
      window.location.pathname
    );
    
    return () => {
      // Clean up approach: no action needed as we're leaving the component
    };
  }, []);
  
  const openEditDialog = () => {
    setIsDialogOpen(true);
  };
  
  if (!item) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  // Generate content for the page
  const content = getItemContent(item);
  
  return (
    <div>
      <div className="flex items-center mb-6">
        <button 
          onClick={goBack}
          className="flex items-center justify-center rounded-md h-9 w-9 mr-3 bg-background/10 hover:bg-background/20 hover:shadow-[0_0_10px_rgba(255,255,0,0.5)] transition-all"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-2xl font-orbitron mb-1">{item.title}</h1>
          <p className="text-[#7DAAB2]">Timeline item details</p>
        </div>
      </div>
      
      <div className="glassmorphic rounded-xl p-6 neon-border mb-8">
        <div className="flex items-center mb-6">
          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center mr-4"
            style={{ 
              backgroundColor: `${getNodeColor(item.category)}30`,
              border: `2px solid ${getNodeColor(item.category)}`
            }}
          >
            <div style={{ color: getNodeColor(item.category) }}>
              {getItemIcon(item.type)}
            </div>
          </div>
          <div>
            <div className="flex items-center">
              <h2 className="text-xl font-orbitron text-[#D6F4FF]">{item.title}</h2>
              <span 
                className="text-xs px-2 py-0.5 rounded ml-3 flex items-center"
                style={{ 
                  backgroundColor: `${getNodeColor(item.category)}20`,
                  color: getNodeColor(item.category)
                }}
              >
                {item.type}
              </span>
            </div>
            <p className="text-xs text-[#7DAAB2]">Recorded on {item.date}</p>
          </div>
        </div>
        
        <div className="prose prose-invert max-w-none mt-6">
          <div className="whitespace-pre-wrap" style={{ fontFamily: 'inherit' }}>
            {content.split('\n').map((line, i) => {
              if (line.startsWith('# ')) {
                return <h1 key={i} className="text-2xl font-orbitron mb-2">{line.substring(2)}</h1>;
              } else if (line.startsWith('## ')) {
                return <h2 key={i} className="text-xl font-medium mt-6 mb-2">{line.substring(3)}</h2>;
              } else if (line.startsWith('### ')) {
                return <h3 key={i} className="text-lg font-medium mt-4 mb-2">{line.substring(4)}</h3>;
              } else if (line.startsWith('- ')) {
                return <div key={i} className="flex items-start mb-1">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 mr-2"></div>
                  <div>{line.substring(2)}</div>
                </div>;
              } else if (line.startsWith('*') && line.endsWith('*')) {
                return <div key={i} className="text-muted-foreground italic mb-4">{line.substring(1, line.length - 1)}</div>;
              } else if (line.includes('[') && line.includes(']') && line.includes('(') && line.includes(')')) {
                // Simple link parsing
                const linkRegex = /\[(.*?)\]\((.*?)\)/g;
                const parts = [];
                let lastIndex = 0;
                let match;
                
                while ((match = linkRegex.exec(line)) !== null) {
                  // Add text before the link
                  if (match.index > lastIndex) {
                    parts.push(<span key={`text-${i}-${lastIndex}`}>{line.substring(lastIndex, match.index)}</span>);
                  }
                  
                  // Add the link
                  parts.push(
                    <a 
                      key={`link-${i}-${match.index}`}
                      href={match[2]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {match[1]}
                    </a>
                  );
                  
                  lastIndex = match.index + match[0].length;
                }
                
                // Add any remaining text
                if (lastIndex < line.length) {
                  parts.push(<span key={`text-${i}-${lastIndex}`}>{line.substring(lastIndex)}</span>);
                }
                
                return <div key={i} className="mb-2">{parts}</div>;
              } else if (line.trim() === '') {
                return <div key={i} className="h-4"></div>;
              } else {
                return <div key={i} className="mb-2">{line}</div>;
              }
            })}
          </div>
        </div>
        
        <div className="flex justify-end mt-8">
          <button 
            onClick={goBack}
            className="flex items-center px-3 py-1 text-xs font-medium rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition mr-2"
          >
            Back to Timeline
          </button>
          <button 
            onClick={openEditDialog}
            className="flex items-center px-3 py-1 text-xs font-medium rounded-md bg-primary/10 text-primary hover:bg-primary/20 hover:shadow-[0_0_10px_rgba(255,255,0,0.5)] transition"
          >
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Details
          </button>
          
          {/* Use our new EditTimelineItemDialog component */}
          <EditTimelineItemDialog 
            isOpen={isDialogOpen}
            onClose={() => setIsDialogOpen(false)}
            item={item as any}
            onSave={(updatedItem) => {
              // Cast to tell TypeScript these are the same type structure
              setItem(updatedItem as any);
              console.log('Timeline item updated:', updatedItem.title);
            }}
          />
        </div>
      </div>
    </div>
  );
}