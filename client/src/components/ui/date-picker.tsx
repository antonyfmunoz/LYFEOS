import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  className?: string;
}

export function DatePicker({ value, onChange, placeholder = "Select date", className }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      return new Date(value + "T00:00:00");
    }
    return new Date();
  });

  const selectedDate = value ? new Date(value + "T00:00:00") : null;

  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const handleDateSelect = (day: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const formatted = newDate.toISOString().split("T")[0];
    onChange(formatted);
    setOpen(false);
  };

  const formatDisplayDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      viewDate.getFullYear() === today.getFullYear() &&
      viewDate.getMonth() === today.getMonth() &&
      day === today.getDate()
    );
  };

  const isSelected = (day: number) => {
    if (!selectedDate) return false;
    return (
      viewDate.getFullYear() === selectedDate.getFullYear() &&
      viewDate.getMonth() === selectedDate.getMonth() &&
      day === selectedDate.getDate()
    );
  };

  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(<div key={`empty-${i}`} className="w-9 h-9" />);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(
      <button
        key={day}
        type="button"
        onClick={(e) => handleDateSelect(day, e)}
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center text-sm transition-all",
          "hover:bg-primary/20 hover:text-primary",
          isSelected(day) && "bg-primary text-primary-foreground",
          isToday(day) && !isSelected(day) && "border border-primary text-primary",
          !isSelected(day) && !isToday(day) && "text-foreground"
        )}
      >
        {day}
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal bg-background/50 border-primary/30 hover:bg-background/70",
            !value && "text-muted-foreground",
            className
          )}
        >
          <Calendar className="mr-2 h-4 w-4" />
          {value ? formatDisplayDate(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-auto p-4 glassmorphic border-primary/30" 
        align="start"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">
              {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
            </h4>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handlePrevMonth}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleNextMonth}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {dayNames.map((day) => (
              <div key={day} className="w-9 h-8 flex items-center justify-center text-xs text-muted-foreground font-medium">
                {day}
              </div>
            ))}
            {days}
          </div>

          <div className="flex justify-between pt-2 border-t border-primary/20">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
