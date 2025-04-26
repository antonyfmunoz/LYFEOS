import React, { useState, useMemo } from 'react';
import { Link, useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLYFEOS } from "@/lib/context";
import { Archive, Calendar, Clock, Tag, ChevronDown, ChevronRight, FilePlus2, Repeat, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface RitualFrequency {
  frequency: string; // "daily" or "weekly" or "monthly"
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

export default function RitualsArchivePage() {
  // Set the page title
  usePageTitle('Rituals Archive');

  // Get mission pages from context
  const { missionPages } = useLYFEOS();
  const [, navigate] = useLocation();

  // Track expanded folders
  const [expandedFolders, setExpandedFolders] = useState<string[]>(['daily']);

  // Toggle folder expansion
  const toggleFolder = (frequency: string) => {
    if (expandedFolders.includes(frequency)) {
      setExpandedFolders(expandedFolders.filter(f => f !== frequency));
    } else {
      setExpandedFolders([...expandedFolders, frequency]);
    }
  };

  // Filter and organize ritual entries by frequency
  const ritualCategories = useMemo(() => {
    // Filter for ritual entries
    const ritualEntries = missionPages.filter(page => 
      page.tags.includes('Rituals')
    );
    
    // Determine frequency from title or content
    const getFrequency = (entry: typeof missionPages[0]) => {
      const titleLower = entry.title.toLowerCase();
      const contentLower = entry.content.toLowerCase();
      
      if (titleLower.includes('daily') || contentLower.includes('daily ritual')) {
        return 'daily';
      } else if (titleLower.includes('weekly') || contentLower.includes('weekly ritual')) {
        return 'weekly';
      } else {
        return 'monthly';
      }
    };
    
    // Group entries
    const dailyRituals = ritualEntries.filter(entry => getFrequency(entry) === 'daily');
    const weeklyRituals = ritualEntries.filter(entry => getFrequency(entry) === 'weekly');
    const monthlyRituals = ritualEntries.filter(entry => getFrequency(entry) === 'monthly');
    
    return [
      {
        frequency: 'daily',
        title: 'Daily Rituals',
        entries: dailyRituals.map(entry => ({
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
        frequency: 'weekly',
        title: 'Weekly Rituals',
        entries: weeklyRituals.map(entry => ({
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
        frequency: 'monthly',
        title: 'Monthly Rituals',
        entries: monthlyRituals.map(entry => ({
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

  // Create new ritual
  const createNewRitual = () => {
    const title = `Daily Ritual - ${new Date().toLocaleDateString()}`;
    const slug = title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-');
    
    const newPage = useLYFEOS().createMissionPage({
      title,
      slug,
      content: `# ${title}\n\n## Purpose\n\nDefine the purpose of this ritual...\n\n## Steps\n\n1. First step\n2. Second step\n3. Third step\n\n## Notes\n\nAdd any additional notes or reflections here...\n\n## Benefits\n\n- Benefit 1\n- Benefit 2\n- Benefit 3`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completed: false,
      xpValue: 10,
      tags: ['Rituals']
    });
    
    toast({
      title: "Ritual Created",
      description: "Your new ritual is ready for customization",
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
          <h1 className="text-2xl font-orbitron mb-1">Rituals Archive</h1>
          <p className="text-[#7DAAB2]">Document your daily, weekly, and monthly practices</p>
        </div>
        <Button 
          onClick={createNewRitual}
          className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50"
        >
          <FilePlus2 className="w-4 h-4" />
          <span>New Ritual</span>
        </Button>
      </div>
      
      {ritualCategories.some(category => category.entries.length > 0) ? (
        <div className="space-y-4">
          {ritualCategories.map((category) => (
            <div key={category.frequency} className="glassmorphic rounded-xl overflow-hidden border border-slate-700/50">
              <div 
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-card/40"
                onClick={() => toggleFolder(category.frequency)}
              >
                <div className="flex items-center">
                  {expandedFolders.includes(category.frequency) ? (
                    <ChevronDown className="h-5 w-5 text-primary mr-2" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-primary mr-2" />
                  )}
                  <div className="flex items-center">
                    <Repeat className="h-5 w-5 text-secondary mr-3" />
                    <h2 className="text-lg font-medium">{category.title}</h2>
                  </div>
                </div>
                <span className="text-xs text-[#7DAAB2] px-2 py-1 bg-slate-800/50 rounded-full">
                  {category.entries.length} {category.entries.length === 1 ? 'ritual' : 'rituals'}
                </span>
              </div>
              
              {expandedFolders.includes(category.frequency) && (
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
                              <span className="material-icons text-secondary mr-2 text-sm">repeat</span>
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
                      <p className="text-[#7DAAB2]">No {category.frequency} rituals found.</p>
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
          <h3 className="text-xl font-medium mb-2">No Rituals Yet</h3>
          <p className="text-[#7DAAB2] mb-4 max-w-md">
            Start documenting your daily, weekly, and monthly rituals to maintain balance and build positive habits.
          </p>
          <Button 
            onClick={createNewRitual}
            className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50"
          >
            Create Your First Ritual
          </Button>
        </div>
      )}
    </>
  );
}