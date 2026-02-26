import { useLYFEOS } from "../../lib/context";
import { Link } from "wouter";

export default function CalendarPreview() {
  const { events } = useLYFEOS();

  return (
    <div className="glassmorphic rounded-xl p-4 neon-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-orbitron">Today's Schedule</h2>
        <Link href="/calendar" className="text-xs text-primary font-medium hover:text-opacity-80 transition">
          VIEW CALENDAR
        </Link>
      </div>
      
      <div className="space-y-3">
        {events.map((event) => (
          <div key={event.id} className="flex items-start">
            <div className="text-right mr-3 text-xs pt-1 w-16 flex-shrink-0">
              <p className="text-primary font-mono">{event.startTime}</p>
            </div>
            <div className={`flex-grow p-3 border-l-2 
              ${event.category === 'work' ? 'border-primary' : 
               event.category === 'personal' ? 'border-secondary' : 
               'border-accent'} 
              rounded-r-md bg-surface bg-opacity-30`}
            >
              <p className="font-medium text-sm">{event.title}</p>
              <p className="text-primary/60 text-xs">{event.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
