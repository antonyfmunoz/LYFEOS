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
            className="glassmorphic rounded-xl p-6 neon-border hover:shadow-[0_0_10px_rgba(0,224,255,0.5)] transition-shadow duration-300 cursor-pointer"
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
      
      {/* Mission Pages Section */}
      <div id="mission-logs-section" className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-orbitron">Mission Logs</h2>
          <button 
            className="text-xs font-medium px-3 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition"
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
                className="glassmorphic rounded-xl p-4 border border-slate-700/50 hover:border-primary/50 cursor-pointer transition-all"
                onClick={() => navigate(`/mission-page/${page.slug}`)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center">
                    <FileText className="h-4 w-4 mr-2 text-primary" />
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
            <div className="text-center py-8 bg-card/30 rounded-lg border border-primary/20">
              <p className="text-[#7DAAB2] mb-3">No mission logs found.</p>
              <button 
                className="text-xs font-medium px-3 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition"
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
      
      {/* Journal Entries Section */}
      <div id="journal-entries-section" className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <h2 className="text-xl font-orbitron">Journal Entries</h2>
            <Link to="/journal-archive" className="ml-3 flex items-center text-xs text-primary hover:underline">
              <span className="material-icons text-xs mr-1">folder_open</span>
              View Archive
            </Link>
          </div>
          <div className="flex gap-2">
            <Link 
              to="/journal-archive"
              className="text-xs font-medium px-3 py-1 rounded-md bg-secondary/10 text-secondary hover:bg-secondary/20 transition flex items-center"
            >
              <span className="material-icons text-xs mr-1">folder</span>
              ARCHIVE
            </Link>
            <button 
              className="text-xs font-medium px-3 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition"
              onClick={() => {
                // Create a new blank journal entry
                const title = `Journal Entry ${new Date().toLocaleDateString()}`;
                const slug = title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-');
                
                // Create the page in our context
                const newPage = useLYFEOS().createMissionPage({
                  title,
                  slug,
                  content: `# ${title}\n\n## Thoughts\n\nStart writing your journal entry here...\n\n## Highlights\n\n- \n- \n- \n\n## Gratitude\n\n- \n- \n- `,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  completed: false,
                  xpValue: 10,
                  tags: ['Journal']
                });
                
                // Navigate to the new page
                navigate(`/mission-page/${slug}`);
              }}
            >
              NEW ENTRY
            </button>
          </div>
        </div>
        
        <div className="space-y-3">
          {missionPages.filter(page => page.tags.includes('Journal') || page.tags.includes('Daily Reflection')).length > 0 ? (
            missionPages
              .filter(page => page.tags.includes('Journal') || page.tags.includes('Daily Reflection'))
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((page) => (
                <div 
                  key={page.id} 
                  className="glassmorphic rounded-xl p-4 border border-slate-700/50 hover:border-primary/50 cursor-pointer transition-all"
                  onClick={() => navigate(`/mission-page/${page.slug}`)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center">
                      <span className="material-icons text-primary mr-2 text-sm">auto_stories</span>
                      <h3 className="font-medium">{page.title}</h3>
                    </div>
                    <div className="flex items-center">
                      <Clock className="h-3 w-3 mr-1 text-[#7DAAB2]" />
                      <span className="text-xs text-[#7DAAB2] font-mono">
                        {new Date(page.createdAt).toLocaleDateString()}
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
            <div className="text-center py-8 bg-card/30 rounded-lg border border-primary/20">
              <p className="text-[#7DAAB2] mb-3">No journal entries found.</p>
              <button 
                className="text-xs font-medium px-3 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition"
                onClick={() => {
                  // Create a new blank journal entry
                  const title = `Journal Entry ${new Date().toLocaleDateString()}`;
                  const slug = title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-');
                  
                  // Create the page in our context
                  const newPage = useLYFEOS().createMissionPage({
                    title,
                    slug,
                    content: `# ${title}\n\n## Thoughts\n\nStart writing your journal entry here...\n\n## Highlights\n\n- \n- \n- \n\n## Gratitude\n\n- \n- \n- `,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    completed: false,
                    xpValue: 10,
                    tags: ['Journal']
                  });
                  
                  // Navigate to the new page
                  navigate(`/mission-page/${slug}`);
                }}
              >
                CREATE YOUR FIRST ENTRY
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}