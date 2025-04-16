import React, { useState, useEffect, useRef } from "react";
import { Clock } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { cn } from "@/lib/utils";

interface CustomTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  icon?: React.ReactNode;
}

export function CustomTimePicker({ 
  value, 
  onChange, 
  className,
  icon = <Clock className="h-4 w-4 text-primary/70" />
}: CustomTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hours, setHours] = useState<number>(12);
  const [minutes, setMinutes] = useState<number>(0);
  const [period, setPeriod] = useState<"AM" | "PM">("AM");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Parse the value (HH:MM format) into hours, minutes and period
  useEffect(() => {
    if (value) {
      const [hoursStr, minutesStr] = value.split(":");
      let parsedHours = parseInt(hoursStr, 10);
      const parsedMinutes = parseInt(minutesStr, 10);
      
      if (!isNaN(parsedHours) && !isNaN(parsedMinutes)) {
        // Convert 24h to 12h format
        let newPeriod: "AM" | "PM" = parsedHours >= 12 ? "PM" : "AM";
        if (parsedHours > 12) {
          parsedHours -= 12;
        } else if (parsedHours === 0) {
          parsedHours = 12;
        }
        
        setHours(parsedHours);
        setMinutes(parsedMinutes);
        setPeriod(newPeriod);
      }
    }
  }, [value]);

  // Convert internal state back to 24-hour format and update parent
  const updateTime = () => {
    // Make sure hours is a valid number
    let h = hours || 12;
    if (h > 12) h = 12;
    if (h < 1) h = 1;
    
    // Make sure minutes is a valid number
    let m = minutes || 0;
    if (m > 59) m = 59;
    if (m < 0) m = 0;
    
    // Convert from 12h to 24h format
    if (period === "PM" && h < 12) {
      h += 12;
    } else if (period === "AM" && h === 12) {
      h = 0;
    }
    
    const newValue = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    onChange(newValue);
    setIsOpen(false);
  };

  // Close the dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle hour increment/decrement
  const adjustHours = (amount: number) => {
    let newHours = hours + amount;
    if (newHours > 12) newHours = 1;
    if (newHours < 1) newHours = 12;
    setHours(newHours);
  };

  // Handle minute increment/decrement
  const adjustMinutes = (amount: number) => {
    let newMinutes = minutes + amount;
    if (newMinutes >= 60) newMinutes = 0;
    if (newMinutes < 0) newMinutes = 59;
    setMinutes(newMinutes);
  };

  // Handle direct number input for hours
  const handleHoursInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10);
    if (!isNaN(newValue) && newValue >= 1 && newValue <= 12) {
      setHours(newValue);
    } else if (e.target.value === "") {
      setHours(12); // Default to 12 if field is empty
    }
  };

  // Handle direct number input for minutes
  const handleMinutesInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10);
    if (!isNaN(newValue) && newValue >= 0 && newValue <= 59) {
      setMinutes(newValue);
    } else if (e.target.value === "") {
      setMinutes(0); // Default to 0 if field is empty
    }
  };

  // Toggle AM/PM
  const togglePeriod = () => {
    setPeriod(prevPeriod => prevPeriod === "AM" ? "PM" : "AM");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Space or Enter opens/closes the dropdown
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setIsOpen(!isOpen);
    }
    
    // Escape closes the dropdown
    if (e.key === "Escape" && isOpen) {
      setIsOpen(false);
    }
    
    // Tab - if dropdown is open, prevent default behavior and focus the correct element
    if (e.key === "Tab" && isOpen) {
      e.preventDefault();
      // Logic for tabbing through dropdown could be added here
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Main time input display */}
      <div 
        className={cn(
          "flex items-center relative cursor-pointer bg-[#00141A] border border-primary/30 text-[#D6F4FF] rounded-md py-2 px-3",
          className
        )}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span className="font-mono flex-grow">
          {hours.toString().padStart(2, '0')}:{minutes.toString().padStart(2, '0')} {period}
        </span>
        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
          {icon}
        </div>
      </div>

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/20 z-[9999] flex items-center justify-center" onClick={() => setIsOpen(false)}>
          <div 
            className="bg-[#001824] border border-primary/30 rounded-md shadow-lg shadow-primary/20 w-64 glassmorphic neon-border animate-in fade-in-50 duration-100 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center font-orbitron mb-3 text-[#D6F4FF] text-sm">Select Time</div>
            
            <div className="flex justify-center items-center gap-2">
              {/* Hours column */}
              <div className="flex flex-col items-center">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-primary hover:bg-primary/20 rounded-full p-1 h-8 w-8 hover:shadow-[0_0_5px_rgba(0,224,255,0.5)] transition-all"
                  onClick={() => adjustHours(1)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                </Button>
                
                <Input
                  className="w-14 text-center bg-[#00141A] border-primary/30 hover:border-primary/50 focus:border-primary/70 font-mono my-1 p-1 h-9 focus:shadow-[0_0_5px_rgba(0,224,255,0.3)] transition-all font-bold"
                  value={hours.toString()}
                  onChange={handleHoursInput}
                />
                
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-primary hover:bg-primary/20 rounded-full p-1 h-8 w-8 hover:shadow-[0_0_5px_rgba(0,224,255,0.5)] transition-all"
                  onClick={() => adjustHours(-1)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </Button>
                
                <span className="text-xs text-[#7DAAB2] mt-1">Hours</span>
              </div>
              
              <span className="text-primary text-xl">:</span>
              
              {/* Minutes column */}
              <div className="flex flex-col items-center">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-primary hover:bg-primary/20 rounded-full p-1 h-8 w-8 hover:shadow-[0_0_5px_rgba(0,224,255,0.5)] transition-all"
                  onClick={() => adjustMinutes(1)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                </Button>
                
                <Input
                  className="w-14 text-center bg-[#00141A] border-primary/30 hover:border-primary/50 focus:border-primary/70 font-mono my-1 p-1 h-9 focus:shadow-[0_0_5px_rgba(0,224,255,0.3)] transition-all font-bold"
                  value={minutes.toString().padStart(2, '0')}
                  onChange={handleMinutesInput}
                />
                
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-primary hover:bg-primary/20 rounded-full p-1 h-8 w-8 hover:shadow-[0_0_5px_rgba(0,224,255,0.5)] transition-all"
                  onClick={() => adjustMinutes(-1)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </Button>
                
                <span className="text-xs text-[#7DAAB2] mt-1">Minutes</span>
              </div>
              
              {/* AM/PM toggle */}
              <div className="flex flex-col items-center ml-2">
                <button
                  className={`w-14 rounded-t-md py-1 transition-all font-mono ${
                    period === "AM" 
                      ? "bg-primary/20 text-primary border-t border-l border-r border-primary/50 shadow-[0_0_5px_rgba(0,224,255,0.3)]" 
                      : "bg-[#001824] text-[#7DAAB2] hover:bg-[#001C26] border-t border-l border-r border-primary/10 hover:border-primary/30"
                  }`}
                  onClick={() => setPeriod("AM")}
                  type="button"
                >
                  AM
                </button>
                <button
                  className={`w-14 rounded-b-md py-1 transition-all font-mono ${
                    period === "PM" 
                      ? "bg-primary/20 text-primary border-b border-l border-r border-primary/50 shadow-[0_0_5px_rgba(0,224,255,0.3)]" 
                      : "bg-[#001824] text-[#7DAAB2] hover:bg-[#001C26] border-b border-l border-r border-primary/10 hover:border-primary/30"
                  }`}
                  onClick={() => setPeriod("PM")}
                  type="button"
                >
                  PM
                </button>
                
                <span className="text-xs text-[#7DAAB2] mt-3">Period</span>
              </div>
            </div>
            
            <div className="flex justify-end mt-4">
              <Button
                size="sm"
                variant="ghost"
                className="text-[#7DAAB2] hover:bg-[#001C26] hover:text-[#D6F4FF] mr-2 transition-all font-mono"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-primary/90 text-primary-foreground hover:bg-primary/100 hover:shadow-[0_0_5px_rgba(0,224,255,0.5)] transition-all font-mono"
                onClick={updateTime}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}