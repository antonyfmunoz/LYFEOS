export default function CodexPage() {
  const codexCategories = [
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
        <h1 className="text-2xl font-orbitron mb-1">Codex</h1>
        <p className="text-[#7DAAB2]">Your personal repository of knowledge, reflections, and growth.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {codexCategories.map((category) => (
          <div 
            key={category.id}
            className="glassmorphic rounded-xl p-6 neon-border hover:shadow-[0_0_10px_rgba(0,224,255,0.5)] transition-shadow duration-300 cursor-pointer"
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
      
      <div className="mb-6">
        <h2 className="text-xl font-orbitron mb-4">Recent Entries</h2>
        
        <div className="space-y-3">
          <div className="glassmorphic rounded-xl p-4 neon-border">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-medium">Morning Reflection</h3>
              <span className="text-xs text-[#7DAAB2] font-mono">TODAY</span>
            </div>
            <p className="text-sm text-[#7DAAB2] line-clamp-2">
              Today I'm focusing on the product launch strategy. Need to balance deep work with team coordination...
            </p>
          </div>
          
          <div className="glassmorphic rounded-xl p-4 neon-border">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-medium">Weekly Review</h3>
              <span className="text-xs text-[#7DAAB2] font-mono">3 DAYS AGO</span>
            </div>
            <p className="text-sm text-[#7DAAB2] line-clamp-2">
              Completed 4/5 major objectives this week. Energy levels were consistent but sleep quality needs improvement...
            </p>
          </div>
          
          <div className="glassmorphic rounded-xl p-4 neon-border">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-medium">Book Notes: Deep Work</h3>
              <span className="text-xs text-[#7DAAB2] font-mono">1 WEEK AGO</span>
            </div>
            <p className="text-sm text-[#7DAAB2] line-clamp-2">
              Key insights: 1) Schedule deep work blocks in advance, 2) Establish rituals to minimize friction...
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
