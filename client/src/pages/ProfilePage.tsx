import React, { useState, useEffect } from "react";
import RootLayout from "../components/layout/RootLayout";
import { useLYFEOS } from "../lib/context";
import { useAuth } from "@/lib/authContext";
import { usePageTitle } from "@/hooks/use-page-title";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import CompactStatsWidget from "../components/dashboard/CompactStatsWidget";
import { 
  LogOut, 
  Edit, 
  Save, 
  X, 
  User,
  Terminal,
  FileText,
  Palette
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const AVATAR_COLORS = [
  "#22d3ee", // cyan (default)
  "#06b6d4", // darker cyan
  "#0ea5e9", // sky blue
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#ec4899", // pink
  "#f43f5e", // rose
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
];

interface UserProfile {
  id: number;
  username: string;
  displayName?: string;
  bio?: string;
  avatarColor?: string;
  title?: string;
}

export default function ProfilePage() {
  // Set the page title
  usePageTitle('Profile');
  
  const { username, stats } = useLYFEOS();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState<UserProfile>({
    id: user?.id || 0,
    username: username,
    displayName: "",
    bio: "",
    avatarColor: "#22d3ee",
    title: "",
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

  const handleColorChange = (color: string) => {
    setProfileData(prev => ({
      ...prev,
      avatarColor: color
    }));
  };

  const handleSave = () => {
    updateProfileMutation.mutate({
      displayName: profileData.displayName,
      bio: profileData.bio,
      avatarColor: profileData.avatarColor,
      title: profileData.title,
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
            {/* Profile image */}
            <div>
              <div 
                className="w-24 h-24 rounded-full border-2 border-primary/50 flex items-center justify-center bg-card"
                style={{ 
                  boxShadow: "0 0 15px rgba(34, 211, 238, 0.2)",
                  backgroundColor: profileData.avatarColor || "#22d3ee",
                  borderColor: `${profileData.avatarColor || "#22d3ee"}50`,
                }}
              >
                <span className="material-icons text-background text-4xl">person</span>
              </div>
              
              {isEditing && (
                <div className="mt-4">
                  <Label className="text-sm text-foreground mb-2 block">Avatar Color</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {AVATAR_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`w-7 h-7 rounded-full transition-all ${
                          profileData.avatarColor === color 
                            ? 'ring-2 ring-offset-2 ring-offset-background ring-primary' 
                            : 'ring-1 ring-primary/20'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => handleColorChange(color)}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Profile details */}
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
                  
                  <div className="bg-card border border-primary/20 rounded-lg p-4">
                    <CompactStatsWidget stats={stats} />
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