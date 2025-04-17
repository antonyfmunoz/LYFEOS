import React, { useState } from 'react';
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
  const { restartOnboarding, enabledGuides, setGuideEnabled } = useOnboarding();
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('dark');
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
        className: "bg-[#001E26] border border-[#36F1CD] text-white",
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
        className: "bg-[#001E26] border border-[#36F1CD] text-white",
      });
    }
  };
  
  // Handle appearance changes
  const changeTheme = (value: 'light' | 'dark' | 'system') => {
    setThemeMode(value);
    
    // In a real implementation, this would actually change the theme
    // For now, we'll just show a toast
    const themeName = value === 'system' ? 'System Default' : value.charAt(0).toUpperCase() + value.slice(1);
    
    toast({
      title: "Theme Updated",
      description: `Theme changed to ${themeName}`,
      className: "bg-[#001E26] border border-[#36F1CD] text-white",
    });
  };
  
  const changePrimaryColor = (value: string) => {
    setPrimaryColor(value);
    
    // In a real implementation, this would actually change the theme color
    toast({
      title: "Color Theme Updated",
      description: `Primary color changed to ${value}`,
      className: "bg-[#001E26] border border-[#36F1CD] text-white",
    });
  };
  
  // Handle onboarding reset
  const handleRestartOnboarding = () => {
    restartOnboarding();
    toast({
      title: "Onboarding Reset",
      description: "Onboarding tutorial has been reset. Refresh to start the tutorial again.",
      className: "bg-[#001E26] border border-[#36F1CD] text-white",
    });
  };
  
  // Toggle a guide
  const toggleGuide = (id: string, enabled: boolean) => {
    setGuideEnabled(id, enabled);
  };
  
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
          <div className="glassmorphic p-6 rounded-lg border border-slate-700/50">
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
          <div className="glassmorphic p-6 rounded-lg border border-slate-700/50">
            <h2 className="text-xl font-orbitron mb-4">Theme Settings</h2>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Theme Mode</Label>
                <div className="flex gap-4">
                  <Button 
                    variant={themeMode === 'light' ? "default" : "outline"} 
                    onClick={() => changeTheme('light')}
                    className="flex items-center gap-2"
                  >
                    <Sun className="h-4 w-4" />
                    Light
                  </Button>
                  
                  <Button 
                    variant={themeMode === 'dark' ? "default" : "outline"} 
                    onClick={() => changeTheme('dark')}
                    className="flex items-center gap-2"
                  >
                    <Moon className="h-4 w-4" />
                    Dark
                  </Button>
                  
                  <Button 
                    variant={themeMode === 'system' ? "default" : "outline"} 
                    onClick={() => changeTheme('system')}
                    className="flex items-center gap-2"
                  >
                    <Monitor className="h-4 w-4" />
                    System
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2 pt-2">
                <Label>Primary Color</Label>
                <Select value={primaryColor} onValueChange={changePrimaryColor}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select a color" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cyan">Cyan</SelectItem>
                    <SelectItem value="purple">Purple</SelectItem>
                    <SelectItem value="blue">Blue</SelectItem>
                    <SelectItem value="green">Green</SelectItem>
                    <SelectItem value="orange">Orange</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="pt-4">
                <Label className="mb-2 block">Preview</Label>
                <div className={`p-4 rounded-lg bg-[#001E26] border border-[#36F1CD]/50`}>
                  <p className="text-[#36F1CD] font-medium mb-2">This is how your theme will look</p>
                  <p className="text-sm text-slate-300">Text and UI elements will be styled according to your preferences.</p>
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
          <div className="glassmorphic p-6 rounded-lg border border-slate-700/50">
            <h2 className="text-xl font-orbitron mb-4">AI Assistant Settings</h2>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="aiName">AI Companion Name</Label>
                <NovaGuideTooltip 
                  guide={{ 
                    ...APP_GUIDES.companion_name,
                    forceShow: true
                  }}
                  onComplete={(id) => {}}
                >
                  <div className="flex gap-2">
                    <Input
                      id="aiName"
                      value={savedAiName}
                      onChange={handleAiNameChange}
                      className="flex-1"
                    />
                    <Button onClick={saveAiName}>Save</Button>
                  </div>
                </NovaGuideTooltip>
              </div>
              
              <div className="space-y-2 pt-4">
                <Label>Voice Settings</Label>
                <div className="flex items-center space-x-2">
                  <Switch id="voice" />
                  <Label htmlFor="voice" className="cursor-pointer">Enable Voice Interaction</Label>
                </div>
                <p className="text-xs text-slate-400 mt-1">Allow your AI companion to speak responses (coming soon)</p>
              </div>
              
              <div className="space-y-2 pt-4">
                <Label>Memory Settings</Label>
                <div className="flex items-center space-x-2">
                  <Switch id="memory" defaultChecked />
                  <Label htmlFor="memory" className="cursor-pointer">Remember Chat History</Label>
                </div>
                <p className="text-xs text-slate-400 mt-1">Your AI companion will remember previous conversations</p>
              </div>
              
              <div className="pt-6">
                <Button 
                  variant="outline" 
                  className="text-red-400 border-red-400/30 hover:bg-red-400/10"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reset AI Memory
                </Button>
                <p className="text-xs text-slate-400 mt-1">This will clear all chat history and AI memory</p>
              </div>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="help" className="space-y-6">
          <div className="glassmorphic p-6 rounded-lg border border-slate-700/50">
            <h2 className="text-xl font-orbitron mb-4">Help & Tutorials</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-2">Guided Tours</h3>
                <div className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start" 
                    onClick={handleRestartOnboarding}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Restart Onboarding Tutorial
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => navigate('/dashboard')}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Dashboard Tutorial
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => navigate('/ai')}
                  >
                    <Bot className="h-4 w-4 mr-2" />
                    AI Companion Tutorial
                  </Button>
                </div>
              </div>
              
              <div className="pt-4">
                <h3 className="text-lg font-medium mb-2">Guide Settings</h3>
                <div className="space-y-3 border border-slate-700/50 rounded-lg p-4">
                  {Object.entries(APP_GUIDES).map(([id, guide]) => (
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
                  ))}
                </div>
              </div>
              
              <div className="pt-4">
                <h3 className="text-lg font-medium mb-2">Additional Resources</h3>
                <div className="space-y-2">
                  <Button variant="link" className="text-[#36F1CD] hover:text-[#36F1CD]/80">
                    Documentation & User Guide
                  </Button>
                  <Button variant="link" className="text-[#36F1CD] hover:text-[#36F1CD]/80">
                    Keyboard Shortcuts
                  </Button>
                  <Button variant="link" className="text-[#36F1CD] hover:text-[#36F1CD]/80">
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