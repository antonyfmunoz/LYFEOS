import { useLYFEOS } from "../lib/context";
import QuestItem from "../components/dashboard/QuestItem";

export default function QuestsPage() {
  const { quests, toggleQuestCompletion } = useLYFEOS();
  
  const activeQuests = quests.filter(quest => !quest.completed);
  const completedQuests = quests.filter(quest => quest.completed);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-orbitron mb-1">Quests</h1>
        <p className="text-[#7DAAB2]">Complete quests to earn XP and reach your goals.</p>
      </div>
      
      {/* Active Quests */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-orbitron">Active Quests</h2>
          <div className="text-xs bg-primary bg-opacity-20 text-primary px-2 py-1 rounded-md">
            {activeQuests.length} ACTIVE
          </div>
        </div>
        
        {activeQuests.length > 0 ? (
          activeQuests.map((quest) => (
            <QuestItem 
              key={quest.id}
              quest={quest}
              onToggle={() => toggleQuestCompletion(quest.id)}
            />
          ))
        ) : (
          <div className="glassmorphic rounded-xl p-6 text-center neon-border mb-4">
            <span className="material-icons text-3xl text-[#7DAAB2] mb-2">task_alt</span>
            <p className="text-[#7DAAB2]">All quests completed. Well done, Commander!</p>
          </div>
        )}
      </div>
      
      {/* Completed Quests */}
      {completedQuests.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-orbitron">Completed</h2>
            <div className="text-xs bg-[#36F1CD] bg-opacity-20 text-[#36F1CD] px-2 py-1 rounded-md">
              {completedQuests.length} COMPLETED
            </div>
          </div>
          
          {completedQuests.map((quest) => (
            <QuestItem 
              key={quest.id}
              quest={quest}
              onToggle={() => toggleQuestCompletion(quest.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
