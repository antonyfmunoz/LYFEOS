import React, { useState, useEffect, useCallback } from "react";
import RootLayout from "../components/layout/RootLayout";
import { useLYFEOS } from "../lib/context";
import { useAuth } from "@/lib/authContext";
import { useTheme } from "@/lib/themeContext";
import { usePageTitle } from "@/hooks/use-page-title";
import CompactStatsWidget from "@/components/dashboard/CompactStatsWidget";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { 
  LogOut, 
  Edit, 
  Save, 
  X, 
  User,
  Terminal,
  ChevronDown,
  FileText,
  Palette,
  Upload,
  Camera,
  Paintbrush,
  Settings,
  ArrowLeft,
  Globe,
  Plus,
  BarChart4,
  RefreshCw,
  Sparkles,
  Brain,
  Target,
  BookOpen,
  FolderKanban,
  Heart,
  Wallet,
  Zap,
  Palette as PaletteIcon,
  Loader2,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { DraggableWidget } from '@/components/ui/draggable-widget';
import update from 'immutability-helper';
import type { UserProfile as UserProfileSchema } from "@shared/schema";



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

interface UserProfile {
  id: number;
  username: string;
  displayName?: string;
  bio?: string;
  title?: string;
  profilePicture?: string;
}

export default function ProfilePage() {
  // Set the page title
  usePageTitle('Profile');
  
  const { username, stats, updateUserStats } = useLYFEOS();
  const { setPrimaryColor, toggleDarkMode } = useTheme();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState<UserProfile>({
    id: user?.id || 0,
    username: username,
    displayName: "",
    bio: "",
    title: "",
    profilePicture: "",
  });
  
  // Fetch user profile data
  const { data: profileFromApi, isLoading } = useQuery({
    queryKey: ["/api/users", user?.id, "profile"],
    queryFn: async () => {
      if (!user?.id) return null;
      return apiRequest<UserProfile>(`/api/users/${user.id}/profile`);
    },
    enabled: !!user?.id,
  });
  
  // Fetch user profile schema data (onboarding/archetype data)
  const { data: userProfileData, isLoading: isProfileSchemaLoading } = useQuery({
    queryKey: ["/api/profile"],
    enabled: !!user?.id,
  });
  
  // State for affirmation regeneration
  const [isGeneratingAffirmation, setIsGeneratingAffirmation] = useState(false);
  
  // Account settings state
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPhone, setAccountPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
  // Fetch account data
  const { data: accountData, isLoading: isAccountLoading } = useQuery<{ email?: string; phoneNumber?: string; authProvider?: string }>({
    queryKey: ["/api/account"],
    enabled: !!user?.id,
  });
  
  // Update account when data loads
  useEffect(() => {
    if (accountData) {
      setAccountEmail(accountData.email || "");
      setAccountPhone(accountData.phoneNumber || "");
    }
  }, [accountData]);
  
  // Update account mutation
  const updateAccountMutation = useMutation({
    mutationFn: async (data: { email?: string; phoneNumber?: string }) => {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update account");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/account"] });
      setIsEditingAccount(false);
      toast({
        title: "Account Updated",
        description: "Your account information has been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update account. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const response = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to change password");
      }
      return response.json();
    },
    onSuccess: () => {
      setIsChangingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change password. Please check your current password.",
        variant: "destructive",
      });
    },
  });
  
  const handleSaveAccount = () => {
    updateAccountMutation.mutate({
      email: accountEmail,
      phoneNumber: accountPhone,
    });
  };
  
  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }
    changePasswordMutation.mutate({
      currentPassword,
      newPassword,
    });
  };

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: Partial<UserProfile>) => {
      if (!user?.id) throw new Error("User not authenticated");
      return apiRequest<UserProfile>(`/api/users/${user.id}/profile`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", user?.id, "profile"] });
      setIsEditing(false);
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
        variant: "default",
        className: "bg-background/80 border border-primary text-foreground",
        duration: 3000,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
      console.error("Failed to update profile:", error);
    },
  });

  // Update local state when API data is loaded
  useEffect(() => {
    if (profileFromApi) {
      setProfileData({
        ...profileData,
        ...profileFromApi,
      });
    }
  }, [profileFromApi]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProfileData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Widget data interface
  interface WidgetData {
    id: string;
    title: string;
    icon: React.ReactNode;
    defaultOpen?: boolean;
  }

  // Define widgets for drag and drop functionality
  const [widgets, setWidgets] = useState<WidgetData[]>([
    {
      id: 'player-record',
      title: "Player Record",
      icon: <FileText className="h-5 w-5 text-primary" />,
      defaultOpen: true
    },
    {
      id: 'player-affirmation',
      title: "Player Affirmation",
      icon: <Terminal className="h-5 w-5 text-primary" />,
      defaultOpen: true
    },
    {
      id: 'stats',
      title: "Player Stats",
      icon: <BarChart4 className="h-5 w-5 text-primary" />,
      defaultOpen: true
    },
    {
      id: 'settings',
      title: "UI Settings",
      icon: <Settings className="h-5 w-5 text-primary" />,
      defaultOpen: true
    }
  ]);

  // Move widget handler for drag and drop
  const moveWidget = useCallback((dragIndex: number, hoverIndex: number) => {
    setWidgets((prevWidgets) =>
      update(prevWidgets, {
        $splice: [
          [dragIndex, 1],
          [hoverIndex, 0, prevWidgets[dragIndex]],
        ],
      })
    );
  }, []);
  
  // Helper to format array or object values for display
  const formatValue = (val: any): string => {
    if (!val) return "—";
    if (Array.isArray(val)) {
      return val.length > 0 ? val.join(", ") : "—";
    }
    if (typeof val === "object") {
      return Object.values(val).filter(Boolean).join(", ") || "—";
    }
    return String(val) || "—";
  };

  // Generate Character Affirmation
  const handleGenerateAffirmation = async () => {
    if (!userProfileData || isGeneratingAffirmation) return;
    
    setIsGeneratingAffirmation(true);
    try {
      const response = await fetch("/api/profile/generate-affirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          displayName: profileData.displayName || username,
          archetypePrimary: (userProfileData as any).archetypePrimary,
          archetypeSecondary: (userProfileData as any).archetypeSecondary,
          coreValues: (userProfileData as any).primaryValues,
          vision5Year: (userProfileData as any).vision5Year,
          primaryCraft: (userProfileData as any).primaryCraft,
          desiredEmotion: (userProfileData as any).desiredEmotion,
        }),
      });
      
      if (!response.ok) throw new Error("Failed to generate affirmation");
      
      const { affirmation } = await response.json();
      
      // Save the affirmation to the profile
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ characterAffirmation: affirmation }),
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      
      toast({
        title: "Affirmation Generated",
        description: "Your character affirmation has been created.",
        variant: "default",
        className: "bg-background/80 border border-primary text-foreground",
        duration: 3000,
      });
    } catch (error) {
      console.error("Error generating affirmation:", error);
      toast({
        title: "Error",
        description: "Failed to generate affirmation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingAffirmation(false);
    }
  };

  // Render Player Record with 9 sections
  const renderPlayerRecord = () => {
    const profile = userProfileData as any;
    
    if (isProfileSchemaLoading) {
      return (
        <div className="p-4 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          Loading profile data...
        </div>
      );
    }
    
    if (!profile) {
      return (
        <div className="p-4 border border-primary/10 rounded-lg bg-background/40 text-center">
          <p className="text-muted-foreground mb-3">Complete onboarding to populate your Player Record.</p>
          <Link href="/onboarding">
            <Button variant="outline" size="sm" className="hover:bg-primary hover:text-background">
              Start Onboarding
            </Button>
          </Link>
        </div>
      );
    }

    const sections = [
      {
        id: "identity",
        title: "Identity",
        icon: <User className="h-4 w-4 text-primary" />,
        items: [
          { label: "Primary Archetype", value: profile.archetypePrimary },
          { label: "Secondary Archetype", value: profile.archetypeSecondary },
          { label: "Shadow Archetype", value: profile.archetypeShadow },
          { label: "Primary Instincts", value: formatValue(profile.primaryInstincts) },
          { label: "Key Drivers", value: formatValue(profile.keyDrivers) },
        ]
      },
      {
        id: "personality",
        title: "Personality",
        icon: <Brain className="h-4 w-4 text-primary" />,
        items: [
          { label: "Core Belief", value: profile.coreBelief },
          { label: "Primary Values", value: formatValue(profile.primaryValues) },
          { label: "Strengths", value: formatValue(profile.strengths) },
          { label: "Weaknesses", value: formatValue(profile.weaknesses) },
          { label: "Trait to Develop", value: profile.desiredTrait },
        ]
      },
      {
        id: "vision",
        title: "Vision & Goals",
        icon: <Target className="h-4 w-4 text-primary" />,
        items: [
          { label: "Life Stage", value: profile.lifeStage },
          { label: "Desired Emotion", value: profile.desiredEmotion },
          { label: "90-Day Vision", value: profile.vision90Day },
          { label: "5-Year Vision", value: profile.vision5Year },
          { label: "Legacy Vision", value: profile.vision10YearLegacy },
        ]
      },
      {
        id: "learning",
        title: "Learning & Skills",
        icon: <BookOpen className="h-4 w-4 text-primary" />,
        items: [
          { label: "Domains of Competence", value: formatValue(profile.domainsOfCompetence) },
          { label: "Skills to Acquire", value: formatValue(profile.skillsToAcquire) },
          { label: "Knowledge Areas", value: formatValue(profile.knowledgeAreas) },
          { label: "Integration Method", value: profile.integrationMethod },
        ]
      },
      {
        id: "projects",
        title: "Projects & Craft",
        icon: <FolderKanban className="h-4 w-4 text-primary" />,
        items: [
          { label: "Primary Craft", value: profile.primaryCraft },
          { label: "Why This Craft", value: profile.primaryCraftWhy },
          { label: "Active Phase", value: profile.activePhase },
          { label: "Current Projects", value: formatValue(profile.currentProjects?.map?.((p: any) => p.name)) },
        ]
      },
      {
        id: "health",
        title: "Health & Body",
        icon: <Heart className="h-4 w-4 text-primary" />,
        items: [
          { label: "Training Style", value: profile.fitnessMovement?.trainingStyle },
          { label: "Nutritional Approach", value: profile.nutritionRecovery?.nutritionalApproach },
          { label: "Energy Patterns", value: profile.healthVitality?.energyPatterns },
          { label: "Longevity Focus", value: formatValue(profile.healthVitality?.longevityFocus) },
        ]
      },
      {
        id: "wealth",
        title: "Wealth & Work",
        icon: <Wallet className="h-4 w-4 text-primary" />,
        items: [
          { label: "Career/Vocation", value: profile.careerVocation },
          { label: "Active Ventures", value: formatValue(profile.activeVentures) },
          { label: "Weekly Capacity", value: profile.weeklyCapacity?.hours ? `${profile.weeklyCapacity.hours} hours` : "—" },
          { label: "Physical Environment", value: profile.physicalEnvironment },
        ]
      },
      {
        id: "performance",
        title: "Performance",
        icon: <Zap className="h-4 w-4 text-primary" />,
        items: [
          { label: "Collaboration Style", value: profile.collaborationStyle },
          { label: "Role Orientation", value: profile.roleOrientation },
          { label: "Decision Style", value: profile.decisionOrientation },
          { label: "Optimal Environment", value: profile.optimalEnvironment },
          { label: "Greatest Contribution", value: profile.greatestContribution },
        ]
      },
      {
        id: "style",
        title: "Style & Expression",
        icon: <PaletteIcon className="h-4 w-4 text-primary" />,
        items: [
          { label: "Aesthetic", value: profile.aesthetic },
          { label: "Signature Expression", value: profile.signatureExpression },
          { label: "Creative Outlets", value: formatValue(profile.creativeOutlets) },
        ]
      },
    ];

    return (
      <div className="space-y-3">
        {sections.map((section) => (
          <Collapsible key={section.id} defaultOpen={false}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card/50 rounded-lg hover:bg-card/70 transition-colors group">
              <div className="flex items-center gap-2">
                {section.icon}
                <span className="text-sm font-medium text-foreground">{section.title}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground group-data-[state=open]:rotate-180 transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-3 pt-2 space-y-2">
                {section.items.map((item, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-1 border-b border-primary/5 last:border-0">
                    <span className="text-xs text-muted-foreground min-w-[120px]">{item.label}</span>
                    <span className="text-sm text-foreground flex-1">{item.value || "—"}</span>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    );
  };

  // Render Player Affirmation
  const renderPlayerAffirmation = () => {
    const profile = userProfileData as any;
    const affirmation = profile?.characterAffirmation;
    
    if (isProfileSchemaLoading) {
      return (
        <div className="p-4 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          Loading...
        </div>
      );
    }

    return (
      <div className="p-4 border border-primary/10 rounded-lg bg-background/40">
        {affirmation ? (
          <>
            <div className="p-4 bg-card/50 rounded-lg border border-primary/20 mb-4">
              <p className="text-foreground italic leading-relaxed whitespace-pre-wrap">
                {affirmation}
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateAffirmation}
                disabled={isGeneratingAffirmation}
                className="hover:bg-primary hover:text-background"
              >
                {isGeneratingAffirmation ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Regenerate
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <Sparkles className="h-8 w-8 text-primary/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              Generate a personalized character affirmation based on your profile data.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateAffirmation}
              disabled={isGeneratingAffirmation || !profile}
              className="hover:bg-primary hover:text-background"
            >
              {isGeneratingAffirmation ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Affirmation
                </>
              )}
            </Button>
            {!profile && (
              <p className="text-xs text-muted-foreground mt-2">
                Complete onboarding first to enable this feature.
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render widget content based on id
  const renderWidgetContent = (widgetId: string) => {
    switch (widgetId) {
      case 'stats':
        return <CompactStatsWidget stats={stats} />;
      case 'player-record':
        return renderPlayerRecord();
      case 'player-affirmation':
        return renderPlayerAffirmation();
      case 'settings':
        return (
          <>
            {/* Dark Theme toggle */}
            <div className="p-4 border border-primary/10 rounded-lg bg-background/40 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-icons text-primary text-sm">dark_mode</span>
                <Label className="text-sm text-foreground">Dark Theme</Label>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Toggle between light and dark interface mode.
              </p>
              <div className="flex items-center justify-between p-3 bg-card/50 rounded-lg hover:bg-card/70 transition-colors">
                <div className="flex items-center">
                  <span className="material-icons text-primary text-sm mr-2">dark_mode</span>
                  <span className="text-sm">Dark Theme</span>
                </div>
                <button 
                  onClick={() => {
                    toggleDarkMode();
                    toast({
                      title: "Theme Updated",
                      description: `Dark Theme has been ${!stats.darkThemeEnabled ? 'enabled' : 'disabled'}.`,
                      variant: "default",
                      className: "bg-background/80 border border-primary text-foreground",
                      duration: 2000,
                    });
                  }}
                  className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors duration-200 ${
                    stats.darkThemeEnabled ? 'bg-primary/30' : 'bg-card'
                  }`}
                  aria-pressed={stats.darkThemeEnabled}
                  role="switch"
                >
                  <div 
                    className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-300 ${
                      stats.darkThemeEnabled ? 'left-5 bg-primary shadow-[0_0_5px_var(--primary-glow-medium)]' : 'left-0.5 bg-muted-foreground'
                    }`}
                  ></div>
                </button>
              </div>
            </div>
            
            {/* Notifications toggle */}
            <div className="p-4 border border-primary/10 rounded-lg bg-background/40 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-icons text-primary text-sm">notifications</span>
                <Label className="text-sm text-foreground">Notifications</Label>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Enable or disable system notifications.
              </p>
              <div className="flex items-center justify-between p-3 bg-card/50 rounded-lg hover:bg-card/70 transition-colors">
                <div className="flex items-center">
                  <span className="material-icons text-primary text-sm mr-2">notifications</span>
                  <span className="text-sm">Notifications</span>
                </div>
                <button 
                  onClick={async () => {
                    if (!user?.id) return;
                    
                    const newValue = !stats.notificationsEnabled;
                    
                    try {
                      const response = await fetch(`/api/users/${user.id}/stats`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ notificationsEnabled: newValue }),
                        credentials: "include"
                      });
                      
                      if (!response.ok) throw new Error("Failed to update setting");
                      
                      const updatedStats = await response.json();
                      updateUserStats(updatedStats.stats);
                      
                      toast({
                        title: "Setting Updated",
                        description: `Notifications have been ${newValue ? 'enabled' : 'disabled'}.`,
                        variant: "default",
                        className: "bg-background/80 border border-primary text-foreground",
                        duration: 2000,
                      });
                    } catch (error) {
                      toast({
                        title: "Error",
                        description: "Failed to update notification settings.",
                        variant: "destructive",
                      });
                      console.error("Error updating notification settings:", error);
                    }
                  }}
                  className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors duration-200 ${
                    stats.notificationsEnabled ? 'bg-primary/30' : 'bg-card'
                  }`}
                  aria-pressed={stats.notificationsEnabled}
                  role="switch"
                >
                  <div 
                    className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-300 ${
                      stats.notificationsEnabled ? 'left-5 bg-primary shadow-[0_0_5px_var(--primary-glow-medium)]' : 'left-0.5 bg-muted-foreground'
                    }`}
                  ></div>
                </button>
              </div>
            </div>
            
            {/* Primary Theme Color Selector */}
            <div className="p-4 border border-primary/10 rounded-lg bg-background/40 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Paintbrush className="h-4 w-4 text-primary" />
                <Label className="text-sm text-foreground">UI Theme Color</Label>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Select your preferred interface color.
              </p>
              <div className="grid grid-cols-4 gap-2">
                {STAT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-md transition-all ${
                      stats.primaryColor === color 
                        ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110' 
                        : 'ring-1 ring-primary/20 hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => handlePrimaryColorChange(color)}
                    aria-label={`Select theme color ${color}`}
                  >
                    {stats.primaryColor === color && (
                      <span className="flex items-center justify-center text-background text-xs">
                        <span className="material-icons" style={{ fontSize: '16px' }}>check</span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center mt-3 gap-2">
                <span className="block w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: stats.primaryColor || "#00e0ff" }}></span>
                <p className="text-xs text-muted-foreground">
                  Current color: {stats.primaryColor || "#00e0ff"}
                </p>
              </div>
            </div>
          </>
        );
      default:
        return null;
    }
  };

  
  // Function to handle theme color changes
  const handlePrimaryColorChange = (color: string) => {
    // Use the context function to update the primary color
    setPrimaryColor(color);
    
    toast({
      title: "Theme Color Updated",
      description: "Your UI theme color has been changed",
      variant: "default",
      className: "bg-background/80 border border-primary text-foreground",
      duration: 3000,
    });
  };

  // File upload handler
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Image size must be less than 5MB",
        variant: "destructive",
      });
      return;
    }
    
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setProfileData(prev => ({
        ...prev,
        profilePicture: base64String
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    updateProfileMutation.mutate({
      displayName: profileData.displayName,
      bio: profileData.bio,
      title: profileData.title,
      profilePicture: profileData.profilePicture,
    });
  };

  const handleCancel = () => {
    // Reset to original data
    if (profileFromApi) {
      setProfileData({
        ...profileData,
        ...profileFromApi,
      });
    }
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <RootLayout>
        <div className="max-w-4xl mx-auto pb-20">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 hover:bg-primary hover:text-background" 
                onClick={() => window.history.back()}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-2xl font-orbitron text-foreground">My Account</h1>
            </div>
            <Button 
              variant="ghost"
              className="flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10"
              disabled
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </Button>
          </div>
          
          {/* Loading Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-background border border-primary/20 backdrop-blur-md rounded-lg p-6 shadow-lg"
                style={{ boxShadow: "0 0 20px var(--primary-glow-light)" }}>
              <div className="animate-pulse">
                <div className="flex items-center justify-between mb-6">
                  <div className="h-4 bg-primary/20 rounded w-24"></div>
                  <div className="h-8 bg-primary/20 rounded w-24"></div>
                </div>
                
                <div className="flex justify-center mb-6">
                  <div className="rounded-full bg-primary/20 h-24 w-24"></div>
                </div>
                
                <div className="flex flex-col items-center space-y-2 mb-6">
                  <div className="h-5 bg-primary/20 rounded w-40"></div>
                  <div className="h-3 bg-primary/20 rounded w-32"></div>
                </div>
                
                <div className="space-y-6">
                  <div className="h-32 bg-primary/10 rounded w-full"></div>
                </div>
              </div>
            </div>
            
            <div className="bg-background border border-primary/20 backdrop-blur-md rounded-lg p-6 shadow-lg"
                style={{ boxShadow: "0 0 20px var(--primary-glow-light)" }}>
              <div className="animate-pulse">
                <div className="h-5 bg-primary/20 rounded w-24 mb-6"></div>
                
                <div className="space-y-4">
                  <div className="h-32 bg-primary/10 rounded w-full"></div>
                  <div className="h-32 bg-primary/10 rounded w-full"></div>
                  <div className="h-32 bg-primary/10 rounded w-full"></div>
                </div>
                
                <div className="flex justify-end mt-6">
                  <div className="h-9 bg-primary/20 rounded w-24"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </RootLayout>
    );
  }

  return (
    <RootLayout>
      <div className="max-w-4xl mx-auto pb-20">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 hover:bg-primary hover:text-background" 
              onClick={() => window.history.back()}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-orbitron text-foreground">My Account</h1>
          </div>
          <Button 
            variant="ghost"
            className="flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </Button>
        </div>

        {updateProfileMutation.isError && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>
              Failed to update profile. Please try again.
            </AlertDescription>
          </Alert>
        )}

        {/* Profile Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glassmorphic rounded-xl neon-border overflow-hidden">
            <div className="p-3 flex items-center justify-between border-b border-primary/20">
              <div className="flex items-center">
                <User className="mr-2 h-5 w-5 text-primary" />
                <h2 className="text-lg font-orbitron text-foreground">Profile</h2>
              </div>
              {isEditing ? (
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleCancel}
                    className="hover:bg-primary hover:text-background"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm"
                    onClick={handleSave}
                    disabled={updateProfileMutation.isPending}
                    className="hover:bg-primary hover:text-background"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    Save
                  </Button>
                </div>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="hover:bg-primary hover:text-background"
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Profile
                </Button>
              )}
            </div>
            
            <div className="p-4">
            
            {/* Profile Image - Centered at the top */}
            <div className="flex justify-center mb-4">
              <div 
                className="w-24 h-24 rounded-full border-2 border-primary/50 relative overflow-hidden"
                style={{ 
                  boxShadow: "0 0 15px var(--primary-glow-light)"
                }}
              >
                {profileData.profilePicture ? (
                  <img 
                    src={profileData.profilePicture} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div 
                    className="w-full h-full flex items-center justify-center bg-primary"
                  >
                    <span className="material-icons text-background text-4xl">person</span>
                  </div>
                )}
                
                {isEditing && (
                  <label 
                    htmlFor="profile-picture-upload" 
                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <div className="flex flex-col items-center text-white">
                      <Camera className="h-6 w-6 mb-1" />
                      <span className="text-xs">Change</span>
                    </div>
                    <input
                      type="file"
                      id="profile-picture-upload"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>
            
            {/* User Info - Centered below profile picture */}
            <div className="flex flex-col items-center text-center mb-4">
              <h2 className="text-xl font-orbitron text-foreground mb-1">
                {profileData.displayName || username}
              </h2>
              
              {profileData.title && (
                <p className="text-primary text-sm mb-3 font-medium">{profileData.title}</p>
              )}
            </div>
            
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="displayName" className="flex items-center gap-2 mb-2">
                    <User className="h-4 w-4 text-primary" />
                    Display Name
                  </Label>
                  <Input
                    id="displayName"
                    name="displayName"
                    value={profileData.displayName || ""}
                    onChange={handleInputChange}
                    placeholder="Enter your display name"
                    className="bg-background/50 border-primary/30 focus:border-primary/50"
                  />
                </div>
                
                <div>
                  <Label htmlFor="title" className="flex items-center gap-2 mb-2">
                    <Terminal className="h-4 w-4 text-primary" />
                    Title
                  </Label>
                  <Input
                    id="title"
                    name="title"
                    value={profileData.title || ""}
                    onChange={handleInputChange}
                    placeholder="e.g. Adventurer, Developer, Explorer"
                    className="bg-background/50 border-primary/30 focus:border-primary/50"
                  />
                </div>
                
                <div>
                  <Label htmlFor="bio" className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Bio
                  </Label>
                  <Textarea
                    id="bio"
                    name="bio"
                    value={profileData.bio || ""}
                    onChange={handleInputChange}
                    placeholder="Write a short bio about yourself"
                    className="bg-background/50 border-primary/30 focus:border-primary/50 resize-none min-h-[120px]"
                  />
                </div>
              </div>
            ) : (
              <>
                {profileData.bio && (
                  <div className="p-4 bg-background/30 border border-primary/10 rounded-md mb-4 text-muted-foreground">
                    <h3 className="text-md font-orbitron text-foreground mb-2">Bio</h3>
                    {profileData.bio}
                  </div>
                )}
              </>
            )}
            
            {/* Account Settings Section */}
            <div className="mt-6 pt-6 border-t border-primary/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-md font-orbitron text-foreground flex items-center gap-2">
                  <Settings className="h-4 w-4 text-primary" />
                  Account Settings
                </h3>
                {!isEditingAccount && !isChangingPassword && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setIsEditingAccount(true)}
                    className="hover:bg-primary hover:text-background"
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                )}
              </div>
              
              {isEditingAccount ? (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="email" className="flex items-center gap-2 mb-2">
                      <Mail className="h-4 w-4 text-primary" />
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={accountEmail}
                      onChange={(e) => setAccountEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="bg-background/50 border-primary/30 focus:border-primary/50"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="phone" className="flex items-center gap-2 mb-2">
                      <Phone className="h-4 w-4 text-primary" />
                      Phone Number
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={accountPhone}
                      onChange={(e) => setAccountPhone(e.target.value)}
                      placeholder="+1 (555) 123-4567"
                      className="bg-background/50 border-primary/30 focus:border-primary/50"
                    />
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setIsEditingAccount(false);
                        setAccountEmail(accountData?.email || "");
                        setAccountPhone(accountData?.phoneNumber || "");
                      }}
                      className="hover:bg-primary hover:text-background"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                    <Button 
                      variant="default" 
                      size="sm"
                      onClick={handleSaveAccount}
                      disabled={updateAccountMutation.isPending}
                      className="hover:bg-primary hover:text-background"
                    >
                      {updateAccountMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              ) : isChangingPassword ? (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="currentPassword" className="flex items-center gap-2 mb-2">
                      <Lock className="h-4 w-4 text-primary" />
                      Current Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="currentPassword"
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                        className="bg-background/50 border-primary/30 focus:border-primary/50 pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      >
                        {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="newPassword" className="flex items-center gap-2 mb-2">
                      <Lock className="h-4 w-4 text-primary" />
                      New Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password (min 6 characters)"
                        className="bg-background/50 border-primary/30 focus:border-primary/50 pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="confirmPassword" className="flex items-center gap-2 mb-2">
                      <Lock className="h-4 w-4 text-primary" />
                      Confirm New Password
                    </Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="bg-background/50 border-primary/30 focus:border-primary/50"
                    />
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setIsChangingPassword(false);
                        setCurrentPassword("");
                        setNewPassword("");
                        setConfirmPassword("");
                      }}
                      className="hover:bg-primary hover:text-background"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                    <Button 
                      variant="default" 
                      size="sm"
                      onClick={handleChangePassword}
                      disabled={changePasswordMutation.isPending}
                      className="hover:bg-primary hover:text-background"
                    >
                      {changePasswordMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Change Password
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-background/30 border border-primary/10 rounded-md">
                    <Mail className="h-4 w-4 text-primary" />
                    <div>
                      <div className="text-xs text-muted-foreground">Email</div>
                      <div className="text-sm">{accountData?.email || "Not set"}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-background/30 border border-primary/10 rounded-md">
                    <Phone className="h-4 w-4 text-primary" />
                    <div>
                      <div className="text-xs text-muted-foreground">Phone</div>
                      <div className="text-sm">{accountData?.phoneNumber || "Not set"}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-background/30 border border-primary/10 rounded-md">
                    <Lock className="h-4 w-4 text-primary" />
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground">Password</div>
                      <div className="text-sm">••••••••</div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setIsChangingPassword(true)}
                      className="hover:bg-primary/10 hover:text-primary"
                    >
                      Change
                    </Button>
                  </div>
                </div>
              )}
            </div>
            
            </div>
          </div>

          </div>

        {/* Draggable Widgets - Stats Log and Settings */}
        <div className="mt-6">
          <DndProvider backend={HTML5Backend}>
            {widgets.map((widget, index) => (
              <DraggableWidget
                key={widget.id}
                id={widget.id}
                index={index}
                title={widget.title}
                icon={widget.icon}
                moveWidget={moveWidget}
                defaultOpen={widget.defaultOpen}
              >
                {renderWidgetContent(widget.id)}
              </DraggableWidget>
            ))}
          </DndProvider>
        </div>
      </div>
    </RootLayout>
  );
}