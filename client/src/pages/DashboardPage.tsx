import { useState } from "react";
import { useLifeOS } from "../lib/context";
import StatWidget from "../components/dashboard/StatWidget";
import DailyQuests from "../components/dashboard/DailyQuests";
import ExperienceBar from "../components/dashboard/ExperienceBar";
import AICompanionPreview from "../components/dashboard/AICompanionPreview";
import CalendarPreview from "../components/dashboard/CalendarPreview";
import DailyLog from "../components/dailylog/DailyLog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeftRight } from "lucide-react";

export default function DashboardPage() {
  const { stats, username } = useLifeOS();
  const [activeView, setActiveView] = useState<"dashboard" | "dailyLog">("dashboard");
  
  return (
    <>
      {/* Toggle between views */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-orbitron">
          {activeView === "dashboard" ? (
            "Welcome back, Commander"
          ) : (
            "Daily Log"
          )}
        </h1>
        
        <button
          onClick={() => setActiveView(activeView === "dashboard" ? "dailyLog" : "dashboard")}
          className="bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-md flex items-center text-sm transition-colors"
        >
          <ArrowLeftRight className="h-4 w-4 mr-2" />
          {activeView === "dashboard" ? "Switch to Daily Log" : "Return to Dashboard"}
        </button>
      </div>

      {activeView === "dashboard" ? (
        <>
          <p className="text-[#7DAAB2] mb-6">Your life simulation is running at optimal efficiency.</p>
          
          {/* Stats widgets */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Time Tokens (TT) */}
            <StatWidget
              type="time"
              icon="schedule"
              title="TIME TOKENS"
              current={stats.timeTokens.current}
              max={stats.timeTokens.max}
              description="Unallocated time remaining today"
            />

            {/* Energy Points (EP) */}
            <StatWidget
              type="energy"
              icon="bolt"
              title="ENERGY POINTS"
              current={stats.energyPoints.current}
              max={stats.energyPoints.max}
              description="Current cognitive and physical capacity"
            />

            {/* Health Points (HP) */}
            <StatWidget
              type="health"
              icon="favorite"
              title="HEALTH POINTS"
              current={stats.healthPoints.current}
              max={stats.healthPoints.max}
              description="Overall physical and mental wellness"
            />
          </div>

          {/* Experience level */}
          <ExperienceBar
            current={stats.experience.current}
            max={stats.experience.max}
            level={stats.experience.level}
          />

          {/* Daily Quests */}
          <DailyQuests />

          {/* AI Companion Preview + Calendar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AICompanionPreview />
            <CalendarPreview />
          </div>
        </>
      ) : (
        <DailyLog />
      )}
    </>
  );
}
