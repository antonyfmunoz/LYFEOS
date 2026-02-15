import React, { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Calendar, Clock, MapPin, Zap, Award, Save, Edit2, Tag } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";
import MarkdownEditor from "@/components/markdown/MarkdownEditor";
import { MissionPage as MissionPageType } from "@/lib/types";

export default function MissionDetailPage() {
  const { missionId } = useParams();
  const { 
    events, 
    updateEvent, 
    missionPages, 
    createMissionPage, 
    updateMissionPage, 
    getMissionPageById 
  } = useLYFEOS();
  const { toast } = useToast();
  
  const mission = events.find(event => event.id === missionId);
  
  usePageTitle(mission ? `Mission: ${mission.title}` : 'Mission Detail');
  
  const [missionPage, setMissionPage] = useState<MissionPageType | null>(null);
  const [content, setContent] = useState("");
  
  const [isDirty, setIsDirty] = useState(false);
  
  useEffect(() => {
    if (mission) {
      const existingPage = missionPages.find(page => page.eventId === mission.id);
      
      if (existingPage) {
        setMissionPage(existingPage);
        setContent(existingPage.content);
      } else {
        const categoryTag = mission.category.charAt(0).toUpperCase() + mission.category.slice(1);
        const newPage = createMissionPage({
          title: mission.title,
          slug: mission.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-'),
          content: `# ${mission.title}\n\n${mission.description || 'Start documenting this mission...'}\n\n## Notes\n\n- [ ] Add your task items here\n- [ ] Use checkboxes for tasks\n\n## Details\n\n* Time: ${mission.startTime}\n* Duration: ${mission.duration}\n* Category: ${categoryTag}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completed: false,
          xpValue: 15,
          tags: [categoryTag, 'Mission'],
          eventId: mission.id
        });
        
        setMissionPage(newPage);
        setContent(newPage.content);
      }
    }
  }, [mission, missionPages, createMissionPage]);
  
  if (!mission) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="glassmorphic rounded-xl p-8 max-w-xl text-center">
          <h1 className="text-2xl font-orbitron mb-4">Mission Not Found</h1>
          <p className="text-muted-foreground mb-6">The mission you're looking for doesn't exist or may have been deleted.</p>
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors rounded-md px-3 py-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Dashboard</span>
          </Link>
        </div>
      </div>
    );
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "work":
        return "text-primary";
      case "health":
        return "text-primary";
      case "personal":
        return "text-primary";
      default:
        return "text-primary";
    }
  };
  
  const getCategoryBg = (category: string) => {
    switch (category) {
      case "work":
        return "bg-primary/20";
      case "health":
        return "bg-primary/20";
      case "personal":
        return "bg-primary/20";
      default:
        return "bg-primary/20";
    }
  };
  
  const getCategoryText = (category: string) => {
    switch (category) {
      case "work":
        return "Work Mission";
      case "health":
        return "Health Mission";
      case "personal":
        return "Personal Mission";
      default:
        return "Mission";
    }
  };
  
  const getLocationText = (category: string) => {
    switch (category) {
      case "work":
        return "Conference Room 3";
      case "health":
        return "Gym";
      case "personal":
        return "Virtual";
      default:
        return "Unknown Location";
    }
  };
  
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
  };
  
  const handleSave = () => {
    if (missionPage) {
      updateMissionPage(missionPage.id, { 
        content,
        updatedAt: new Date().toISOString()
      });
      
      updateEvent(mission.id, { 
        description: content.substring(0, 100) + (content.length > 100 ? '...' : '') 
      });
      
      toast({
        title: "Mission Page Updated",
        description: "Your mission document has been saved successfully",
        variant: "default",
        className: "bg-background border border-primary text-white",
        duration: 3000,
      });
    }
  };
  
  return (
    <div className="container max-w-5xl py-6">
      <div className="mb-6 flex items-center">
        <Link href="/dashboard" className="mr-3 inline-flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors rounded-md px-3 py-2">
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Link>
        <h1 className="text-2xl font-orbitron">{mission.title}</h1>
      </div>
      
      <div className="glassmorphic rounded-xl p-6 neon-border mb-8">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:w-1/3">
            <div className={`p-4 rounded-xl ${getCategoryBg(mission.category)} mb-4`}>
              <h2 className={`text-lg font-orbitron ${getCategoryColor(mission.category)}`}>
                {getCategoryText(mission.category)}
              </h2>
              
              <Separator className="my-3 opacity-50" />
              
              <div className="space-y-4 mt-4">
                <div className="flex items-center">
                  <Clock className={`h-4 w-4 ${getCategoryColor(mission.category)} mr-2`} />
                  <span className="text-sm">{mission.startTime} ({mission.duration})</span>
                </div>
                
                <div className="flex items-center">
                  <MapPin className={`h-4 w-4 ${getCategoryColor(mission.category)} mr-2`} />
                  <span className="text-sm">{getLocationText(mission.category)}</span>
                </div>
                
                <div className="flex items-center">
                  <Calendar className={`h-4 w-4 ${getCategoryColor(mission.category)} mr-2`} />
                  <span className="text-sm">Today</span>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-primary/10 rounded-xl">
              <h3 className="font-orbitron text-sm mb-3">MISSION REWARDS</h3>
              
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center">
                  <Zap className="h-4 w-4 text-primary mr-2" />
                  <span className="text-sm">Energy Cost</span>
                </div>
                <span className="text-primary font-mono">-5</span>
              </div>
              
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <Award className="h-4 w-4 text-primary mr-2" />
                  <span className="text-sm">XP Reward</span>
                </div>
                <span className="text-primary font-mono">+15</span>
              </div>
            </div>
          </div>
          
          <div className="md:w-2/3">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-orbitron text-lg">Mission Details</h2>
              
              {missionPage && (
                <div className="flex items-center space-x-2">
                  {missionPage.tags.map((tag, index) => (
                    <div 
                      key={index} 
                      className="text-xs px-2 py-1 rounded-md bg-muted/50 border border-muted/40"
                    >
                      <Tag className="h-3 w-3 inline mr-1" />
                      {tag}
                    </div>
                  ))}
                  
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-8 px-3 ml-2"
                    onClick={handleSave}
                  >
                    <Save className="h-4 w-4 mr-1" /> Save
                  </Button>
                </div>
              )}
            </div>
            
            {missionPage ? (
              <MarkdownEditor
                content={content}
                onChange={handleContentChange}
                onSave={handleSave}
                className="mb-4"
              />
            ) : (
              <div className="text-center p-8 bg-card/30 rounded-lg border border-primary/20">
                <p className="text-muted-foreground italic">Loading mission document...</p>
              </div>
            )}
            
            <div className="text-xs text-muted-foreground mt-4">
              <p>This mission document supports Markdown, including task lists using "- [ ]" syntax and wiki-style links with "[[Page Name]]".</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
