interface ExperienceBarProps {
  current: number;
  max: number;
  level: number;
}

export default function ExperienceBar({ current, max, level }: ExperienceBarProps) {
  // Calculate percentage for progress bar
  const percentage = (current / max) * 100;
  
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <span className="material-icons text-[#36F1CD] mr-2">auto_graph</span>
          <h3 className="font-orbitron text-[#D6F4FF]">LEVEL PROGRESS</h3>
        </div>
        <div className="text-right">
          <span className="bg-[#36F1CD] bg-opacity-20 text-[#36F1CD] px-2 py-1 rounded-md text-xs font-orbitron">
            LEVEL {level}
          </span>
        </div>
      </div>
      <div className="progress-bar progress-xp mb-2">
        <div className="progress-fill" style={{ width: `${percentage}%` }}></div>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-[#7DAAB2]">{current.toLocaleString()} XP</span>
        <span className="text-[#7DAAB2]">{max.toLocaleString()} XP</span>
      </div>
    </div>
  );
}
