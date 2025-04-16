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
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Format the time value
  const formatTime = (h: number, m: number) => {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };

  // Update the parent component when time changes, but avoid infinite loops
  useEffect(() => {
    // Only update if the formatted value is different from current value
    const formattedTime = formatTime(hours, minutes);
    if (formattedTime !== value) {
      onChange(formattedTime);
    }
  }, [hours, minutes, onChange, value]);

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

  // Increment/decrement hours
  const incrementHours = () => {
    setHours((prev) => (prev === 23 ? 0 : prev + 1));
  };

  const decrementHours = () => {
    setHours((prev) => (prev === 0 ? 23 : prev - 1));
  };

  // Increment/decrement minutes
  const incrementMinutes = () => {
    const newMinutes = minutes + 15;
    if (newMinutes >= 60) {
      setMinutes(0);
      incrementHours();
    } else {
      setMinutes(newMinutes);
    }
  };

  const decrementMinutes = () => {
    const newMinutes = minutes - 15;
    if (newMinutes < 0) {
      setMinutes(45);
      decrementHours();
    } else {
      setMinutes(newMinutes);
    }
  };

  // Normalize minutes to quarters (0, 15, 30, 45)
  const normalizeMinutes = (mins: number) => {
    const remainder = mins % 15;
    if (remainder === 0) return mins;
    return mins - remainder;
  };

  // Handle manual input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const timeValue = e.target.value;
    
    if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeValue)) {
      const [newHours, newMinutes] = timeValue.split(":").map(Number);
      setHours(newHours);
      setMinutes(normalizeMinutes(newMinutes));
      onChange(formatTime(newHours, normalizeMinutes(newMinutes)));
    } else {
      // Just set the raw value and let validation happen on blur
      e.target.value = timeValue;
    }
  };

  // Handle blur to validate and normalize time
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const timeValue = e.target.value;
    
    if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeValue)) {
      const [newHours, newMinutes] = timeValue.split(":").map(Number);
      setHours(newHours);
      setMinutes(normalizeMinutes(newMinutes));
    }
    
    // Reset to valid value
    e.target.value = formatTime(hours, minutes);
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
          value={formatTime(hours, minutes)}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onClick={() => setIsOpen(true)}
          className="pr-10 font-mono"
          placeholder="HH:MM"
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
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-md">
          <div className="p-3">
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs font-medium">Hours</div>
              <div className="text-xs font-medium">Minutes</div>
            </div>
            
            <div className="flex justify-between">
              <div className="flex flex-col items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={incrementHours}
                  className="h-8 w-8"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <div className="font-mono text-lg py-1">{hours.toString().padStart(2, "0")}</div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={decrementHours}
                  className="h-8 w-8"
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
                  className="h-8 w-8"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <div className="font-mono text-lg py-1">{minutes.toString().padStart(2, "0")}</div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={decrementMinutes}
                  className="h-8 w-8"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="flex justify-between mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="text-xs"
              >
                Close
              </Button>
              
              <div className="space-x-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setHours(9);
                    setMinutes(0);
                  }}
                  className="text-xs"
                >
                  9:00
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setHours(12);
                    setMinutes(0);
                  }}
                  className="text-xs"
                >
                  12:00
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setHours(15);
                    setMinutes(0);
                  }}
                  className="text-xs"
                >
                  15:00
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}