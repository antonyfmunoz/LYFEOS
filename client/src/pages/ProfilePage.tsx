import React from "react";
import RootLayout from "../components/layout/RootLayout";
import { useLYFEOS } from "../lib/context";
import { useAuth } from "@/lib/authContext";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function ProfilePage() {
  const { username, stats } = useLYFEOS();
  const { logout } = useAuth();

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

        <div className="bg-background border border-primary/20 backdrop-blur-md rounded-lg p-6 shadow-lg"
             style={{ boxShadow: "0 0 20px rgba(34, 211, 238, 0.1)" }}>
          <div className="flex flex-col md:flex-row gap-6 items-start">
            {/* Profile image */}
            <div className="w-24 h-24 rounded-full border-2 border-primary/50 flex items-center justify-center bg-card"
                 style={{ boxShadow: "0 0 15px rgba(34, 211, 238, 0.2)" }}>
              <span className="material-icons text-primary text-4xl">person</span>
            </div>
            
            {/* Profile details */}
            <div className="flex-1">
              <h2 className="text-xl font-orbitron text-foreground mb-1">{username}</h2>
              
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
              
              <h3 className="text-lg font-orbitron text-foreground mb-3">Stats</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Time stats */}
                <div className="p-4 bg-card border border-primary/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-icons text-primary">schedule</span>
                    <span className="font-medium">Time</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Tokens</span>
                    <span className="text-foreground">{stats.timeTokens.current}/{stats.timeTokens.max}</span>
                  </div>
                </div>
                
                {/* Energy stats */}
                <div className="p-4 bg-card border border-primary/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-icons text-primary">bolt</span>
                    <span className="font-medium">Energy</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Points</span>
                    <span className="text-foreground">{Math.round((stats.energyPoints.current / stats.energyPoints.max) * 100)}%</span>
                  </div>
                </div>
                
                {/* Health stats */}
                <div className="p-4 bg-card border border-primary/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-icons text-primary">favorite</span>
                    <span className="font-medium">Health</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Points</span>
                    <span className="text-foreground">{Math.round((stats.healthPoints.current / stats.healthPoints.max) * 100)}%</span>
                  </div>
                </div>
              </div>
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