import { Quest } from "../../lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuestItemProps {
  quest: Quest;
  onToggle: () => void;
  onDelete?: () => void;
}

export default function QuestItem({ quest, onToggle, onDelete }: QuestItemProps) {
  const { title, description, completed, energyCost, experienceReward, dueDate } = quest;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="glassmorphic rounded-xl p-4 mb-3 hover:shadow-[0_0_5px_rgba(0,224,255,0.3)] transition neon-border">
      <div className="flex items-start">
        <Checkbox 
          className="mt-1 rounded border border-primary/50 data-[state=checked]:bg-primary/20 data-[state=checked]:text-primary"
          checked={completed}
          onCheckedChange={onToggle}
        />
        <div className="ml-3 flex-grow">
          <div className="flex justify-between items-start">
            <div className="flex-grow">
              <h3 className={`font-medium mb-1 ${completed ? "text-muted-foreground line-through" : ""}`}>
                {title}
              </h3>
              {dueDate && (
                <div className={`flex items-center gap-1 text-xs mb-1 ${completed ? "opacity-50" : "text-muted-foreground"}`}>
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(dueDate)}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-red-400 text-xs font-mono ${completed ? "opacity-50" : ""}`}>
                -{energyCost} EP
              </span>
              <span className={`text-primary text-xs font-mono ${completed ? "opacity-50" : ""}`}>
                +{experienceReward} XP
              </span>
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          <p className={`text-muted-foreground text-sm ${completed ? "opacity-50" : ""}`}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
