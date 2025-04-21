import React, { useState, useEffect } from "react";
import RootLayout from "../components/layout/RootLayout";
import { useLYFEOS } from "../lib/context";
import { useAuth } from "@/lib/authContext";
import { useTheme } from "@/lib/themeContext";
import { usePageTitle } from "@/hooks/use-page-title";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  LogOut, 
  Edit, 
  Save, 
  X, 
  User,
  Terminal,
  FileText,
  Palette,
  Upload,
  Camera,
  Paintbrush
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";



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
  avatarColor?: string;
  title?: string;
  profilePicture?: string;
}

export default function ProfilePage() {
  // Set the page title
  usePageTitle('Profile');
  
  const { username, stats } = useLYFEOS();
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


  
  // Function to handle theme color changes
  const handlePrimaryColorChange = (color: string) => {
    // Use the context function to update the primary color
    setPrimaryColor(color);
    
    toast({
      title: "Theme Color Updated",
      description: "Your UI theme color has been changed",
      className: "bg-[#001E26] border border-[#36F1CD] text-white",
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
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <Link 
              href="/dashboard" 
              className="text-primary hover:text-primary/80 transition"
            >
              <span className="material-icons">arrow_back</span>
            </Link>
            <h1 className="text-2xl font-orbitron text-foreground">Profile</h1>
          </div>
          <div className="bg-background border border-primary/20 backdrop-blur-md rounded-lg p-6 shadow-lg flex items-center justify-center h-96">
            <div className="animate-pulse flex space-x-4">
              <div className="rounded-full bg-primary/20 h-12 w-12"></div>
              <div className="flex-1 space-y-4 py-1">
                <div className="h-4 bg-primary/20 rounded w-3/4"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-primary/20 rounded"></div>
                  <div className="h-4 bg-primary/20 rounded w-5/6"></div>
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
        <div className="flex items-center gap-2 mb-6">
          <Link 
            href="/dashboard" 
            className="text-primary hover:text-primary/80 transition"
          >
            <span className="material-icons">arrow_back</span>
          </Link>
          <h1 className="text-2xl font-orbitron text-foreground">Profile</h1>
          
          {/* Edit/Save buttons */}
          <div className="ml-auto">
            {isEditing ? (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleCancel}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={handleSave}
                  disabled={updateProfileMutation.isPending}
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
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit Profile
              </Button>
            )}
          </div>
        </div>

        {updateProfileMutation.isError && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>
              Failed to update profile. Please try again.
            </AlertDescription>
          </Alert>
        )}

        <div className="bg-background border border-primary/20 backdrop-blur-md rounded-lg p-6 shadow-lg"
             style={{ boxShadow: "0 0 20px rgba(34, 211, 238, 0.1)" }}>
          <div className="flex flex-col md:flex-row gap-6 items-start">
            {/* Left Column: Profile image & Theme Customization */}
            <div className="md:w-64">
              {/* Profile Image */}
              <div 
                className="w-24 h-24 rounded-full border-2 border-primary/50 relative overflow-hidden mb-6"
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
              
              {/* Primary Theme Color Selector */}
              <div className="p-4 border border-primary/10 rounded-lg bg-background/40">
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
            </div>
            
            {/* Right Column: Profile details */}
            <div className="flex-1">
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
                  <h2 className="text-xl font-orbitron text-foreground mb-1">
                    {profileData.displayName || username}
                  </h2>
                  
                  {profileData.title && (
                    <p className="text-primary text-sm mb-2 font-medium">{profileData.title}</p>
                  )}
                  
                  {profileData.bio && (
                    <div className="p-4 bg-background/30 border border-primary/10 rounded-md my-4 text-muted-foreground">
                      {profileData.bio}
                    </div>
                  )}
                  
                  <div className="mb-4 flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs bg-primary/10 text-primary border border-primary/30">
                      Level {stats.experience.level}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {stats.experience.current}/{stats.experience.max} XP
                    </span>
                  </div>
                  
                  <div className="h-2 mb-6 bg-primary/20 rounded-full">
                    <div 
                      className="h-full bg-primary rounded-full transition-all duration-500" 
                      style={{ width: `${(stats.experience.current / stats.experience.max) * 100}%` }}
                    ></div>
                  </div>
                </>
              )}
              
              {!isEditing && (
                <>
                  <h3 className="text-lg font-orbitron text-foreground mb-3">Stats</h3>
                  
                  {/* Stats Overview Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="glassmorphic rounded-xl p-4 neon-border">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <span className="material-icons text-primary mr-2">calendar_month</span>
                          <h3 className="font-orbitron text-[#D6F4FF]">STREAK</h3>
                        </div>
                        <div className="text-right">
                          <p className="text-[#D6F4FF] font-mono text-xl">{stats.streakDays}<span className="text-[#7DAAB2] text-xs"> DAYS</span></p>
                        </div>
                      </div>
                      <div className="h-1 bg-primary/30 rounded-full mb-2">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, stats.streakDays)}%` }}></div>
                      </div>
                      <p className="text-xs text-[#7DAAB2]">Consecutive days using LYFEOS</p>
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
                          <p className="text-[#D6F4FF] font-mono text-xl">{stats.efficiencyScore}<span className="text-[#7DAAB2] text-xs">%</span></p>
                        </div>
                      </div>
                      <div className="h-1 bg-secondary/30 rounded-full mb-2">
                        <div className="h-full bg-secondary rounded-full" style={{ width: `${stats.efficiencyScore}%` }}></div>
                      </div>
                      <p className="text-xs text-[#7DAAB2]">Overall system optimization score</p>
                    </div>
                  </div>
                  
                  {/* Detailed Stats Section */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Attention Tokens */}
                    <div className="p-4 bg-card border border-indigo-500/20 rounded-lg" style={{ boxShadow: "0 0 10px rgba(99, 102, 241, 0.1)" }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="material-icons text-indigo-500">visibility</span>
                        <span className="font-medium">Attention</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Tokens</span>
                        <span className="text-foreground">{stats.attentionTokens.current}/{stats.attentionTokens.max}</span>
                      </div>
                      <div className="mt-2 h-1.5 bg-indigo-500/20 rounded-full">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(stats.attentionTokens.current / stats.attentionTokens.max) * 100}%` }}></div>
                      </div>
                    </div>
                    
                    {/* Time Tokens */}
                    <div className="p-4 bg-card border border-cyan-500/20 rounded-lg" style={{ boxShadow: "0 0 10px rgba(34, 211, 238, 0.1)" }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="material-icons text-cyan-500">schedule</span>
                        <span className="font-medium">Time</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Tokens</span>
                        <span className="text-foreground">{stats.timeTokens.current}/{stats.timeTokens.max}</span>
                      </div>
                      <div className="mt-2 h-1.5 bg-cyan-500/20 rounded-full">
                        <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${(stats.timeTokens.current / stats.timeTokens.max) * 100}%` }}></div>
                      </div>
                    </div>
                    
                    {/* Energy Points */}
                    <div className="p-4 bg-card border border-orange-500/20 rounded-lg" style={{ boxShadow: "0 0 10px rgba(249, 115, 22, 0.1)" }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="material-icons text-orange-500">bolt</span>
                        <span className="font-medium">Energy</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Points</span>
                        <span className="text-foreground">{stats.energyPoints.current}/{stats.energyPoints.max}</span>
                      </div>
                      <div className="mt-2 h-1.5 bg-orange-500/20 rounded-full">
                        <div className="h-full bg-orange-500 rounded-full" style={{ width: `${(stats.energyPoints.current / stats.energyPoints.max) * 100}%` }}></div>
                      </div>
                    </div>
                    
                    {/* Health Points */}
                    <div className="p-4 bg-card border border-rose-500/20 rounded-lg" style={{ boxShadow: "0 0 10px rgba(244, 63, 94, 0.1)" }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="material-icons text-rose-500">favorite</span>
                        <span className="font-medium">Health</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Points</span>
                        <span className="text-foreground">{stats.healthPoints.current}/{stats.healthPoints.max}</span>
                      </div>
                      <div className="mt-2 h-1.5 bg-rose-500/20 rounded-full">
                        <div className="h-full bg-rose-500 rounded-full" style={{ width: `${(stats.healthPoints.current / stats.healthPoints.max) * 100}%` }}></div>
                      </div>
                    </div>
                    
                    {/* Streak Days */}
                    <div className="p-4 bg-card border border-green-500/20 rounded-lg" style={{ boxShadow: "0 0 10px rgba(34, 197, 94, 0.1)" }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="material-icons text-green-500">calendar_today</span>
                        <span className="font-medium">Streak</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Days</span>
                        <span className="text-foreground">{stats.streakDays}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-start gap-1">
                        {[...Array(7)].map((_, i) => (
                          <div 
                            key={i} 
                            className={`h-2 w-2 rounded-full ${i < Math.min(stats.streakDays, 7) ? 'bg-green-500' : 'bg-green-500/20'}`}
                          ></div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Efficiency Score */}
                    <div className="p-4 bg-card border border-yellow-500/20 rounded-lg" style={{ boxShadow: "0 0 10px rgba(234, 179, 8, 0.1)" }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="material-icons text-yellow-500">speed</span>
                        <span className="font-medium">Efficiency</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Score</span>
                        <span className="text-foreground">{stats.efficiencyScore}/100</span>
                      </div>
                      <div className="mt-2 h-1.5 bg-yellow-500/20 rounded-full">
                        <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${stats.efficiencyScore}%` }}></div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          
          {/* Logout Button */}
          <div className="mt-8 flex justify-end">
            <Button 
              variant="outline" 
              className="border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-400"
              onClick={logout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    </RootLayout>
  );
}