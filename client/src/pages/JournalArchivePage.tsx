import React, { useState, useMemo } from 'react';
import { Link, useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLYFEOS } from "@/lib/context";
import { Archive, Calendar, Clock, Tag, ChevronDown, ChevronRight, FilePlus2, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface JournalFolder {
  month: string; // Format: "YYYY-MM"
  title: string; // Format: "Month YYYY"
  entries: Array<{
    id: string;
    title: string;
    date: string;
    content: string;
    slug: string;
    tags: string[];
    createdAt: string;
  }>;
}

export default function JournalArchivePage() {
  // Set the page title
  usePageTitle('Journal Archive');

  // Get mission pages from context
  const { missionPages } = useLYFEOS();
  const [, navigate] = useLocation();

  // Track expanded folders
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);

  // Toggle folder expansion
  const toggleFolder = (month: string) => {
    if (expandedFolders.includes(month)) {
      setExpandedFolders(expandedFolders.filter(m => m !== month));
    } else {
      setExpandedFolders([...expandedFolders, month]);
    }
  };

  // Filter and organize journal entries by month
  const journalFolders = useMemo(() => {
    // Filter for journal and daily reflection entries
    const journalEntries = missionPages.filter(page => 
      page.tags.includes('Journal') || page.tags.includes('Daily Reflection')
    );
    
    // Group by month
    const folderMap = new Map<string, JournalFolder>();
    
    journalEntries.forEach(entry => {
      const date = new Date(entry.createdAt);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthTitle = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      
      if (!folderMap.has(month)) {
        folderMap.set(month, {
          month,
          title: monthTitle,
          entries: []
        });
      }
      
      folderMap.get(month)?.entries.push({
        id: entry.id,
        title: entry.title,
        date: date.toISOString().split('T')[0],
        content: entry.content,
        slug: entry.slug,
        tags: entry.tags,
        createdAt: entry.createdAt
      });
    });
    
    // Convert map to array and sort by month (newest first)
    return Array.from(folderMap.values())
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [missionPages]);

  // Create new journal entry
  const createNewJournalEntry = () => {
    const title = `Journal Entry ${new Date().toLocaleDateString()}`;
    const slug = title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-');
    
    const newPage = useLYFEOS().createMissionPage({
      title,
      slug,
      content: `# ${title}\n\n## Thoughts\n\nStart writing your journal entry here...\n\n## Highlights\n\n- \n- \n- \n\n## Gratitude\n\n- \n- \n- `,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completed: false,
      xpValue: 10,
      tags: ['Journal']
    });
    
    toast({
      title: "Journal Entry Created",
      description: "Your new journal entry is ready for writing",
      variant: "default",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
    
    navigate(`/mission-page/${slug}`);
  };

  return (
    <>
      <div className="mb-4">
        <Link href="/chronilog" className="text-primary flex items-center hover:underline">
          <ChevronRight className="h-4 w-4 mr-1" />
          Back to Chronilog
        </Link>
      </div>
      
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-orbitron mb-1">Journal Archive</h1>
          <p className="text-[#7DAAB2]">All your journal entries and reflections organized by date</p>
        </div>
        <Button 
          onClick={createNewJournalEntry}
          className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50"
        >
          <FilePlus2 className="w-4 h-4" />
          <span>New Entry</span>
        </Button>
      </div>
      
      {journalFolders.length > 0 ? (
        <div className="space-y-4">
          {journalFolders.map((folder) => (
            <div key={folder.month} className="glassmorphic rounded-xl overflow-hidden border border-slate-700/50">
              <div 
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-card/40"
                onClick={() => toggleFolder(folder.month)}
              >
                <div className="flex items-center">
                  {expandedFolders.includes(folder.month) ? (
                    <ChevronDown className="h-5 w-5 text-primary mr-2" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-primary mr-2" />
                  )}
                  <div className="flex items-center">
                    <Calendar className="h-5 w-5 text-primary mr-3" />
                    <h2 className="text-lg font-medium">{folder.title}</h2>
                  </div>
                </div>
                <span className="text-xs text-[#7DAAB2] px-2 py-1 bg-slate-800/50 rounded-full">
                  {folder.entries.length} {folder.entries.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>
              
              {expandedFolders.includes(folder.month) && (
                <div className="px-4 pb-4 space-y-3 pt-2 border-t border-slate-700/50">
                  {folder.entries
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((entry) => (
                      <div 
                        key={entry.id}
                        className="p-3 rounded-lg bg-card/30 hover:bg-card/50 transition-colors border border-slate-700/30 cursor-pointer"
                        onClick={() => navigate(`/mission-page/${entry.slug}`)}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center">
                            <CalendarIcon className="h-4 w-4 text-primary mr-2" />
                            <h3 className="font-medium">{entry.title}</h3>
                          </div>
                          <div className="flex items-center">
                            <Clock className="h-3 w-3 mr-1 text-[#7DAAB2]" />
                            <span className="text-xs text-[#7DAAB2] font-mono">
                              {new Date(entry.createdAt).toLocaleDateString()}
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
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 glassmorphic rounded-xl border border-primary/20 flex flex-col items-center justify-center">
          <Archive className="h-16 w-16 text-primary/40 mb-4" />
          <h3 className="text-xl font-medium mb-2">No Journal Entries Yet</h3>
          <p className="text-[#7DAAB2] mb-4 max-w-md">
            Start documenting your journey by creating daily reflections or journal entries.
            They will be automatically organized here.
          </p>
          <Button 
            onClick={createNewJournalEntry}
            className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50"
          >
            Create Your First Entry
          </Button>
        </div>
      )}
      
      {/* Admin Tools Section */}
      <div className="mt-10 pt-6 border-t border-slate-700/30">
        <h3 className="text-sm uppercase tracking-wider text-[#7DAAB2]/70 mb-2">Admin Tools</h3>
        <div className="flex items-center gap-3">
          <Link href="/add-mock-journal">
            <Button variant="outline" size="sm" className="text-xs border-slate-700/50 hover:bg-card/50">
              Create Screenshot Journal
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}