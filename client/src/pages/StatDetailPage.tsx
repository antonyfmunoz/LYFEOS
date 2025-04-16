import { useLYFEOS } from "@/lib/context";
import { StatType } from "@/lib/types";
import { Link } from "wouter";
import { 
  ArrowLeft, Clock, Zap, Heart, ChevronRight, 
  Lightbulb, History, TrendingDown, TrendingUp, 
  Activity, Plus, RotateCcw
} from "lucide-react";

interface StatDetailPageProps {
  stat: StatType;
}

export default function StatDetailPage({ stat }: StatDetailPageProps) {
  const { stats } = useLYFEOS();
  
  // Configure based on stat type
  const statConfig = {
    time: {
      title: "Time Tokens",
      icon: "schedule",
      color: "primary",
      current: stats.timeTokens.current,
      max: stats.timeTokens.max,
      description: "Unallocated time remaining today",
      progressClass: "progress-tt",
      dataPoints: [
        { label: "Deep Work", value: 6 },
        { label: "Meetings", value: 3 },
        { label: "Exercise", value: 1 },
        { label: "Rest", value: 2 },
        { label: "Unallocated", value: 12 },
      ],
    },
    energy: {
      title: "Energy Points",
      icon: "bolt",
      color: "secondary",
      current: stats.energyPoints.current,
      max: stats.energyPoints.max,
      description: "Current cognitive and physical capacity",
      progressClass: "progress-ep",
      dataPoints: [
        { label: "Morning", value: 85 },
        { label: "Afternoon", value: 65 },
        { label: "Evening", value: 40 },
        { label: "Current", value: stats.energyPoints.current },
      ],
    },
    health: {
      title: "Health Points",
      icon: "favorite",
      color: "accent",
      current: stats.healthPoints.current,
      max: stats.healthPoints.max,
      description: "Overall physical and mental wellness",
      progressClass: "progress-hp",
      dataPoints: [
        { label: "Sleep", value: 75 },
        { label: "Nutrition", value: 80 },
        { label: "Exercise", value: 70 },
        { label: "Mental", value: 85 },
      ],
    },
  };
  
  const config = statConfig[stat];
  
  // Calculate percentage for progress bar
  const percentage = (config.current / config.max) * 100;
  
  return (
    <>
      <div className="mb-6 flex items-center">
        <Link href="/dashboard">
          <a className="mr-3 flex items-center text-[#7DAAB2] hover:text-primary transition">
            <ArrowLeft size={20} />
          </a>
        </Link>
        <h1 className="text-2xl font-orbitron">{config.title}</h1>
      </div>
      
      {/* Main stat card */}
      <div className="glassmorphic rounded-xl p-6 neon-border mb-8">
        <div className="flex flex-col md:flex-row md:items-center mb-4">
          <div className={`w-16 h-16 rounded-full ${
            stat === 'time' ? 'bg-primary/20' : 
            stat === 'energy' ? 'bg-secondary/20' : 
            'bg-accent/20'
          } flex items-center justify-center mr-4 mb-4 md:mb-0`}>
            <span className={`material-icons text-3xl ${
              stat === 'time' ? 'text-primary' : 
              stat === 'energy' ? 'text-secondary' : 
              'text-accent'
            }`}>{config.icon}</span>
          </div>
          
          <div className="flex-grow">
            <div className="flex items-end justify-between mb-2">
              <div>
                <h2 className="text-3xl font-orbitron">
                  {stat === 'time' 
                    ? <>{config.current}<span className="text-[#7DAAB2] text-lg">/{config.max}</span></>
                    : <>{Math.round(percentage)}%</>
                  }
                </h2>
                <p className="text-sm text-[#7DAAB2]">{config.description}</p>
              </div>
              <div className={`px-3 py-1 rounded-md text-sm ${
                percentage > 70 ? 'bg-[#36F1CD]/20 text-[#36F1CD]' : 
                percentage > 30 ? 'bg-[#FFB800]/20 text-[#FFB800]' : 
                'bg-[#FF3D57]/20 text-[#FF3D57]'
              }`}>
                {percentage > 70 ? 'OPTIMAL' : 
                 percentage > 30 ? 'MODERATE' : 
                 'LOW'}
              </div>
            </div>
            
            <div className={`progress-bar ${config.progressClass} h-3`}>
              <div className="progress-fill" style={{ width: `${percentage}%` }}></div>
            </div>
          </div>
        </div>
        
        <div className="mt-6 pt-6 border-t border-primary/20">
          <h3 className="font-orbitron mb-4">BREAKDOWN</h3>
          
          <div className="space-y-4">
            {config.dataPoints.map((point, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm">{point.label}</span>
                <div className="flex items-center">
                  <div className="w-32 h-2 bg-card/50 rounded-full mr-3 overflow-hidden">
                    <div 
                      className={`h-full ${
                        stat === 'time' ? 'bg-primary' : 
                        stat === 'energy' ? 'bg-secondary' : 
                        'bg-accent'
                      }`}
                      style={{ 
                        width: `${stat === 'time' 
                          ? (point.value / stats.timeTokens.max) * 100 
                          : point.value
                        }%` 
                      }}
                    ></div>
                  </div>
                  <span className="text-sm font-mono w-8 text-right">
                    {stat === 'time' ? `${point.value}h` : `${point.value}%`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Tips section */}
      <div className="mb-6">
        <h2 className="text-xl font-orbitron mb-4">
          {stat === 'time' ? 'Time Management Tips' : 
           stat === 'energy' ? 'Energy Recovery Tips' : 
           'Health Optimization Tips'}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="glassmorphic rounded-xl p-4 neon-border">
            <div className="flex items-start">
              <div className={`w-8 h-8 rounded-full ${
                stat === 'time' ? 'bg-primary/20' : 
                stat === 'energy' ? 'bg-secondary/20' : 
                'bg-accent/20'
              } flex items-center justify-center mr-3 flex-shrink-0 mt-0.5`}>
                <span className={`material-icons text-sm ${
                  stat === 'time' ? 'text-primary' : 
                  stat === 'energy' ? 'text-secondary' : 
                  'text-accent'
                }`}>lightbulb</span>
              </div>
              <div>
                <h3 className="font-medium mb-1">
                  {stat === 'time' ? 'Time Blocking' : 
                   stat === 'energy' ? 'Energy Cycling' : 
                   'Sleep Optimization'}
                </h3>
                <p className="text-sm text-[#7DAAB2]">
                  {stat === 'time' 
                    ? 'Allocate specific time blocks for deep work, meetings, and breaks.' 
                    : stat === 'energy' 
                    ? 'Work with your natural energy rhythms throughout the day.'
                    : 'Aim for 7-8 hours of quality sleep each night for optimal health.'}
                </p>
              </div>
            </div>
          </div>
          
          <div className="glassmorphic rounded-xl p-4 neon-border">
            <div className="flex items-start">
              <div className={`w-8 h-8 rounded-full ${
                stat === 'time' ? 'bg-primary/20' : 
                stat === 'energy' ? 'bg-secondary/20' : 
                'bg-accent/20'
              } flex items-center justify-center mr-3 flex-shrink-0 mt-0.5`}>
                <span className={`material-icons text-sm ${
                  stat === 'time' ? 'text-primary' : 
                  stat === 'energy' ? 'text-secondary' : 
                  'text-accent'
                }`}>lightbulb</span>
              </div>
              <div>
                <h3 className="font-medium mb-1">
                  {stat === 'time' ? 'Pomodoro Technique' : 
                   stat === 'energy' ? 'Strategic Breaks' : 
                   'Nutrition Balance'}
                </h3>
                <p className="text-sm text-[#7DAAB2]">
                  {stat === 'time' 
                    ? 'Work in focused 25-minute intervals with 5-minute breaks.' 
                    : stat === 'energy' 
                    ? 'Take short breaks between tasks to maintain energy levels.'
                    : 'Maintain a balanced diet with proper hydration for sustained energy.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* History/Logs section */}
      <div>
        <h2 className="text-xl font-orbitron mb-4">Recent History</h2>
        
        <div className="glassmorphic rounded-xl p-4 neon-border">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2 border-b border-primary/10">
              <div className="flex items-center">
                <span className="material-icons text-sm text-[#7DAAB2] mr-2">
                  {stat === 'time' ? 'history' : 
                   stat === 'energy' ? 'trending_down' : 
                   'monitor_heart'}
                </span>
                <span>
                  {stat === 'time' ? 'Deep Work Session' : 
                   stat === 'energy' ? 'Energy Depleted' : 
                   'Health Check'}
                </span>
              </div>
              <div className="text-xs text-[#7DAAB2] font-mono">TODAY, 10:45 AM</div>
            </div>
            
            <div className="flex items-center justify-between p-2 border-b border-primary/10">
              <div className="flex items-center">
                <span className="material-icons text-sm text-[#7DAAB2] mr-2">
                  {stat === 'time' ? 'add' : 
                   stat === 'energy' ? 'trending_up' : 
                   'trending_up'}
                </span>
                <span>
                  {stat === 'time' ? 'Time Token Added' : 
                   stat === 'energy' ? 'Energy Recovered' : 
                   'Health Improved'}
                </span>
              </div>
              <div className="text-xs text-[#7DAAB2] font-mono">YESTERDAY, 8:30 PM</div>
            </div>
            
            <div className="flex items-center justify-between p-2">
              <div className="flex items-center">
                <span className="material-icons text-sm text-[#7DAAB2] mr-2">
                  {stat === 'time' ? 'update' : 
                   stat === 'energy' ? 'update' : 
                   'update'}
                </span>
                <span>
                  {stat === 'time' ? 'Daily Reset' : 
                   stat === 'energy' ? 'Weekly Analysis' : 
                   'Monthly Health Report'}
                </span>
              </div>
              <div className="text-xs text-[#7DAAB2] font-mono">3 DAYS AGO, 12:00 AM</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
