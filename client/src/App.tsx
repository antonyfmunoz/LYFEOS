import React, { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { LYFEOSProvider } from "./lib/context";
import { AuthProvider, useAuth } from "./lib/authContext";
import { ThemeProvider } from "./lib/themeContext";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";
import { CelebrationProvider } from "./lib/celebrationContext";
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
import LandingPage from "./pages/LandingPage";
import RolodexPage from "./pages/RolodexPage";
import BlueLightFilter from "./components/BlueLightFilter";

const isTouchDevice = () =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

function hideOAuthPreloader() {
  const el = document.getElementById('oauth-preloader');
  if (el) el.style.display = 'none';
}

function hideAppPreloader() {
  const el = document.getElementById('app-preloader');
  if (el) {
    el.style.transition = 'opacity 0.3s ease';
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; }, 300);
  }
}

function OAuthLoadingScreen() {
  useEffect(() => {
    hideOAuthPreloader();
  }, []);
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background">
      <span className="text-3xl text-white font-orbitron font-bold mb-4">
        LYFE<span className="text-white">OS</span>
      </span>
      <div className="w-8 h-8 rounded-full animate-spin border-2 border-white border-t-transparent" />
      <p className="text-muted-foreground text-sm mt-4">Signing you in...</p>
    </div>
  );
}

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
              return resp.json().then(data => {
                if (data && data.user) {
                  localStorage.setItem("lyfeos_user", JSON.stringify(data.user));
                  window.location.reload();
                }
              });
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
      hideAppPreloader();
      navigate("/login", { replace: true });
    }
  }, [isAuthenticated, isLoading, isRecoveringSession, navigate]);

  if (isLoading || isRecoveringSession) {
    const savedColor = localStorage.getItem('lyfeos-primary-color');
    const spinnerColor = (savedColor && savedColor !== '#ffffff') ? savedColor : '#fff';
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background z-50">
        <div className="flex flex-col items-center gap-4">
          <span className="text-3xl text-white font-orbitron font-bold">LYFE<span className="text-white">OS</span></span>
          <div className="w-8 h-8 rounded-full animate-spin border-2" style={{ borderColor: spinnerColor, borderTopColor: 'transparent' }} />
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      hideAppPreloader();
    }
  }, [isAuthenticated, isLoading]);

  return isAuthenticated ? <>{children}</> : null;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const routeRedirectRef = React.useRef<string | null>(null);
  
  const wasAuthenticated = React.useRef<boolean | null>(null);
  
  const [isLoginTransition, setIsLoginTransition] = React.useState(false);
  
  useEffect(() => {
    if (!isLoading) {
      hideOAuthPreloader();
    }
  }, [isLoading]);
  
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
    
    // Skip onboarding and ceremony path protection - needed for new users and login ceremony
    if (currentPath.startsWith('/onboarding') || currentPath.startsWith('/ceremony')) {
      return;
    }
    
    // Skip login/register page protection
    if (currentPath === '/login' || currentPath === '/register') {
      return;
    }
    
    // Public paths that don't require auth
    const publicPaths = ['/login', '/register', '/login-success'];
    const exactPublicPaths = ['/subscription'];
    if (publicPaths.some(path => currentPath.startsWith(path)) || exactPublicPaths.includes(currentPath)) {
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
      <Route path="/login">
        {isLoading && localStorage.getItem('lyfeos-oauth-mode') ? (
          <OAuthLoadingScreen />
        ) : <LoginPage />}
      </Route>
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

      <Route path="/tracker">
        <ProtectedRoute>
          <RootLayout>
            <AnalyticsPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/subscription" component={LandingPage} />

      <Route path="/subscription/manage">
        <ProtectedRoute>
          <SubscriptionPage />
        </ProtectedRoute>
      </Route>

      <Route path="/rolodex">
        <ProtectedRoute>
          <RootLayout>
            <RolodexPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      {/* Redirect to dashboard if authenticated, or login if not */}
      <Route path="/">
        {isAuthenticated ? (
          <RootLayout>
            <DashboardPage />
          </RootLayout>
        ) : isLoading && localStorage.getItem('lyfeos-oauth-mode') ? (
          <OAuthLoadingScreen />
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
      <CelebrationProvider>
        <LYFEOSProvider>
          <ThemeProvider>
            <DndProvider backend={isTouchDevice() ? TouchBackend : HTML5Backend} options={isTouchDevice() ? { enableMouseEvents: true } : undefined}>
              <Router />
              <VoiceOverlay />
              <CelebrationOverlay />
              <BlueLightFilter />
              <Toaster />
            </DndProvider>
          </ThemeProvider>
        </LYFEOSProvider>
      </CelebrationProvider>
    </AuthProvider>
  );
}


export default App;
