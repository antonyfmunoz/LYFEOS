import React from "react";
import { useLocation } from "wouter";
import { useLYFEOS } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";

export default function AddMockJournalPage() {
  usePageTitle("Dashboard Snapshot");
  const { createMissionPage } = useLYFEOS();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const addMockJournalEntry = () => {
    // Create a date for the mock journal entry
    const date = new Date();
    const currentTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} ${date.getHours() >= 12 ? 'PM' : 'AM'}`;
    
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
    const monthDay = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    const year = date.getFullYear();
    
    // Create unique slug
    const slug = `journal-dashboard-${Date.now()}`;
    
    // Create content that exactly replicates the dashboard UI
    let content = `# Daily Dashboard\n`;
    content += `${weekday}, ${monthDay}, ${year}\n`;
    content += `${currentTime}\n\n`;
    
    // Time zone and format
    content += `PST\n`;
    content += `24h\n\n`;
    
    // Stats Log
    content += `## Stats Log\n\n`;
    
    content += `LEVEL\n`;
    content += `1\n\n`;
    
    content += `STREAK\n`;
    content += `0 days\n\n`;
    
    content += `EFFICIENCY\n`;
    content += `0%\n\n`;
    
    content += `ATTENTION\n`;
    content += `100%\n\n`;
    
    content += `TIME\n`;
    content += `100%\n\n`;
    
    content += `ENERGY\n`;
    content += `100%\n\n`;
    
    content += `HEALTH\n`;
    content += `100%\n\n`;
    
    // Mission Log
    content += `## Mission Log\n\n`;
    content += `No missions scheduled for today\n\n`;
    content += `Create a new mission or visit the Calendar page\n\n`;
    content += `New Mission\n`;
    content += `↴ Click the checkbox to mark missions as completed\n\n`;
    
    // Data Entry Log
    content += `## Data Entry Log\n\n`;
    
    content += `### Today's Thoughts\n`;
    content += `Ideas worth saving...\n\n`;
    
    content += `### Content Consumed\n`;
    content += `Books, podcasts, videos...\n\n`;
    
    content += `### Today's Research\n`;
    content += `Summarize learnings or add links...\n\n`;
    
    content += `### New To-Do-List Ideas\n`;
    content += `Add anything...\n\n`;
    
    // Recalibration Log
    content += `## Recalibration Log\n\n`;
    
    // Sleep Tracker
    content += `### Sleep Tracker\n`;
    content += `Wake Up Time\n`;
    content += `6:00 AM\n\n`;
    
    content += `Sleep Time\n`;
    content += `10:00 PM\n\n`;
    
    // Energy Recap
    content += `### Energy Recap\n`;
    content += `Daily Total:\n`;
    content += `50%\n\n`;
    
    // State Metrics
    content += `### Mental State\n`;
    content += `5/10\n`;
    content += `1 2 3 4 5 6 7 8 9 10\n\n`;
    
    content += `### Physical State\n`;
    content += `5/10\n`;
    content += `1 2 3 4 5 6 7 8 9 10\n\n`;
    
    content += `### Emotional State\n`;
    content += `5/10\n`;
    content += `1 2 3 4 5 6 7 8 9 10\n\n`;
    
    // Intention Setter
    content += `## Intention Setter\n\n`;
    
    content += `### Gratitude\n`;
    content += `What three things are you most grateful for today?\n\n`;
    
    content += `### Tomorrow's Goals\n`;
    content += `What three things do you want to accomplish tomorrow?\n\n`;
    
    content += `### Annual Goals\n`;
    content += `What are your three big targets for the year?`;
    
    try {
      // Create the mission page with the journal entry
      const title = `Dashboard - ${weekday}, ${monthDay}, ${year}`;
      createMissionPage({
        title,
        slug,
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completed: false,
        xpValue: 20,
        tags: ['Journal', 'Dashboard', 'Daily Reflection']
      });
      
      toast({
        title: "Dashboard Snapshot Created",
        description: `A snapshot of today's dashboard has been saved to your journal.`,
        variant: "default",
        className: "bg-background/80 border border-primary text-foreground",
        duration: 5000,
      });
      
      // Navigate to journal archive
      navigate("/journal-archive");
    } catch (error) {
      console.error("Failed to create dashboard snapshot:", error);
      toast({
        title: "Error",
        description: "Failed to create dashboard snapshot.",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  return (
    <div className="container mx-auto py-8 flex flex-col items-center">
      <div className="max-w-2xl w-full">
        <h1 className="text-3xl font-bold mb-6 text-center">Dashboard Snapshot Creator</h1>
        
        <div className="bg-card/30 rounded-lg border border-primary/20 p-6 mb-8">
          <p className="mb-4 text-[#7DAAB2]">
            This page creates an exact replica of the dashboard UI as it appears right now.
            Each snapshot preserves the complete layout with all sections and placeholders exactly as they appear on screen.
          </p>
          
          <div className="flex justify-center">
            <Button 
              onClick={addMockJournalEntry}
              className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50"
            >
              Create Dashboard Snapshot
            </Button>
          </div>
        </div>
        
        <div className="bg-card/30 rounded-lg border border-primary/20 p-6">
          <h2 className="text-xl font-semibold mb-3">What's included in the snapshot?</h2>
          <ul className="space-y-2 text-[#7DAAB2]">
            <li>• Dashboard header with date and time</li>
            <li>• Stats Log section (Level, Streak, Efficiency, etc.)</li>
            <li>• Mission Log section</li>
            <li>• Data Entry Log section</li>
            <li>• Recalibration Log section</li>
            <li>• All tracking metrics</li>
            <li>• All section placeholders</li>
          </ul>
          
          <div className="mt-6 pt-3 border-t border-slate-700/30">
            <h3 className="text-sm font-medium mb-2">Preview:</h3>
            <div className="p-3 rounded-md border border-slate-700/30 bg-card/20 text-xs text-[#7DAAB2] font-mono space-y-2">
              <div>
                <p># Daily Dashboard</p>
                <p>Monday, April 22, 2025</p>
                <p>09:15 AM</p>
              </div>
              <div>
                <p>PST</p>
                <p>24h</p>
              </div>
              <div>
                <p>## Stats Log</p>
                <p>LEVEL</p>
                <p>1</p>
                <p>STREAK</p>
                <p>0 days</p>
                <p>...</p>
              </div>
              <p>## Mission Log</p>
              <p>No missions scheduled for today</p>
              <p>...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}