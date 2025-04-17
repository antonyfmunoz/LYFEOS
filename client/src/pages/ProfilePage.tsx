import React from "react";
import RootLayout from "../components/layout/RootLayout";
import { useLYFEOS } from "../lib/context";
import { useAuth } from "@/lib/authContext";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LogOut, ChevronLeft, Clock, Zap, Heart, BrainCircuit, User } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function ProfilePage() {
  const { username, stats } = useLYFEOS();
  const { logout } = useAuth();

  return (
    <RootLayout>
      <div className="max-w-4xl mx-auto px-4 md:px-0">
        <div className="flex items-center gap-2 mb-8">
          <Link 
            href="/dashboard" 
            className="text-primary hover:text-primary/80 transition focus:outline-none focus:ring-2 focus:ring-primary/50 rounded-full p-1"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-orbitron text-foreground tracking-wide">COMMANDER PROFILE</h1>
        </div>

        <div className="bg-black/30 border border-primary/30 backdrop-blur-md rounded-lg p-8 shadow-[0_0_30px_rgba(0,224,255,0.15)] relative">
          {/* Top neon line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_5px_rgba(0,224,255,0.7)]"></div>
          
          <div className="flex flex-col md:flex-row gap-8 items-start">
            {/* Profile image */}
            <div className="relative">
              <div className="w-28 h-28 rounded-full border border-primary/60 flex items-center justify-center bg-black/50 shadow-[0_0_20px_rgba(0,224,255,0.2)]">
                <User className="h-14 w-14 text-primary/90" />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-primary/10 text-primary text-xs font-mono font-semibold py-1 px-2 rounded border border-primary/40 shadow-[0_0_10px_rgba(0,224,255,0.2)] backdrop-blur-sm">
                ACTIVE
              </div>
            </div>
            
            {/* Profile details */}
            <div className="flex-1">
              <h2 className="text-2xl font-orbitron text-foreground mb-2 tracking-wider flex items-center gap-2">
                {username}
                <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded font-mono tracking-widest border border-primary/30">
                  COMMANDER
                </span>
              </h2>
              
              <div className="mb-6 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#7DAAB2] font-mono uppercase tracking-wider">System Level</span>
                  <span className="text-white font-medium">
                    <span className="text-primary font-semibold">{stats.experience.level}</span>
                    <span className="text-[#7DAAB2] ml-2 font-mono">{stats.experience.current}/{stats.experience.max} XP</span>
                  </span>
                </div>
                
                <div className="h-2 bg-black/50 rounded-full border border-primary/30 overflow-hidden shadow-inner">
                  <div 
                    className="h-full bg-gradient-to-r from-primary/70 to-primary rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(0,224,255,0.5)]" 
                    style={{ width: `${(stats.experience.current / stats.experience.max) * 100}%` }}
                  ></div>
                </div>
              </div>
              
              <h3 className="text-lg font-orbitron text-foreground mb-4 uppercase tracking-wider flex items-center">
                <span className="w-8 h-0.5 bg-primary/50 mr-3 shadow-[0_0_5px_rgba(0,224,255,0.5)]"></span>
                System Resources
                <span className="w-8 h-0.5 bg-primary/50 ml-3 shadow-[0_0_5px_rgba(0,224,255,0.5)]"></span>
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Attention Tokens */}
                <div className="p-4 bg-black/40 border border-[#9333ea]/30 rounded-lg shadow-[0_0_15px_rgba(147,51,234,0.1)] backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <BrainCircuit className="h-4 w-4 text-[#9333ea]" />
                    <span className="font-mono text-xs text-[#9333ea] uppercase tracking-wide">Attention</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#7DAAB2] text-xs font-mono">TOKENS</span>
                    <span className="text-[#9333ea] font-mono font-medium text-lg">
                      {stats.attentionTokens?.current || 0}/{stats.attentionTokens?.max || 10}
                    </span>
                  </div>
                </div>
                
                {/* Time Tokens */}
                <div className="p-4 bg-black/40 border border-primary/30 rounded-lg shadow-[0_0_15px_rgba(0,224,255,0.1)] backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="font-mono text-xs text-primary uppercase tracking-wide">Time</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#7DAAB2] text-xs font-mono">TOKENS</span>
                    <span className="text-primary font-mono font-medium text-lg">
                      {stats.timeTokens.current}/{stats.timeTokens.max}
                    </span>
                  </div>
                </div>
                
                {/* Energy Points */}
                <div className="p-4 bg-black/40 border border-[#f97316]/30 rounded-lg shadow-[0_0_15px_rgba(249,115,22,0.1)] backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="h-4 w-4 text-[#f97316]" />
                    <span className="font-mono text-xs text-[#f97316] uppercase tracking-wide">Energy</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#7DAAB2] text-xs font-mono">CAPACITY</span>
                    <span className="text-[#f97316] font-mono font-medium text-lg">
                      {Math.round((stats.energyPoints.current / stats.energyPoints.max) * 100)}%
                    </span>
                  </div>
                </div>
                
                {/* Health Points */}
                <div className="p-4 bg-black/40 border border-[#ef4444]/30 rounded-lg shadow-[0_0_15px_rgba(239,68,68,0.1)] backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Heart className="h-4 w-4 text-[#ef4444]" />
                    <span className="font-mono text-xs text-[#ef4444] uppercase tracking-wide">Health</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#7DAAB2] text-xs font-mono">STATUS</span>
                    <span className="text-[#ef4444] font-mono font-medium text-lg">
                      {Math.round((stats.healthPoints.current / stats.healthPoints.max) * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Logout Button */}
          <div className="mt-10 flex justify-end">
            <Button 
              variant="outline" 
              className="border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-400 rounded-md shadow-[0_0_10px_rgba(239,68,68,0.1)] backdrop-blur-sm"
              onClick={() => {
                logout();
                toast({
                  title: "Logged Out",
                  description: "You have been successfully logged out of LYFEOS.",
                  className: "bg-background border border-primary text-foreground",
                });
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              System Logout
            </Button>
          </div>
          
          {/* Bottom neon line */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[80%] h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_5px_rgba(0,224,255,0.7)]"></div>
        </div>
      </div>
    </RootLayout>
  );
}