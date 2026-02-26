import { useLYFEOS } from "../../lib/context";
import { Link } from "wouter";
import { useMemo } from "react";

export default function CalendarPreview() {
  const { quests } = useLYFEOS();

  const todayMissions = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return quests
      .filter(q => !q.completed && q.startDate === today && q.startTime)
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [quests]);

  return (
    <div className="glassmorphic rounded-xl p-4 neon-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-orbitron">Today's Schedule</h2>
        <Link href="/missions" className="text-xs text-primary font-medium hover:text-opacity-80 transition">
          VIEW CALENDAR
        </Link>
      </div>
      
      <div className="space-y-3">
        {todayMissions.length === 0 && (
          <p className="text-muted-foreground text-xs text-center py-4">No scheduled missions today</p>
        )}
        {todayMissions.map((mission) => (
          <div key={mission.id} className="flex items-start">
            <div className="text-right mr-3 text-xs pt-1 w-16 flex-shrink-0">
              <p className="text-primary font-mono">{mission.startTime}</p>
            </div>
            <div className="flex-grow p-3 border-l-2 border-primary rounded-r-md bg-surface bg-opacity-30">
              <p className="font-medium text-sm">{mission.title}</p>
              {mission.description && (
                <p className="text-muted-foreground text-xs">{mission.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
