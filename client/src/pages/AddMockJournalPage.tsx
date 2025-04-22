import React from "react";
import { useLocation } from "wouter";
import { useLYFEOS } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";

export default function AddMockJournalPage() {
  usePageTitle("Dashboard Journal");
  const { createMissionPage } = useLYFEOS();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const addMockJournalEntry = () => {
    // Create a date for the mock journal entry
    const date = new Date();
    const formattedDate = date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    
    // Create unique slug
    const slug = `journal-dashboard-${Date.now()}`;
    
    // Create content that mimics the exact dashboard UI layout
    let content = `# Daily Dashboard - ${formattedDate}\n\n`;
    
    // Metrics Bar - Exactly as shown in the dashboard
    content += `## Daily Metrics\n`;
    content += `| Mental State | Physical State | Emotional State | Energy | Focus | Time |\n`;
    content += `|:------------:|:--------------:|:---------------:|:------:|:-----:|:----:|\n`;
    content += `| 8/10 | 7/10 | 8/10 | 85/100 | 90/100 | 75/100 |\n\n`;
    
    // Daily Reflection - Dashboard Format
    content += `## Daily Reflection\n\n`;
    
    // Morning Routine Section
    content += `### Morning Routine\n`;
    content += `- Wake time: 06:30\n`;
    content += `- Morning meditation completed\n`;
    content += `- Daily planning session completed\n`;
    content += `- Breakfast: Protein smoothie and oatmeal\n\n`;
    
    // Today's Focus Section
    content += `### Today's Focus\n`;
    content += `- Complete LYFEOS markdown editor feature\n`;
    content += `- Debug journal archive functionality\n`;
    content += `- Implement UI improvements for mobile devices\n`;
    content += `- Plan next sprint features\n\n`;
    
    // Gratitude Section
    content += `### Gratitude\n`;
    content += `Today I'm grateful for the progress made on the project, the supportive feedback, and the opportunity to build something meaningful. I'm also grateful for the good weather today that allowed me to take a short walk between coding sessions.\n\n`;
    
    // Timeline Section
    content += `### Day Timeline\n`;
    content += `- 06:30 - 07:30: Morning routine and planning\n`;
    content += `- 08:00 - 10:30: Focused work on markdown editor\n`;
    content += `- 10:30 - 10:45: Short break\n`;
    content += `- 10:45 - 12:30: Continued with editor fixes\n`;
    content += `- 12:30 - 13:30: Lunch and short walk\n`;
    content += `- 13:30 - 16:00: Journal archive development\n`;
    content += `- 16:00 - 17:30: Testing and debugging\n`;
    content += `- 17:30 - 18:30: Planning session for next features\n\n`;
    
    // Notes and Insights Section
    content += `### Notes & Insights\n`;
    content += `Today I discovered a better approach to handling text formatting in the markdown editor. By focusing on targeted event handlers rather than automatic formatting, we can provide users with more control over their content. This could be applied to other text input components as well.\n\n`;
    
    // End of Day Summary
    content += `### End of Day Summary\n`;
    content += `Overall a very productive day. All planned tasks were completed, with the markdown editor improvements being the highlight. Energy levels remained high throughout the day, likely due to the short breaks and walking session. Tomorrow I plan to focus on finalizing the journal archive system and starting work on the calendar integration.\n\n`;
    
    try {
      // Create the mission page with the journal entry
      const title = `Dashboard - ${formattedDate}`;
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
        title: "Dashboard Journal Created",
        description: `A dashboard journal for ${formattedDate} has been saved.`,
        variant: "default",
        className: "bg-background/80 border border-primary text-foreground",
        duration: 5000,
      });
      
      // Navigate to journal archive
      navigate("/journal-archive");
    } catch (error) {
      console.error("Failed to create dashboard journal:", error);
      toast({
        title: "Error",
        description: "Failed to create dashboard journal entry.",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  return (
    <div className="container mx-auto py-8 flex flex-col items-center">
      <div className="max-w-2xl w-full">
        <h1 className="text-3xl font-bold mb-6 text-center">Dashboard Journal Creator</h1>
        
        <div className="bg-card/30 rounded-lg border border-primary/20 p-6 mb-8">
          <p className="mb-4 text-[#7DAAB2]">
            This page creates journal entries that exactly mirror the dashboard UI format.
            Each entry captures the complete dashboard structure with accurate metrics and formatted sections.
          </p>
          
          <div className="flex justify-center">
            <Button 
              onClick={addMockJournalEntry}
              className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50"
            >
              Create Dashboard Journal
            </Button>
          </div>
        </div>
        
        <div className="bg-card/30 rounded-lg border border-primary/20 p-6">
          <h2 className="text-xl font-semibold mb-3">What's included in the journal?</h2>
          <ul className="space-y-2 text-[#7DAAB2]">
            <li>• Complete daily metrics table (mental, physical, emotional states)</li>
            <li>• Morning routine details</li>
            <li>• Today's focus points</li>
            <li>• Gratitude reflection</li>
            <li>• Detailed day timeline</li>
            <li>• Notes and insights</li>
            <li>• End of day summary</li>
          </ul>
          
          <div className="mt-6 pt-3 border-t border-slate-700/30">
            <h3 className="text-sm font-medium mb-2">Preview:</h3>
            <div className="p-3 rounded-md border border-slate-700/30 bg-card/20">
              <p className="text-xs text-[#7DAAB2] mb-1 font-mono">## Daily Metrics</p>
              <p className="text-xs text-[#7DAAB2] mb-1 font-mono">| Mental State | Physical State | Emotional State | Energy | Focus | Time |</p>
              <p className="text-xs text-[#7DAAB2] mb-2 font-mono">| 8/10 | 7/10 | 8/10 | 85/100 | 90/100 | 75/100 |</p>
              <p className="text-xs text-[#7DAAB2] mb-1 font-mono">### Morning Routine</p>
              <p className="text-xs text-[#7DAAB2] font-mono">- Wake time: 06:30</p>
              <p className="text-xs text-[#7DAAB2] font-mono">- Morning meditation completed</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}