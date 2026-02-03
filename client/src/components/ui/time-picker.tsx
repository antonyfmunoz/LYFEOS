import { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Clock, ChevronUp, ChevronDown } from "lucide-react";
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

  useEffect(() => {
    if (value) {
      const { hour, minute, period } = parseTime(value);
      setSelectedHour(hour);
      setSelectedMinute(minute);
      setSelectedPeriod(period);
    }
  }, [value]);

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

  const incrementHours = () => {
    setSelectedHour((prev) => {
      const newHour = prev + 1;
      if (newHour === 12) {
        setSelectedPeriod(selectedPeriod === 'AM' ? 'PM' : 'AM');
      } else if (newHour > 12) {
        return 1;
      }
      return newHour;
    });
  };

  const decrementHours = () => {
    setSelectedHour((prev) => {
      if (prev === 1) {
        return 12;
      } else if (prev === 12) {
        setSelectedPeriod(selectedPeriod === 'AM' ? 'PM' : 'AM');
        return 11;
      }
      return prev - 1;
    });
  };

  const incrementMinutes = () => {
    setSelectedMinute((prev) => {
      const newMinutes = prev + 5;
      if (newMinutes >= 60) {
        incrementHours();
        return 0;
      }
      return newMinutes;
    });
  };

  const decrementMinutes = () => {
    setSelectedMinute((prev) => {
      const newMinutes = prev - 5;
      if (newMinutes < 0) {
        decrementHours();
        return 55;
      }
      return newMinutes;
    });
  };

  const togglePeriod = () => {
    setSelectedPeriod(selectedPeriod === 'AM' ? 'PM' : 'AM');
  };

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
        className="w-auto p-3 bg-background border border-primary/30 rounded-md shadow-md glassmorphic" 
        align="start"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="space-y-2">
          <div className="flex justify-between items-center mb-2">
            <div className="text-xs font-medium">Hours</div>
            <div className="text-xs font-medium">Minutes</div>
            <div className="text-xs font-medium">AM/PM</div>
          </div>
          
          <div className="flex justify-between">
            <div className="flex flex-col items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={incrementHours}
                className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <div className="font-mono text-lg py-1">
                {selectedHour.toString().padStart(2, "0")}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={decrementHours}
                className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="text-lg py-2">:</div>
            
            <div className="flex flex-col items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={incrementMinutes}
                className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <div className="font-mono text-lg py-1">
                {selectedMinute.toString().padStart(2, "0")}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={decrementMinutes}
                className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex flex-col items-center ml-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={togglePeriod}
                className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <div className="font-mono text-lg py-1">
                {selectedPeriod}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={togglePeriod}
                className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex justify-between pt-2 border-t border-primary/20">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={handleClear}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
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
