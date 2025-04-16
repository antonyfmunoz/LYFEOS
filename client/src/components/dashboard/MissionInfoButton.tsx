import { Button } from "@/components/ui/button";
import { CalendarEvent } from "@/lib/types";
import { Info } from "lucide-react";
import { MissionInfoDialog } from "@/components/ui/mission-info-dialog";

interface MissionInfoButtonProps {
  mission: CalendarEvent;
}

export default function MissionInfoButton({ mission }: MissionInfoButtonProps) {
  // Create the info button as the trigger
  const infoTrigger = (
    <Button
      variant="outline"
      size="icon"
      className="h-6 w-6 p-0 bg-primary/10 text-primary hover:bg-primary/20 transition rounded-full border border-primary"
    >
      <Info className="h-3.5 w-3.5" />
    </Button>
  );
  
  return (
    <MissionInfoDialog 
      trigger={infoTrigger}
      mission={mission}
    />
  );
}