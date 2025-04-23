import React from "react";
import {
  BarChart,
  UserIcon,
  Calendar,
} from "lucide-react";

interface Stats {
  energyPoints: {
    current: number;
    max: number;
  };
  attentionTokens: {
    current: number;
    max: number;
  };
  timeTokens: {
    current: number;
    max: number;
  };
  healthPoints: {
    current: number;
    max: number;
  };
  experience: {
    current: number;
    max: number;
    level: number;
  };
  streakDays: number;
  efficiencyScore: number;
}

interface CompactStatsWidgetProps {
  stats: Stats;
}

export function CompactStatsWidget({ stats }: CompactStatsWidgetProps) {
  return (
    <div className="compact-stats flex items-center gap-4">
      <div className="level-indicator flex items-center bg-primary/10 rounded-full px-3 py-1">
        <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center mr-2">
          <UserIcon className="h-3 w-3 text-background" />
        </div>
        <span className="text-xs font-semibold">Lv.{stats.experience.level}</span>
      </div>
      
      <div className="streak-days flex items-center bg-primary/10 rounded-full px-3 py-1">
        <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center mr-2">
          <Calendar className="h-3 w-3 text-background" />
        </div>
        <span className="text-xs font-semibold">{stats.streakDays} Days</span>
      </div>
      
      <div className="efficiency-score flex items-center bg-primary/10 rounded-full px-3 py-1">
        <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center mr-2">
          <BarChart className="h-3 w-3 text-background" />
        </div>
        <span className="text-xs font-semibold">{stats.efficiencyScore}% Eff.</span>
      </div>
    </div>
  );
}