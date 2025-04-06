import { Link } from "wouter";

interface SidebarProps {
  currentPage: string;
  username: string;
}

export default function Sidebar({ currentPage, username }: SidebarProps) {
  const navItems = [
    { id: "dashboard", icon: "dashboard", label: "Dashboard" },
    { id: "quests", icon: "star", label: "Quests" },
    { id: "ai", icon: "smart_toy", label: "AI Companion" },
    { id: "codex", icon: "book", label: "Codex" },
    { id: "systems", icon: "settings", label: "Systems" },
  ];

  return (
    <div className="hidden lg:flex lg:flex-col w-64 border-r border-opacity-20 border-primary p-4 glassmorphic">
      {/* App logo */}
      <div className="flex items-center mb-8">
        <span className="text-3xl text-primary font-orbitron font-bold">Life<span className="text-white">OS</span></span>
      </div>

      {/* User profile section */}
      <div className="flex items-center mb-8">
        <div className="relative w-12 h-12 rounded-full overflow-hidden border border-primary shadow-[0_0_5px_rgba(0,224,255,0.3)]">
          {/* User avatar */}
          <div className="bg-primary/20 w-full h-full flex items-center justify-center">
            <span className="material-icons text-primary">person</span>
          </div>
        </div>
        <div className="ml-3">
          <p className="font-orbitron text-sm text-text-primary">COMMANDER</p>
          <p className="text-[#7DAAB2] text-xs">{username}</p>
        </div>
      </div>

      {/* Navigation links */}
      <nav className="flex-grow">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.id}>
              <Link href={`/${item.id}`}
                className={`flex items-center py-2 px-3 rounded-lg
                  ${currentPage === item.id
                    ? "bg-card bg-opacity-50 border border-primary border-opacity-30 shadow-[0_0_5px_rgba(0,224,255,0.3)] text-primary"
                    : "hover:bg-card hover:bg-opacity-30 text-[#7DAAB2] transition duration-200"
                  }`}
              >
                <span className="material-icons text-sm mr-3">{item.icon}</span>
                <span className="font-medium">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* System status */}
      <div className="pt-4 border-t border-primary border-opacity-20">
        <div className="flex items-center justify-between">
          <span className="text-[#7DAAB2] text-xs">SYSTEM</span>
          <span className="text-xs font-mono text-[#36F1CD] flex items-center">
            <span className="w-2 h-2 rounded-full bg-[#36F1CD] mr-1"></span>
            ONLINE
          </span>
        </div>
        <div className="text-xs text-[#7DAAB2] mt-1 font-mono">v0.9.0-alpha</div>
      </div>
    </div>
  );
}
