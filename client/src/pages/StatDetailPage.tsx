import { useLYFEOS } from "@/lib/context";
import { StatType } from "@/lib/types";
import { Link } from "wouter";
import { usePageTitle } from "@/hooks/use-page-title";
import { 
  ArrowLeft, Clock, Zap, Heart, ChevronRight, 
  Lightbulb, History, TrendingDown, TrendingUp, 
  Activity, Plus, RotateCcw, Award, Focus, BrainCircuit
} from "lucide-react";

interface StatDetailPageProps {
  stat: StatType;
}

export default function StatDetailPage({ stat }: StatDetailPageProps) {
  // Get the appropriate stat title for the page title
  const getStatTitle = () => {
    switch(stat) {
      case 'attention': return 'Attention Tokens';
      case 'time': return 'Time Tokens';
      case 'energy': return 'Energy Tokens';
      case 'health': return 'Health Points';
      case 'experience': return 'Experience';
      default: return 'Stats';
    }
  };
  
  // Set dynamic page title based on the stat type
  usePageTitle(getStatTitle());
  
  const { stats } = useLYFEOS();
  
  // Configure based on stat type
  const statConfig = {
    attention: {
      title: "Attention Tokens",
      icon: <BrainCircuit className="w-8 h-8" />,
      color: "#6366F1", // Indigo (Third Eye)
      current: stats.attentionTokens.current,
      max: stats.attentionTokens.max,
      description: "Focus and attention allocation capacity",
      progressClass: "progress-at",
      dataPoints: [
        { label: "Deep Work", value: 35 },
        { label: "Creative", value: 25 },
        { label: "Learning", value: 20 },
        { label: "Available", value: 20 },
      ],
    },
    time: {
      title: "Time Tokens",
      icon: <Clock className="w-8 h-8" />,
      color: "#22D3EE", // Cyan (Throat)
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
      title: "Energy Tokens",
      icon: <Zap className="w-8 h-8" />,
      color: "#F97316", // Orange (Sacral)
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
      icon: <Heart className="w-8 h-8" />,
      color: "#EF4444", // Red (Root)
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
    experience: {
      title: "Experience Points",
      icon: <Award className="w-8 h-8" />,
      color: "#8B5CF6", // Violet (Crown)
      current: stats.experience.current,
      max: stats.experience.max,
      description: `Level ${stats.experience.level} progress`,
      progressClass: "progress-xp",
      dataPoints: [
        { label: "Missions", value: 65 },
        { label: "Daily Log", value: 20 },
        { label: "Systems", value: 10 },
        { label: "Chronilog", value: 5 },
      ],
    },
  };
  
  const config = statConfig[stat as keyof typeof statConfig];
  
  // Calculate percentage for progress bar
  const percentage = (config.current / config.max) * 100;
  
  return (
    <>
      <div className="mb-6 flex items-center">
        <Link href="/dashboard" className="mr-3 flex items-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition rounded-md p-1">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-orbitron">{config.title}</h1>
      </div>
      
      {/* Main stat card */}
      <div className="glassmorphic rounded-xl p-6 neon-border mb-8">
        <div className="flex flex-col md:flex-row md:items-center mb-4">
          <div className={`w-16 h-16 rounded-full ${
            stat === 'attention' ? 'bg-[#6366F1]/20' : // Indigo (Third Eye)
            stat === 'time' ? 'bg-[#22D3EE]/20' : // Cyan (Throat)
            stat === 'energy' ? 'bg-[#F97316]/20' : // Orange (Sacral)
            stat === 'health' ? 'bg-[#EF4444]/20' : // Red (Root)
            'bg-[#8B5CF6]/20' // Violet (Crown)
          } flex items-center justify-center mr-4 mb-4 md:mb-0`}>
            <div className={
              stat === 'attention' ? 'text-[#6366F1]' : // Indigo (Third Eye)
              stat === 'time' ? 'text-[#22D3EE]' : // Cyan (Throat)
              stat === 'energy' ? 'text-[#F97316]' : // Orange (Sacral)
              stat === 'health' ? 'text-[#EF4444]' : // Red (Root)
              'text-[#8B5CF6]' // Violet (Crown)
            }>
              {config.icon}
            </div>
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
            {config.dataPoints.map((point: { label: string, value: number }, index: number) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm">{point.label}</span>
                <div className="flex items-center">
                  <div className="w-32 h-2 bg-card/50 rounded-full mr-3 overflow-hidden">
                    <div 
                      className={`h-full ${
                        stat === 'attention' ? 'bg-[#6366F1]' : // Indigo (Third Eye)
                        stat === 'time' ? 'bg-[#22D3EE]' : // Cyan (Throat)
                        stat === 'energy' ? 'bg-[#F97316]' : // Orange (Sacral)
                        stat === 'health' ? 'bg-[#EF4444]' : // Red (Root)
                        'bg-[#8B5CF6]' // Violet (Crown)
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
           stat === 'health' ? 'Health Optimization Tips' :
           stat === 'attention' ? 'Focus Enhancement Tips' :
           'Experience Growth Tips'}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="glassmorphic rounded-xl p-4 neon-border">
            <div className="flex items-start">
              <div className={`w-8 h-8 rounded-full ${
                stat === 'attention' ? 'bg-[#6366F1]/20' : // Indigo (Third Eye)
                stat === 'time' ? 'bg-[#22D3EE]/20' : // Cyan (Throat)
                stat === 'energy' ? 'bg-[#F97316]/20' : // Orange (Sacral)
                stat === 'health' ? 'bg-[#EF4444]/20' : // Red (Root)
                'bg-[#8B5CF6]/20' // Violet (Crown)
              } flex items-center justify-center mr-3 flex-shrink-0 mt-0.5`}>
                <Lightbulb className={`w-4 h-4 ${
                  stat === 'attention' ? 'text-[#6366F1]' : // Indigo (Third Eye)
                  stat === 'time' ? 'text-[#22D3EE]' : // Cyan (Throat)
                  stat === 'energy' ? 'text-[#F97316]' : // Orange (Sacral)
                  stat === 'health' ? 'text-[#EF4444]' : // Red (Root)
                  'text-[#8B5CF6]' // Violet (Crown)
                }`} />
              </div>
              <div>
                <h3 className="font-medium mb-1">
                  {stat === 'time' ? 'Time Blocking' : 
                   stat === 'energy' ? 'Energy Cycling' : 
                   stat === 'health' ? 'Sleep Optimization' :
                   stat === 'attention' ? 'Single-tasking' :
                   'Mission Completion'}
                </h3>
                <p className="text-sm text-[#7DAAB2]">
                  {stat === 'time' 
                    ? 'Allocate specific time blocks for deep work, meetings, and breaks.' 
                    : stat === 'energy' 
                    ? 'Work with your natural energy rhythms throughout the day.'
                    : stat === 'health'
                    ? 'Aim for 7-8 hours of quality sleep each night for optimal health.'
                    : stat === 'attention'
                    ? 'Focus fully on one task to completion before switching to another.'
                    : 'Complete daily missions consistently to gain experience faster.'}
                </p>
              </div>
            </div>
          </div>
          
          <div className="glassmorphic rounded-xl p-4 neon-border">
            <div className="flex items-start">
              <div className={`w-8 h-8 rounded-full ${
                stat === 'attention' ? 'bg-[#6366F1]/20' : // Indigo (Third Eye)
                stat === 'time' ? 'bg-[#22D3EE]/20' : // Cyan (Throat)
                stat === 'energy' ? 'bg-[#F97316]/20' : // Orange (Sacral)
                stat === 'health' ? 'bg-[#EF4444]/20' : // Red (Root)
                'bg-[#8B5CF6]/20' // Violet (Crown)
              } flex items-center justify-center mr-3 flex-shrink-0 mt-0.5`}>
                <Lightbulb className={`w-4 h-4 ${
                  stat === 'attention' ? 'text-[#6366F1]' : // Indigo (Third Eye)
                  stat === 'time' ? 'text-[#22D3EE]' : // Cyan (Throat)
                  stat === 'energy' ? 'text-[#F97316]' : // Orange (Sacral)
                  stat === 'health' ? 'text-[#EF4444]' : // Red (Root)
                  'text-[#8B5CF6]' // Violet (Crown)
                }`} />
              </div>
              <div>
                <h3 className="font-medium mb-1">
                  {stat === 'time' ? 'Pomodoro Technique' : 
                   stat === 'energy' ? 'Strategic Breaks' : 
                   stat === 'health' ? 'Nutrition Balance' :
                   stat === 'attention' ? 'Digital Minimalism' :
                   'Daily Reflection'}
                </h3>
                <p className="text-sm text-[#7DAAB2]">
                  {stat === 'time' 
                    ? 'Work in focused 25-minute intervals with 5-minute breaks.' 
                    : stat === 'energy' 
                    ? 'Take short breaks between tasks to maintain energy levels.'
                    : stat === 'health'
                    ? 'Maintain a balanced diet with proper hydration for sustained energy.'
                    : stat === 'attention'
                    ? 'Eliminate unnecessary digital distractions during focus time.'
                    : 'Document your daily progress to gain additional experience points.'}
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
                {stat === 'time' ? (
                  <History className="h-4 w-4 text-[#7DAAB2] mr-2" />
                ) : stat === 'energy' ? (
                  <TrendingDown className="h-4 w-4 text-[#7DAAB2] mr-2" />
                ) : (
                  <Activity className="h-4 w-4 text-[#7DAAB2] mr-2" />
                )}
                <span>
                  {stat === 'time' ? 'Deep Work Session' : 
                   stat === 'energy' ? 'Energy Depleted' : 
                   stat === 'health' ? 'Health Check' :
                   stat === 'attention' ? 'Focus Session' :
                   'XP Gained'}
                </span>
              </div>
              <div className="text-xs text-[#7DAAB2] font-mono">TODAY, 10:45 AM</div>
            </div>
            
            <div className="flex items-center justify-between p-2 border-b border-primary/10">
              <div className="flex items-center">
                {stat === 'time' ? (
                  <Plus className="h-4 w-4 text-[#7DAAB2] mr-2" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-[#7DAAB2] mr-2" />
                )}
                <span>
                  {stat === 'time' ? 'Time Token Added' : 
                   stat === 'energy' ? 'Energy Recovered' : 
                   stat === 'health' ? 'Health Improved' :
                   stat === 'attention' ? 'Attention Reset' :
                   'Level Up Progress'}
                </span>
              </div>
              <div className="text-xs text-[#7DAAB2] font-mono">YESTERDAY, 8:30 PM</div>
            </div>
            
            <div className="flex items-center justify-between p-2">
              <div className="flex items-center">
                <RotateCcw className="h-4 w-4 text-[#7DAAB2] mr-2" />
                <span>
                  {stat === 'time' ? 'Daily Reset' : 
                   stat === 'energy' ? 'Weekly Analysis' : 
                   stat === 'health' ? 'Monthly Health Report' :
                   stat === 'attention' ? 'Focus Analysis' :
                   'Experience Summary'}
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