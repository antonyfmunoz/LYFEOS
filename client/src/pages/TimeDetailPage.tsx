import React from "react";
import { Link } from "wouter";
import { ArrowLeft, Clock, ArrowUpRight, Timer, Coffee, Calendar, Briefcase } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";

export default function TimeDetailPage() {
  // Set page title
  usePageTitle("Time Tokens - LYFEOS");
  
  // Get stats from context
  const { stats } = useLYFEOS();
  
  // Time allocation in hours
  const timeAllocation = [
    { category: "Deep Work", hours: 5, icon: Timer, description: "Focused work with no distractions" },
    { category: "Meetings", hours: 3, icon: Calendar, description: "Collaborative sessions and discussions" },
    { category: "Personal", hours: 2, icon: Coffee, description: "Self-care and personal activities" },
    { category: "Administrative", hours: 1, icon: Briefcase, description: "Email, planning, and organizing" },
  ];
  
  // For the unallocated time
  const unallocatedHours = stats.timeTokens.current;
  
  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-6">
        <Link href="/dashboard" className="flex items-center text-muted-foreground hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4 mr-2" />
          <span>Back to Dashboard</span>
        </Link>
      </div>
      
      <div className="mb-8 flex items-center">
        <Clock className="h-8 w-8 mr-3 text-primary" /> {/* Cyan (Throat) */}
        <h1 className="text-3xl font-orbitron">Time Tokens</h1>
      </div>
      
      {/* Current Time Status */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30"> {/* Cyan (Throat) */}
        <h2 className="font-orbitron text-xl mb-4 text-primary">Unallocated Time</h2> {/* Cyan (Throat) */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground mb-1">Available time tokens for today</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{stats.timeTokens.current}</span>
              <span className="text-muted-foreground ml-3 text-lg">/ {stats.timeTokens.max}</span>
            </div>
          </div>
          <div className="bg-background/50 border border-primary/20 rounded-md p-4">
            <p className="text-muted-foreground text-sm mb-1">Allocation status</p>
            <div className="flex items-center">
              <Timer className="h-5 w-5 mr-2 text-primary" /> {/* Cyan (Throat) */}
              <span className="text-white">{Math.round((stats.timeTokens.current / stats.timeTokens.max) * 100)}%</span>
            </div>
            <p className="text-primary text-xs mt-1">Remaining</p> {/* Cyan (Throat) */}
          </div>
        </div>
        <div className="mt-4 w-full bg-muted/30 h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-primary/50 to-primary h-full rounded-full"
            style={{ width: `${(stats.timeTokens.current / stats.timeTokens.max) * 100}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">Current: {stats.timeTokens.current} hours</span>
          <span className="text-xs text-muted-foreground">Total: {stats.timeTokens.max} hours</span>
        </div>
      </div>
      
      {/* Time Allocation */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-primary/30"> {/* Cyan (Throat) */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-primary">Time Allocation</h2> {/* Cyan (Throat) */}
        </div>
        
        <div className="space-y-6">
          {timeAllocation.map((item) => (
            <div key={item.category} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div className="col-span-1 flex items-center">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mr-3"> {/* Cyan (Throat) */}
                  <item.icon className="h-5 w-5 text-primary" /> {/* Cyan (Throat) */}
                </div>
                <div>
                  <h3 className="text-white">{item.category}</h3>
                  <p className="text-muted-foreground text-xs">{item.description}</p>
                </div>
              </div>
              <div className="col-span-1">
                <div className="w-full bg-muted/30 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-primary h-full rounded-full" 
                    style={{ width: `${(item.hours / stats.timeTokens.max) * 100}%` }}
                  ></div>
                </div>
              </div>
              <div className="col-span-1 flex justify-end">
                <span className="text-lg font-mono text-primary">{item.hours}h</span> {/* Cyan (Throat) */}
              </div>
            </div>
          ))}
          
          <div className="border-t border-primary/20 mt-6 pt-6"> {/* Cyan (Throat) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div className="col-span-1 flex items-center">
                <div className="w-10 h-10 rounded-full bg-primary/30 flex items-center justify-center mr-3"> {/* Cyan (Throat) */}
                  <Clock className="h-5 w-5 text-primary" /> {/* Cyan (Throat) */}
                </div>
                <div>
                  <h3 className="text-white">Unallocated</h3>
                  <p className="text-muted-foreground text-xs">Available time tokens</p>
                </div>
              </div>
              <div className="col-span-1">
                <div className="w-full bg-muted/30 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-primary h-full rounded-full" 
                    style={{ width: `${(unallocatedHours / stats.timeTokens.max) * 100}%` }}
                  ></div>
                </div>
              </div>
              <div className="col-span-1 flex justify-end">
                <span className="text-lg font-mono text-primary">{unallocatedHours}h</span> {/* Cyan (Throat) */}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Time Management Tips */}
      <div className="glassmorphic rounded-xl p-6 border border-primary/30"> {/* Cyan (Throat) */}
        <h2 className="font-orbitron text-xl mb-4 text-primary">Time Management Tips</h2> {/* Cyan (Throat) */}
        <ul className="space-y-3">
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-primary flex-shrink-0" /> {/* Cyan (Throat) */}
            <span className="text-muted-foreground">Batch similar tasks together to minimize context switching and maximize efficiency.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-primary flex-shrink-0" /> {/* Cyan (Throat) */}
            <span className="text-muted-foreground">Use time blocking to allocate specific hours for deep work, meetings, and personal time.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-primary flex-shrink-0" /> {/* Cyan (Throat) */}
            <span className="text-muted-foreground">Schedule buffer time between activities to prevent back-to-back commitments.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-primary flex-shrink-0" /> {/* Cyan (Throat) */}
            <span className="text-muted-foreground">Prioritize tasks using the Eisenhower Matrix (urgent/important) to allocate time effectively.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}