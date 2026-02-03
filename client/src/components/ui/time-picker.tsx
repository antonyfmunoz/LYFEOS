import { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimePickerProps {
  value: string;
  onChange: (time: string) => void;
  placeholder?: string;
  className?: string;
}

export function TimePicker({ value, onChange, placeholder = "Select time", className }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  
  const parseTime = (timeStr: string): { hour: number; minute: number; period: "AM" | "PM" } => {
    if (!timeStr) return { hour: 8, minute: 0, period: "AM" };
    const [hours, minutes] = timeStr.split(":").map(Number);
    const period: "AM" | "PM" = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    return { hour: hour12, minute: minutes, period };
  };

  const { hour: initialHour, minute: initialMinute, period: initialPeriod } = parseTime(value);
  const [selectedHour, setSelectedHour] = useState(initialHour);
  const [selectedMinute, setSelectedMinute] = useState(initialMinute);
  const [selectedPeriod, setSelectedPeriod] = useState<"AM" | "PM">(initialPeriod);

  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      const { hour, minute, period } = parseTime(value);
      setSelectedHour(hour);
      setSelectedMinute(minute);
      setSelectedPeriod(period);
    }
  }, [value]);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        if (hourRef.current) {
          const hourElement = hourRef.current.querySelector(`[data-hour="${selectedHour}"]`);
          if (hourElement) {
            hourElement.scrollIntoView({ block: "center", behavior: "auto" });
          }
        }
        if (minuteRef.current) {
          const minuteElement = minuteRef.current.querySelector(`[data-minute="${selectedMinute}"]`);
          if (minuteElement) {
            minuteElement.scrollIntoView({ block: "center", behavior: "auto" });
          }
        }
      }, 100);
    }
  }, [open, selectedHour, selectedMinute]);

  const formatTime24 = (hour: number, minute: number, period: "AM" | "PM") => {
    let hour24 = hour;
    if (period === "PM" && hour !== 12) hour24 = hour + 12;
    if (period === "AM" && hour === 12) hour24 = 0;
    return `${hour24.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  };

  const formatDisplayTime = (timeStr: string) => {
    if (!timeStr) return "";
    const [hours, minutes] = timeStr.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes.toString().padStart(2, "0")} ${period}`;
  };

  const handleDone = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const time24 = formatTime24(selectedHour, selectedMinute, selectedPeriod);
    onChange(time24);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange("");
    setOpen(false);
  };

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

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
          <Clock className="mr-2 h-4 w-4" />
          {value ? formatDisplayTime(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-auto p-4 glassmorphic border-primary/30" 
        align="start"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="space-y-4">
          <div className="flex gap-2 h-48">
            <div 
              ref={hourRef}
              className="flex flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-primary/30 w-14 snap-y"
            >
              {hours.map((hour) => (
                <button
                  key={hour}
                  type="button"
                  data-hour={hour}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedHour(hour);
                  }}
                  className={cn(
                    "py-2 px-3 text-center rounded-lg transition-all snap-center",
                    selectedHour === hour
                      ? "bg-primary/20 text-primary font-medium"
                      : "text-muted-foreground hover:bg-primary/10"
                  )}
                >
                  {hour}
                </button>
              ))}
            </div>

            <div className="text-2xl font-light text-muted-foreground flex items-center">:</div>

            <div 
              ref={minuteRef}
              className="flex flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-primary/30 w-14 snap-y"
            >
              {minutes.map((minute) => (
                <button
                  key={minute}
                  type="button"
                  data-minute={minute}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedMinute(minute);
                  }}
                  className={cn(
                    "py-2 px-3 text-center rounded-lg transition-all snap-center",
                    selectedMinute === minute
                      ? "bg-primary/20 text-primary font-medium"
                      : "text-muted-foreground hover:bg-primary/10"
                  )}
                >
                  {minute.toString().padStart(2, "0")}
                </button>
              ))}
            </div>

            <div className="flex flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-primary/30 w-14 snap-y ml-2">
              {(["AM", "PM"] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedPeriod(period);
                  }}
                  className={cn(
                    "py-2 px-3 text-center rounded-lg transition-all snap-center font-medium",
                    selectedPeriod === period
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:bg-primary/10"
                  )}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between pt-2 border-t border-primary/20">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={handleClear}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={handleDone}
            >
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
