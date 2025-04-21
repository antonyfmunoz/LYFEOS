import { useState, useEffect } from "react";
import { useLYFEOS } from "../lib/context";
import { CollapsibleWidget } from "@/components/ui/collapsible-widget";
import { Calendar, Settings, Bell } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/themeContext";

export default function SystemsPage() {
  const { stats, updateUserStats } = useLYFEOS();
  const { user } = useAuth();
  const { toast } = useToast();
  const { toggleDarkMode } = useTheme();
  

  
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
                <div key={i} className="text-xs text-center text-muted-foreground font-medium">
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
                      ${isToday ? 'bg-primary text-background' : hasEvent ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    {i + 1}
                  </div>
                );
              })}
            </div>
            
            <div className="border-t border-primary/20 pt-3">
              <p className="text-xs text-muted-foreground mb-2">UPCOMING</p>
              <div className="space-y-2">
                <div className="flex items-center">
                  <div className="w-1 h-6 bg-primary rounded-full mr-2"></div>
                  <p className="text-sm">Strategy Meeting <span className="text-xs text-muted-foreground">• Today, 9:00 AM</span></p>
                </div>
                <div className="flex items-center">
                  <div className="w-1 h-6 bg-secondary rounded-full mr-2"></div>
                  <p className="text-sm">Project Review <span className="text-xs text-muted-foreground">• Today, 11:30 AM</span></p>
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
          <div className="grid grid-cols-1 gap-4">
            <p className="text-sm text-muted-foreground">
              System settings like UI theme and notifications can be managed in your profile.
            </p>
            <div className="flex justify-start items-center">
              <Link to="/profile" className="px-4 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium rounded-md transition-colors duration-200 flex items-center">
                <Settings className="h-3.5 w-3.5 mr-1.5" />
                Go to Profile Settings
              </Link>
            </div>
          </div>
        </CollapsibleWidget>
      </section>
      

    </>
  );
}
