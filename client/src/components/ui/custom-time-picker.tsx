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
  const [hours, setHours] = useState<number>(
    value ? parseInt(value.split(":")[0]) : 9
  );
  const [minutes, setMinutes] = useState<number>(
    value ? parseInt(value.split(":")[1]) : 0
  );
  const [ampm, setAmPm] = useState<'AM' | 'PM'>(
    value && parseInt(value.split(":")[0]) >= 12 ? 'PM' : 'AM'
  );
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Format the time value in 24-hour format for internal use
  const formatTime = (h: number, m: number) => {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };
  
  // Format the time value in 12-hour format for display
  const formatDisplayTime = (h: number, m: number, a: 'AM' | 'PM') => {
    let displayHour = h;
    if (a === 'PM' && h < 12) {
      displayHour = h + 12;
    } else if (a === 'AM' && h === 12) {
      displayHour = 0;
    }
    
    // Convert to 12-hour format
    let hour12 = displayHour % 12;
    if (hour12 === 0) hour12 = 12;
    
    return `${hour12}:${m.toString().padStart(2, "0")} ${a}`;
  };

  // Update the parent component when time changes, but avoid infinite loops
  useEffect(() => {
    // Convert 12-hour time to 24-hour format for internal storage
    let hours24 = hours;
    if (ampm === 'PM' && hours < 12) {
      hours24 = hours + 12;
    } else if (ampm === 'AM' && hours === 12) {
      hours24 = 0;
    }
    
    // Only update if the formatted value is different from current value
    const formattedTime = formatTime(hours24, minutes);
    if (formattedTime !== value) {
      onChange(formattedTime);
    }
  }, [hours, minutes, ampm, onChange, value]);

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
    setHours((prev) => {
      const newHour = prev + 1;
      if (newHour === 12) {
        setAmPm(ampm === 'AM' ? 'PM' : 'AM');
      } else if (newHour > 12) {
        return 1; // Reset to 1 after 12
      }
      return newHour;
    });
  };

  const decrementHours = () => {
    setHours((prev) => {
      if (prev === 1) {
        return 12;  // Wrap around to 12
      } else if (prev === 12) {
        setAmPm(ampm === 'AM' ? 'PM' : 'AM');
        return 11;
      }
      return prev - 1;
    });
  };
  
  // Toggle between AM and PM
  const toggleAmPm = () => {
    setAmPm(ampm === 'AM' ? 'PM' : 'AM');
  };

  // Increment/decrement minutes
  const incrementMinutes = () => {
    const newMinutes = minutes + 1;
    if (newMinutes >= 60) {
      setMinutes(0);
      incrementHours();
    } else {
      setMinutes(newMinutes);
    }
  };

  const decrementMinutes = () => {
    const newMinutes = minutes - 1;
    if (newMinutes < 0) {
      setMinutes(59);
      decrementHours();
    } else {
      setMinutes(newMinutes);
    }
  };

  // Removed normalizeMinutes function as it's no longer needed

  // Handle manual input changes with 12-hour format support
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const timeValue = e.target.value;
    
    // Match 12-hour format with AM/PM
    // e.g., "3:45 PM", "10:30 AM", etc.
    const twelveHourRegex = /^(1[0-2]|0?[1-9]):([0-5][0-9])(?:\s*)([AaPp][Mm])$/;
    if (twelveHourRegex.test(timeValue)) {
      const match = timeValue.match(twelveHourRegex);
      if (match) {
        let newHours = parseInt(match[1]);
        const newMinutes = parseInt(match[2]);
        const period = match[3].toUpperCase();
        
        // Adjust hours based on AM/PM
        if (period === 'PM' && newHours < 12) {
          newHours += 12;
        } else if (period === 'AM' && newHours === 12) {
          newHours = 0;
        }
        
        setHours(newHours);
        setMinutes(newMinutes);
        setAmPm(period === 'AM' ? 'AM' : 'PM');
        
        // Store in 24-hour format internally
        onChange(formatTime(newHours, newMinutes));
      }
    } else {
      // Just set the raw value and let validation happen on blur
      e.target.value = timeValue;
    }
  };

  // Handle blur to validate and format time properly
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Simply reset to the current valid time in 12-hour format
    e.target.value = formatDisplayTime(hours, minutes, ampm);
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
          value={formatDisplayTime(hours, minutes, ampm)}
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
          className="absolute right-0 top-0 h-full px-3 text-muted-foreground hover:text-foreground"
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
                  {/* Convert to 12-hour format for display */}
                  {hours === 0 ? '12' : (hours > 12 ? (hours - 12).toString() : hours.toString()).padStart(2, "0")}
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
                <div className="font-mono text-lg py-1">{minutes.toString().padStart(2, "0")}</div>
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
                <div className="font-mono text-lg py-1">{ampm}</div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleAmPm}
                  className="h-8 w-8"
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
                className="text-xs"
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