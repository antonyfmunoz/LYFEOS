import { useState } from "react";
import { useLifeOS } from "../lib/context";

export default function SystemsPage() {
  const { stats } = useLifeOS();
  
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
      
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="glassmorphic rounded-xl p-4 neon-border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <span className="material-icons text-primary mr-2">calendar_month</span>
              <h3 className="font-orbitron text-[#D6F4FF]">STREAK</h3>
            </div>
            <div className="text-right">
              <p className="text-[#D6F4FF] font-mono text-xl">14<span className="text-[#7DAAB2] text-xs"> DAYS</span></p>
            </div>
          </div>
          <div className="h-1 bg-primary/30 rounded-full mb-2">
            <div className="h-full bg-primary rounded-full" style={{ width: '70%' }}></div>
          </div>
          <p className="text-xs text-[#7DAAB2]">Consecutive days using LifeOS</p>
        </div>
        
        <div className="glassmorphic rounded-xl p-4 neon-border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <span className="material-icons text-[#36F1CD] mr-2">auto_graph</span>
              <h3 className="font-orbitron text-[#D6F4FF]">LEVEL</h3>
            </div>
            <div className="text-right">
              <p className="text-[#D6F4FF] font-mono text-xl">{stats.experience.level}</p>
            </div>
          </div>
          <div className="h-1 bg-[#36F1CD]/30 rounded-full mb-2">
            <div className="h-full bg-[#36F1CD] rounded-full" style={{ width: `${(stats.experience.current / stats.experience.max) * 100}%` }}></div>
          </div>
          <p className="text-xs text-[#7DAAB2]">Current progress and achievements</p>
        </div>
        
        <div className="glassmorphic rounded-xl p-4 neon-border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <span className="material-icons text-secondary mr-2">insights</span>
              <h3 className="font-orbitron text-[#D6F4FF]">EFFICIENCY</h3>
            </div>
            <div className="text-right">
              <p className="text-[#D6F4FF] font-mono text-xl">78<span className="text-[#7DAAB2] text-xs">%</span></p>
            </div>
          </div>
          <div className="h-1 bg-secondary/30 rounded-full mb-2">
            <div className="h-full bg-secondary rounded-full" style={{ width: '78%' }}></div>
          </div>
          <p className="text-xs text-[#7DAAB2]">Overall system optimization score</p>
        </div>
      </div>
      
      {/* Systems Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Calendar Module */}
        <div className="glassmorphic rounded-xl p-4 neon-border">
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
        
        {/* Stats Module */}
        <div className="glassmorphic rounded-xl p-4 neon-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-orbitron">Stats</h2>
            <button className="text-xs text-primary font-medium hover:text-opacity-80 transition">DETAILS</button>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="material-icons text-primary text-sm mr-2">schedule</span>
                <span className="text-sm">Time Tokens</span>
              </div>
              <div className="flex items-center">
                <span className="text-[#D6F4FF] font-mono">{stats.timeTokens.current}/{stats.timeTokens.max}</span>
                <span className="material-icons text-[#7DAAB2] text-sm ml-2">chevron_right</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="material-icons text-secondary text-sm mr-2">bolt</span>
                <span className="text-sm">Energy Points</span>
              </div>
              <div className="flex items-center">
                <span className="text-[#D6F4FF] font-mono">{stats.energyPoints.current}/{stats.energyPoints.max}</span>
                <span className="material-icons text-[#7DAAB2] text-sm ml-2">chevron_right</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="material-icons text-accent text-sm mr-2">favorite</span>
                <span className="text-sm">Health Points</span>
              </div>
              <div className="flex items-center">
                <span className="text-[#D6F4FF] font-mono">{stats.healthPoints.current}/{stats.healthPoints.max}</span>
                <span className="material-icons text-[#7DAAB2] text-sm ml-2">chevron_right</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="material-icons text-[#36F1CD] text-sm mr-2">auto_graph</span>
                <span className="text-sm">Experience</span>
              </div>
              <div className="flex items-center">
                <span className="text-[#D6F4FF] font-mono">{stats.experience.current}/{stats.experience.max}</span>
                <span className="material-icons text-[#7DAAB2] text-sm ml-2">chevron_right</span>
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
