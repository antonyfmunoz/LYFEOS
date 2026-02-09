import { Link } from "wouter";
import { StatType } from "../../lib/types";

interface StatWidgetProps {
  type: StatType;
  icon: string;
  title: string;
  current: number;
  max: number;
  description: string;
}

export default function StatWidget({ 
  type, icon, title, current, max, description 
}: StatWidgetProps) {
  // Determine progress bar class based on type
  const progressClass = `progress-${type === 'time' ? 'tt' : type === 'energy' ? 'ep' : 'hp'}`;
  
  // Calculate percentage for progress bar
  const percentage = (current / max) * 100;
  
  return (
    <Link href={`/${type}`} className="glassmorphic rounded-xl p-4 neon-border hover:shadow-[0_0_10px_var(--primary-glow-medium)] transition-shadow duration-300 block">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <span className={`material-icons ${
            type === 'time' ? 'text-primary' : 
            type === 'energy' ? 'text-secondary' : 
            'text-accent'
          } mr-2`}>{icon}</span>
          <h3 className="font-orbitron text-[#D6F4FF]">{title}</h3>
        </div>
        <div className="text-right">
          {type === 'time' ? (
            <p className="text-[#D6F4FF] font-mono text-xl">
              {current}<span className="text-[#7DAAB2] text-sm">/{max}</span>
            </p>
          ) : (
            <p className="text-[#D6F4FF] font-mono text-xl">
              {Math.round((current / max) * 100)}<span className="text-[#7DAAB2] text-sm">%</span>
            </p>
          )}
        </div>
      </div>
      <div className={`progress-bar ${progressClass}`}>
        <div className="progress-fill" style={{ width: `${percentage}%` }}></div>
      </div>
      <p className="text-xs text-[#7DAAB2] mt-2">{description}</p>
    </Link>
  );
}
