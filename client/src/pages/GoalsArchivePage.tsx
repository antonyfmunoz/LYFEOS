import React, { useState, useMemo } from 'react';
import { Link, useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLYFEOS } from "@/lib/context";
import { Archive, Calendar, Clock, Tag, ChevronDown, ChevronRight, FilePlus2, Target, Rocket, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface GoalTimeframe {
  timeframe: string; // "annual", "quarterly", "monthly", etc.
  title: string;
  entries: Array<{
    id: string;
    title: string;
    content: string;
    slug: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
  }>;
}

export default function GoalsArchivePage() {
  // Set the page title
  usePageTitle('Goals & Vision Archive');

  // Get mission pages from context
  const { missionPages } = useLYFEOS();
  const [, navigate] = useLocation();

  // Track expanded folders
  const [expandedFolders, setExpandedFolders] = useState<string[]>(['vision']);

  // Toggle folder expansion
  const toggleFolder = (timeframe: string) => {
    if (expandedFolders.includes(timeframe)) {
      setExpandedFolders(expandedFolders.filter(t => t !== timeframe));
    } else {
      setExpandedFolders([...expandedFolders, timeframe]);
    }
  };

  // Filter and organize goals by timeframe
  const goalCategories = useMemo(() => {
    // Filter for goals entries
    const goalEntries = missionPages.filter(page => 
      page.tags.includes('Goals & Vision')
    );
    
    // Determine timeframe from title or content
    const getTimeframe = (entry: typeof missionPages[0]) => {
      const titleLower = entry.title.toLowerCase();
      const contentLower = entry.content.toLowerCase();
      
      if (titleLower.includes('vision') || contentLower.includes('life vision')) {
        return 'vision';
      } else if (titleLower.includes('annual') || titleLower.includes('yearly') || contentLower.includes('annual goals')) {
        return 'annual';
      } else if (titleLower.includes('quarter') || contentLower.includes('quarterly goals')) {
        return 'quarterly';
      } else if (titleLower.includes('month') || contentLower.includes('monthly goals')) {
        return 'monthly';
      } else {
        return 'weekly';
      }
    };
    
    // Group entries
    const visionEntries = goalEntries.filter(entry => getTimeframe(entry) === 'vision');
    const annualEntries = goalEntries.filter(entry => getTimeframe(entry) === 'annual');
    const quarterlyEntries = goalEntries.filter(entry => getTimeframe(entry) === 'quarterly');
    const monthlyEntries = goalEntries.filter(entry => getTimeframe(entry) === 'monthly');
    const weeklyEntries = goalEntries.filter(entry => getTimeframe(entry) === 'weekly');
    
    return [
      {
        timeframe: 'vision',
        title: 'Life Vision & Purpose',
        entries: visionEntries.map(entry => ({
          id: entry.id,
          title: entry.title,
          content: entry.content,
          slug: entry.slug,
          tags: entry.tags,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt
        }))
      },
      {
        timeframe: 'annual',
        title: 'Annual Goals',
        entries: annualEntries.map(entry => ({
          id: entry.id,
          title: entry.title,
          content: entry.content,
          slug: entry.slug,
          tags: entry.tags,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt
        }))
      },
      {
        timeframe: 'quarterly',
        title: 'Quarterly Goals',
        entries: quarterlyEntries.map(entry => ({
          id: entry.id,
          title: entry.title,
          content: entry.content,
          slug: entry.slug,
          tags: entry.tags,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt
        }))
      },
      {
        timeframe: 'monthly',
        title: 'Monthly Goals',
        entries: monthlyEntries.map(entry => ({
          id: entry.id,
          title: entry.title,
          content: entry.content,
          slug: entry.slug,
          tags: entry.tags,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt
        }))
      },
      {
        timeframe: 'weekly',
        title: 'Weekly Goals',
        entries: weeklyEntries.map(entry => ({
          id: entry.id,
          title: entry.title,
          content: entry.content,
          slug: entry.slug,
          tags: entry.tags,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt
        }))
      }
    ];
  }, [missionPages]);

  // Create new goal entry
  const createNewGoalEntry = () => {
    const title = `Annual Goals ${new Date().getFullYear()}`;
    const slug = title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-');
    
    const newPage = useLYFEOS().createMissionPage({
      title,
      slug,
      content: `# ${title}\n\n## Vision Statement\n\nWrite your vision for this year...\n\n## Goals\n\n### Career\n- [ ] Goal 1\n- [ ] Goal 2\n\n### Health & Fitness\n- [ ] Goal 1\n- [ ] Goal 2\n\n### Relationships\n- [ ] Goal 1\n- [ ] Goal 2\n\n### Personal Development\n- [ ] Goal 1\n- [ ] Goal 2\n\n## Key Metrics\n\n- Metric 1: Target value\n- Metric 2: Target value\n\n## Review Schedule\n\n- Monthly review date: 1st of each month\n- Quarterly deep review: End of each quarter`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completed: false,
      xpValue: 10,
      tags: ['Goals & Vision']
    });
    
    toast({
      title: "Goal Document Created",
      description: "Your new goals document is ready for editing",
      variant: "default",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
    
    navigate(`/mission-page/${slug}`);
  };

  return (
    <>
      <div className="mb-4">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 hover:bg-primary hover:text-background" 
          onClick={() => navigate('/chronilog')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-orbitron mb-1">Goals & Vision Archive</h1>
          <p className="text-[#7DAAB2]">Document your life vision and goals at different time horizons</p>
        </div>
        <Button 
          onClick={createNewGoalEntry}
          className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50"
        >
          <FilePlus2 className="w-4 h-4" />
          <span>New Goals</span>
        </Button>
      </div>
      
      {goalCategories.some(category => category.entries.length > 0) ? (
        <div className="space-y-4">
          {goalCategories.map((category) => (
            <div key={category.timeframe} className="glassmorphic rounded-xl overflow-hidden border border-slate-700/50">
              <div 
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-card/40"
                onClick={() => toggleFolder(category.timeframe)}
              >
                <div className="flex items-center">
                  {expandedFolders.includes(category.timeframe) ? (
                    <ChevronDown className="h-5 w-5 text-primary mr-2" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-primary mr-2" />
                  )}
                  <div className="flex items-center">
                    <span className="material-icons text-emerald-400 mr-3">track_changes</span>
                    <h2 className="text-lg font-medium">{category.title}</h2>
                  </div>
                </div>
                <span className="text-xs text-[#7DAAB2] px-2 py-1 bg-slate-800/50 rounded-full">
                  {category.entries.length} {category.entries.length === 1 ? 'document' : 'documents'}
                </span>
              </div>
              
              {expandedFolders.includes(category.timeframe) && (
                <div className="px-4 pb-4 space-y-3 pt-2 border-t border-slate-700/50">
                  {category.entries.length > 0 ? (
                    category.entries
                      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                      .map((entry) => (
                        <div 
                          key={entry.id}
                          className="p-3 rounded-lg bg-card/30 hover:bg-card/50 transition-colors border border-slate-700/30 cursor-pointer"
                          onClick={() => navigate(`/mission-page/${entry.slug}`)}
                        >
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center">
                              {category.timeframe === 'vision' ? (
                                <Rocket className="h-4 w-4 text-emerald-400 mr-2" />
                              ) : (
                                <Target className="h-4 w-4 text-emerald-400 mr-2" />
                              )}
                              <h3 className="font-medium">{entry.title}</h3>
                            </div>
                            <div className="flex items-center">
                              <Clock className="h-3 w-3 mr-1 text-[#7DAAB2]" />
                              <span className="text-xs text-[#7DAAB2] font-mono">
                                {new Date(entry.updatedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          
                          {/* Tags */}
                          <div className="flex flex-wrap gap-2 mb-2">
                            {entry.tags.map((tag, idx) => (
                              <div key={idx} className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300 flex items-center">
                                <Tag className="h-3 w-3 mr-1" />
                                {tag}
                              </div>
                            ))}
                          </div>
                          
                          <p className="text-sm text-[#7DAAB2] line-clamp-2">
                            {entry.content.length > 150 
                              ? entry.content.substring(0, 150) + '...' 
                              : entry.content}
                          </p>
                        </div>
                      ))
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-[#7DAAB2]">No {category.title.toLowerCase()} found.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 glassmorphic rounded-xl border border-primary/20 flex flex-col items-center justify-center">
          <Archive className="h-16 w-16 text-primary/40 mb-4" />
          <h3 className="text-xl font-medium mb-2">No Goals Documents Yet</h3>
          <p className="text-[#7DAAB2] mb-4 max-w-md">
            Document your life vision and set goals at different time horizons to guide your personal development journey.
          </p>
          <Button 
            onClick={createNewGoalEntry}
            className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50"
          >
            Create Your First Goals
          </Button>
        </div>
      )}
    </>
  );
}