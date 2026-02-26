import { Button } from "@/components/ui/button";
type CalendarEvent = { id: string; title: string; description: string; startTime: string; duration: string; category: string; date: string; };
import { Info } from "lucide-react";

interface InfoButtonProps {
  event: CalendarEvent;
  onClick: (event: CalendarEvent) => void;
}

export default function InfoButton({ event, onClick }: InfoButtonProps) {
  return (
    <Button
      variant="outline"
      size="icon"
      className="h-6 w-6 p-0 text-primary bg-primary/10 hover:bg-primary/20 transition rounded-full border border-primary"
      onClick={(e) => {
        e.stopPropagation();
        onClick(event);
      }}
    >
      <Info className="h-3.5 w-3.5" />
    </Button>
  );
}