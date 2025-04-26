import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { 
  UserRound, Link2, Compass, Sunrise, PieChart, 
  ChevronRight, Star, Trophy, Zap 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useLYFEOS } from '@/lib/context';
import { cn } from '@/lib/utils';

// Define the setup mission type
interface SetupMission {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  slug: string;
  xpValue: number;
  completed: boolean;
  progress: number;
}

export default function SetupMissionsSection() {
  const [, navigate] = useLocation();
  const { createMissionPage, missionPages } = useLYFEOS();
  
  // Check if setup missions already exist in mission pages
  const existingMissions = missionPages.filter(page => 
    page.tags.includes('Setup Mission')
  );
  
  // Define the available setup missions
  const [setupMissions, setSetupMissions] = useState<SetupMission[]>(() => {
    // Initial setup missions data
    const missions: SetupMission[] = [
      {
        id: 'archetype-quiz',
        title: 'Complete Full Archetype Quiz',
        description: 'Discover your personality archetype with a comprehensive 12Types style assessment.',
        icon: <UserRound className="h-5 w-5 text-blue-400" />,
        slug: 'archetype-quiz-mission',
        xpValue: 50,
        completed: false,
        progress: 0
      },
      {
        id: 'integrations',
        title: 'Connect Integrations',
        description: 'Link your Health, Calendar, Notion, and other external services for a seamless experience.',
        icon: <Link2 className="h-5 w-5 text-purple-400" />,
        slug: 'integrations-mission',
        xpValue: 35,
        completed: false,
        progress: 0
      },
      {
        id: 'future-self',
        title: 'Design Future Self',
        description: 'Create your future vision with AI-guided journaling and visual movie generation.',
        icon: <Compass className="h-5 w-5 text-emerald-400" />,
        slug: 'future-self-mission',
        xpValue: 60,
        completed: false,
        progress: 0
      },
      {
        id: 'routines',
        title: 'Craft Daily Routines',
        description: 'Design your ideal Morning, Evening, and Recovery routines for optimal performance.',
        icon: <Sunrise className="h-5 w-5 text-amber-400" />,
        slug: 'routines-mission',
        xpValue: 45,
        completed: false,
        progress: 0
      },
      {
        id: 'life-pillars',
        title: 'Establish Core Life Pillars',
        description: 'Define your essential life values in Career, Fitness, Relationships, and more.',
        icon: <PieChart className="h-5 w-5 text-rose-400" />,
        slug: 'life-pillars-mission',
        xpValue: 55,
        completed: false,
        progress: 0
      }
    ];
    
    // Update with progress from existing mission pages if any
    if (existingMissions.length > 0) {
      return missions.map(mission => {
        const existing = existingMissions.find(page => 
          page.slug === mission.slug || 
          page.slug === mission.slug + '-setup'
        );
        
        if (existing) {
          return {
            ...mission,
            completed: existing.completed,
            progress: existing.tags.includes('In Progress') ? 50 : existing.completed ? 100 : 0
          };
        }
        return mission;
      });
    }
    
    return missions;
  });
  
  // Calculate overall setup progress
  const overallProgress = setupMissions.reduce((acc, mission) => 
    acc + mission.progress, 0) / (setupMissions.length * 100) * 100;
  
  // Start a new setup mission
  const startSetupMission = (mission: SetupMission) => {
    // Check if mission already exists
    const existingMission = missionPages.find(page => 
      page.slug === mission.slug || 
      page.slug === mission.slug + '-setup'
    );
    
    if (existingMission) {
      // Navigate to existing mission
      navigate(`/mission-page/${existingMission.slug}`);
      return;
    }
    
    // Create mission content based on type
    let missionContent = '';
    let missionTags = ['Setup Mission', 'Mission'];
    
    switch (mission.id) {
      case 'archetype-quiz':
        missionContent = `# ${mission.title}\n\n## Mission Overview\n\nThis mission will help you discover your personality archetype through a comprehensive assessment based on the 12Types model. Understanding your archetype will unlock personalized insights and recommendations across the platform.\n\n## Getting Started\n\n- [ ] Take the 12Types assessment (approximately 10 minutes)\n- [ ] Review your primary and shadow archetypes\n- [ ] Explore your archetype strengths and growth areas\n- [ ] Set personal development goals based on insights\n\n## Why This Matters\n\nKnowing your personality archetype helps you harness your natural strengths and address your unique challenges. This self-knowledge forms the foundation for more effective personal growth strategies.`;
        missionTags.push('Personality');
        break;
        
      case 'integrations':
        missionContent = `# ${mission.title}\n\n## Mission Overview\n\nConnect your external applications and services to enhance your experience with personalized data syncing and insights. This mission will guide you through setting up integrations with your most important tools.\n\n## Available Integrations\n\n- [ ] Health apps (Apple Health, Google Fit, etc.)\n- [ ] Calendar services (Google Calendar, Outlook, etc.)\n- [ ] Productivity tools (Notion, Todoist, etc.)\n- [ ] Content services (Spotify, Kindle, etc.)\n- [ ] Smart home systems\n\n## Benefits of Integration\n\nConnecting your services creates a unified dashboard of your digital life, enabling smart suggestions, automated tracking, and comprehensive insights across all your activities.`;
        missionTags.push('Technical');
        break;
        
      case 'future-self':
        missionContent = `# ${mission.title}\n\n## Mission Overview\n\nDesign a compelling vision of your future self through guided reflection, AI-powered visualization, and goal-setting exercises. This mission helps you create a clear destination for your personal development journey.\n\n## Future Self Design Process\n\n- [ ] Complete the guided future-self journaling exercise\n- [ ] Identify 3-5 core values you want your future self to embody\n- [ ] Generate your visual future self movie with AI assistance\n- [ ] Set 1-year, a 3-year, and 5-year milestone goals\n- [ ] Create a personal mission statement\n\n## The Power of Vision\n\nPeople with clear future visions are 3x more likely to achieve their goals. Your future self design acts as a compass for daily decisions and a motivation source during challenges.`;
        missionTags.push('Vision');
        break;
        
      case 'routines':
        missionContent = `# ${mission.title}\n\n## Mission Overview\n\nDesign optimal routines for different parts of your day to maximize energy, productivity, and wellbeing. This mission guides you in creating structured sequences that become automatic with practice.\n\n## Key Routines to Design\n\n- [ ] Morning Routine (Energy activation & day preparation)\n- [ ] Evening Routine (Reflection & recovery preparation)\n- [ ] Deep Work Routine (Focus & creative production)\n- [ ] Recovery Routine (Stress management & renewal)\n- [ ] Weekly Reset Routine (Review & planning)\n\n## Routine Design Principles\n\nThe most effective routines balance structure with flexibility, incorporate science-backed practices, and align with your natural rhythms and preferences. Start small and build consistency before expanding.`;
        missionTags.push('Productivity');
        break;
        
      case 'life-pillars':
        missionContent = `# ${mission.title}\n\n## Mission Overview\n\nIdentify and define the core pillars that form the foundation of your life. This mission helps you clarify what matters most and how to allocate your time and energy accordingly.\n\n## Life Pillars Establishment\n\n- [ ] Identify 4-7 core life pillars (Career, Health, Relationships, etc.)\n- [ ] Rate current satisfaction in each pillar (1-10)\n- [ ] Define what excellence looks like in each pillar\n- [ ] Set one key focus area for improvement in each pillar\n- [ ] Allocate ideal time/energy percentages across pillars\n\n## Impact of Clear Pillars\n\nWhen your core life pillars are clearly defined, decision-making becomes easier, priorities are clearer, and your sense of purpose and direction strengthens.`;
        missionTags.push('Purpose');
        break;
        
      default:
        missionContent = `# ${mission.title}\n\n## Mission Overview\n\n${mission.description}\n\n## Getting Started\n\n- [ ] First step\n- [ ] Second step\n- [ ] Third step\n\n## Why This Matters\n\nCompleting this setup mission will enhance your personal growth journey.`;
    }
    
    // Create the mission page
    const newMission = createMissionPage({
      title: mission.title,
      slug: mission.slug + '-setup',
      content: missionContent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completed: false,
      xpValue: mission.xpValue,
      tags: missionTags,
    });
    
    // Update local state to show in-progress
    setSetupMissions(missions => 
      missions.map(m => 
        m.id === mission.id 
          ? { ...m, progress: 50 } 
          : m
      )
    );
    
    // Navigate to the new mission page
    navigate(`/mission-page/${newMission.slug}`);
  };
  
  return (
    <div className="mb-12">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-orbitron mb-1">Deep Setup Missions</h2>
          <p className="text-[#7DAAB2] text-sm">Optional missions that expand your customization</p>
        </div>
        
        {/* Setup progress indicator */}
        <div className="flex items-center bg-card/30 px-3 py-1.5 rounded-full">
          <Trophy className="h-4 w-4 text-primary mr-2" />
          <div className="flex flex-col mr-3">
            <span className="text-xs text-[#7DAAB2]">Setup Progress</span>
            <div className="w-24 h-1.5 mt-1 relative">
              <Progress value={overallProgress} className="h-1.5" />
            </div>
          </div>
          <Badge variant="outline" className="bg-primary/10 text-primary">
            {Math.round(overallProgress)}%
          </Badge>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {setupMissions.map((mission) => (
          <div 
            key={mission.id}
            className={cn(
              "glassmorphic rounded-xl p-5 border transition-all duration-300",
              mission.completed 
                ? "border-emerald-500/50 bg-emerald-500/5" 
                : mission.progress > 0 
                  ? "border-amber-500/50 bg-amber-500/5 hover:border-primary/50 hover:shadow-[0_0_8px_var(--primary-glow-light)]" 
                  : "border-slate-700/50 hover:border-primary/50 hover:shadow-[0_0_8px_var(--primary-glow-light)]"
            )}
          >
            <div className="flex items-start">
              {/* Icon */}
              <div className="p-2 rounded-lg bg-card/50 mr-4">
                {mission.icon}
              </div>
              
              {/* Content */}
              <div className="flex-grow">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-medium">{mission.title}</h3>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs ml-2",
                      mission.completed 
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50" 
                        : mission.progress > 0 
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/50"
                          : "bg-slate-700/50 text-slate-300"
                    )}
                  >
                    {mission.completed 
                      ? "Completed" 
                      : mission.progress > 0 
                        ? "In Progress" 
                        : "Available"}
                  </Badge>
                </div>
                
                <p className="text-[#7DAAB2] text-sm mb-3">
                  {mission.description}
                </p>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-xs">
                    <Star className="h-3.5 w-3.5 text-primary mr-1" />
                    <span className="text-primary font-medium">+{mission.xpValue} XP</span>
                    {mission.completed && (
                      <span className="ml-2 text-emerald-400 flex items-center">
                        <Zap className="h-3 w-3 mr-1" />
                        Unlocked
                      </span>
                    )}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-7 text-xs",
                      mission.completed 
                        ? "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
                        : "bg-primary/10 hover:bg-primary/20 text-primary border-primary/30"
                    )}
                    onClick={() => startSetupMission(mission)}
                  >
                    {mission.completed 
                      ? "Review" 
                      : mission.progress > 0 
                        ? "Continue" 
                        : "Start"}
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
                
                {/* Progress bar */}
                {(mission.progress > 0 || mission.completed) && (
                  <div className="w-full h-1 mt-3 relative">
                    <Progress 
                      value={mission.progress > 0 ? mission.progress : mission.completed ? 100 : 0} 
                      className={cn(
                        "h-1",
                        mission.completed ? "bg-emerald-500/50" : "bg-amber-500/50"
                      )}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}