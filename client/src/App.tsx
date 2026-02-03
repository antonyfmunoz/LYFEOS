import React, { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { LYFEOSProvider } from "./lib/context";
import { AuthProvider, useAuth } from "./lib/authContext";
import { ThemeProvider } from "./lib/themeContext";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import DashboardPage from "./pages/DashboardPage";
import QuestsPage from "./pages/QuestsPage";
import AIPage from "./pages/AIPage";
import ChronilogPage from "./pages/ChronilogPage";
import TimelinePage from "./pages/TimelinePage";
import TimelineDetailPage from "./pages/TimelineDetailPage";
import OnboardingPage from "./pages/OnboardingPage";
import CeremonyPage from "./pages/CeremonyPage";
import ProfilePage from "./pages/ProfilePage";
import StatDetailPage from "./pages/StatDetailPage";
import MissionDetailPage from "./pages/MissionDetailPage";
import CalendarPage from "./pages/CalendarPage";
import KanbanPage from "./pages/KanbanPage";
import KanbanBoardPage from "./pages/KanbanBoardPage";
import StreakDetailPage from "./pages/StreakDetailPage";
import EfficiencyDetailPage from "./pages/EfficiencyDetailPage";
import EnergyDetailPage from "./pages/EnergyDetailPage";
import HealthDetailPage from "./pages/HealthDetailPage";
import AttentionDetailPage from "./pages/AttentionDetailPage";
import TimeDetailPage from "./pages/TimeDetailPage";
import ExperienceDetailPage from "./pages/ExperienceDetailPage";
import NotFound from "./pages/not-found";
import EnhancedMissionPage from "./pages/EnhancedMissionPage";
import MissionPage from "./components/markdown/MissionPage";
import SetupMissionPage from "./components/missions/SetupMissionPage";
import RootLayout from "./components/layout/RootLayout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import JournalArchivePage from "./pages/JournalArchivePage";
import MissionArchivePage from "./pages/MissionArchivePage";
import RitualsArchivePage from "./pages/RitualsArchivePage";
import KnowledgeArchivePage from "./pages/KnowledgeArchivePage";
import GoalsArchivePage from "./pages/GoalsArchivePage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, navigate] = useLocation();
  const hasAttemptedRedirect = React.useRef(false);
  const [sessionRetryCount, setSessionRetryCount] = React.useState(0);
  const [isRedirecting, setIsRedirecting] = React.useState(false);
  
  // Simplified session recovery - only attempt once if needed
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const lsUser = localStorage.getItem("lyfeos_user");
      if (lsUser && sessionRetryCount === 0) {
        setSessionRetryCount(1); // Mark that we've tried recovery
        console.log("Found user in localStorage but session is invalid, attempting silent re-auth");
        
        // Quietly try to restore the session without page reload
        fetch("/api/auth/me", { credentials: "include" })
          .then(resp => {
            if (resp.ok) {
              console.log("Session restored silently");
              // The next auth state update will handle rendering
            }
          })
          .catch(() => {
            // Do nothing on error, the redirect logic will handle it
          });
      }
    }
  }, [isAuthenticated, isLoading, sessionRetryCount]);
  
  // Redirect to login if user is not authenticated and not loading
  useEffect(() => {
    // Skip if we're in the middle of a redirect already
    if (isRedirecting) return;
    
    // Only redirect once if not authenticated after loading completes
    // Wait for session retry if needed (sessionRetryCount > 0)
    const shouldAttemptRedirect = !isAuthenticated && 
                               !isLoading && 
                               !hasAttemptedRedirect.current &&
                               (sessionRetryCount === 0 || sessionRetryCount > 0);
    
    if (shouldAttemptRedirect) {
      setIsRedirecting(true);
      console.log("Not authenticated, redirecting to login from protected route");
      hasAttemptedRedirect.current = true;
      navigate("/login", { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, sessionRetryCount, isRedirecting]);
  
  // Show minimal spinner during initial loading only
  if (isLoading && !localStorage.getItem("lyfeos_user")) {
    return <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary fixed top-4 right-4 opacity-70"></div>;
  }
  
  // If authenticated, render the children, otherwise show nothing
  // (redirect happens via useEffect)
  return isAuthenticated ? <>{children}</> : null;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  
  // Track if we've already attempted a redirect for the current route
  const routeRedirectRef = React.useRef<string | null>(null);
  
  // Track the authentication state to detect changes
  const wasAuthenticated = React.useRef<boolean | null>(null);
  
  // Track if we are in the process of logging in
  const isLoginTransition = React.useRef<boolean>(false);
  
  // Check if we're in a login transition (the period right after login before session is fully established)
  useEffect(() => {
    if (wasAuthenticated.current === false && isAuthenticated === true) {
      console.log("Login detected - entering transition state");
      isLoginTransition.current = true;
      
      // After a delay, exit the transition state
      const timer = setTimeout(() => {
        isLoginTransition.current = false;
        console.log("Login transition complete");
      }, 500);
      
      return () => clearTimeout(timer);
    }
    
    wasAuthenticated.current = isAuthenticated;
  }, [isAuthenticated]);
  
  // Redirect from root to dashboard if authenticated, or to login if not
  useEffect(() => {
    if (isLoading) {
      return; // Wait until auth state is determined
    }
    
    // Skip route protection during login transition
    if (isLoginTransition.current) {
      console.log("In login transition - skipping route protection");
      return;
    }
    
    const currentPath = window.location.pathname;
    
    // Skip if we've already redirected for this path
    if (routeRedirectRef.current === currentPath) {
      return;
    }
    
    // Handle root path redirects
    if (currentPath === '/') {
      routeRedirectRef.current = currentPath;
      if (isAuthenticated) {
        console.log('Authenticated at root, redirecting to dashboard');
        navigate('/dashboard', { replace: true });
      } else {
        console.log('Not authenticated at root, redirecting to login');
        navigate('/login', { replace: true });
      }
      return;
    }
    
    // Skip onboarding path protection - needed for new users
    if (currentPath.startsWith('/onboarding')) {
      console.log('Allowing access to onboarding path for authentication flow');
      return;
    }
    
    // Skip login/register page protection
    if (currentPath === '/login' || currentPath === '/register') {
      return;
    }
    
    // Public paths that don't require auth
    const publicPaths = ['/login', '/register'];
    if (publicPaths.some(path => currentPath.startsWith(path))) {
      return;
    }
    
    // If we're already at dashboard after login, don't redirect again
    if (isAuthenticated && currentPath === '/dashboard') {
      console.log('Already at dashboard, skipping redirect');
      return;
    }
    
    // All other paths are considered protected
    if (!isAuthenticated) {
      console.log('Unauthorized access attempt to protected path:', currentPath);
      routeRedirectRef.current = currentPath;
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      
      {/* Onboarding route - requires auth but has special handling */}
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/ceremony" component={CeremonyPage} />
      
      {/* Wrap main app routes in the layout component */}
      <Route path="/dashboard">
        <ProtectedRoute>
          <RootLayout>
            <DashboardPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/active-missions">
        <ProtectedRoute>
          <RootLayout>
            <QuestsPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/ai">
        <ProtectedRoute>
          <RootLayout>
            <AIPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/chronilog">
        <ProtectedRoute>
          <RootLayout>
            <ChronilogPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/chronilog/timeline">
        <ProtectedRoute>
          <RootLayout>
            <TimelinePage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/chronilog/timeline/:id">
        <ProtectedRoute>
          <RootLayout>
            <TimelineDetailPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      {/* Keep old route for compatibility, redirects to new route */}
      <Route path="/codex">
        <ProtectedRoute>
          <RootLayout>
            <ChronilogPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      
      <Route path="/calendar">
        <ProtectedRoute>
          <RootLayout>
            <CalendarPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/kanban">
        <ProtectedRoute>
          <RootLayout>
            <KanbanPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/kanban/board/:boardId">
        <ProtectedRoute>
          <RootLayout>
            <KanbanBoardPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/attention">
        <ProtectedRoute>
          <RootLayout>
            <AttentionDetailPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/time">
        <ProtectedRoute>
          <RootLayout>
            <TimeDetailPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/energy">
        <ProtectedRoute>
          <RootLayout>
            <EnergyDetailPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/health">
        <ProtectedRoute>
          <RootLayout>
            <HealthDetailPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/experience">
        <ProtectedRoute>
          <RootLayout>
            <ExperienceDetailPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/streak">
        <ProtectedRoute>
          <RootLayout>
            <StreakDetailPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/efficiency">
        <ProtectedRoute>
          <RootLayout>
            <EfficiencyDetailPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/profile">
        <ProtectedRoute>
          <ProfilePage />
        </ProtectedRoute>
      </Route>
      
      <Route path="/mission/:missionId">
        <ProtectedRoute>
          <RootLayout>
            <MissionDetailPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      {/* Mission Page route with slug */}
      <Route path="/mission-page/:slug">
        <ProtectedRoute>
          <RootLayout>
            <div className="container max-w-4xl py-6">
              <EnhancedMissionPage />
            </div>
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      {/* Setup Mission Page route */}
      <Route path="/setup-mission/:slug">
        <ProtectedRoute>
          <RootLayout>
            <SetupMissionPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      {/* Archive Pages */}
      <Route path="/journal-archive">
        <ProtectedRoute>
          <RootLayout>
            <JournalArchivePage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/mission-archive">
        <ProtectedRoute>
          <RootLayout>
            <MissionArchivePage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/rituals-archive">
        <ProtectedRoute>
          <RootLayout>
            <RitualsArchivePage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/knowledge-archive">
        <ProtectedRoute>
          <RootLayout>
            <KnowledgeArchivePage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/goals-archive">
        <ProtectedRoute>
          <RootLayout>
            <GoalsArchivePage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      {/* Redirect to dashboard if authenticated, or login if not */}
      <Route path="/">
        {isAuthenticated ? (
          <RootLayout>
            <DashboardPage />
          </RootLayout>
        ) : <LoginPage />}
      </Route>
      
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <AuthProvider>
      <FirebaseOAuthHandler>
        <LYFEOSProvider>
          <ThemeProvider>
            <DndProvider backend={HTML5Backend}>
              <Router />
              <Toaster />
            </DndProvider>
          </ThemeProvider>
        </LYFEOSProvider>
      </FirebaseOAuthHandler>
    </AuthProvider>
  );
}

// Component to handle Firebase OAuth redirects
function FirebaseOAuthHandler({ children }: { children: React.ReactNode }) {
  const { handleOAuthRedirect } = useAuth();
  
  // Check for redirect result when component mounts
  useEffect(() => {
    const checkRedirect = async () => {
      try {
        await handleOAuthRedirect();
      } catch (error) {
        console.error("Error handling OAuth redirect:", error);
      }
    };
    
    checkRedirect();
  }, [handleOAuthRedirect]);
  
  return <>{children}</>;
}

export default App;
