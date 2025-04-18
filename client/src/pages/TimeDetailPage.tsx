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
        <Link href="/dashboard" className="flex items-center text-[#7DAAB2] hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4 mr-2" />
          <span>Back to Dashboard</span>
        </Link>
      </div>
      
      <div className="mb-8 flex items-center">
        <Clock className="h-8 w-8 mr-3 text-[#22D3EE]" /> {/* Cyan (Throat) */}
        <h1 className="text-3xl font-orbitron">Time Tokens</h1>
      </div>
      
      {/* Current Time Status */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-[#22D3EE]/30"> {/* Cyan (Throat) */}
        <h2 className="font-orbitron text-xl mb-4 text-[#22D3EE]">Unallocated Time</h2> {/* Cyan (Throat) */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[#7DAAB2] mb-1">Available time tokens for today</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{stats.timeTokens.current}</span>
              <span className="text-[#7DAAB2] ml-3 text-lg">/ {stats.timeTokens.max}</span>
            </div>
          </div>
          <div className="bg-[#001E26] border border-[#22D3EE]/20 rounded-md p-4">
            <p className="text-[#7DAAB2] text-sm mb-1">Allocation status</p>
            <div className="flex items-center">
              <Timer className="h-5 w-5 mr-2 text-[#22D3EE]" /> {/* Cyan (Throat) */}
              <span className="text-white">{Math.round((stats.timeTokens.current / stats.timeTokens.max) * 100)}%</span>
            </div>
            <p className="text-[#22D3EE] text-xs mt-1">Remaining</p> {/* Cyan (Throat) */}
          </div>
        </div>
        <div className="mt-4 w-full bg-[#060F13] h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-[#22D3EE]/50 to-[#22D3EE] h-full rounded-full"
            style={{ width: `${(stats.timeTokens.current / stats.timeTokens.max) * 100}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-[#7DAAB2]">Current: {stats.timeTokens.current} hours</span>
          <span className="text-xs text-[#7DAAB2]">Total: {stats.timeTokens.max} hours</span>
        </div>
      </div>
      
      {/* Time Allocation */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-[#22D3EE]/30"> {/* Cyan (Throat) */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-[#22D3EE]">Time Allocation</h2> {/* Cyan (Throat) */}
        </div>
        
        <div className="space-y-6">
          {timeAllocation.map((item) => (
            <div key={item.category} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div className="col-span-1 flex items-center">
                <div className="w-10 h-10 rounded-full bg-[#22D3EE]/10 flex items-center justify-center mr-3"> {/* Cyan (Throat) */}
                  <item.icon className="h-5 w-5 text-[#22D3EE]" /> {/* Cyan (Throat) */}
                </div>
                <div>
                  <h3 className="text-white">{item.category}</h3>
                  <p className="text-[#7DAAB2] text-xs">{item.description}</p>
                </div>
              </div>
              <div className="col-span-1">
                <div className="w-full bg-[#060F13] h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-[#22D3EE] h-full rounded-full" 
                    style={{ width: `${(item.hours / stats.timeTokens.max) * 100}%` }}
                  ></div>
                </div>
              </div>
              <div className="col-span-1 flex justify-end">
                <span className="text-lg font-mono text-[#22D3EE]">{item.hours}h</span> {/* Cyan (Throat) */}
              </div>
            </div>
          ))}
          
          <div className="border-t border-[#22D3EE]/20 mt-6 pt-6"> {/* Cyan (Throat) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div className="col-span-1 flex items-center">
                <div className="w-10 h-10 rounded-full bg-[#22D3EE]/30 flex items-center justify-center mr-3"> {/* Cyan (Throat) */}
                  <Clock className="h-5 w-5 text-[#22D3EE]" /> {/* Cyan (Throat) */}
                </div>
                <div>
                  <h3 className="text-white">Unallocated</h3>
                  <p className="text-[#7DAAB2] text-xs">Available time tokens</p>
                </div>
              </div>
              <div className="col-span-1">
                <div className="w-full bg-[#060F13] h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-[#22D3EE] h-full rounded-full" 
                    style={{ width: `${(unallocatedHours / stats.timeTokens.max) * 100}%` }}
                  ></div>
                </div>
              </div>
              <div className="col-span-1 flex justify-end">
                <span className="text-lg font-mono text-[#22D3EE]">{unallocatedHours}h</span> {/* Cyan (Throat) */}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Time Management Tips */}
      <div className="glassmorphic rounded-xl p-6 border border-[#22D3EE]/30"> {/* Cyan (Throat) */}
        <h2 className="font-orbitron text-xl mb-4 text-[#22D3EE]">Time Management Tips</h2> {/* Cyan (Throat) */}
        <ul className="space-y-3">
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-[#22D3EE] flex-shrink-0" /> {/* Cyan (Throat) */}
            <span className="text-[#7DAAB2]">Batch similar tasks together to minimize context switching and maximize efficiency.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-[#22D3EE] flex-shrink-0" /> {/* Cyan (Throat) */}
            <span className="text-[#7DAAB2]">Use time blocking to allocate specific hours for deep work, meetings, and personal time.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-[#22D3EE] flex-shrink-0" /> {/* Cyan (Throat) */}
            <span className="text-[#7DAAB2]">Schedule buffer time between activities to prevent back-to-back commitments.</span>
          </li>
          <li className="flex">
            <ArrowUpRight className="h-5 w-5 mr-2 text-[#22D3EE] flex-shrink-0" /> {/* Cyan (Throat) */}
            <span className="text-[#7DAAB2]">Prioritize tasks using the Eisenhower Matrix (urgent/important) to allocate time effectively.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}