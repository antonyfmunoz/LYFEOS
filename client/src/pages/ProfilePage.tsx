import React from "react";
import RootLayout from "../components/layout/RootLayout";
import { useLifeOS } from "../lib/context";
import { Link } from "wouter";

export default function ProfilePage() {
  const { username, stats } = useLifeOS();

  return (
    <RootLayout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Link 
            href="/dashboard" 
            className="text-[#36F1CD] hover:text-[#36F1CD]/80 transition"
          >
            <span className="material-icons">arrow_back</span>
          </Link>
          <h1 className="text-2xl font-orbitron text-white">Profile</h1>
        </div>

        <div className="bg-[#00222A] border border-[#36F1CD]/20 backdrop-blur-md rounded-lg p-6 shadow-lg"
             style={{ boxShadow: "0 0 20px rgba(54, 241, 205, 0.1)" }}>
          <div className="flex flex-col md:flex-row gap-6 items-start">
            {/* Profile image */}
            <div className="w-24 h-24 rounded-full border-2 border-[#36F1CD]/50 flex items-center justify-center bg-[#001E26]"
                 style={{ boxShadow: "0 0 15px rgba(54, 241, 205, 0.2)" }}>
              <span className="material-icons text-[#36F1CD] text-4xl">person</span>
            </div>
            
            {/* Profile details */}
            <div className="flex-1">
              <h2 className="text-xl font-orbitron text-white mb-1">{username}</h2>
              
              <div className="mb-4 flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs bg-[#36F1CD]/10 text-[#36F1CD] border border-[#36F1CD]/30">
                  Level {stats.experience.level}
                </span>
                <span className="text-[#7DAAB2] text-sm">
                  {stats.experience.current}/{stats.experience.max} XP
                </span>
              </div>
              
              <div className="h-2 mb-6 bg-[#36F1CD]/20 rounded-full">
                <div 
                  className="h-full bg-[#36F1CD] rounded-full transition-all duration-500" 
                  style={{ width: `${(stats.experience.current / stats.experience.max) * 100}%` }}
                ></div>
              </div>
              
              <h3 className="text-lg font-orbitron text-white mb-3">Stats</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Time stats */}
                <div className="p-4 bg-[#001E26] border border-[#36F1CD]/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-icons text-[#36F1CD]">schedule</span>
                    <span className="font-medium">Time</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#7DAAB2]">Tokens</span>
                    <span className="text-white">{stats.timeTokens.current}/{stats.timeTokens.max}</span>
                  </div>
                </div>
                
                {/* Energy stats */}
                <div className="p-4 bg-[#001E26] border border-[#36F1CD]/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-icons text-[#36F1CD]">bolt</span>
                    <span className="font-medium">Energy</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#7DAAB2]">Points</span>
                    <span className="text-white">{stats.energyPoints.current}/{stats.energyPoints.max}</span>
                  </div>
                </div>
                
                {/* Health stats */}
                <div className="p-4 bg-[#001E26] border border-[#36F1CD]/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-icons text-[#36F1CD]">favorite</span>
                    <span className="font-medium">Health</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#7DAAB2]">Points</span>
                    <span className="text-white">{stats.healthPoints.current}/{stats.healthPoints.max}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </RootLayout>
  );
}