import React, { useState, useEffect } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { useLYFEOS } from "@/lib/context";
import { AIAgentFAB } from "@/components/ui/ai-agent-fab";
import { CalendarDays, Clock } from "lucide-react";
import { CustomizableDashboard } from "@/components/dashboard/CustomizableDashboard";
import { useToast } from "@/hooks/use-toast";

export default function DashboardPage() {
  // Set the page title
  usePageTitle("Dashboard");
  
  const { stats, events } = useLYFEOS();
  const { toast } = useToast();
  
  // Time-related state
  const [currentDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">("12h");
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  
  // Format current date 
  const formattedDate = currentDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
  
  // Format time
  const formattedTime = currentTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: timeFormat === "12h",
    timeZone: timezone
  });
  
  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="dashboard-container">
      <AIAgentFAB />
      
      {/* Daily Dashboard Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center">
          <h1 className="text-3xl font-orbitron text-primary mr-2">Daily Dashboard</h1>
          <div className="w-48 h-0.5 bg-gradient-to-r from-primary/80 to-transparent"></div>
        </div>
      </div>
      
      {/* Date and Time Display */}
      <section className="mb-6">
        <div className="glassmorphic rounded-xl p-3 neon-border">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div className="flex items-center">
              <CalendarDays className="h-5 w-5 text-primary mr-2" />
              <h1 className="text-xl sm:text-2xl font-orbitron text-[#D6F4FF]">{formattedDate}</h1>
            </div>
            <div className="flex items-center gap-2 mt-2 sm:mt-0">
              <Clock className="h-4 w-4 text-[#7DAAB2] mr-2" />
              <span className="text-[#7DAAB2] font-mono">{formattedTime}</span>
              
              <select 
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="ml-3 bg-[#00141A] border border-primary/30 rounded text-xs text-[#7DAAB2] p-1"
              >
                {[
                  { label: 'EST', value: 'America/New_York' },
                  { label: 'CST', value: 'America/Chicago' },
                  { label: 'MST', value: 'America/Denver' },
                  { label: 'PST', value: 'America/Los_Angeles' },
                  { label: 'GMT', value: 'Europe/London' },
                  { label: 'CET', value: 'Europe/Paris' },
                  { label: 'JST', value: 'Asia/Tokyo' },
                  { label: 'AEST', value: 'Australia/Sydney' },
                  { label: 'NZST', value: 'Pacific/Auckland' }
                ].map(tz => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
              
              <button 
                onClick={() => setTimeFormat(prev => prev === "12h" ? "24h" : "12h")}
                className="bg-primary/10 hover:bg-primary/20 text-primary rounded px-2 py-1 text-xs"
              >
                {timeFormat === "12h" ? "24h" : "12h"}
              </button>
            </div>
          </div>
        </div>
      </section>
      
      {/* Main Customizable Dashboard */}
      <CustomizableDashboard className="mt-4" />
    </div>
  );
}