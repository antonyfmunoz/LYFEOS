import React, { useState, useMemo } from 'react';
import { Link, useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLYFEOS } from "@/lib/context";
import { Archive, Calendar, Clock, Tag, ChevronDown, ChevronRight, FilePlus2, FileEdit, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface MissionFolder {
  status: string; // "active" or "completed"
  title: string;
  entries: Array<{
    id: string;
    title: string;
    content: string;
    slug: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
    completed: boolean;
  }>;
}

export default function MissionArchivePage() {
  // Set the page title
  usePageTitle('Mission Archive');

  // Get mission pages from context
  const { missionPages } = useLYFEOS();
  const [, navigate] = useLocation();

  // Track expanded folders
  const [expandedFolders, setExpandedFolders] = useState<string[]>(['active']);

  // Toggle folder expansion
  const toggleFolder = (status: string) => {
    if (expandedFolders.includes(status)) {
      setExpandedFolders(expandedFolders.filter(s => s !== status));
    } else {
      setExpandedFolders([...expandedFolders, status]);
    }
  };

  // Filter and organize mission pages by status
  const missionFolders = useMemo(() => {
    // Filter for mission entries
    const missionEntries = missionPages.filter(page => 
      page.tags.includes('Mission') || page.tags.includes('Document')
    );
    
    // Group by status
    const activeMissions = missionEntries.filter(entry => !entry.completed);
    const completedMissions = missionEntries.filter(entry => entry.completed);
    
    return [
      {
        status: 'active',
        title: 'Active Missions',
        entries: activeMissions.map(entry => ({
          id: entry.id,
          title: entry.title,
          content: entry.content,
          slug: entry.slug,
          tags: entry.tags,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
          completed: entry.completed
        }))
      },
      {
        status: 'completed',
        title: 'Completed Missions',
        entries: completedMissions.map(entry => ({
          id: entry.id,
          title: entry.title,
          content: entry.content,
          slug: entry.slug,
          tags: entry.tags,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
          completed: entry.completed
        }))
      }
    ];
  }, [missionPages]);

  // Create new mission log
  const createNewMissionLog = () => {
    const title = `New Mission Log ${new Date().toLocaleDateString()}`;
    const slug = title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-');
    
    const newPage = useLYFEOS().createMissionPage({
      title,
      slug,
      content: `# ${title}\n\n## Summary\n\nAdd a brief summary of this mission...\n\n## Tasks\n\n- [ ] First task\n- [ ] Second task\n- [ ] Third task\n\n## Notes\n\nAdd any additional notes or reflections here...`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completed: false,
      xpValue: 10,
      tags: ['Document', 'Mission']
    });
    
    toast({
      title: "Mission Log Created",
      description: "Your new mission log is ready for editing",
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
          <h1 className="text-2xl font-orbitron mb-1">Mission Archive</h1>
          <p className="text-[#7DAAB2]">Track and review your active and completed missions</p>
        </div>
        <Button 
          onClick={createNewMissionLog}
          className="flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow"
        >
          <FilePlus2 className="w-4 h-4" />
          <span>New Mission</span>
        </Button>
      </div>
      
      {missionFolders.some(folder => folder.entries.length > 0) ? (
        <div className="space-y-4">
          {missionFolders.map((folder) => (
            <div key={folder.status} className="glassmorphic rounded-xl overflow-hidden border border-slate-700/50">
              <div 
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-card/40"
                onClick={() => toggleFolder(folder.status)}
              >
                <div className="flex items-center">
                  {expandedFolders.includes(folder.status) ? (
                    <ChevronDown className="h-5 w-5 text-primary mr-2" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-primary mr-2" />
                  )}
                  <div className="flex items-center">
                    {folder.status === 'active' ? (
                      <FileEdit className="h-5 w-5 text-primary mr-3" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400 mr-3" />
                    )}
                    <h2 className="text-lg font-medium">{folder.title}</h2>
                  </div>
                </div>
                <span className="text-xs text-[#7DAAB2] px-2 py-1 bg-slate-800/50 rounded-full">
                  {folder.entries.length} {folder.entries.length === 1 ? 'mission' : 'missions'}
                </span>
              </div>
              
              {expandedFolders.includes(folder.status) && (
                <div className="px-4 pb-4 space-y-3 pt-2 border-t border-slate-700/50">
                  {folder.entries.length > 0 ? (
                    folder.entries
                      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                      .map((entry) => (
                        <div 
                          key={entry.id}
                          className="p-3 rounded-lg bg-card/30 hover:bg-card/50 transition-all border border-slate-700/30 hover:border-primary/30 hover:shadow-[0_0_5px_var(--primary-glow-light)] cursor-pointer"
                          onClick={() => navigate(`/mission-page/${entry.slug}`)}
                        >
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center">
                              <span className="material-icons text-primary mr-2 text-sm">task_alt</span>
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
                      <p className="text-[#7DAAB2]">No {folder.status} missions found.</p>
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
          <h3 className="text-xl font-medium mb-2">No Mission Logs Yet</h3>
          <p className="text-[#7DAAB2] mb-4 max-w-md">
            Start documenting your missions, tasks, and projects to track your progress and achievements.
          </p>
          <Button 
            onClick={createNewMissionLog}
            className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition-shadow"
          >
            Create Your First Mission
          </Button>
        </div>
      )}
    </>
  );
}