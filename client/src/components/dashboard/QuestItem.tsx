import { Quest } from "../../lib/types";

interface QuestItemProps {
  quest: Quest;
  onToggle: () => void;
}

export default function QuestItem({ quest, onToggle }: QuestItemProps) {
  const { title, description, completed, energyCost, experienceReward } = quest;

  return (
    <div 
      className="glassmorphic rounded-xl p-4 mb-3 hover:shadow-[0_0_5px_rgba(0,224,255,0.3)] transition neon-border cursor-pointer"
      onClick={onToggle}
    >
      <div className="flex items-start">
        <input 
          type="checkbox" 
          className="custom-checkbox mt-1" 
          checked={completed}
          onChange={() => {}} // Controlled by parent onClick
        />
        <div className="ml-3 flex-grow">
          <div className="flex justify-between">
            <h3 className={`font-medium mb-1 ${completed ? "text-[#7DAAB2] line-through" : ""}`}>
              {title}
            </h3>
            <div className="flex items-center">
              <span className={`text-secondary text-xs font-mono mr-2 ${completed ? "opacity-50" : ""}`}>
                -{energyCost} EP
              </span>
              <span className={`text-[#36F1CD] text-xs font-mono ${completed ? "opacity-50" : ""}`}>
                +{experienceReward} XP
              </span>
            </div>
          </div>
          <p className={`text-[#7DAAB2] text-sm ${completed ? "opacity-50" : ""}`}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
