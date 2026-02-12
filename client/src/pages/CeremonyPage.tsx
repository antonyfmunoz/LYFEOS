import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/lib/authContext";

export default function CeremonyPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [phase, setPhase] = useState(0);
  const [statsLoaded, setStatsLoaded] = useState({
    level: false,
    energy: false,
    health: false,
    time: false,
    attention: false,
    efficiency: false,
  });

  const ceremonyMode = localStorage.getItem("lyfeos-ceremony-mode") || "init";
  const isUpdate = ceremonyMode === "update";
  const isLogin = ceremonyMode === "login";
  
  const pageTitle = isLogin ? "Welcome Back" : isUpdate ? "System Updated" : "System Online";
  usePageTitle(pageTitle);

  useEffect(() => {
    const resumeData = localStorage.getItem("lyfeos-onboarding-resume");
    const destination = resumeData ? "/onboarding" : "/dashboard";
    
    localStorage.removeItem("lyfeos-ceremony-mode");

    const phases = [
      { delay: 500, action: () => setPhase(1) },
      { delay: 1200, action: () => setStatsLoaded(prev => ({ ...prev, level: true })) },
      { delay: 1700, action: () => setStatsLoaded(prev => ({ ...prev, energy: true })) },
      { delay: 2200, action: () => setStatsLoaded(prev => ({ ...prev, health: true })) },
      { delay: 2700, action: () => setStatsLoaded(prev => ({ ...prev, time: true })) },
      { delay: 3200, action: () => setStatsLoaded(prev => ({ ...prev, attention: true })) },
      { delay: 3700, action: () => setStatsLoaded(prev => ({ ...prev, efficiency: true })) },
      { delay: 4700, action: () => setPhase(2) },
      { delay: 6700, action: () => { sessionStorage.setItem("lyfeos_ceremony_complete", "true"); navigate(destination); } },
    ];

    const timeouts = phases.map(({ delay, action }) => 
      setTimeout(action, delay)
    );

    return () => timeouts.forEach(clearTimeout);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-primary/5" />
      
      <div className="relative z-10 text-center space-y-8">
        {phase === 0 && (
          <div className="animate-pulse">
            <p className="text-primary font-mono text-lg tracking-widest">
              {isLogin ? "RECONNECTING..." : isUpdate ? "UPDATING SYSTEM..." : "INITIATING SYSTEM..."}
            </p>
          </div>
        )}
        
        {phase === 1 && (
          <div className="space-y-6 animate-fade-in">
            <p className="text-primary font-mono text-sm tracking-wider mb-8">
              {isLogin ? "RESTORING PLAYER STATS" : isUpdate ? "SYNCING PLAYER STATS" : "LOADING PLAYER STATS"}
            </p>
            
            <div className="space-y-4 w-80">
              <StatBar label="LEVEL" loaded={statsLoaded.level} value="1" />
              <StatBar label="ENERGY POINTS" loaded={statsLoaded.energy} value="100 / 100" />
              <StatBar label="HEALTH POINTS" loaded={statsLoaded.health} value="100 / 100" />
              <StatBar label="TIME TOKENS" loaded={statsLoaded.time} value="100 / 100" />
              <StatBar label="ATTENTION TOKENS" loaded={statsLoaded.attention} value="100 / 100" />
              <StatBar label="EFFICIENCY SCORE" loaded={statsLoaded.efficiency} value="0%" />
            </div>
          </div>
        )}
        
        {phase === 2 && (
          <div className="space-y-4 animate-scale-in">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-3xl animate-pulse" />
              <h1 className="relative text-4xl md:text-6xl font-bold text-primary tracking-widest">
                {isLogin ? "WELCOME BACK" : isUpdate ? "SYSTEM UPDATED" : "SYSTEM ONLINE"}
              </h1>
            </div>
            <p className="text-muted-foreground font-mono text-sm animate-fade-in">
              Welcome, {user?.username || "Player"}
            </p>
          </div>
        )}
      </div>
      
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes fill-bar {
          from { width: 0%; }
          to { width: 100%; }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
        .animate-scale-in {
          animation: scale-in 0.5s ease-out forwards;
        }
        .animate-fill-bar {
          animation: fill-bar 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

function StatBar({ label, loaded, value }: { label: string; loaded: boolean; value: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono">
        <span className={loaded ? "text-primary" : "text-muted-foreground"}>{label}</span>
        <span className={loaded ? "text-primary" : "text-muted-foreground"}>
          {loaded ? value : "..."}
        </span>
      </div>
      <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-400 ${loaded ? "animate-fill-bar" : ""}`}
          style={{ 
            backgroundColor: loaded ? "hsl(var(--primary))" : "transparent",
            width: loaded ? "100%" : "0%"
          }}
        />
      </div>
    </div>
  );
}
