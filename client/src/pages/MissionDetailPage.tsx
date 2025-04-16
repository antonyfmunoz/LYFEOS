import React, { useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Calendar, Clock, MapPin, Zap, Award, Save, Edit2 } from "lucide-react";
import { useLYFEOS } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

export default function MissionDetailPage() {
  const { missionId } = useParams();
  const { events, updateEvent } = useLYFEOS();
  const { toast } = useToast();
  
  // Find the mission from events based on ID
  const mission = events.find(event => event.id === missionId);
  
  // Handle if mission isn't found
  if (!mission) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="glassmorphic rounded-xl p-8 max-w-xl text-center">
          <h1 className="text-2xl font-orbitron mb-4">Mission Not Found</h1>
          <p className="text-[#7DAAB2] mb-6">The mission you're looking for doesn't exist or may have been deleted.</p>
          <Link href="/dashboard">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" /> Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }
  
  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editedDescription, setEditedDescription] = useState(mission.description || "");

  // Get category-specific styling
  const getCategoryColor = (category: string) => {
    switch (category) {
      case "work":
        return "text-blue-400";
      case "health":
        return "text-red-400";
      case "personal":
        return "text-purple-400";
      default:
        return "text-primary";
    }
  };
  
  const getCategoryBg = (category: string) => {
    switch (category) {
      case "work":
        return "bg-blue-400/20";
      case "health":
        return "bg-red-400/20";
      case "personal":
        return "bg-purple-400/20";
      default:
        return "bg-primary/20";
    }
  };
  
  const getCategoryText = (category: string) => {
    switch (category) {
      case "work":
        return "Work Mission";
      case "health":
        return "Health Mission";
      case "personal":
        return "Personal Mission";
      default:
        return "Mission";
    }
  };
  
  const getLocationText = (category: string) => {
    switch (category) {
      case "work":
        return "Conference Room 3";
      case "health":
        return "Gym";
      case "personal":
        return "Virtual";
      default:
        return "Unknown Location";
    }
  };
  
  const handleSave = () => {
    updateEvent(mission.id, { description: editedDescription });
    setIsEditing(false);
    
    toast({
      title: "Mission Updated",
      description: "Your notes have been saved successfully",
      variant: "default",
      className: "bg-[#001E26] border border-[#36F1CD] text-white",
      duration: 3000,
    });
  };
  
  return (
    <div className="container max-w-5xl py-6">
      {/* Header with back button */}
      <div className="mb-6 flex items-center">
        <Link href="/dashboard" className="mr-3 flex items-center text-[#7DAAB2] hover:text-primary transition">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-orbitron">{mission.title}</h1>
      </div>
      
      {/* Mission information card */}
      <div className="glassmorphic rounded-xl p-6 neon-border mb-8">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left column - Mission metadata */}
          <div className="md:w-1/3">
            <div className={`p-4 rounded-xl ${getCategoryBg(mission.category)} mb-4`}>
              <h2 className={`text-lg font-orbitron ${getCategoryColor(mission.category)}`}>
                {getCategoryText(mission.category)}
              </h2>
              
              <Separator className="my-3 opacity-50" />
              
              <div className="space-y-4 mt-4">
                <div className="flex items-center">
                  <Clock className={`h-4 w-4 ${getCategoryColor(mission.category)} mr-2`} />
                  <span className="text-sm">{mission.startTime} ({mission.duration})</span>
                </div>
                
                <div className="flex items-center">
                  <MapPin className={`h-4 w-4 ${getCategoryColor(mission.category)} mr-2`} />
                  <span className="text-sm">{getLocationText(mission.category)}</span>
                </div>
                
                <div className="flex items-center">
                  <Calendar className={`h-4 w-4 ${getCategoryColor(mission.category)} mr-2`} />
                  <span className="text-sm">Today</span>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-primary/10 rounded-xl">
              <h3 className="font-orbitron text-sm mb-3">MISSION REWARDS</h3>
              
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center">
                  <Zap className="h-4 w-4 text-red-400 mr-2" />
                  <span className="text-sm">Energy Cost</span>
                </div>
                <span className="text-red-400 font-mono">-5</span>
              </div>
              
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <Award className="h-4 w-4 text-[#36F1CD] mr-2" />
                  <span className="text-sm">XP Reward</span>
                </div>
                <span className="text-[#36F1CD] font-mono">+15</span>
              </div>
            </div>
          </div>
          
          {/* Right column - Mission notes */}
          <div className="md:w-2/3">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-orbitron text-lg">Mission Details</h2>
              
              {isEditing ? (
                <div className="flex space-x-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-8 px-3"
                    onClick={handleSave}
                  >
                    <Save className="h-4 w-4 mr-1" /> Save
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-8 px-3"
                    onClick={() => {
                      setEditedDescription(mission.description || "");
                      setIsEditing(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-8 px-3"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit2 className="h-4 w-4 mr-1" /> Edit
                </Button>
              )}
            </div>
            
            {isEditing ? (
              <div className="relative mb-4">
                <textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  placeholder="Enter mission details, notes, and any relevant information..."
                  className="w-full min-h-[300px] p-4 rounded-lg bg-card/50 border border-primary/30 
                            focus:outline-none focus:ring-2 focus:ring-primary/50 
                            transition-all font-mono text-sm leading-relaxed"
                />
              </div>
            ) : (
              <div className="prose prose-invert prose-cyan max-w-none">
                {mission.description ? (
                  <div className="bg-card/30 p-4 rounded-lg border border-primary/20 min-h-[300px]">
                    {mission.description.split('\n').map((paragraph, idx) => (
                      <p key={idx} className="mb-4">{paragraph}</p>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-8 bg-card/30 rounded-lg border border-primary/20">
                    <p className="text-[#7DAAB2] italic">No details available for this mission. Click Edit to add notes.</p>
                  </div>
                )}
              </div>
            )}
            
            <div className="text-xs text-[#7DAAB2] mt-4">
              <p>This mission document is stored in your Codex for future reference.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}