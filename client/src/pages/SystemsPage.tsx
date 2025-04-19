import { useState, useEffect } from "react";
import { useLYFEOS } from "../lib/context";
import { CollapsibleWidget } from "@/components/ui/collapsible-widget";
import { Calendar, Settings, Bell, AlertCircle, Paintbrush } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/themeContext";

// Chakra colors for stats (used for theme colors)
const STAT_COLORS = [
  "#00e0ff", // cyan - Time Tokens (Throat Chakra)
  "#f56565", // red - Health Points (Root Chakra)
  "#ed8936", // orange - Energy Points (Sacral Chakra)
  "#ecc94b", // yellow - Efficiency (Solar Plexus Chakra)
  "#48bb78", // green - Streak (Heart Chakra)
  "#4299e1", // blue - General/Primary
  "#667eea", // indigo - Attention Tokens (Third Eye Chakra)
  "#9f7aea", // purple - Experience (Crown Chakra)
];

export default function SystemsPage() {
  const { stats, updateUserStats } = useLYFEOS();
  const { user } = useAuth();
  const { toast } = useToast();
  const { toggleDarkMode } = useTheme();
  
  // Handle color scheme selection
  const handlePrimaryColorChange = async (colorValue: string) => {
    if (!user) return;
    
    try {
      const response = await fetch(`/api/users/${user.id}/stats`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ primaryColor: colorValue }),
        credentials: "include"
      });
      
      if (!response.ok) {
        throw new Error("Failed to update primary color");
      }
      
      const data = await response.json();
      
      // Update global state
      if (updateUserStats) {
        updateUserStats(data.stats);
      }
      
      // Show success toast
      toast({
        title: "Theme Updated",
        description: "The primary color theme has been updated.",
        duration: 2000,
      });
      
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update theme color. Please try again.",
        variant: "destructive",
      });
      
      console.error("Error updating primary color:", error);
    }
  };
  
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
      // Handle dark theme toggle specially - use the theme context
      if (setting === 'darkTheme') {
        // Theme context now handles both UI change and DB update
        toggleDarkMode();
        
        // Show the toast message
        toast({
          title: "Setting Updated",
          description: `Dark Theme has been ${newValue ? 'enabled' : 'disabled'}.`,
          duration: 2000,
        });
        
        return; // Exit early since theme context handles the update
      }
      
      // For other settings (not dark theme), proceed with normal API call
      // Map UI setting name to database field name
      const fieldMapping: Record<string, string> = {
        notifications: "notificationsEnabled"
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
            <Link to="/calendar" className="px-4 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium rounded-md transition-colors duration-200 flex items-center">
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
      
      {/* Theme Customization */}
      <section className="mb-6">
        <CollapsibleWidget
          title="UI Theme Colors" 
          icon={<Paintbrush className="h-5 w-5 text-primary" />}
          defaultOpen={true}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select a primary color for the user interface. This will affect buttons, highlights, and various UI elements.
            </p>
            
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
              {STAT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`relative w-10 h-10 rounded-md transition-all ${
                    stats?.primaryColor === color 
                      ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110' 
                      : 'ring-1 ring-primary/20 hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => handlePrimaryColorChange(color)}
                  aria-label={`Select theme color ${color}`}
                >
                  {stats?.primaryColor === color && (
                    <span className="flex items-center justify-center text-background text-xs">
                      <span className="material-icons" style={{ fontSize: '16px' }}>check</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
            
            <div className="flex items-center mt-3 gap-2 p-3 bg-card/50 rounded-lg">
              <span className="block w-4 h-4 rounded-full animate-pulse" style={{ backgroundColor: stats?.primaryColor || "#00e0ff" }}></span>
              <div>
                <p className="text-sm font-medium">Current Theme Color</p>
                <p className="text-xs text-muted-foreground">
                  {stats?.primaryColor || "#00e0ff"}
                </p>
              </div>
            </div>
            
            <div className="text-xs text-muted-foreground bg-card/30 p-3 rounded-lg">
              <p className="flex items-center gap-2 mb-3">
                <span className="material-icons text-xs">info</span>
                Theme colors are synced across all devices.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 rounded-md bg-[#00e0ff]/10 border border-[#00e0ff]/30 text-[#00e0ff]">Cyan</span>
                <span className="px-2 py-1 rounded-md bg-[#f56565]/10 border border-[#f56565]/30 text-[#f56565]">Red</span>
                <span className="px-2 py-1 rounded-md bg-[#ed8936]/10 border border-[#ed8936]/30 text-[#ed8936]">Orange</span>
                <span className="px-2 py-1 rounded-md bg-[#ecc94b]/10 border border-[#ecc94b]/30 text-[#ecc94b]">Yellow</span>
                <span className="px-2 py-1 rounded-md bg-[#48bb78]/10 border border-[#48bb78]/30 text-[#48bb78]">Green</span>
                <span className="px-2 py-1 rounded-md bg-[#4299e1]/10 border border-[#4299e1]/30 text-[#4299e1]">Blue</span>
                <span className="px-2 py-1 rounded-md bg-[#667eea]/10 border border-[#667eea]/30 text-[#667eea]">Indigo</span>
                <span className="px-2 py-1 rounded-md bg-[#9f7aea]/10 border border-[#9f7aea]/30 text-[#9f7aea]">Purple</span>
              </div>
            </div>
          </div>
        </CollapsibleWidget>
      </section>
    </>
  );
}
