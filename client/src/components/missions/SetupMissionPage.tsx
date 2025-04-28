import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'wouter';
import { 
  ArrowLeft, Star, Trophy, CheckSquare, Square, 
  Save, ThumbsUp, Send, HelpCircle 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogDescription, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useLYFEOS } from '@/lib/context';
import { useAuth } from '@/lib/authContext';
import { usePageTitle } from '@/hooks/use-page-title';
import { cn } from '@/lib/utils';
import MarkdownEditor from '@/components/markdown/MarkdownEditor';

export default function SetupMissionPage() {
  const params = useParams();
  const slug = params.slug || '';
  const { toast } = useToast();
  const { missionPages, updateMissionPage, getMissionPageBySlug } = useLYFEOS();
  const { user } = useAuth(); // Get user from auth context
  
  // Load mission page by slug
  const missionPage = getMissionPageBySlug(slug);
  
  // Use title for page title
  usePageTitle(missionPage ? `Mission: ${missionPage.title}` : 'Setup Mission');
  
  // Content state
  const [content, setContent] = useState('');
  const [taskCount, setTaskCount] = useState({ total: 0, completed: 0 });
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [reflectionText, setReflectionText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Initialize content
  useEffect(() => {
    if (missionPage) {
      setContent(missionPage.content);
      
      // Parse tasks from content
      const lines = missionPage.content.split('\n');
      let totalTasks = 0;
      let completedTasks = 0;
      
      lines.forEach(line => {
        // Match Markdown task syntax: "- [ ]" or "- [x]"
        const taskMatch = line.match(/- \[([ x])\]/i);
        if (taskMatch) {
          totalTasks++;
          if (taskMatch[1].toLowerCase() === 'x') {
            completedTasks++;
          }
        }
      });
      
      setTaskCount({
        total: totalTasks,
        completed: completedTasks
      });
    }
  }, [missionPage]);
  
  // Handle content changes
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    
    // Update task counts
    const lines = newContent.split('\n');
    let totalTasks = 0;
    let completedTasks = 0;
    
    lines.forEach(line => {
      const taskMatch = line.match(/- \[([ x])\]/i);
      if (taskMatch) {
        totalTasks++;
        if (taskMatch[1].toLowerCase() === 'x') {
          completedTasks++;
        }
      }
    });
    
    setTaskCount({
      total: totalTasks,
      completed: completedTasks
    });
  };
  
  // Handle saving content
  const handleSave = async () => {
    if (missionPage && content !== missionPage.content) {
      // Set saving state to show loading indicator
      setIsSaving(true);
      
      try {
        // Update mission page content
        await updateMissionPage(missionPage.id, {
          content,
          updatedAt: new Date().toISOString()
        });
        
        // Show success toast
        toast({
          title: "Mission Progress Saved",
          description: "Your progress has been saved successfully",
          variant: "default",
          className: "bg-background/80 border border-primary text-foreground",
          duration: 3000,
        });
        
        // Log success for debugging
        console.log("Mission progress saved successfully");
        
        return true; // Return success status for when called from other functions
      } catch (error) {
        console.error("Error saving mission progress:", error);
        
        // Show error toast
        toast({
          title: "Error Saving Progress",
          description: "There was a problem saving your progress. Please try again.",
          variant: "destructive",
          duration: 5000,
        });
        
        return false; // Return failure status
      } finally {
        // Reset saving state
        setIsSaving(false);
      }
    }
    return false; // No changes to save
  };
  
  // Calculate progress percentage
  const progressPercentage = taskCount.total > 0
    ? Math.round((taskCount.completed / taskCount.total) * 100)
    : 0;
  
  // Mark mission as completed
  const completeMission = async () => {
    if (!missionPage) return;
    
    // Set submitting state to show loading state
    setIsSubmitting(true);
    
    try {
      // Save current content first
      handleSave();
      
      // Add reflection to content
      const updatedContent = reflectionText 
        ? `${content}\n\n## Mission Reflection\n\n${reflectionText}\n\n---\n\n*Mission completed on ${new Date().toLocaleDateString()}*`
        : content;
      
      // Update mission as completed
      updateMissionPage(missionPage.id, {
        content: updatedContent,
        completed: true,
        updatedAt: new Date().toISOString()
      });
      
      // Award XP to the user using the API endpoint
      if (missionPage.xpValue && missionPage.xpValue > 0 && user && user.id) {
        try {
          console.log(`Awarding ${missionPage.xpValue} XP to user ${user.id} for completing mission`);
          
          // Using the API to award XP
          const response = await fetch(`/api/users/${user.id}/award-xp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              amount: missionPage.xpValue,
              reason: `Completed setup mission: ${missionPage.title}`
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log("XP award response:", data);
            
            // Check if user leveled up
            if (data.levelUp) {
              console.log("User leveled up!");
            }
          } else {
            console.error("Error awarding XP:", await response.text());
          }
        } catch (xpError) {
          console.error("Error awarding XP:", xpError);
        }
      }
      
      // Show success toast
      toast({
        title: "Mission Completed! 🎉",
        description: `You've earned +${missionPage.xpValue} XP by completing this setup mission`,
        variant: "default",
        className: "bg-background/80 border border-emerald-500 text-foreground",
        duration: 5000,
      });
    } catch (error) {
      console.error("Error completing mission:", error);
      
      toast({
        title: "Error",
        description: "Failed to complete mission. Please try again.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      // Close dialog and reset submitting state
      setSubmitDialogOpen(false);
      setIsSubmitting(false);
    }
  };
  
  // If mission not found
  if (!missionPage) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="glassmorphic rounded-xl p-8 max-w-xl text-center">
          <h1 className="text-2xl font-orbitron mb-4">Mission Not Found</h1>
          <p className="text-[#7DAAB2] mb-6">The setup mission you're looking for doesn't exist or may have been deleted.</p>
          <Link href="/mission-archive">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" /> Return to Mission Archive
            </Button>
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container max-w-5xl py-6">
      {/* Header with back button */}
      <div className="mb-6 flex items-center">
        <Link href="/mission-archive" className="mr-3 flex items-center text-[#7DAAB2] hover:text-primary transition">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-orbitron">{missionPage.title}</h1>
      </div>
      
      {/* Mission info card */}
      <div className="glassmorphic rounded-xl p-6 border border-primary/30 mb-8">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left column - Mission metadata */}
          <div className="md:w-1/3">
            <div className="p-4 rounded-xl bg-primary/10 mb-4">
              <h2 className="text-lg font-orbitron text-primary mb-3">
                Setup Mission
              </h2>
              
              <Separator className="my-3 opacity-50" />
              
              <div className="space-y-4 mt-4">
                <div>
                  <h3 className="text-sm mb-2 flex items-center">
                    <Trophy className="h-4 w-4 text-primary mr-2" />
                    Mission Progress
                  </h3>
                  <div className="flex items-center justify-between mb-2 text-xs">
                    <span>{taskCount.completed} of {taskCount.total} tasks completed</span>
                    <span className="font-mono">{progressPercentage}%</span>
                  </div>
                  <Progress value={progressPercentage} className="h-1.5" />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Star className="h-4 w-4 text-primary mr-2" />
                    <span className="text-sm">XP Reward</span>
                  </div>
                  <Badge variant="outline" className="font-mono text-primary bg-primary/10">
                    +{missionPage.xpValue}
                  </Badge>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-card/30 rounded-xl mb-4">
              <h3 className="font-orbitron text-sm mb-3">COMPLETION BENEFITS</h3>
              
              <ul className="space-y-2 text-sm">
                {missionPage.tags.includes('Personality') && (
                  <li className="flex items-start">
                    <div className="mt-0.5 mr-2">
                      {missionPage.completed ? <CheckSquare className="h-4 w-4 text-emerald-400" /> : <Square className="h-4 w-4 text-[#7DAAB2]" />}
                    </div>
                    <span>Personalized insights based on your archetype</span>
                  </li>
                )}
                
                {missionPage.tags.includes('Technical') && (
                  <li className="flex items-start">
                    <div className="mt-0.5 mr-2">
                      {missionPage.completed ? <CheckSquare className="h-4 w-4 text-emerald-400" /> : <Square className="h-4 w-4 text-[#7DAAB2]" />}
                    </div>
                    <span>Automated data syncing across integrated services</span>
                  </li>
                )}
                
                {missionPage.tags.includes('Vision') && (
                  <li className="flex items-start">
                    <div className="mt-0.5 mr-2">
                      {missionPage.completed ? <CheckSquare className="h-4 w-4 text-emerald-400" /> : <Square className="h-4 w-4 text-[#7DAAB2]" />}
                    </div>
                    <span>AI-powered future self visualization movie</span>
                  </li>
                )}
                
                {missionPage.tags.includes('Productivity') && (
                  <li className="flex items-start">
                    <div className="mt-0.5 mr-2">
                      {missionPage.completed ? <CheckSquare className="h-4 w-4 text-emerald-400" /> : <Square className="h-4 w-4 text-[#7DAAB2]" />}
                    </div>
                    <span>Optimized daily schedule with routine reminders</span>
                  </li>
                )}
                
                {missionPage.tags.includes('Purpose') && (
                  <li className="flex items-start">
                    <div className="mt-0.5 mr-2">
                      {missionPage.completed ? <CheckSquare className="h-4 w-4 text-emerald-400" /> : <Square className="h-4 w-4 text-[#7DAAB2]" />}
                    </div>
                    <span>Life dashboard with pillar-based tracking</span>
                  </li>
                )}
                
                <li className="flex items-start">
                  <div className="mt-0.5 mr-2">
                    {missionPage.completed ? <CheckSquare className="h-4 w-4 text-emerald-400" /> : <Square className="h-4 w-4 text-[#7DAAB2]" />}
                  </div>
                  <span>Unlock specialized features and insights</span>
                </li>
                
                <li className="flex items-start">
                  <div className="mt-0.5 mr-2">
                    {missionPage.completed ? <CheckSquare className="h-4 w-4 text-emerald-400" /> : <Square className="h-4 w-4 text-[#7DAAB2]" />}
                  </div>
                  <span>Experience points toward level progression</span>
                </li>
              </ul>
            </div>
            
            {/* Mission Actions */}
            <div className="space-y-2">
              {!missionPage.completed && (
                <>
                  <Button 
                    className="w-full"
                    onClick={handleSave}
                    disabled={content === missionPage.content}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save Progress
                  </Button>
                  
                  <Button 
                    className="w-full bg-emerald-500 hover:bg-emerald-600"
                    disabled={taskCount.completed < taskCount.total || isSubmitting}
                    onClick={() => {
                      if (taskCount.completed >= taskCount.total) {
                        setSubmitDialogOpen(true);
                      }
                    }}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                        Processing...
                      </>
                    ) : (
                      <>
                        <ThumbsUp className="h-4 w-4 mr-2" />
                        Complete Mission
                      </>
                    )}
                  </Button>
                </>
              )}
              
              {missionPage.completed && (
                <Button 
                  className="w-full bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-500/50"
                  disabled
                >
                  <Trophy className="h-4 w-4 mr-2" />
                  Mission Completed
                </Button>
              )}
            </div>
          </div>
          
          {/* Right column - Mission content */}
          <div className="md:w-2/3">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-orbitron text-lg">Mission Details</h2>
              
              {/* Mission tags */}
              <div className="flex items-center gap-2">
                {missionPage.tags
                  .filter(tag => tag !== 'Mission' && tag !== 'Setup Mission')
                  .map((tag, index) => (
                    <Badge 
                      key={index}
                      variant="outline" 
                      className="text-xs bg-slate-700/50 border-slate-600/50"
                    >
                      {tag}
                    </Badge>
                  ))}
              </div>
            </div>
            
            {/* Mission Content Editor */}
            <MarkdownEditor
              content={content}
              onChange={handleContentChange}
              onSave={handleSave}
              className="mb-4"
              readOnly={missionPage.completed}
            />
            
            {!missionPage.completed && (
              <div className="text-xs text-[#7DAAB2] mt-4 p-2 bg-card/20 rounded-md border border-primary/10 flex items-center">
                <HelpCircle className="h-3.5 w-3.5 mr-2 text-primary" />
                <p>To complete this mission, check off all the task items in the list using the checkbox syntax (- [x]).</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Mission Completion Dialog */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit Mission Completion</DialogTitle>
            <DialogDescription>
              Congratulations on completing all the tasks! Add a final reflection on what you've learned or accomplished.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <h4 className="text-sm font-medium mb-2">Mission Reflection (Optional)</h4>
            <Textarea
              placeholder="Share your thoughts, insights, or key takeaways from this setup mission..."
              className="min-h-[120px]"
              value={reflectionText}
              onChange={(e) => setReflectionText(e.target.value)}
            />
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSubmitDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={completeMission}
              disabled={isSubmitting}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              {isSubmitting ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                  Processing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Complete Mission
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}