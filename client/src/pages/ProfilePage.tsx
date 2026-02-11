import React, { useState, useEffect, useCallback } from "react";
import { useWidgetState } from "@/hooks/use-widget-state";
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
  EyeOff,
  Play,
  Pause,
  Repeat
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { DraggableWidget, type DraggableWidgetProps } from '@/components/ui/draggable-widget';
import update from 'immutability-helper';
import type { UserProfile as UserProfileSchema } from "@shared/schema";



function PersistentProfileDraggableWidget({ widgetId, ...props }: Omit<DraggableWidgetProps, 'isOpenProp' | 'onOpenChange'> & { widgetId: string }) {
  const [isOpen, setIsOpen] = useWidgetState(widgetId, props.defaultOpen ?? true);
  return <DraggableWidget {...props} isOpenProp={isOpen} onOpenChange={setIsOpen} />;
}

type ProfileFieldItem = {
  label: string;
  value: any;
  rawValue?: any;
  fieldKey?: string;
  fieldType?: "text" | "array" | "nested";
  nestedPath?: string;
};

function PersistentProfileSection({ section, onSave }: { section: { id: string; title: string; icon: React.ReactNode; items: ProfileFieldItem[] }; onSave?: (updates: Record<string, any>) => Promise<void> }) {
  const [isOpen, setIsOpen] = useWidgetState(`profile.section.${section.id}`, false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = () => {
    const values: Record<string, string> = {};
    section.items.forEach((item) => {
      if (item.fieldKey && item.rawValue !== undefined) {
        const raw = item.rawValue;
        if (raw === null || raw === undefined) {
          values[item.fieldKey] = "";
        } else if (Array.isArray(raw)) {
          values[item.fieldKey] = raw.join(", ");
        } else {
          values[item.fieldKey] = String(raw);
        }
      }
    });
    setEditValues(values);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditValues({});
  };

  const handleSave = async () => {
    if (!onSave) return;
    setIsSaving(true);
    try {
      const updates: Record<string, any> = {};
      section.items.forEach((item) => {
        if (!item.fieldKey) return;
        const raw = editValues[item.fieldKey] ?? "";
        if (item.fieldType === "nested" && item.nestedPath) {
          const parts = item.nestedPath.split(".");
          const topKey = parts[0];
          const subKey = parts[1];
          if (!updates[topKey]) updates[topKey] = {};
          updates[topKey][subKey] = raw || null;
        } else if (item.fieldType === "array") {
          updates[item.fieldKey] = raw ? raw.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
        } else {
          updates[item.fieldKey] = raw || null;
        }
      });
      await onSave(updates);
      setIsEditing(false);
      setEditValues({});
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-card/50 rounded-lg hover:bg-card/70 transition-colors group">
        <div className="flex items-center gap-2">
          {section.icon}
          <span className="text-sm font-medium text-foreground">{section.title}</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-3 pt-2 space-y-2">
          {!isEditing && onSave && (
            <div className="flex justify-end mb-1">
              <button onClick={startEditing} className="text-xs font-mono px-2 py-1 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors inline-flex items-center gap-1">
                <Edit className="h-3 w-3" />
                Edit
              </button>
            </div>
          )}
          {section.items.map((item, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-1 border-b border-primary/5 last:border-0">
              <span className="text-xs text-muted-foreground min-w-[120px]">{item.label}</span>
              {isEditing && item.fieldKey ? (
                <Input
                  value={editValues[item.fieldKey] ?? ""}
                  onChange={(e) => setEditValues({ ...editValues, [item.fieldKey!]: e.target.value })}
                  className="h-7 text-sm flex-1"
                  placeholder={item.fieldType === "array" ? "Comma separated values" : item.label}
                />
              ) : (
                <span className="text-sm text-foreground flex-1">{item.value || "\u2014"}</span>
              )}
            </div>
          ))}
          {isEditing && (
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={cancelEditing} className="text-xs font-mono px-3 py-1.5 rounded border border-muted-foreground/30 text-muted-foreground hover:bg-muted/30 transition-colors inline-flex items-center gap-1">
                <X className="h-3 w-3" />
                Cancel
              </button>
              <button onClick={handleSave} disabled={isSaving} className="text-xs font-mono px-3 py-1.5 rounded border border-primary/50 bg-primary/20 text-primary hover:bg-primary/30 transition-colors inline-flex items-center gap-1 disabled:opacity-50">
                {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </button>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Chakra colors for stats (used for theme colors)
const STAT_COLORS = [
  "#00e0ff", // cyan - Time Tokens (Throat Chakra)
  "#f56565", // red - Health Points (Root Chakra)
  "#ed8936", // orange - Energy Points (Sacral Chakra)
  "#ecc94b", // yellow - Efficiency (Solar Plexus Chakra)
  "#48bb78", // green - Streak (Heart Chakra)
  "#9f7aea", // purple - Experience (Crown Chakra)
];

interface UserProfile {
  id: number;
  username: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  title?: string;
  profilePicture?: string;
}

export default function ProfilePage() {
  // Set the page title
  usePageTitle('Profile');
  
  const { username, stats, updateUserStats, setPrimaryColor: setContextPrimaryColor } = useLYFEOS();
  const { setPrimaryColor: setThemePrimaryColor, toggleDarkMode } = useTheme();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState(username);
  const [isProfileOpen, setIsProfileOpen] = useWidgetState("profile.details", true);
  const [profileData, setProfileData] = useState<UserProfile>({
    id: user?.id || 0,
    username: username,
    displayName: "",
    firstName: "",
    lastName: "",
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
  const [isPlayingAffirmation, setIsPlayingAffirmation] = useState(false);
  const [isLoopingAffirmation, setIsLoopingAffirmation] = useState(false);
  const loopingRef = React.useRef(false);
  const affirmationTextRef = React.useRef("");

  useEffect(() => {
    loopingRef.current = isLoopingAffirmation;
  }, [isLoopingAffirmation]);

  const stopAffirmationPlayback = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsPlayingAffirmation(false);
  }, []);

  const speakAffirmation = useCallback((text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) 
      || voices.find(v => v.lang.startsWith('en'));
    if (preferredVoice) utterance.voice = preferredVoice;
    
    utterance.onend = () => {
      if (loopingRef.current) {
        setTimeout(() => speakAffirmation(text), 500);
      } else {
        setIsPlayingAffirmation(false);
      }
    };
    
    utterance.onerror = () => {
      setIsPlayingAffirmation(false);
    };
    
    window.speechSynthesis.speak(utterance);
  }, []);

  const toggleAffirmationPlayback = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    if (isPlayingAffirmation) {
      stopAffirmationPlayback();
    } else {
      affirmationTextRef.current = text;
      setIsPlayingAffirmation(true);
      speakAffirmation(text);
    }
  }, [isPlayingAffirmation, stopAffirmationPlayback, speakAffirmation]);

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);
  
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
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", user?.id, "profile"] });
      if (data?.username) {
        setEditUsername(data.username);
      }
      setIsEditing(false);
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to update profile. Please try again.";
      toast({
        title: "Error",
        description: message,
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
    infoDescription?: string;
  }

  // Define widgets for drag and drop functionality
  const [widgets, setWidgets] = useState<WidgetData[]>([
    {
      id: 'stats',
      title: "Player Stats",
      icon: <BarChart4 className="h-5 w-5 text-primary" />,
      defaultOpen: true,
      infoDescription: "Overview of your current resource levels — XP, energy, health, time tokens, and attention tokens. These stats reflect your daily activity and progress."
    },
    {
      id: 'player-record',
      title: "Player Record",
      icon: <FileText className="h-5 w-5 text-primary" />,
      defaultOpen: true,
      infoDescription: "Your personal bio and background story. This is your player identity card — edit it to define who you are in the system."
    },
    {
      id: 'player-affirmation',
      title: "Player Affirmation",
      icon: <Terminal className="h-5 w-5 text-primary" />,
      defaultOpen: true,
      infoDescription: "Your personal affirmation or mantra. Set a message that motivates and reminds you of your purpose every time you visit your profile."
    },
    {
      id: 'settings',
      title: "Settings",
      icon: <Settings className="h-5 w-5 text-primary" />,
      defaultOpen: true,
      infoDescription: "Customize the look and feel of your interface. Adjust theme colors, layout preferences, and display options to match your style."
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

    const sections: { id: string; title: string; icon: React.ReactNode; items: ProfileFieldItem[] }[] = [
      {
        id: "identity",
        title: "Identity",
        icon: <User className="h-4 w-4 text-primary" />,
        items: [
          { label: "Primary Archetype", value: profile.archetypePrimary, rawValue: profile.archetypePrimary, fieldKey: "archetypePrimary", fieldType: "text" },
          { label: "Secondary Archetype", value: profile.archetypeSecondary, rawValue: profile.archetypeSecondary, fieldKey: "archetypeSecondary", fieldType: "text" },
          { label: "Shadow Archetype", value: profile.archetypeShadow, rawValue: profile.archetypeShadow, fieldKey: "archetypeShadow", fieldType: "text" },
          { label: "Primary Instincts", value: formatValue(profile.primaryInstincts), rawValue: profile.primaryInstincts, fieldKey: "primaryInstincts", fieldType: "array" },
          { label: "Key Drivers", value: formatValue(profile.keyDrivers), rawValue: profile.keyDrivers, fieldKey: "keyDrivers", fieldType: "array" },
          { label: "Life Stage", value: profile.lifeStage, rawValue: profile.lifeStage, fieldKey: "lifeStage", fieldType: "text" },
        ]
      },
      {
        id: "personality",
        title: "Personality",
        icon: <Brain className="h-4 w-4 text-primary" />,
        items: [
          { label: "Core Belief", value: profile.coreBelief, rawValue: profile.coreBelief, fieldKey: "coreBelief", fieldType: "text" },
          { label: "Primary Values", value: formatValue(profile.primaryValues), rawValue: profile.primaryValues, fieldKey: "primaryValues", fieldType: "array" },
          { label: "Strengths", value: formatValue(profile.strengths), rawValue: profile.strengths, fieldKey: "strengths", fieldType: "array" },
          { label: "Weaknesses", value: formatValue(profile.weaknesses), rawValue: profile.weaknesses, fieldKey: "weaknesses", fieldType: "array" },
          { label: "Desired Emotion", value: profile.desiredEmotion, rawValue: profile.desiredEmotion, fieldKey: "desiredEmotion", fieldType: "text" },
          { label: "Trait to Develop", value: profile.desiredTrait, rawValue: profile.desiredTrait, fieldKey: "desiredTrait", fieldType: "text" },
        ]
      },
      {
        id: "learning",
        title: "Learning & Skills",
        icon: <BookOpen className="h-4 w-4 text-primary" />,
        items: [
          { label: "Domains of Competence", value: formatValue(profile.domainsOfCompetence), rawValue: profile.domainsOfCompetence, fieldKey: "domainsOfCompetence", fieldType: "array" },
          { label: "Skills to Acquire", value: formatValue(profile.skillsToAcquire), rawValue: profile.skillsToAcquire, fieldKey: "skillsToAcquire", fieldType: "array" },
          { label: "Knowledge Areas", value: formatValue(profile.knowledgeAreas), rawValue: profile.knowledgeAreas, fieldKey: "knowledgeAreas", fieldType: "array" },
          { label: "Integration Method", value: profile.integrationMethod, rawValue: profile.integrationMethod, fieldKey: "integrationMethod", fieldType: "text" },
        ]
      },
      {
        id: "projects",
        title: "Projects & Craft",
        icon: <FolderKanban className="h-4 w-4 text-primary" />,
        items: [
          { label: "Primary Craft", value: profile.primaryCraft, rawValue: profile.primaryCraft, fieldKey: "primaryCraft", fieldType: "text" },
          { label: "Why This Craft", value: profile.primaryCraftWhy, rawValue: profile.primaryCraftWhy, fieldKey: "primaryCraftWhy", fieldType: "text" },
          { label: "Active Phase", value: profile.activePhase, rawValue: profile.activePhase, fieldKey: "activePhase", fieldType: "text" },
          { label: "Current Projects", value: formatValue(profile.currentProjects?.map?.((p: any) => p.name)) },
        ]
      },
      {
        id: "health",
        title: "Health & Body",
        icon: <Heart className="h-4 w-4 text-primary" />,
        items: [
          { label: "Training Style", value: profile.fitnessMovement?.trainingStyle, rawValue: profile.fitnessMovement?.trainingStyle, fieldKey: "fitnessMovement_trainingStyle", fieldType: "nested", nestedPath: "fitnessMovement.trainingStyle" },
          { label: "Nutritional Approach", value: profile.nutritionRecovery?.nutritionalApproach, rawValue: profile.nutritionRecovery?.nutritionalApproach, fieldKey: "nutritionRecovery_nutritionalApproach", fieldType: "nested", nestedPath: "nutritionRecovery.nutritionalApproach" },
          { label: "Energy Patterns", value: profile.healthVitality?.energyPatterns, rawValue: profile.healthVitality?.energyPatterns, fieldKey: "healthVitality_energyPatterns", fieldType: "nested", nestedPath: "healthVitality.energyPatterns" },
          { label: "Longevity Focus", value: formatValue(profile.healthVitality?.longevityFocus), rawValue: profile.healthVitality?.longevityFocus, fieldKey: "healthVitality_longevityFocus", fieldType: "nested", nestedPath: "healthVitality.longevityFocus" },
        ]
      },
      {
        id: "wealth",
        title: "Wealth & Work",
        icon: <Wallet className="h-4 w-4 text-primary" />,
        items: [
          { label: "Career/Vocation", value: profile.careerVocation, rawValue: profile.careerVocation, fieldKey: "careerVocation", fieldType: "text" },
          { label: "Active Ventures", value: formatValue(profile.activeVentures), rawValue: profile.activeVentures, fieldKey: "activeVentures", fieldType: "array" },
          { label: "Weekly Capacity", value: profile.weeklyCapacity?.hours ? `${profile.weeklyCapacity.hours} hours` : "\u2014", rawValue: profile.weeklyCapacity?.hours, fieldKey: "weeklyCapacity_hours", fieldType: "nested", nestedPath: "weeklyCapacity.hours" },
          { label: "Physical Environment", value: profile.physicalEnvironment, rawValue: profile.physicalEnvironment, fieldKey: "physicalEnvironment", fieldType: "text" },
        ]
      },
      {
        id: "performance",
        title: "Performance",
        icon: <Zap className="h-4 w-4 text-primary" />,
        items: [
          { label: "Collaboration Style", value: profile.collaborationStyle, rawValue: profile.collaborationStyle, fieldKey: "collaborationStyle", fieldType: "text" },
          { label: "Role Orientation", value: profile.roleOrientation, rawValue: profile.roleOrientation, fieldKey: "roleOrientation", fieldType: "text" },
          { label: "Decision Style", value: profile.decisionOrientation, rawValue: profile.decisionOrientation, fieldKey: "decisionOrientation", fieldType: "text" },
          { label: "Optimal Environment", value: profile.optimalEnvironment, rawValue: profile.optimalEnvironment, fieldKey: "optimalEnvironment", fieldType: "text" },
          { label: "Greatest Contribution", value: profile.greatestContribution, rawValue: profile.greatestContribution, fieldKey: "greatestContribution", fieldType: "text" },
        ]
      },
      {
        id: "style",
        title: "Style & Expression",
        icon: <PaletteIcon className="h-4 w-4 text-primary" />,
        items: [
          { label: "Aesthetic", value: profile.aesthetic, rawValue: profile.aesthetic, fieldKey: "aesthetic", fieldType: "text" },
          { label: "Signature Expression", value: profile.signatureExpression, rawValue: profile.signatureExpression, fieldKey: "signatureExpression", fieldType: "text" },
          { label: "Creative Outlets", value: formatValue(profile.creativeOutlets), rawValue: profile.creativeOutlets, fieldKey: "creativeOutlets", fieldType: "array" },
        ]
      },
    ];

    const handleProfileSectionSave = async (updates: Record<string, any>) => {
      const patchData: Record<string, any> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          patchData[key] = { ...(profile[key] || {}), ...value };
        } else {
          patchData[key] = value;
        }
      }
      try {
        await apiRequest("/api/profile", {
          method: "PATCH",
          body: JSON.stringify(patchData),
        });
        queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      } catch (error) {
        toast({ title: "Error", description: "Failed to save. Please try again.", variant: "destructive" });
        throw error;
      }
    };

    return (
      <div className="space-y-3">
        {sections.map((section) => (
          <PersistentProfileSection key={section.id} section={section} onSave={handleProfileSectionSave} />
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleAffirmationPlayback(affirmation)}
                  className={`text-xs font-mono px-2 py-1 rounded border transition-colors inline-flex items-center gap-1.5 ${
                    isPlayingAffirmation 
                      ? 'bg-primary/30 border-primary text-primary' 
                      : 'bg-primary/20 border-primary/50 text-primary hover:bg-primary/30'
                  }`}
                >
                  {isPlayingAffirmation ? (
                    <>
                      <Pause className="h-3 w-3" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3" />
                      Play
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setIsLoopingAffirmation(!isLoopingAffirmation);
                  }}
                  className={`text-xs font-mono px-2 py-1 rounded border transition-colors inline-flex items-center gap-1.5 ${
                    isLoopingAffirmation 
                      ? 'bg-primary/30 border-primary text-primary' 
                      : 'bg-card/50 border-primary/30 text-muted-foreground hover:text-primary hover:bg-primary/10'
                  }`}
                  title={isLoopingAffirmation ? "Loop is ON" : "Loop is OFF"}
                >
                  <Repeat className="h-3 w-3" />
                  Loop
                </button>
              </div>
              <button
                onClick={handleGenerateAffirmation}
                disabled={isGeneratingAffirmation}
                className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                {isGeneratingAffirmation ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3" />
                    Regenerate
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <Sparkles className="h-8 w-8 text-primary/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              Generate a personalized character affirmation based on your profile data.
            </p>
            <button
              onClick={handleGenerateAffirmation}
              disabled={isGeneratingAffirmation || !profile}
              className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              {isGeneratingAffirmation ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3" />
                  Generate Affirmation
                </>
              )}
            </button>
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
            {/* Account Settings */}
            <div className="p-4 border border-primary/10 rounded-lg bg-background/40 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" />
                  <Label className="text-sm text-foreground">Account</Label>
                </div>
                {!isEditingAccount && !isChangingPassword && (
                  <button onClick={() => setIsEditingAccount(true)} className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors inline-flex items-center gap-1.5">
                    <Edit className="h-3 w-3" />Edit
                  </button>
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
                    <button onClick={() => {
                        setIsEditingAccount(false);
                        setAccountEmail(accountData?.email || "");
                        setAccountPhone(accountData?.phoneNumber || "");
                      }} className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors inline-flex items-center gap-1.5">
                      <X className="h-3 w-3" />Cancel
                    </button>
                    <button onClick={handleSaveAccount} disabled={updateAccountMutation.isPending} className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40 inline-flex items-center gap-1.5">
                      {updateAccountMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="h-3 w-3" />
                      )}
                      Save
                    </button>
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
                    <button onClick={() => {
                        setIsChangingPassword(false);
                        setCurrentPassword("");
                        setNewPassword("");
                        setConfirmPassword("");
                      }} className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors inline-flex items-center gap-1.5">
                      <X className="h-3 w-3" />Cancel
                    </button>
                    <button onClick={handleChangePassword} disabled={changePasswordMutation.isPending} className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40 inline-flex items-center gap-1.5">
                      {changePasswordMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="h-3 w-3" />
                      )}
                      Change Password
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-card/50 rounded-lg border border-primary/10">
                    <Mail className="h-4 w-4 text-primary" />
                    <div>
                      <div className="text-xs text-muted-foreground">Email</div>
                      <div className="text-sm">{accountData?.email ? "••••••••" : "Not set"}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-card/50 rounded-lg border border-primary/10">
                    <Phone className="h-4 w-4 text-primary" />
                    <div>
                      <div className="text-xs text-muted-foreground">Phone</div>
                      <div className="text-sm">{accountData?.phoneNumber ? "••••••••" : "Not set"}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-card/50 rounded-lg border border-primary/10">
                    <Lock className="h-4 w-4 text-primary" />
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground">Password</div>
                      <div className="text-sm">••••••••</div>
                    </div>
                    <button onClick={() => setIsChangingPassword(true)} className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors">
                      Change
                    </button>
                  </div>
                </div>
              )}
            </div>
            
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
                      
                      updateUserStats({
                        ...stats,
                        notificationsEnabled: newValue,
                      });
                    } catch (error) {
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
                <Label className="text-sm text-foreground">Theme Color</Label>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Select your preferred interface color.
              </p>
              <div className="grid grid-cols-3 gap-2">
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
            </div>
          </>
        );
      default:
        return null;
    }
  };

  
  // Function to handle theme color changes
  const handlePrimaryColorChange = (color: string) => {
    setThemePrimaryColor(color);
    setContextPrimaryColor(color);
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
    const computedDisplayName = [profileData.firstName, profileData.lastName].filter(Boolean).join(" ") || profileData.displayName;
    const mutationData: any = {
      displayName: computedDisplayName,
      firstName: profileData.firstName,
      lastName: profileData.lastName,
      profilePicture: profileData.profilePicture,
    };
    if (editUsername && editUsername !== username) {
      mutationData.username = editUsername;
    }
    updateProfileMutation.mutate(mutationData);
  };

  const handleCancel = () => {
    if (profileFromApi) {
      setProfileData({
        ...profileData,
        ...profileFromApi,
      });
    }
    setEditUsername(username);
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
            <div 
              className="p-3 flex items-center justify-between border-b border-primary/20 cursor-pointer hover:bg-primary/5 transition-colors"
              onClick={() => setIsProfileOpen(!isProfileOpen)}
            >
              <div className="flex items-center">
                <User className="mr-2 h-5 w-5 text-primary" />
                <h2 className="text-lg font-orbitron text-foreground">Player Profile</h2>
              </div>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={handleCancel} className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors inline-flex items-center gap-1.5">
                      <X className="h-3 w-3" />Cancel
                    </button>
                    <button onClick={handleSave} disabled={updateProfileMutation.isPending} className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40 inline-flex items-center gap-1.5">
                      <Save className="h-3 w-3" />Save
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditing(true);
                    }}
                    className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors inline-flex items-center gap-1.5"
                  >
                    <Edit className="h-3 w-3" />
                    Edit Profile
                  </button>
                )}
                <div className="text-primary">
                  {isProfileOpen ? <ChevronDown className="h-5 w-5 rotate-180 transition-transform" /> : <ChevronDown className="h-5 w-5 transition-transform" />}
                </div>
              </div>
            </div>
            
            {isProfileOpen && (
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
            </div>
            
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <Label className="flex items-center gap-2 mb-2">
                    <User className="h-4 w-4 text-primary" />
                    Username
                  </Label>
                  <Input
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    placeholder="Enter username"
                    className="bg-background/50 border-primary/30 focus:border-primary/50"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="firstName" className="flex items-center gap-2 mb-2">
                      <User className="h-4 w-4 text-primary" />
                      First Name
                    </Label>
                    <Input
                      id="firstName"
                      name="firstName"
                      value={profileData.firstName || ""}
                      onChange={handleInputChange}
                      placeholder="First name"
                      className="bg-background/50 border-primary/30 focus:border-primary/50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName" className="flex items-center gap-2 mb-2">
                      <User className="h-4 w-4 text-primary" />
                      Last Name
                    </Label>
                    <Input
                      id="lastName"
                      name="lastName"
                      value={profileData.lastName || ""}
                      onChange={handleInputChange}
                      placeholder="Last name"
                      className="bg-background/50 border-primary/30 focus:border-primary/50"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <></>
            )}
            
            
            </div>
            )}
          </div>

          </div>

        {/* Draggable Widgets - Stats Log and Settings */}
        <div className="mt-6">
          <DndProvider backend={HTML5Backend}>
            {widgets.map((widget, index) => (
              <PersistentProfileDraggableWidget
                key={widget.id}
                widgetId={`profile.${widget.id}`}
                id={widget.id}
                index={index}
                title={widget.title}
                icon={widget.icon}
                moveWidget={moveWidget}
                defaultOpen={widget.defaultOpen}
                infoDescription={widget.infoDescription}
              >
                {renderWidgetContent(widget.id)}
              </PersistentProfileDraggableWidget>
            ))}
          </DndProvider>
        </div>
      </div>
    </RootLayout>
  );
}