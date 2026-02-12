import React, { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { LYFEOSProvider } from "./lib/context";
import { AuthProvider, useAuth } from "./lib/authContext";
import { ThemeProvider } from "./lib/themeContext";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { CelebrationProvider, useCelebration } from "./lib/celebrationContext";
import CelebrationOverlay from "./components/CelebrationOverlay";
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
import RootLayout from "./components/layout/RootLayout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import JournalArchivePage from "./pages/JournalArchivePage";
import MissionArchivePage from "./pages/MissionArchivePage";
import RitualsArchivePage from "./pages/RitualsArchivePage";
import KnowledgeArchivePage from "./pages/KnowledgeArchivePage";
import GoalsArchivePage from "./pages/GoalsArchivePage";
import AnalyticsPage from "./pages/AnalyticsPage";
import VoiceOverlay from "./components/VoiceOverlay";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import LoginSuccessPage from "./pages/LoginSuccessPage";
import SubscriptionPage from "./pages/SubscriptionPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const hasAttemptedRedirect = React.useRef(false);
  const [isRecoveringSession, setIsRecoveringSession] = React.useState(false);
  const recoveryAttempted = React.useRef(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !recoveryAttempted.current) {
      const lsUser = localStorage.getItem("lyfeos_user");
      if (lsUser) {
        recoveryAttempted.current = true;
        setIsRecoveringSession(true);

        const timeout = setTimeout(() => {
          setIsRecoveringSession(false);
        }, 5000);

        fetch("/api/auth/me", { credentials: "include" })
          .then(resp => {
            if (resp.ok) {
              console.log("Session restored silently");
            }
          })
          .catch(() => {})
          .finally(() => {
            clearTimeout(timeout);
            setIsRecoveringSession(false);
          });
      }
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (isRecoveringSession || isLoading) return;
    if (hasAttemptedRedirect.current) return;

    if (!isAuthenticated) {
      hasAttemptedRedirect.current = true;
      navigate("/login", { replace: true });
    }
  }, [isAuthenticated, isLoading, isRecoveringSession, navigate]);

  if (isLoading || isRecoveringSession) {
    return <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary fixed top-4 right-4 opacity-70"></div>;
  }

  return isAuthenticated ? <>{children}</> : null;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { triggerCelebration } = useCelebration();
  
  useEffect(() => {
    const pendingName = sessionStorage.getItem("pending_login_celebration");
    if (pendingName !== null && isAuthenticated) {
      sessionStorage.removeItem("pending_login_celebration");
      triggerCelebration({
        type: "mission_complete",
        title: pendingName ? `Welcome back, ${pendingName}!` : "Welcome back!",
        xp: 0,
      });
    }
  }, [isAuthenticated, triggerCelebration]);
  
  // Track if we've already attempted a redirect for the current route
  const routeRedirectRef = React.useRef<string | null>(null);
  
  // Track the authentication state to detect changes
  const wasAuthenticated = React.useRef<boolean | null>(null);
  
  // Track if we are in the process of logging in (use state so effects re-trigger)
  const [isLoginTransition, setIsLoginTransition] = React.useState(false);
  
  // Check if we're in a login transition (the period right after login before session is fully established)
  useEffect(() => {
    if (wasAuthenticated.current === false && isAuthenticated === true) {
      console.log("Login detected - entering transition state");
      setIsLoginTransition(true);
      
      // After a delay, exit the transition state and allow route protection to run
      const timer = setTimeout(() => {
        routeRedirectRef.current = null;
        setIsLoginTransition(false);
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
    if (isLoginTransition) {
      console.log("In login transition - skipping route protection");
      return;
    }
    
    const currentPath = window.location.pathname;
    
    const hasPendingOnboarding = localStorage.getItem("lyfeos-pending-onboarding") === "true";
    const hasPendingRegistration = !!sessionStorage.getItem("lyfeos-pending-registration");

    if (hasPendingOnboarding && !isAuthenticated && !hasPendingRegistration) {
      localStorage.removeItem("lyfeos-pending-onboarding");
      localStorage.removeItem("lyfeos-onboarding-answers");
      localStorage.removeItem("lyfeos-continued-past-mission0");
      localStorage.removeItem("lyfeos-onboarding-resume");
    }

    if (hasPendingOnboarding && (isAuthenticated || hasPendingRegistration)) {
      if (!currentPath.startsWith('/onboarding')) {
        console.log('Pending onboarding detected, redirecting to /onboarding');
        navigate('/onboarding', { replace: true });
      }
      return;
    }
    
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
    const publicPaths = ['/login', '/register', '/login-success'];
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
  }, [isAuthenticated, isLoading, isLoginTransition, navigate]);

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/verify-email" component={VerifyEmailPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/login-success" component={LoginSuccessPage} />
      
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
      
      <Route path="/missions">
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
      
      <Route path="/timeline">
        <ProtectedRoute>
          <RootLayout>
            <TimelinePage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/timeline/:id">
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
      
            
      {/* Log Pages */}
      <Route path="/journal-log">
        <ProtectedRoute>
          <RootLayout>
            <JournalArchivePage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/mission-log">
        <ProtectedRoute>
          <RootLayout>
            <MissionArchivePage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/rituals">
        <ProtectedRoute>
          <RootLayout>
            <RitualsArchivePage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/knowledge-vault">
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

      <Route path="/analytics">
        <ProtectedRoute>
          <RootLayout>
            <AnalyticsPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/subscription">
        <ProtectedRoute>
          <SubscriptionPage />
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
        <CelebrationProvider>
          <LYFEOSProvider>
            <ThemeProvider>
              <DndProvider backend={HTML5Backend}>
                <Router />
                <VoiceOverlay />
                <CelebrationOverlay />
                <Toaster />
              </DndProvider>
            </ThemeProvider>
          </LYFEOSProvider>
        </CelebrationProvider>
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
