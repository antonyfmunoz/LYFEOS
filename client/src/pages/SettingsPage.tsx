import React, { useState, useEffect } from 'react';
import { 
  User, 
  Bot, 
  Moon, 
  Sun, 
  Monitor, 
  HelpCircle, 
  Settings, 
  RefreshCw,
  RotateCcw
} from 'lucide-react';
import { useLocation } from 'wouter';
import { useLYFEOS } from '@/lib/context';
import { useOnboarding, APP_GUIDES } from '@/lib/onboardingContext';
import { useTheme } from '@/lib/themeContext';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NovaGuideTooltip } from '@/components/ui/guide-tooltip';

export default function SettingsPage() {
  const { username, setUsername, aiCompanionName, setAICompanionName } = useLYFEOS();
  const { 
    restartOnboarding, 
    enabledGuides, 
    setGuideEnabled, 
    dismissTooltip, 
    completeTooltip 
  } = useOnboarding();
  const { theme, toggleTheme, reloadWithTheme } = useTheme();
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(theme === 'dark' ? 'dark' : 'light');
  
  // Simple visual detection for primary color (synchronous)
  const detectColorSync = (): string => {
    try {
      if (typeof window === 'undefined') return 'cyan';
      
      const primaryBtn = document.querySelector('.bg-primary');
      if (primaryBtn) {
        const btnColor = window.getComputedStyle(primaryBtn).backgroundColor;
        
        // Map RGB color back to our theme colors
        if (btnColor.includes('0, 224, 255') || btnColor.includes('0,224,255')) {
          return "cyan";
        } else if (btnColor.includes('197, 139, 255') || btnColor.includes('197,139,255')) {
          return "purple";
        } else if (btnColor.includes('59, 130, 246') || btnColor.includes('59,130,246')) {
          return "blue";
        } else if (btnColor.includes('34, 197, 94') || btnColor.includes('34,197,94')) {
          return "green";
        } else if (btnColor.includes('255, 120, 10') || btnColor.includes('255,120,10')) {
          return "orange";
        }
      }
    } catch (e) {
      console.error("Error in synchronous color detection:", e);
    }
    
    return 'cyan';
  };
  
  // Improved function to detect current primary color from theme.json (asynchronous)
  const getCurrentPrimaryColor = async (): Promise<string> => {
    // Default to cyan if detection fails
    let defaultColor = "cyan";
    
    try {
      // Mapping HSL values to our color names
      const hslToColorMap: Record<string, string> = {
        "hsl(188 100% 50%)": "cyan",
        "hsl(265 89% 78%)": "purple",
        "hsl(217 91% 60%)": "blue", 
        "hsl(142 71% 45%)": "green",
        "hsl(24 94% 50%)": "orange"
      };
      
      // Attempt to fetch theme.json directly to get the exact primary color
      const response = await fetch('/theme.json');
      if (response.ok) {
        const themeData = await response.json();
        const primaryHsl = themeData.primary;
        
        // Return the matching color name if found in our map
        if (primaryHsl && hslToColorMap[primaryHsl]) {
          return hslToColorMap[primaryHsl];
        }
        
        // If we couldn't determine from HSL, fallback to visual detection
        return detectColorSync();
      }
    } catch (e) {
      console.error("Error detecting primary color from theme.json:", e);
    }
    
    return defaultColor;
  };
  
  // Set initial state to 'cyan', we'll update it in the useEffect
  const [primaryColor, setPrimaryColor] = useState<string>('cyan');
  const [savedName, setSavedName] = useState<string>(username);
  const [savedAiName, setSavedAiName] = useState<string>(aiCompanionName);
  const [activeTab, setActiveTab] = useState<string>('account');
  const [, navigate] = useLocation();
  
  // Handle account changes
  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSavedName(e.target.value);
  };
  
  const saveUsername = () => {
    if (savedName.trim()) {
      setUsername(savedName);
      toast({
        title: "Username Updated",
        description: "Your username has been updated successfully.",
        className: "bg-background border border-primary text-foreground",
      });
    }
  };
  
  // Handle AI companion name change
  const handleAiNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSavedAiName(e.target.value);
  };
  
  const saveAiName = () => {
    if (savedAiName.trim()) {
      setAICompanionName(savedAiName);
      toast({
        title: "AI Companion Name Updated",
        description: `Your AI companion is now named ${savedAiName}.`,
        className: "bg-background border border-primary text-foreground",
      });
    }
  };
  
  // Handle appearance changes
  const changeTheme = async (value: 'light' | 'dark') => {
    setThemeMode(value);
    
    try {
      // Update theme in theme.json with the appropriate appearance value
      const response = await fetch('/api/settings/theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          appearance: value
        })
      });
      
      if (response.ok) {
        // Apply the theme change using the themeContext
        if (value === 'light' && theme === 'dark') {
          toggleTheme(); // Switch from dark to light
        } else if (value === 'dark' && theme === 'light') {
          toggleTheme(); // Switch from light to dark
        }
        
        const themeName = value.charAt(0).toUpperCase() + value.slice(1);
        
        toast({
          title: "Theme Updated",
          description: `Theme changed to ${themeName}. Click OK to apply all styling.`,
          className: "bg-background border border-primary text-foreground",
          action: (
            <Button 
              onClick={() => {
                // Use our reloadWithTheme function from ThemeContext
                reloadWithTheme();
              }}
              className="bg-primary text-primary-foreground"
            >
              OK
            </Button>
          ),
        });
      } else {
        throw new Error('Failed to update theme');
      }
    } catch (error) {
      console.error('Error updating theme:', error);
      toast({
        title: "Error",
        description: "Failed to update the theme. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const changePrimaryColor = async (value: string) => {
    // Map color name to HSL value
    const colorValues: Record<string, string> = {
      "cyan": "hsl(188 100% 50%)",
      "purple": "hsl(265 89% 78%)",
      "blue": "hsl(217 91% 60%)",
      "green": "hsl(142 71% 45%)",
      "orange": "hsl(24 94% 50%)"
    };
    
    try {
      // First update UI immediately to provide instant feedback
      setPrimaryColor(value);
      setPrimaryColor(value as any); // Cast to any as we know these values match our PrimaryColor type
      
      // Then update theme.json on the server
      const response = await fetch('/api/settings/theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ primary: colorValues[value] })
      });
      
      if (response.ok) {
        // Show success message with less prominent toast that doesn't require action
        toast({
          title: "Color Theme Updated",
          description: `Primary color changed to ${value}`,
          className: "bg-background border border-primary text-foreground",
        });
      } else {
        throw new Error('Failed to update theme');
      }
    } catch (error) {
      console.error('Error updating theme:', error);
      toast({
        title: "Error",
        description: "Failed to update the theme color. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  // Handle onboarding reset
  const handleRestartOnboarding = () => {
    restartOnboarding();
    toast({
      title: "Onboarding Reset",
      description: "Onboarding tutorial has been reset. Refresh to start the tutorial again.",
      className: "bg-background border border-primary text-foreground",
    });
  };
  
  // Toggle a guide
  const toggleGuide = (id: string, enabled: boolean) => {
    setGuideEnabled(id, enabled);
  };
  
  // Update primaryColor after component mounts
  useEffect(() => {
    const detectAndSetColor = async () => {
      if (typeof window !== 'undefined') {
        try {
          const detectedColor = await getCurrentPrimaryColor();
          if (detectedColor !== primaryColor) {
            setPrimaryColor(detectedColor);
          }
        } catch (e) {
          console.error('Error detecting primary color:', e);
        }
      }
    };
    
    detectAndSetColor();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Removed welcome tooltip

  return (
    <div>
      <h1 className="text-2xl font-orbitron mb-6">Settings</h1>
      
      <Tabs 
        defaultValue="account" 
        value={activeTab} 
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList className="grid grid-cols-4 lg:w-[400px] mb-4">
          <TabsTrigger value="account" className="flex items-center gap-1">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Account</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center gap-1">
            <Moon className="h-4 w-4" />
            <span className="hidden sm:inline">Appearance</span>
          </TabsTrigger>
          <TabsTrigger value="assistant" className="flex items-center gap-1">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Assistant</span>
          </TabsTrigger>
          <TabsTrigger value="help" className="flex items-center gap-1">
            <HelpCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Help</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="account" className="space-y-6">
          <div className="glassmorphic p-6 rounded-lg border border-primary/20">
            <h2 className="text-xl font-orbitron mb-4">Account Settings</h2>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <div className="flex gap-2">
                  <Input
                    id="username"
                    value={savedName}
                    onChange={handleUsernameChange}
                    className="flex-1"
                  />
                  <Button onClick={saveUsername}>Save</Button>
                </div>
              </div>
              
              <div className="space-y-2 pt-4">
                <Label>Avatar</Label>
                <div className="flex items-center space-x-4">
                  <div className="h-16 w-16 rounded-full bg-blue-900 flex items-center justify-center text-2xl font-bold">
                    {username.substring(0, 1).toUpperCase()}
                  </div>
                  <Button variant="outline">Change Avatar</Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="appearance" className="space-y-6">
          <div className="glassmorphic p-6 rounded-lg border border-primary/20">
            <h2 className="text-xl font-orbitron mb-4">Theme Settings</h2>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Theme Mode</Label>
                <div className="flex gap-4">
                  <Button 
                    variant={themeMode === 'light' ? "default" : "outline"} 
                    onClick={() => changeTheme('light')}
                    className="flex items-center gap-2 text-foreground"
                  >
                    <Sun className="h-4 w-4" />
                    Light
                  </Button>
                  
                  <Button 
                    variant={themeMode === 'dark' ? "default" : "outline"} 
                    onClick={() => changeTheme('dark')}
                    className="flex items-center gap-2 text-foreground"
                  >
                    <Moon className="h-4 w-4" />
                    Dark
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2 pt-2">
                <Label>Primary Color</Label>
                <div>
                  <h4 className="text-sm font-medium mb-2">Select a primary color:</h4>
                  <div className="flex flex-wrap gap-3">
                    <Button 
                      variant="outline"
                      className={`w-24 relative font-medium border-2 ${primaryColor === 'cyan' ? 'border-[#00e0ff] shadow-[0_0_10px_rgba(0,224,255,0.5)]' : 'border-transparent'}`}
                      onClick={() => changePrimaryColor('cyan')}
                      style={{
                        backgroundColor: primaryColor === 'cyan' ? 'rgba(0, 224, 255, 0.2)' : 'transparent',
                        color: 'hsl(188 100% 50%)'
                      }}
                    >
                      {primaryColor === 'cyan' && (
                        <div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-[#00e0ff]"></div>
                      )}
                      Cyan
                    </Button>
                    <Button 
                      variant="outline"
                      className={`w-24 relative font-medium border-2 ${primaryColor === 'purple' ? 'border-[#c58bff] shadow-[0_0_10px_rgba(197,139,255,0.5)]' : 'border-transparent'}`}
                      onClick={() => changePrimaryColor('purple')}
                      style={{
                        backgroundColor: primaryColor === 'purple' ? 'rgba(197, 139, 255, 0.2)' : 'transparent',
                        color: 'hsl(265 89% 78%)'
                      }}
                    >
                      {primaryColor === 'purple' && (
                        <div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-[#c58bff]"></div>
                      )}
                      Purple
                    </Button>
                    <Button 
                      variant="outline"
                      className={`w-24 relative font-medium border-2 ${primaryColor === 'blue' ? 'border-[#3b82f6] shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'border-transparent'}`}
                      onClick={() => changePrimaryColor('blue')}
                      style={{
                        backgroundColor: primaryColor === 'blue' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        color: 'hsl(217 91% 60%)'
                      }}
                    >
                      {primaryColor === 'blue' && (
                        <div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-[#3b82f6]"></div>
                      )}
                      Blue
                    </Button>
                    <Button 
                      variant="outline"
                      className={`w-24 relative font-medium border-2 ${primaryColor === 'green' ? 'border-[#22c55e] shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'border-transparent'}`}
                      onClick={() => changePrimaryColor('green')}
                      style={{
                        backgroundColor: primaryColor === 'green' ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
                        color: 'hsl(142 71% 45%)'
                      }}
                    >
                      {primaryColor === 'green' && (
                        <div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-[#22c55e]"></div>
                      )}
                      Green
                    </Button>
                    <Button 
                      variant="outline"
                      className={`w-24 relative font-medium border-2 ${primaryColor === 'orange' ? 'border-[#ff780a] shadow-[0_0_10px_rgba(255,120,10,0.5)]' : 'border-transparent'}`}
                      onClick={() => changePrimaryColor('orange')}
                      style={{
                        backgroundColor: primaryColor === 'orange' ? 'rgba(255, 120, 10, 0.2)' : 'transparent',
                        color: 'hsl(24 94% 50%)'
                      }}
                    >
                      {primaryColor === 'orange' && (
                        <div className="absolute top-1 left-1 w-3 h-3 rounded-full bg-[#ff780a]"></div>
                      )}
                      Orange
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="pt-4">
                <Label className="mb-2 block">Preview</Label>
                <div className="p-4 rounded-lg bg-background border border-primary/50">
                  <p className="text-primary font-medium mb-2">This is how your theme will look</p>
                  <p className="text-sm text-muted-foreground">Text and UI elements will be styled according to your preferences.</p>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm">Primary Button</Button>
                    <Button size="sm" variant="outline">Secondary</Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="assistant" className="space-y-6">
          <div className="glassmorphic p-6 rounded-lg border border-primary/20">
            <h2 className="text-xl font-orbitron mb-4">AI Assistant Settings</h2>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="aiName">AI Companion Name</Label>
                <div className="flex gap-2">
                  <Input
                    id="aiName"
                    value={savedAiName}
                    onChange={handleAiNameChange}
                    className="flex-1"
                  />
                  <Button onClick={saveAiName}>Save</Button>
                </div>
              </div>
              
              <div className="space-y-2 pt-4">
                <Label>Voice Settings</Label>
                <div className="flex items-center space-x-2">
                  <Switch id="voice" />
                  <Label htmlFor="voice" className="cursor-pointer">Enable Voice Interaction</Label>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Allow your AI companion to speak responses (coming soon)</p>
              </div>
              
              <div className="space-y-2 pt-4">
                <Label>Memory Settings</Label>
                <div className="flex items-center space-x-2">
                  <Switch id="memory" defaultChecked />
                  <Label htmlFor="memory" className="cursor-pointer">Remember Chat History</Label>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Your AI companion will remember previous conversations</p>
              </div>
              
              <div className="pt-6">
                <Button 
                  variant="outline" 
                  className="text-red-400 border-red-400/30 hover:bg-red-400/10"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reset AI Memory
                </Button>
                <p className="text-xs text-muted-foreground mt-1">This will clear all chat history and AI memory</p>
              </div>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="help" className="space-y-6">
          <div className="glassmorphic p-6 rounded-lg border border-primary/20">
            <h2 className="text-xl font-orbitron mb-4">Help & Tutorials</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-2">Guided Tours</h3>
                <div className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start text-foreground" 
                    onClick={handleRestartOnboarding}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Restart Onboarding Tutorial
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="w-full justify-start text-foreground"
                    onClick={() => navigate('/dashboard')}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Dashboard Tutorial
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="w-full justify-start text-foreground"
                    onClick={() => navigate('/ai')}
                  >
                    <Bot className="h-4 w-4 mr-2" />
                    AI Companion Tutorial
                  </Button>
                </div>
              </div>
              
              <div className="pt-4">
                <h3 className="text-lg font-medium mb-2">Guide Settings</h3>
                <div className="space-y-6 border border-primary/20 rounded-lg p-4">
                  {/* Dashboard Guides */}
                  <div>
                    <h4 className="text-md font-medium text-primary mb-2">Dashboard Guides</h4>
                    <div className="space-y-3">
                      {['dashboard_welcome', 'stats_overview', 'mission_log', 'data_entry', 'recalibration_log'].map((id) => {
                        const guide = APP_GUIDES[id] || {
                          id,
                          title: id.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
                        };
                        return (
                          <div key={id} className="flex items-center justify-between">
                            <Label htmlFor={`guide-${id}`} className="cursor-pointer text-sm">
                              {guide.title}
                            </Label>
                            <Switch 
                              id={`guide-${id}`} 
                              checked={enabledGuides[id] !== false}
                              onCheckedChange={(checked) => toggleGuide(id, checked)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Codex Guides */}
                  <div>
                    <h4 className="text-md font-medium text-primary mb-2">Codex Guides</h4>
                    <div className="space-y-3">
                      {['codex_welcome', 'mission_page_create', 'markdown_basics', 'wiki_links'].map((id) => {
                        const guide = APP_GUIDES[id] || {
                          id,
                          title: id.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
                        };
                        return (
                          <div key={id} className="flex items-center justify-between">
                            <Label htmlFor={`guide-${id}`} className="cursor-pointer text-sm">
                              {guide.title}
                            </Label>
                            <Switch 
                              id={`guide-${id}`} 
                              checked={enabledGuides[id] !== false}
                              onCheckedChange={(checked) => toggleGuide(id, checked)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* AI Companion Guides */}
                  <div>
                    <h4 className="text-md font-medium text-primary mb-2">AI Companion Guides</h4>
                    <div className="space-y-3">
                      {['ai_companion_intro', 'chat_session', 'companion_name'].map((id) => {
                        const guide = APP_GUIDES[id] || {
                          id,
                          title: id.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
                        };
                        return (
                          <div key={id} className="flex items-center justify-between">
                            <Label htmlFor={`guide-${id}`} className="cursor-pointer text-sm">
                              {guide.title}
                            </Label>
                            <Switch 
                              id={`guide-${id}`} 
                              checked={enabledGuides[id] !== false}
                              onCheckedChange={(checked) => toggleGuide(id, checked)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Additional Settings */}
                  <div className="pt-4 border-t border-primary/10">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="guide-all" className="cursor-pointer font-medium">
                        Enable All Guides
                      </Label>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="text-foreground"
                        onClick={() => {
                          // Enable all guides
                          Object.keys(APP_GUIDES).forEach(id => {
                            setGuideEnabled(id, true);
                          });
                          toast({
                            title: "Guides Enabled",
                            description: "All guides have been enabled.",
                            className: "bg-background border border-primary text-foreground",
                          });
                        }}
                      >
                        Enable All
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="pt-4">
                <h3 className="text-lg font-medium mb-2">Additional Resources</h3>
                <div className="space-y-2">
                  <Button variant="link" className="text-primary hover:text-primary/80">
                    Documentation & User Guide
                  </Button>
                  <Button variant="link" className="text-primary hover:text-primary/80">
                    Keyboard Shortcuts
                  </Button>
                  <Button variant="link" className="text-primary hover:text-primary/80">
                    Frequently Asked Questions
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}