import { Quest } from "../../lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Calendar, Clock, Bell, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuestItemProps {
  quest: Quest;
  onToggle: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
}

export default function QuestItem({ quest, onToggle, onDelete, onEdit }: QuestItemProps) {
  const { title, description, completed, energyCost, experienceReward, startDate, startTime, endDate, endTime, notificationEnabled } = quest;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const hasSchedule = startDate || startTime || endDate || endTime;

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
                {notificationEnabled && (
                  <Bell className="inline-block ml-2 h-3 w-3 text-primary opacity-70" />
                )}
              </h3>
              
              {hasSchedule && (
                <div className={`flex flex-wrap items-center gap-2 text-xs mb-1 ${completed ? "opacity-50" : "text-muted-foreground"}`}>
                  {startDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(startDate)}
                      {startTime && (
                        <>
                          <Clock className="h-3 w-3 ml-1" />
                          {formatTime(startTime)}
                        </>
                      )}
                    </span>
                  )}
                  {(endDate || endTime) && (
                    <>
                      <span className="text-primary">→</span>
                      <span className="flex items-center gap-1">
                        {endDate && (
                          <>
                            <Calendar className="h-3 w-3" />
                            {formatDate(endDate)}
                          </>
                        )}
                        {endTime && (
                          <>
                            <Clock className="h-3 w-3 ml-1" />
                            {formatTime(endTime)}
                          </>
                        )}
                      </span>
                    </>
                  )}
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
              {onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </Button>
              )}
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
