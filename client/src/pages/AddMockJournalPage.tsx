import React from "react";
import { useLocation } from "wouter";
import { useLYFEOS } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";

export default function AddMockJournalPage() {
  usePageTitle("Add Mock Journal");
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
    
    // Create content for the journal entry
    let content = `# Daily Reflection - ${formattedDate}\n\n`;
    
    // Add state metrics
    content += `## Daily State\n`;
    content += `- Mental State: 8/10\n`;
    content += `- Physical State: 7/10\n`;
    content += `- Emotional State: 8/10\n`;
    content += `- Wake Time: 06:30\n`;
    content += `- Sleep Time: 22:30\n\n`;
    
    // Add gratitude section
    content += `## Gratitude\n`;
    content += `Today I'm grateful for:\n\n`;
    content += `1. The beautiful weather that allowed me to take a walk in the park\n`;
    content += `2. The good conversation I had with an old friend\n`;
    content += `3. Making progress on my personal projects\n\n`;
    
    // Add tomorrow's goals
    content += `## Tomorrow's Goals\n`;
    content += `1. Complete the presentation for the meeting\n`;
    content += `2. Go for a morning run\n`;
    content += `3. Read at least 30 pages of my current book\n\n`;
    
    // Add annual goals
    content += `## Annual Goals\n`;
    content += `1. Improve my programming skills, especially with React\n`;
    content += `2. Travel to at least two new places\n`;
    content += `3. Establish a consistent exercise routine\n\n`;
    
    // Add thoughts
    content += `## Thoughts & Reflections\n`;
    content += `Today was productive overall. I made good progress on the LYFEOS project and learned some new techniques for React development. I noticed I was most focused during the morning hours, so I should try to schedule more important tasks during that time.\n\n`;
    
    // Add content consumed
    content += `## Content Consumed\n`;
    content += `- Finished Chapter 5 of "Atomic Habits"\n`;
    content += `- Watched a tutorial on advanced React hooks\n`;
    content += `- Listened to a podcast about productivity systems\n\n`;
    
    // Add research
    content += `## Research & Discoveries\n`;
    content += `I discovered a useful new npm library for handling forms in React. It seems to have good documentation and active maintenance. I should try implementing it in my next project.\n\n`;
    
    // Add to-do ideas
    content += `## To-Do Ideas\n`;
    content += `- Look into the new form library\n`;
    content += `- Update my personal website\n`;
    content += `- Schedule a dentist appointment\n`;
    content += `- Compare pricing for the new equipment\n\n`;
    
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
        tags: ['Journal', 'Daily Reflection']
      });
      
      toast({
        title: "Mock Journal Entry Created",
        description: `A mock journal entry for ${formattedDate} has been created.`,
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
        description: "Failed to create mock journal entry.",
        variant: "destructive",
        duration: 5000,
      });
    }
  };

  return (
    <div className="container mx-auto py-8 flex flex-col items-center">
      <div className="max-w-2xl w-full">
        <h1 className="text-3xl font-bold mb-6 text-center">Add Mock Journal Entry</h1>
        
        <div className="bg-card/30 rounded-lg border border-primary/20 p-6 mb-8">
          <p className="mb-4 text-[#7DAAB2]">
            This page allows you to add a mock journal entry to test the journal archiving functionality.
            Click the button below to create a sample journal entry with pre-filled content.
          </p>
          
          <div className="flex justify-center">
            <Button 
              onClick={addMockJournalEntry}
              className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50"
            >
              Create Mock Journal Entry
            </Button>
          </div>
        </div>
        
        <div className="bg-card/30 rounded-lg border border-primary/20 p-6">
          <h2 className="text-xl font-semibold mb-3">What's included in the mock entry?</h2>
          <ul className="space-y-2 text-[#7DAAB2]">
            <li>• Daily state metrics (mental, physical, emotional)</li>
            <li>• Sleep tracking (wake time and sleep time)</li>
            <li>• Gratitude list</li>
            <li>• Tomorrow's goals</li>
            <li>• Annual goals</li>
            <li>• Thoughts and reflections</li>
            <li>• Content consumed</li>
            <li>• Research notes</li>
            <li>• To-do ideas</li>
          </ul>
        </div>
      </div>
    </div>
  );
}