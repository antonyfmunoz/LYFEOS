import { Link } from "wouter";
import { useLYFEOS } from "../../lib/context";
import { useAuth } from "../../lib/authContext";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";

interface SidebarProps {
  currentPage: string;
  username: string;
}

export default function Sidebar({ currentPage, username }: SidebarProps) {
  const { stats } = useLYFEOS();
  const { user } = useAuth();
  
  // Fetch user profile data
  const { data: profileData } = useQuery({
    queryKey: ["/api/users", user?.id, "profile"],
    queryFn: async () => {
      if (!user?.id) return null;
      const data = await apiRequest(`/api/users/${user.id}/profile`);
      console.log("Profile data fetched:", data);
      return data;
    },
    enabled: !!user?.id,
  });
  const navItems = [
    { id: "dashboard", icon: "dashboard", label: "Dashboard" },
    { id: "quests", icon: "track_changes", label: "Missions" },
    { id: "ai", icon: "smart_toy", label: "AI Assistant" },
    { id: "chronilog", icon: "book", label: "Chronilog" },
    { id: "profile", icon: "person", label: "Profile" },
  ];

  return (
    <div className="hidden lg:flex lg:flex-col w-64 border-r border-opacity-20 border-primary p-4 glassmorphic">
      {/* App logo */}
      <div className="flex items-center mb-8">
        <span className="text-3xl text-primary font-orbitron font-bold">LYFE<span className="text-white">OS</span></span>
      </div>

      {/* User profile section */}
      <div className="flex items-center mb-8">
        <div className="relative w-12 h-12 rounded-full overflow-hidden border border-primary shadow-[0_0_5px_var(--primary-shadow)]">
          {/* User avatar */}
          {profileData?.profilePicture ? (
            <img 
              src={profileData.profilePicture} 
              alt="Profile" 
              className="w-full h-full object-cover"
            />
          ) : (
            <div 
              className="w-full h-full flex items-center justify-center"
              style={{ backgroundColor: profileData?.avatarColor || "var(--primary)" }}
            >
              <span className="material-icons text-background text-lg">person</span>
            </div>
          )}
        </div>
        <div className="ml-3">
          <p className="font-orbitron text-sm text-primary">LEVEL {stats.experience.level}</p>
          <p className="text-muted-foreground text-xs">{profileData?.displayName || username}</p>
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
                    ? "bg-card bg-opacity-50 border border-primary border-opacity-30 shadow-[0_0_5px_var(--primary-shadow)] text-primary"
                    : "hover:bg-card hover:bg-opacity-30 text-muted-foreground transition duration-200"
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
          <span className="text-muted-foreground text-xs">SYSTEM</span>
          <span className="text-xs font-mono text-primary flex items-center">
            <span className="w-2 h-2 rounded-full bg-primary mr-1"></span>
            ONLINE
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-1 font-mono">v0.9.0-alpha</div>
      </div>
    </div>
  );
}
