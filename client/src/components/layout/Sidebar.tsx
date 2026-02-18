import { Link } from "wouter";
import { useState } from "react";

interface SidebarProps {
  currentPage: string;
  username: string;
}

export default function Sidebar({ currentPage, username }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { id: "dashboard", icon: "dashboard", label: "Dashboard" },
    { id: "missions", icon: "track_changes", label: "Missions" },
    { id: "ai", icon: "smart_toy", label: "AI" },
    { id: "chronilog", icon: "book", label: "Chronilog" },
    { id: "profile", icon: "person", label: "Profile" },
  ];

  return (
    <div
      data-tour="sidebar-nav"
      className={`hidden lg:flex lg:flex-col border-r border-opacity-20 border-primary p-4 glassmorphic transition-all duration-300 ${
        collapsed ? "w-[72px]" : "w-64"
      }`}
    >
      <div className={`flex items-center mb-8 ${collapsed ? "justify-center" : "justify-start"}`}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-card hover:bg-opacity-30 text-muted-foreground transition duration-200"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span className="material-icons text-lg">menu</span>
        </button>
      </div>

      <nav className="flex-grow">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.id}>
              <Link href={`/${item.id}`}
                className={`flex items-center py-2 rounded-lg transition duration-200
                  ${collapsed ? "justify-center px-2" : "px-3"}
                  ${currentPage === item.id
                    ? "bg-card bg-opacity-50 border border-primary border-opacity-30 shadow-[0_0_5px_var(--primary-shadow)] text-primary"
                    : "hover:bg-card hover:bg-opacity-30 text-muted-foreground"
                  }`}
                title={collapsed ? item.label : undefined}
              >
                <span className={`material-icons text-sm ${collapsed ? "" : "mr-3"}`}>{item.icon}</span>
                {!collapsed && <span className="font-medium">{item.label}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="pt-4 border-t border-primary border-opacity-20">
        {!collapsed && (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">SYSTEM</span>
              <span className="text-xs font-mono text-primary flex items-center">
                <span className="w-2 h-2 rounded-full bg-primary mr-1"></span>
                ONLINE
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1 font-mono">v0.9.0-alpha</div>
          </div>
        )}

        {collapsed && (
          <div className="flex justify-center">
            <span className="w-2 h-2 rounded-full bg-primary" title="System Online"></span>
          </div>
        )}
      </div>
    </div>
  );
}
