import { Button } from "@/components/ui/button";
import { CalendarEvent } from "@/lib/types";
import { Info } from "lucide-react";
import { Link } from "wouter";

interface MissionInfoButtonProps {
  mission: CalendarEvent;
}

export default function MissionInfoButton({ mission }: MissionInfoButtonProps) {
  return (
    <Link href={`/mission/${mission.id}`}>
      <Button
        variant="outline"
        size="icon"
        className="h-6 w-6 p-0 bg-primary/10 text-primary hover:bg-primary/20 transition rounded-full border border-primary"
      >
        <Info className="h-3.5 w-3.5" />
      </Button>
    </Link>
  );
}