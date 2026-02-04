import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Clock, ChevronUp, ChevronDown } from "lucide-react";

interface CustomTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function CustomTimePicker({ value, onChange, className }: CustomTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Store onChange in a ref so we can call it without it being a dependency
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Parse the value prop into display components (fully controlled - no internal state for time)
  const parseValue = (val: string): { hours: number; minutes: number; ampm: 'AM' | 'PM' } => {
    if (!val || !val.includes(':')) {
      return { hours: 9, minutes: 0, ampm: 'AM' };
    }
    const [h, m] = val.split(':').map(Number);
    const hours24 = isNaN(h) ? 9 : h;
    const mins = isNaN(m) ? 0 : m;
    
    // Convert 24-hour to 12-hour format
    let hours12 = hours24 % 12;
    if (hours12 === 0) hours12 = 12;
    const period: 'AM' | 'PM' = hours24 >= 12 ? 'PM' : 'AM';
    
    return { hours: hours12, minutes: mins, ampm: period };
  };

  // Derive display values directly from prop (fully controlled)
  const parsed = parseValue(value);
  const displayHours = parsed.hours;
  const displayMinutes = parsed.minutes;
  const displayAmpm = parsed.ampm;

  // Format the time value in 24-hour format for internal use
  const formatTime = (h: number, m: number) => {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };
  
  // Format the time value in 12-hour format for display
  const formatDisplayTime = (h: number, m: number, a: 'AM' | 'PM') => {
    return `${h}:${m.toString().padStart(2, "0")} ${a}`;
  };

  // Helper to convert 12-hour to 24-hour and call onChange
  const updateTime = (newHours: number, newMinutes: number, newAmpm: 'AM' | 'PM') => {
    let hours24 = newHours;
    if (newAmpm === 'PM' && newHours < 12) {
      hours24 = newHours + 12;
    } else if (newAmpm === 'AM' && newHours === 12) {
      hours24 = 0;
    }
    const formattedTime = formatTime(hours24, newMinutes);
    onChangeRef.current(formattedTime);
  };

  // Handle click outside to close the dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Increment/decrement hours in 12-hour format
  const incrementHours = () => {
    let newHour = displayHours + 1;
    let newAmpm = displayAmpm;
    
    if (newHour === 12) {
      newAmpm = displayAmpm === 'AM' ? 'PM' : 'AM';
    } else if (newHour > 12) {
      newHour = 1;
    }
    
    updateTime(newHour, displayMinutes, newAmpm);
  };

  const decrementHours = () => {
    let newHour = displayHours;
    let newAmpm = displayAmpm;
    
    if (newHour === 1) {
      newHour = 12;
    } else if (newHour === 12) {
      newAmpm = displayAmpm === 'AM' ? 'PM' : 'AM';
      newHour = 11;
    } else {
      newHour = newHour - 1;
    }
    
    updateTime(newHour, displayMinutes, newAmpm);
  };
  
  // Toggle between AM and PM
  const toggleAmPm = () => {
    const newAmpm = displayAmpm === 'AM' ? 'PM' : 'AM';
    updateTime(displayHours, displayMinutes, newAmpm);
  };

  // Increment/decrement minutes
  const incrementMinutes = () => {
    let newMinutes = displayMinutes + 1;
    let newHours = displayHours;
    let newAmpm = displayAmpm;
    
    if (newMinutes >= 60) {
      newMinutes = 0;
      // Increment hours
      newHours = newHours + 1;
      if (newHours === 12) {
        newAmpm = displayAmpm === 'AM' ? 'PM' : 'AM';
      } else if (newHours > 12) {
        newHours = 1;
      }
    }
    
    updateTime(newHours, newMinutes, newAmpm);
  };

  const decrementMinutes = () => {
    let newMinutes = displayMinutes - 1;
    let newHours = displayHours;
    let newAmpm = displayAmpm;
    
    if (newMinutes < 0) {
      newMinutes = 59;
      // Decrement hours
      if (newHours === 1) {
        newHours = 12;
      } else if (newHours === 12) {
        newAmpm = displayAmpm === 'AM' ? 'PM' : 'AM';
        newHours = 11;
      } else {
        newHours = newHours - 1;
      }
    }
    
    updateTime(newHours, newMinutes, newAmpm);
  };

  // Handle manual input changes with 12-hour format support
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const timeValue = e.target.value;
    
    // Match 12-hour format with AM/PM
    const twelveHourRegex = /^(1[0-2]|0?[1-9]):([0-5][0-9])(?:\s*)([AaPp][Mm])$/;
    if (twelveHourRegex.test(timeValue)) {
      const match = timeValue.match(twelveHourRegex);
      if (match) {
        let newHours = parseInt(match[1]);
        const newMinutes = parseInt(match[2]);
        const period = match[3].toUpperCase() as 'AM' | 'PM';
        
        updateTime(newHours, newMinutes, period);
      }
    }
  };

  // Handle blur to validate and format time properly
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.value = formatDisplayTime(displayHours, displayMinutes, displayAmpm);
  };

  return (
    <div
      className={cn(
        "relative inline-block w-full",
        className
      )}
      ref={dropdownRef}
    >
      <div className="relative">
        <Input
          type="text"
          value={formatDisplayTime(displayHours, displayMinutes, displayAmpm)}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onClick={() => setIsOpen(true)}
          className="pr-10 font-mono bg-background text-foreground border-primary/30 focus:border-primary/50 placeholder:text-muted-foreground"
          placeholder="HH:MM AM"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-0 top-0 h-full px-3 text-primary/70 hover:text-primary hover:bg-primary/10"
        >
          <Clock className="h-4 w-4" />
        </Button>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-primary/30 bg-background shadow-md glassmorphic">
          <div className="p-3">
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs font-medium">Hours</div>
              <div className="text-xs font-medium">Minutes</div>
              <div className="text-xs font-medium">AM/PM</div>
            </div>
            
            <div className="flex justify-between">
              <div className="flex flex-col items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={incrementHours}
                  className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <div className="font-mono text-lg py-1">
                  {displayHours.toString().padStart(2, "0")}
                </div>
                <Button
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
                  variant="ghost"
                  size="icon"
                  onClick={incrementMinutes}
                  className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <div className="font-mono text-lg py-1">{displayMinutes.toString().padStart(2, "0")}</div>
                <Button
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
                  variant="ghost"
                  size="icon"
                  onClick={toggleAmPm}
                  className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <div className="font-mono text-lg py-1">{displayAmpm}</div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleAmPm}
                  className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="flex justify-center mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="text-xs bg-primary/10 hover:bg-primary/20 text-primary border border-primary/50"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
