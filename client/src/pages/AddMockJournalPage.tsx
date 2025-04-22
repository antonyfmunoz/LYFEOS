import React from "react";
import { useLocation } from "wouter";
import { useLYFEOS } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";

export default function AddMockJournalPage() {
  usePageTitle("Screenshot Journal");
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
    const slug = `journal-mock-${Date.now()}`;
    
    // Create content as a simple screenshot-like journal entry
    let content = `# Journal - ${formattedDate}\n\n`;
    content += `![Screenshot 2025-04-21 191426](attached_assets/Screenshot%202025-04-21%20191426.png)\n\n`;
    content += `## Notes\n\n`;
    content += `Today I captured this screenshot of my daily progress. Key points of the day:\n\n`;
    content += `- Completed all main tasks for the LYFEOS project\n`;
    content += `- Added three new features to the dashboard\n`;
    content += `- Resolved the bullet point formatting issues in the markdown editor\n`;
    content += `- Started planning for the next phase of development\n\n`;
    content += `Overall mood: Productive and focused (8/10)\n\n`;
    
    try {
      // Create the mission page with the journal entry
      const title = `Journal - ${formattedDate}`;
      createMissionPage({
        title,
        slug,
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completed: false,
        xpValue: 20,
        tags: ['Journal', 'Screenshot', 'Daily Reflection']
      });
      
      toast({
        title: "Screenshot Journal Entry Created",
        description: `A screenshot journal entry for ${formattedDate} has been created.`,
        variant: "default",
        className: "bg-background/80 border border-primary text-foreground",
        duration: 5000,
      });
      
      // Navigate to journal archive
      navigate("/journal-archive");
    } catch (error) {
      console.error("Failed to create mock journal entry:", error);
      toast({
        title: "Error",
        description: "Failed to create screenshot journal entry.",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  return (
    <div className="container mx-auto py-8 flex flex-col items-center">
      <div className="max-w-2xl w-full">
        <h1 className="text-3xl font-bold mb-6 text-center">Screenshot Journal Creator</h1>
        
        <div className="bg-card/30 rounded-lg border border-primary/20 p-6 mb-8">
          <p className="mb-4 text-[#7DAAB2]">
            This page creates journal entries that automatically include a screenshot of your dashboard progress.
            Each entry will be saved with today's date and include the latest dashboard screenshot.
          </p>
          
          <div className="flex justify-center">
            <Button 
              onClick={addMockJournalEntry}
              className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50"
            >
              Create Screenshot Journal
            </Button>
          </div>
        </div>
        
        <div className="bg-card/30 rounded-lg border border-primary/20 p-6">
          <h2 className="text-xl font-semibold mb-3">What's included in the mock entry?</h2>
          <ul className="space-y-2 text-[#7DAAB2]">
            <li>• Screenshot of your dashboard</li>
            <li>• Brief notes about the day</li>
            <li>• Key accomplishments</li>
            <li>• Overall mood rating</li>
            <li>• Automatically dated timestamp</li>
          </ul>
          
          <div className="mt-6 pt-3 border-t border-slate-700/30">
            <h3 className="text-sm font-medium mb-2">Preview:</h3>
            <div className="p-3 rounded-md border border-slate-700/30 bg-card/20">
              <p className="text-sm text-[#7DAAB2] mb-1">Screenshot embedded at top of entry</p>
              <p className="text-sm text-[#7DAAB2] mb-1">Brief bullet points summarizing the day</p>
              <p className="text-sm text-[#7DAAB2]">Overall mood rating included</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}