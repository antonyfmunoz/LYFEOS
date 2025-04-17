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
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>(theme === 'dark' ? 'dark' : 'light');
  
  // Simplified function to get current primary color - uses a simpler approach
  const getCurrentPrimaryColor = (): string => {
    // Instead of relying on CSS variables, we'll check theme.json values directly
    let defaultColor = "cyan";
    
    try {
      // Create a mapping of HSL values to simple color names
      const colorMap: Record<string, string> = {
        "hsl(188 100% 50%)": "cyan",
        "hsl(265 89% 78%)": "purple",
        "hsl(217 91% 60%)": "blue", 
        "hsl(142 71% 45%)": "green",
        "hsl(24 94% 50%)": "orange"
      };
      
      // Get the actual primary color value
      const primaryBtn = document.querySelector('.bg-primary');
      if (primaryBtn) {
        const btnColor = window.getComputedStyle(primaryBtn).backgroundColor;
        
        // Map RGB color back to our theme colors
        // This is a simplistic approach - we'll just use our default mapping
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
      console.error("Error detecting primary color:", e);
    }
    
    return defaultColor;
  };
  
  const [primaryColor, setPrimaryColor] = useState<string>(() => {
    // We need to run this in useEffect since it accesses the DOM
    if (typeof window !== 'undefined') {
      try {
        return getCurrentPrimaryColor();
      } catch (e) {
        return 'cyan';
      }
    }
    return 'cyan';
  });
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
  const changeTheme = async (value: 'light' | 'dark' | 'system') => {
    setThemeMode(value);
    
    try {
      // Calculate the actual appearance value for theme.json
      let appearance = value;
      if (value === 'system') {
        appearance = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      
      // Update theme in theme.json
      const response = await fetch('/api/settings/theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          appearance
        })
      });
      
      if (response.ok) {
        // Apply the theme change using the themeContext
        if (value === 'light' && theme === 'dark') {
          toggleTheme(); // Switch from dark to light
        } else if (value === 'dark' && theme === 'light') {
          toggleTheme(); // Switch from light to dark
        } else if (value === 'system') {
          // For system preference, we'd need to check the system preference
          // and apply the appropriate theme
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          if ((prefersDark && theme === 'light') || (!prefersDark && theme === 'dark')) {
            toggleTheme();
          }
        }
        
        const themeName = value === 'system' ? 'System Default' : value.charAt(0).toUpperCase() + value.slice(1);
        
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
    setPrimaryColor(value);
    
    // Map color name to HSL value
    const colorValues: Record<string, string> = {
      "cyan": "hsl(188 100% 50%)",
      "purple": "hsl(265 89% 78%)",
      "blue": "hsl(217 91% 60%)",
      "green": "hsl(142 71% 45%)",
      "orange": "hsl(24 94% 50%)"
    };
    
    try {
      // Update theme color in theme.json
      const response = await fetch('/api/settings/theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ primary: colorValues[value] })
      });
      
      if (response.ok) {
        toast({
          title: "Color Theme Updated",
          description: `Primary color changed to ${value}. Click OK to apply changes.`,
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
    if (typeof window !== 'undefined') {
      try {
        const detectedColor = getCurrentPrimaryColor();
        if (detectedColor !== primaryColor) {
          setPrimaryColor(detectedColor);
        }
      } catch (e) {
        console.error('Error detecting primary color:', e);
      }
    }
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
                  
                  <Button 
                    variant={themeMode === 'system' ? "default" : "outline"} 
                    onClick={() => changeTheme('system')}
                    className="flex items-center gap-2 text-foreground"
                  >
                    <Monitor className="h-4 w-4" />
                    System
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2 pt-2">
                <Label>Primary Color</Label>
                <div>
                  <h4 className="text-sm font-medium mb-2">Select a primary color:</h4>
                  <div className="flex flex-wrap gap-3">
                    <Button 
                      variant={primaryColor === 'cyan' ? 'default' : 'outline'}
                      className="w-24 bg-[#00e0ff] text-black hover:text-black hover:bg-[#00e0ff]/90"
                      onClick={() => changePrimaryColor('cyan')}
                    >
                      Cyan
                    </Button>
                    <Button 
                      variant={primaryColor === 'purple' ? 'default' : 'outline'}
                      className="w-24 bg-[#c58bff] text-black hover:text-black hover:bg-[#c58bff]/90"
                      onClick={() => changePrimaryColor('purple')}
                    >
                      Purple
                    </Button>
                    <Button 
                      variant={primaryColor === 'blue' ? 'default' : 'outline'}
                      className="w-24 bg-[#3b82f6] text-white hover:text-white hover:bg-[#3b82f6]/90"
                      onClick={() => changePrimaryColor('blue')}
                    >
                      Blue
                    </Button>
                    <Button 
                      variant={primaryColor === 'green' ? 'default' : 'outline'}
                      className="w-24 bg-[#22c55e] text-white hover:text-white hover:bg-[#22c55e]/90"
                      onClick={() => changePrimaryColor('green')}
                    >
                      Green
                    </Button>
                    <Button 
                      variant={primaryColor === 'orange' ? 'default' : 'outline'}
                      className="w-24 bg-[#ff780a] text-white hover:text-white hover:bg-[#ff780a]/90"
                      onClick={() => changePrimaryColor('orange')}
                    >
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