import { useLifeOS } from "../../lib/context";
import QuestItem from "./QuestItem";

export default function DailyQuests() {
  const { quests, toggleQuestCompletion } = useLifeOS();

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-orbitron">Daily Quests</h2>
        <button className="text-xs text-primary font-medium hover:text-opacity-80 transition">VIEW ALL</button>
      </div>
      
      {quests.map((quest) => (
        <QuestItem 
          key={quest.id}
          quest={quest}
          onToggle={() => toggleQuestCompletion(quest.id)}
        />
      ))}
    </div>
  );
}
