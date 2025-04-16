import { Info } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { CalendarEvent } from '@/lib/types';

interface InfoIconButtonProps {
  event: CalendarEvent;
  onClick?: (event: CalendarEvent, e: React.MouseEvent) => void;
}

export default function InfoIconButton({ event, onClick }: InfoIconButtonProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick(event, e);
    }
  };

  return (
    <Link href={`/mission/${event.id}`}>
      <Button
        variant="outline"
        size="icon"
        className="h-6 w-6 p-0 bg-primary/10 text-primary hover:bg-primary/20 transition rounded-full border border-primary"
        onClick={handleClick}
      >
        <Info className="h-3.5 w-3.5" />
      </Button>
    </Link>
  );
}