import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";

export default function CeremonyPage() {
  usePageTitle("System Online");
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState(0);
  const [statsLoaded, setStatsLoaded] = useState({
    energy: false,
    health: false,
    time: false,
    attention: false,
    xp: false,
  });

  useEffect(() => {
    const phases = [
      { delay: 500, action: () => setPhase(1) },
      { delay: 1500, action: () => setStatsLoaded(prev => ({ ...prev, energy: true })) },
      { delay: 2000, action: () => setStatsLoaded(prev => ({ ...prev, health: true })) },
      { delay: 2500, action: () => setStatsLoaded(prev => ({ ...prev, time: true })) },
      { delay: 3000, action: () => setStatsLoaded(prev => ({ ...prev, attention: true })) },
      { delay: 3500, action: () => setStatsLoaded(prev => ({ ...prev, xp: true })) },
      { delay: 4500, action: () => setPhase(2) },
      { delay: 6500, action: () => navigate("/dashboard") },
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
            <p className="text-primary font-mono text-lg tracking-widest">INITIATING SYSTEM...</p>
          </div>
        )}
        
        {phase === 1 && (
          <div className="space-y-6 animate-fade-in">
            <p className="text-primary font-mono text-sm tracking-wider mb-8">LOADING PLAYER STATS</p>
            
            <div className="space-y-4 w-80">
              <StatBar label="ENERGY TOKENS" loaded={statsLoaded.energy} color="text-green-400" />
              <StatBar label="HEALTH POINTS" loaded={statsLoaded.health} color="text-red-400" />
              <StatBar label="TIME TOKENS" loaded={statsLoaded.time} color="text-blue-400" />
              <StatBar label="ATTENTION TOKENS" loaded={statsLoaded.attention} color="text-purple-400" />
              <StatBar label="EXPERIENCE" loaded={statsLoaded.xp} color="text-primary" />
            </div>
          </div>
        )}
        
        {phase === 2 && (
          <div className="space-y-4 animate-scale-in">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-3xl animate-pulse" />
              <h1 className="relative text-4xl md:text-6xl font-bold text-primary tracking-widest">
                SYSTEM ONLINE
              </h1>
            </div>
            <p className="text-muted-foreground font-mono text-sm animate-fade-in">
              Welcome, Commander
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

function StatBar({ label, loaded, color }: { label: string; loaded: boolean; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono">
        <span className={loaded ? color : "text-muted-foreground"}>{label}</span>
        <span className={loaded ? color : "text-muted-foreground"}>
          {loaded ? "100%" : "..."}
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
