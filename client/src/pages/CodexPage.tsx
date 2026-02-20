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
      title: "Missions Log", 
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
      title: "Vision", 
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
            className="glassmorphic rounded-xl p-6 neon-border hover:shadow-[0_0_10px_var(--primary-glow-medium)] transition-shadow duration-300 cursor-pointer"
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
              <button className={`text-xs font-medium px-3 py-1 rounded-md ${
                category.color === 'primary' ? 'bg-primary/10 text-primary' : 
                category.color === 'secondary' ? 'bg-secondary/10 text-secondary' : 
                category.color === 'accent' ? 'bg-accent/10 text-accent' : 
                'bg-emerald-400/10 text-emerald-400'
              } hover:bg-opacity-20 transition`}>
                OPEN
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {/* Mission Pages Section */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-orbitron">Missions Log</h2>
          <button 
            className="text-xs font-medium px-3 py-1 rounded-md bg-[#36F1CD]/10 text-[#36F1CD] hover:bg-opacity-20 transition"
            onClick={() => {
              // Create a new blank mission page
              const title = `New Mission Log ${new Date().toLocaleDateString()}`;
              const slug = title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-');
              
              // Create the page in our context
              const newPage = useLYFEOS().createMissionPage({
                title,
                slug,
                content: `# ${title}\n\n## Summary\n\nAdd a brief summary of this mission...\n\n## Tasks\n\n- [ ] First task\n- [ ] Second task\n- [ ] Third task\n\n## Notes\n\nAdd any additional notes or reflections here...`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                completed: false,
                xpValue: 10,
                tags: ['Document', 'Mission']
              });
              
              // Navigate to the new page
              navigate(`/mission-page/${slug}`);
            }}
          >
            NEW PAGE
          </button>
        </div>
        
        <div className="space-y-3">
          {missionPages.length > 0 ? (
            missionPages.map((page) => (
              <div 
                key={page.id} 
                className="glassmorphic rounded-xl p-4 border border-slate-700/50 hover:border-cyan-500/50 cursor-pointer transition-all"
                onClick={() => navigate(`/mission-page/${page.slug}`)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center">
                    <FileText className="h-4 w-4 mr-2 text-[#36F1CD]" />
                    <h3 className="font-medium">{page.title}</h3>
                  </div>
                  <div className="flex items-center">
                    <Clock className="h-3 w-3 mr-1 text-[#7DAAB2]" />
                    <span className="text-xs text-[#7DAAB2] font-mono">
                      {new Date(page.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                
                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-2">
                  {page.tags.map((tag, idx) => (
                    <div key={idx} className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300 flex items-center">
                      <Tag className="h-3 w-3 mr-1" />
                      {tag}
                    </div>
                  ))}
                </div>
                
                <p className="text-sm text-[#7DAAB2] line-clamp-2">
                  {page.content.length > 150 
                    ? page.content.substring(0, 150) + '...' 
                    : page.content}
                </p>
              </div>
            ))
          ) : (
            <div className="text-center py-8 bg-card/30 rounded-lg border border-[#36F1CD]/20">
              <p className="text-[#7DAAB2] mb-3">No mission logs found.</p>
              <button 
                className="text-xs font-medium px-3 py-1 rounded-md bg-[#36F1CD]/10 text-[#36F1CD] hover:bg-opacity-20 transition"
                onClick={() => {
                  // Create a new blank mission page
                  const title = `New Mission Log ${new Date().toLocaleDateString()}`;
                  const slug = title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-');
                  
                  // Create the page in our context
                  const newPage = useLYFEOS().createMissionPage({
                    title,
                    slug,
                    content: `# ${title}\n\n## Summary\n\nAdd a brief summary of this mission...\n\n## Tasks\n\n- [ ] First task\n- [ ] Second task\n- [ ] Third task\n\n## Notes\n\nAdd any additional notes or reflections here...`,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    completed: false,
                    xpValue: 10,
                    tags: ['Document', 'Mission']
                  });
                  
                  // Navigate to the new page
                  navigate(`/mission-page/${slug}`);
                }}
              >
                CREATE YOUR FIRST LOG
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Other Entries Section */}
      <div className="mb-6">
        <h2 className="text-xl font-orbitron mb-4">Recent Journal Entries</h2>
        
        <div className="space-y-3">
          <div className="glassmorphic rounded-xl p-4 border border-slate-700/50">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-medium">Morning Reflection</h3>
              <span className="text-xs text-[#7DAAB2] font-mono">TODAY</span>
            </div>
            <p className="text-sm text-[#7DAAB2] line-clamp-2">
              Today I'm focusing on the product launch strategy. Need to balance deep work with team coordination...
            </p>
          </div>
          
          <div className="glassmorphic rounded-xl p-4 border border-slate-700/50">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-medium">Weekly Review</h3>
              <span className="text-xs text-[#7DAAB2] font-mono">3 DAYS AGO</span>
            </div>
            <p className="text-sm text-[#7DAAB2] line-clamp-2">
              Completed 4/5 major objectives this week. Energy levels were consistent but sleep quality needs improvement...
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
