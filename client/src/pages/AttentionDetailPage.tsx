import React from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowUpRight, BrainCircuit, Focus, BookOpen, Palette, Clock } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";

export default function AttentionDetailPage() {
  // Set page title
  usePageTitle("Attention Tokens - LYFEOS");
  
  // Get stats from context
  const { stats } = useLYFEOS();
  
  // Attention allocation
  const attentionAllocation = [
    { category: "Deep Work", percentage: 40, icon: Focus },
    { category: "Learning", percentage: 25, icon: BookOpen },
    { category: "Creative", percentage: 20, icon: Palette },
    { category: "Unallocated", percentage: 15, icon: Clock },
  ];
  
  // Focus techniques
  const focusTechniques = [
    "Time blocking: Schedule specific time blocks for focused work without interruptions.",
    "Pomodoro technique: Work in 25-minute focused sprints with 5-minute breaks.",
    "Digital minimalism: Remove distractions by closing unnecessary apps and notifications.",
    "Mindful transitions: Take a moment to reset between different types of tasks.",
  ];
  
  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-6">
        <Link href="/dashboard" className="flex items-center text-[#7DAAB2] hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4 mr-2" />
          <span>Back to Dashboard</span>
        </Link>
      </div>
      
      <div className="mb-8 flex items-center">
        <BrainCircuit className="h-8 w-8 mr-3 text-[#6366F1]" /> {/* Indigo (Third Eye) */}
        <h1 className="text-3xl font-orbitron">Attention Tokens</h1>
      </div>
      
      {/* Current Attention Status */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-[#6366F1]/30"> {/* Indigo (Third Eye) */}
        <h2 className="font-orbitron text-xl mb-4 text-[#6366F1]">Attention Capacity</h2> {/* Indigo (Third Eye) */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[#7DAAB2] mb-1">Focus and cognitive allocation</p>
            <div className="flex items-baseline">
              <span className="text-white text-5xl font-mono">{stats.attentionTokensCurrent}</span>
              <span className="text-[#7DAAB2] ml-3 text-lg">/ {stats.attentionTokensMax}</span>
            </div>
          </div>
          <div className="bg-[#001E26] border border-[#6366F1]/20 rounded-md p-4">
            <p className="text-[#7DAAB2] text-sm mb-1">Focus state</p>
            <div className="flex items-center">
              <Focus className="h-5 w-5 mr-2 text-[#6366F1]" /> {/* Indigo (Third Eye) */}
              <span className="text-white">{Math.round((stats.attentionTokensCurrent / stats.attentionTokensMax) * 100)}%</span>
            </div>
            <p className="text-[#6366F1] text-xs mt-1">Mental clarity</p> {/* Indigo (Third Eye) */}
          </div>
        </div>
        <div className="mt-4 w-full bg-[#060F13] h-2 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-[#6366F1]/50 to-[#6366F1] h-full rounded-full"
            style={{ width: `${(stats.attentionTokensCurrent / stats.attentionTokensMax) * 100}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-[#7DAAB2]">Current: {stats.attentionTokensCurrent}</span>
          <span className="text-xs text-[#7DAAB2]">Maximum: {stats.attentionTokensMax}</span>
        </div>
      </div>
      
      {/* Attention Allocation */}
      <div className="glassmorphic rounded-xl p-6 mb-6 border border-[#6366F1]/30"> {/* Indigo (Third Eye) */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-orbitron text-xl text-[#6366F1]">Attention Allocation</h2> {/* Indigo (Third Eye) */}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            {attentionAllocation.map((item) => (
              <div key={item.category} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <item.icon className="h-5 w-5 mr-2 text-[#6366F1]" /> {/* Indigo (Third Eye) */}
                    <h3 className="text-white">{item.category}</h3>
                  </div>
                  <div>
                    <span className="px-3 py-1 rounded-md text-sm bg-[#6366F1]/20 text-[#6366F1]">
                      {item.percentage}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-[#060F13] h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-[#6366F1]" /* Indigo (Third Eye) */
                    style={{ width: `${item.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="bg-[#001E26] border border-[#6366F1]/20 rounded-xl p-4">
            <h3 className="text-[#6366F1] font-orbitron mb-3">Focus Insights</h3> {/* Indigo (Third Eye) */}
            <div className="space-y-4">
              <p className="text-[#7DAAB2] text-sm">
                Your attention is primarily allocated to deep work activities, which is ideal for productivity.
              </p>
              <p className="text-[#7DAAB2] text-sm">
                Consider increasing your learning allocation to 30% to maximize knowledge acquisition during your peak focus hours.
              </p>
              <p className="text-[#7DAAB2] text-sm">
                Your unallocated attention reserve is at 15%, which provides flexibility for unexpected tasks.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Focus Techniques */}
      <div className="glassmorphic rounded-xl p-6 border border-[#6366F1]/30"> {/* Indigo (Third Eye) */}
        <h2 className="font-orbitron text-xl mb-4 text-[#6366F1]">Focus Enhancement Techniques</h2> {/* Indigo (Third Eye) */}
        <ul className="space-y-3">
          {focusTechniques.map((technique, index) => (
            <li key={index} className="flex">
              <ArrowUpRight className="h-5 w-5 mr-2 text-[#6366F1] flex-shrink-0" /> {/* Indigo (Third Eye) */}
              <span className="text-[#7DAAB2]">{technique}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}