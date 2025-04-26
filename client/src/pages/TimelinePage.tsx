import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, Link } from 'wouter';
import { ArrowLeft, CalendarClock, BookOpen, Sparkles, Milestone, CalendarDays, Trophy, MessageCircle, CheckCircle2, XCircle, Filter, ArrowUpDown } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLYFEOS } from '@/lib/context';
import { usePageTitle } from '@/hooks/use-page-title';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

export default function TimelinePage() {
  // Set the page title
  usePageTitle('Timeline');
  
  const [, navigate] = useLocation();
  const { missionPages, events, quests, messages } = useLYFEOS();

  // State for filtering and sorting
  const [activeFilters, setActiveFilters] = useState<TimelineItemType[]>([]);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  
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
      type: 'knowledge' as TimelineItemType,
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

  // Filter and sort items
  const filteredAndSortedItems = useMemo(() => {
    // First apply filters
    let result = timelineItems;
    
    if (activeFilters.length > 0) {
      result = result.filter(item => activeFilters.includes(item.type));
    }
    
    // Then sort
    return [...result].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      
      return sortOrder === 'newest' 
        ? dateB - dateA  // newest first
        : dateA - dateB; // oldest first
    });
  }, [timelineItems, activeFilters, sortOrder]);
  
  // Toggle a filter
  const toggleFilter = (type: TimelineItemType) => {
    setActiveFilters(prev => {
      if (prev.includes(type)) {
        return prev.filter(t => t !== type);
      } else {
        return [...prev, type];
      }
    });
  };
  
  // Reset all filters
  const resetFilters = () => {
    setActiveFilters([]);
  };
  
  // Navigate to detail view for the item with improved history handling
  const viewItemDetails = (item: TimelineItem) => {
    console.log("Viewing item:", item);
    
    // Save current state to history before navigating away
    window.history.pushState(
      { from: 'timeline', itemId: item.id }, 
      '', 
      window.location.pathname
    );
    
    // Navigate to the detail page for this item
    navigate(`/chronilog/timeline/${item.id}`);
  };

  // Using window navigation is replaced with Link component for the back button
  // We'll keep this function for the onClick handler but modify the JSX
  const goBack = () => {
    navigate('/chronilog'); // Fixed spelling to match other pages
  };
  
  // Handle coming to timeline page - record where we came from
  useEffect(() => {
    window.history.replaceState(
      { from: 'chronilog' }, 
      '', 
      window.location.pathname
    );
  }, []);

  return (
    <div>
      <div className="mb-4">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 hover:bg-primary hover:text-background" 
          onClick={goBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>
        
      <div className="flex items-center mb-6">
        <div>
          <h1 className="text-2xl font-orbitron mb-1">Timeline</h1>
          <p className="text-[#7DAAB2]">Your complete journey through time</p>
        </div>
      </div>
      
      <div className="glassmorphic rounded-xl p-6 neon-border mb-8">
        <div className="flex items-center mb-6">
          <div className="bg-primary/20 p-2 rounded-md mr-3">
            <CalendarClock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-orbitron text-[#D6F4FF]">Life Timeline</h2>
            <p className="text-xs text-[#7DAAB2]">All your events, missions, and achievements in chronological order</p>
          </div>
        </div>
        
        <div className="flex justify-end mb-6">
          <div className="flex items-center space-x-2">
            {/* Filter Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center px-3 py-1 text-xs rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition">
                  <Filter className="h-3 w-3 mr-1" />
                  Filter {activeFilters.length > 0 && `(${activeFilters.length})`}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 bg-background/80 backdrop-blur-xl border border-primary/30">
                <DropdownMenuLabel className="text-xs text-primary">Filter by Type</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-primary/20" />
                <DropdownMenuGroup>
                  <DropdownMenuItem 
                    className="flex items-center justify-between text-xs py-1.5 cursor-pointer"
                    onClick={() => toggleFilter('mission')}
                  >
                    <div className="flex items-center">
                      <Milestone className="h-3 w-3 mr-2" />
                      <span>Missions</span>
                    </div>
                    {activeFilters.includes('mission') ? 
                      <CheckCircle2 className="h-3 w-3 text-primary" /> : 
                      <div className="h-3 w-3" />
                    }
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem 
                    className="flex items-center justify-between text-xs py-1.5 cursor-pointer"
                    onClick={() => toggleFilter('quest')}
                  >
                    <div className="flex items-center">
                      <Sparkles className="h-3 w-3 mr-2" />
                      <span>Quests</span>
                    </div>
                    {activeFilters.includes('quest') ? 
                      <CheckCircle2 className="h-3 w-3 text-primary" /> : 
                      <div className="h-3 w-3" />
                    }
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem 
                    className="flex items-center justify-between text-xs py-1.5 cursor-pointer"
                    onClick={() => toggleFilter('event')}
                  >
                    <div className="flex items-center">
                      <CalendarDays className="h-3 w-3 mr-2" />
                      <span>Events</span>
                    </div>
                    {activeFilters.includes('event') ? 
                      <CheckCircle2 className="h-3 w-3 text-primary" /> : 
                      <div className="h-3 w-3" />
                    }
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem 
                    className="flex items-center justify-between text-xs py-1.5 cursor-pointer"
                    onClick={() => toggleFilter('achievement')}
                  >
                    <div className="flex items-center">
                      <Trophy className="h-3 w-3 mr-2" />
                      <span>Achievements</span>
                    </div>
                    {activeFilters.includes('achievement') ? 
                      <CheckCircle2 className="h-3 w-3 text-primary" /> : 
                      <div className="h-3 w-3" />
                    }
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem 
                    className="flex items-center justify-between text-xs py-1.5 cursor-pointer"
                    onClick={() => toggleFilter('knowledge')}
                  >
                    <div className="flex items-center">
                      <BookOpen className="h-3 w-3 mr-2" />
                      <span>Knowledge</span>
                    </div>
                    {activeFilters.includes('knowledge') ? 
                      <CheckCircle2 className="h-3 w-3 text-primary" /> : 
                      <div className="h-3 w-3" />
                    }
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                
                <DropdownMenuSeparator className="bg-primary/20" />
                <DropdownMenuItem 
                  className="flex items-center justify-center text-xs py-1.5 text-primary cursor-pointer hover:bg-background/40"
                  onClick={resetFilters}
                >
                  Clear All Filters
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sort Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center px-3 py-1 text-xs rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition">
                  <ArrowUpDown className="h-3 w-3 mr-1" />
                  Sort
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-40 bg-background/80 backdrop-blur-xl border border-primary/30">
                <DropdownMenuLabel className="text-xs text-primary">Sort By Date</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-primary/20" />
                <DropdownMenuItem 
                  className="flex items-center justify-between text-xs py-1.5 cursor-pointer"
                  onClick={() => setSortOrder('newest')}
                >
                  <div className="flex items-center">
                    <span>Newest First</span>
                  </div>
                  {sortOrder === 'newest' && <CheckCircle2 className="h-3 w-3 text-primary" />}
                </DropdownMenuItem>
                
                <DropdownMenuItem 
                  className="flex items-center justify-between text-xs py-1.5 cursor-pointer"
                  onClick={() => setSortOrder('oldest')}
                >
                  <div className="flex items-center">
                    <span>Oldest First</span>
                  </div>
                  {sortOrder === 'oldest' && <CheckCircle2 className="h-3 w-3 text-primary" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        <div className="space-y-6 relative mt-6">
          {/* Vertical timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-primary/30" />
          
          {filteredAndSortedItems.length > 0 ? (
            filteredAndSortedItems.map((item, index) => (
              <div key={item.id} className="flex items-start ml-2 group">
                {/* Timeline node */}
                <div 
                  className={`w-8 h-8 rounded-full border-2 border-primary mt-0.5 z-10 flex items-center justify-center mr-3 transition-all group-hover:scale-110 bg-primary/20`}
                >
                  <div className="flex items-center justify-center w-full h-full text-primary">
                    {item.icon}
                  </div>
                </div>
                
                {/* Content */}
                <div className="flex-1 bg-background/10 p-4 rounded-lg border border-primary/10 group-hover:border-primary/30 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-xs text-muted-foreground">{item.date}</span>
                      <h4 className="text-base font-medium text-foreground">{item.title}</h4>
                    </div>
                    <span 
                      className="text-xs px-2 py-0.5 rounded flex items-center bg-primary/10 text-primary"
                    >
                      {item.type}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                  
                  <div className="flex justify-end mt-2">
                    <button 
                      className="text-xs font-medium px-3 py-1 rounded-md bg-primary/10 text-primary hover:bg-opacity-20 transition"
                      onClick={(e) => {
                        e.stopPropagation();
                        viewItemDetails(item);
                      }}
                    >
                      VIEW DETAILS
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              <p>No entries yet. Start creating entries to build your life timeline.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}