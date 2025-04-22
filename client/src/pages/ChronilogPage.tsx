import { Link, useLocation } from "wouter";
import { useLYFEOS } from "@/lib/context";
import { usePageTitle } from "@/hooks/use-page-title";
import { FileText, Clock, Tag, Calendar, Award } from "lucide-react";

export default function ChronilogPage() {
  // Set the page title
  usePageTitle('Chronilog');
  
  const { missionPages } = useLYFEOS();
  const [, navigate] = useLocation();
  
  const chronilogCategories = [
    { 
      id: "missions", 
      title: "Mission Logs", 
      icon: "task_alt",
      description: "Documentation of your completed and active missions",
      color: "cyan-400"
    },
    { 
      id: "journal", 
      title: "Journal", 
      icon: "auto_stories",
      description: "Personal reflections and daily entries",
      color: "primary"
    },
    { 
      id: "rituals", 
      title: "Rituals", 
      icon: "repeat",
      description: "Daily and weekly practices to maintain balance",
      color: "secondary"
    },
    { 
      id: "knowledge", 
      title: "Knowledge Base", 
      icon: "school",
      description: "Notes and learnings from books and courses",
      color: "accent"
    },
    { 
      id: "goals", 
      title: "Goals & Vision", 
      icon: "track_changes",
      description: "Long-term objectives and aspirations",
      color: "emerald-400"
    }
  ];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-orbitron mb-1">Chronilog</h1>
        <p className="text-[#7DAAB2]">Your personal timeline of knowledge, reflections, and growth logs.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {chronilogCategories.map((category) => (
          <div 
            key={category.id}
            className="glassmorphic rounded-xl p-6 neon-border hover:shadow-[0_0_10px_var(--primary-glow-medium)] hover:border-primary/60 transition-all duration-300 cursor-pointer"
            onClick={() => {
              // Handle category click based on category.id
              if (category.id === "journal") {
                // Navigate to journal archive
                navigate('/journal-archive');
              } else if (category.id === "missions") {
                // Navigate to mission archive
                navigate('/mission-archive');
              } else if (category.id === "rituals") {
                // Navigate to rituals archive
                navigate('/rituals-archive');
              } else if (category.id === "knowledge") {
                // Navigate to knowledge archive
                navigate('/knowledge-archive');
              } else if (category.id === "goals") {
                // Navigate to goals archive
                navigate('/goals-archive');
              }
            }}
          >
            <div className="flex items-center mb-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 ${
                category.color === 'primary' ? 'bg-primary/20' : 
                category.color === 'secondary' ? 'bg-secondary/20' : 
                category.color === 'accent' ? 'bg-accent/20' : 
                'bg-emerald-400/20'
              }`}>
                <span className={`material-icons text-2xl ${
                  category.color === 'primary' ? 'text-primary' : 
                  category.color === 'secondary' ? 'text-secondary' : 
                  category.color === 'accent' ? 'text-accent' : 
                  'text-emerald-400'
                }`}>{category.icon}</span>
              </div>
              <div>
                <h3 className="text-lg font-orbitron text-[#D6F4FF]">{category.title}</h3>
                <p className="text-xs text-[#7DAAB2]">{category.description}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <button 
                className={`text-xs font-medium px-3 py-1 rounded-md ${
                  category.color === 'primary' ? 'bg-primary/10 text-primary' : 
                  category.color === 'secondary' ? 'bg-secondary/10 text-secondary' : 
                  category.color === 'accent' ? 'bg-accent/10 text-accent' : 
                  'bg-emerald-400/10 text-emerald-400'
                } hover:bg-opacity-20 transition`}
                onClick={(e) => {
                  e.stopPropagation(); // Prevent the parent div's onClick from firing
                  
                  // Handle button click (same logic as div onClick)
                  if (category.id === "journal") {
                    navigate('/journal-archive');
                  } else if (category.id === "missions") {
                    navigate('/mission-archive');
                  } else if (category.id === "rituals") {
                    navigate('/rituals-archive');
                  } else if (category.id === "knowledge") {
                    navigate('/knowledge-archive');
                  } else if (category.id === "goals") {
                    navigate('/goals-archive');
                  }
                }}
              >
                OPEN
              </button>
            </div>
          </div>
        ))}
      </div>
      

    </>
  );
}