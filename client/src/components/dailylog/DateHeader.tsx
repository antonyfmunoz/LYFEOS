import React, { useState, useEffect } from "react";
import { CalendarDays, Clock } from "lucide-react";

export default function DateHeader() {
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Format current date as "Day, Month DD, YYYY"
  const formattedDate = currentTime.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  
  // Format current time as "HH:MM AM/PM"
  const formattedTime = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  
  return (
    <div className="mb-6">
      <div className="glassmorphic rounded-xl p-4 neon-border">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
          <div className="flex items-center">
            <CalendarDays className="h-5 w-5 text-primary mr-2" />
            <h1 className="text-2xl font-orbitron text-[#D6F4FF]">{formattedDate}</h1>
          </div>
          <div className="flex items-center mt-2 md:mt-0">
            <Clock className="h-4 w-4 text-[#7DAAB2] mr-2" />
            <span className="text-[#7DAAB2] font-mono">{formattedTime}</span>
          </div>
        </div>
      </div>
    </div>
  );
}