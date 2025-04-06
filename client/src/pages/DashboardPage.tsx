import { useLifeOS } from "../lib/context";
import StatWidget from "../components/dashboard/StatWidget";
import DailyQuests from "../components/dashboard/DailyQuests";
import ExperienceBar from "../components/dashboard/ExperienceBar";
import AICompanionPreview from "../components/dashboard/AICompanionPreview";
import CalendarPreview from "../components/dashboard/CalendarPreview";

export default function DashboardPage() {
  const { stats, username } = useLifeOS();
  
  return (
    <>
      {/* Dashboard header */}
      <div className="mb-6">
        <h1 className="text-2xl font-orbitron mb-1">Welcome back, Commander</h1>
        <p className="text-[#7DAAB2]">Your life simulation is running at optimal efficiency.</p>
      </div>

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
  );
}
