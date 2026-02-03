import React, { useMemo } from 'react';
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLYFEOS } from "@/lib/context";
import { Archive, Clock, Tag, CheckCircle2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";


export default function MissionArchivePage() {
  // Set the page title
  usePageTitle('Mission Archive');

  // Get mission pages from context
  const { missionPages } = useLYFEOS();
  const [, navigate] = useLocation();

  
  // Filter for only completed missions (archive only shows completed)
  const completedMissions = useMemo(() => {
    return missionPages
      .filter(page => 
        (page.tags.includes('Mission') || page.tags.includes('Document')) && page.completed
      )
      .map(entry => ({
        id: entry.id,
        title: entry.title,
        content: entry.content,
        slug: entry.slug,
        tags: entry.tags,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        completed: entry.completed
      }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [missionPages]);

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
      
      <div className="mb-6">
        <h1 className="text-2xl font-orbitron mb-1">Mission Archive</h1>
        <p className="text-[#7DAAB2]">Review your completed missions and achievements</p>
      </div>
      
            
      {completedMissions.length > 0 ? (
        <div className="glassmorphic rounded-xl overflow-hidden border border-primary/20">
          <div className="p-4 flex items-center justify-between border-b border-primary/20">
            <div className="flex items-center">
              <CheckCircle2 className="h-5 w-5 text-primary mr-3" />
              <h2 className="text-lg font-medium">Completed Missions</h2>
            </div>
            <span className="text-xs text-[#7DAAB2] px-2 py-1 bg-slate-800/50 rounded-full">
              {completedMissions.length} {completedMissions.length === 1 ? 'mission' : 'missions'}
            </span>
          </div>
          
          <div className="px-4 pb-4 space-y-3 pt-4">
            {completedMissions.map((entry) => (
              <div 
                key={entry.id}
                className="p-3 rounded-lg bg-card/30 hover:bg-card/50 transition-all border border-slate-700/30 hover:border-primary/30 hover:shadow-[0_0_5px_var(--primary-glow-light)] cursor-pointer"
                onClick={() => navigate(`/mission-page/${entry.slug}`)}
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center">
                    <CheckCircle2 className="h-4 w-4 text-primary mr-2" />
                    <h3 className="font-medium">{entry.title}</h3>
                  </div>
                  <div className="flex items-center">
                    <Clock className="h-3 w-3 mr-1 text-[#7DAAB2]" />
                    <span className="text-xs text-[#7DAAB2] font-mono">
                      {new Date(entry.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                
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
        </div>
      ) : (
        <div className="text-center py-16 glassmorphic rounded-xl border border-primary/20 flex flex-col items-center justify-center">
          <Archive className="h-16 w-16 text-primary/40 mb-4" />
          <h3 className="text-xl font-medium mb-2">No Completed Missions Yet</h3>
          <p className="text-[#7DAAB2] mb-4 max-w-md">
            Complete missions from the Active Missions page to see them archived here.
          </p>
        </div>
      )}
    </>
  );
}