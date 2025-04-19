import { useState, useEffect } from "react";
import { useLYFEOS } from "../lib/context";
import { CollapsibleWidget } from "@/components/ui/collapsible-widget";
import { Calendar, Settings, Bell, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/hooks/use-toast";

export default function SystemsPage() {
  const { stats, updateUserStats } = useLYFEOS();
  const { user } = useAuth();
  const { toast } = useToast();
  
  // System settings state
  const [settings, setSettings] = useState({
    notifications: false,
    darkTheme: true
  });

  // Initialize settings from stats when component mounts
  useEffect(() => {
    if (stats) {
      // Access system settings from stats
      setSettings({
        notifications: stats.notificationsEnabled !== undefined ? stats.notificationsEnabled : false,
        darkTheme: stats.darkThemeEnabled !== undefined ? stats.darkThemeEnabled : true
      });
    }
  }, [stats]);
  
  // Toggle setting by name and update in the database
  const toggleSetting = async (setting: keyof typeof settings) => {
    if (!user) return;
    
    const newValue = !settings[setting];
    
    // Update local state immediately for responsive UI
    setSettings(prev => ({
      ...prev,
      [setting]: newValue
    }));
    
    try {
      // Map UI setting name to database field name
      const fieldMapping: Record<string, string> = {
        notifications: "notificationsEnabled",
        darkTheme: "darkThemeEnabled"
      };
      
      // Prepare data for API call
      const updateData = {
        [fieldMapping[setting]]: newValue
      };
      
      // Make API call to update setting
      const response = await fetch(`/api/users/${user.id}/stats`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updateData),
        credentials: "include"
      });
      
      if (!response.ok) {
        throw new Error("Failed to update setting");
      }
      
      const updatedStats = await response.json();
      
      // Update global state
      if (updateUserStats) {
        updateUserStats(updatedStats.stats);
      }
      
      // Show success toast
      toast({
        title: "Setting Updated",
        description: `${setting.charAt(0).toUpperCase() + setting.slice(1)} has been ${newValue ? 'enabled' : 'disabled'}.`,
        duration: 2000,
      });
      
    } catch (error) {
      // If error, revert local state
      setSettings(prev => ({
        ...prev,
        [setting]: !newValue
      }));
      
      // Show error toast
      toast({
        title: "Error",
        description: "Failed to update setting. Please try again.",
        variant: "destructive",
      });
      
      console.error("Error updating setting:", error);
    }
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-orbitron mb-1">Systems</h1>
        <p className="text-[#7DAAB2]">Manage your personal operating system settings and view analytics.</p>
      </div>
      
      {/* Calendar Module */}
      <section className="mb-6">
        <CollapsibleWidget 
          title="Calendar" 
          icon={<Calendar className="h-5 w-5 text-primary" />}
          defaultOpen={true}
        >
          <div className="flex justify-start items-center mb-3">
            <Link href="/calendar" className="px-4 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium rounded-md transition-colors duration-200 flex items-center">
              <Calendar className="h-3.5 w-3.5 mr-1.5" />
              Go to Calendar
            </Link>
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
        </CollapsibleWidget>
      </section>
      
      {/* System Settings */}
      <section className="mb-6">
        <CollapsibleWidget
          title="System Settings" 
          icon={<Settings className="h-5 w-5 text-primary" />}
          defaultOpen={true}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-card/50 rounded-lg hover:bg-card/70 transition-colors">
              <div className="flex items-center">
                <span className="material-icons text-[#36F1CD] text-sm mr-2">notifications</span>
                <span className="text-sm">Notifications</span>
              </div>
              <button 
                onClick={() => toggleSetting('notifications')} 
                className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors duration-200 ${
                  settings.notifications ? 'bg-[#36F1CD]/30' : 'bg-card'
                }`}
                aria-pressed={settings.notifications}
                role="switch"
              >
                <div 
                  className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-300 ${
                    settings.notifications ? 'left-5 bg-[#36F1CD] shadow-glow-cyan' : 'left-0.5 bg-muted-foreground'
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
                className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors duration-200 ${
                  settings.darkTheme ? 'bg-[#36F1CD]/30' : 'bg-card'
                }`}
                aria-pressed={settings.darkTheme}
                role="switch"
              >
                <div 
                  className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-300 ${
                    settings.darkTheme ? 'left-5 bg-[#36F1CD] shadow-glow-cyan' : 'left-0.5 bg-muted-foreground'
                  }`}
                ></div>
              </button>
            </div>
          </div>
        </CollapsibleWidget>
      </section>
    </>
  );
}
