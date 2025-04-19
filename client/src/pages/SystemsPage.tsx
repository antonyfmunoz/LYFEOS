import { useState } from "react";
import { useLYFEOS } from "../lib/context";

export default function SystemsPage() {
  const { stats } = useLYFEOS();
  
  // System settings state
  const [settings, setSettings] = useState({
    notifications: false,
    darkTheme: true,
    autoSync: true,
    aiAssistant: true
  });
  
  // Toggle setting by name
  const toggleSetting = (setting: keyof typeof settings) => {
    setSettings(prev => ({
      ...prev,
      [setting]: !prev[setting]
    }));
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-orbitron mb-1">Systems</h1>
        <p className="text-[#7DAAB2]">Manage your personal operating system settings and view analytics.</p>
      </div>
      
      {/* Calendar Module */}
      <div className="glassmorphic rounded-xl p-4 neon-border mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-orbitron">Calendar</h2>
          <button className="text-xs text-primary font-medium hover:text-opacity-80 transition">VIEW ALL</button>
        </div>
        
        <div className="space-y-3">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <div key={i} className="text-xs text-center text-[#7DAAB2] font-medium">
                {day}
              </div>
            ))}
            
            {Array.from({ length: 31 }, (_, i) => {
              const isToday = i + 1 === new Date().getDate();
              const hasEvent = [3, 8, 12, 15, 23, 27].includes(i + 1);
              
              return (
                <div 
                  key={i} 
                  className={`text-xs rounded-full aspect-square flex items-center justify-center 
                    ${isToday ? 'bg-primary text-background' : hasEvent ? 'text-primary' : 'text-[#7DAAB2]'}`}
                >
                  {i + 1}
                </div>
              );
            })}
          </div>
          
          <div className="border-t border-primary/20 pt-3">
            <p className="text-xs text-[#7DAAB2] mb-2">UPCOMING</p>
            <div className="space-y-2">
              <div className="flex items-center">
                <div className="w-1 h-6 bg-primary rounded-full mr-2"></div>
                <p className="text-sm">Strategy Meeting <span className="text-xs text-[#7DAAB2]">• Today, 9:00 AM</span></p>
              </div>
              <div className="flex items-center">
                <div className="w-1 h-6 bg-secondary rounded-full mr-2"></div>
                <p className="text-sm">Project Review <span className="text-xs text-[#7DAAB2]">• Today, 11:30 AM</span></p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* System Settings */}
      <div className="glassmorphic rounded-xl p-4 neon-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-orbitron">System Settings</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-3 bg-card/50 rounded-lg hover:bg-card/70 transition-colors">
            <div className="flex items-center">
              <span className="material-icons text-[#36F1CD] text-sm mr-2">notifications</span>
              <span className="text-sm">Notifications</span>
            </div>
            <button 
              onClick={() => toggleSetting('notifications')} 
              className="w-10 h-5 rounded-full bg-[#36F1CD]/20 relative cursor-pointer"
              aria-pressed={settings.notifications}
              role="switch"
            >
              <div 
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#36F1CD] transition-all duration-200 ${
                  settings.notifications ? 'left-5' : 'left-0.5'
                }`}
              ></div>
            </button>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-card/50 rounded-lg hover:bg-card/70 transition-colors">
            <div className="flex items-center">
              <span className="material-icons text-[#36F1CD] text-sm mr-2">dark_mode</span>
              <span className="text-sm">Dark Theme</span>
            </div>
            <button 
              onClick={() => toggleSetting('darkTheme')} 
              className="w-10 h-5 rounded-full bg-[#36F1CD]/20 relative cursor-pointer"
              aria-pressed={settings.darkTheme}
              role="switch"
            >
              <div 
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#36F1CD] transition-all duration-200 ${
                  settings.darkTheme ? 'left-5' : 'left-0.5'
                }`}
              ></div>
            </button>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-card/50 rounded-lg hover:bg-card/70 transition-colors">
            <div className="flex items-center">
              <span className="material-icons text-[#36F1CD] text-sm mr-2">sync</span>
              <span className="text-sm">Auto Sync</span>
            </div>
            <button 
              onClick={() => toggleSetting('autoSync')} 
              className="w-10 h-5 rounded-full bg-[#36F1CD]/20 relative cursor-pointer"
              aria-pressed={settings.autoSync}
              role="switch"
            >
              <div 
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#36F1CD] transition-all duration-200 ${
                  settings.autoSync ? 'left-5' : 'left-0.5'
                }`}
              ></div>
            </button>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-card/50 rounded-lg hover:bg-card/70 transition-colors">
            <div className="flex items-center">
              <span className="material-icons text-[#36F1CD] text-sm mr-2">smart_toy</span>
              <span className="text-sm">AI Assistant</span>
            </div>
            <button 
              onClick={() => toggleSetting('aiAssistant')} 
              className="w-10 h-5 rounded-full bg-[#36F1CD]/20 relative cursor-pointer"
              aria-pressed={settings.aiAssistant}
              role="switch"
            >
              <div 
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-[#36F1CD] transition-all duration-200 ${
                  settings.aiAssistant ? 'left-5' : 'left-0.5'
                }`}
              ></div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
