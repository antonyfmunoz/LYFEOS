import React, { Suspense, useEffect } from "react";
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
import RootLayout from "./components/layout/RootLayout";
import VoiceOverlay from "./components/VoiceOverlay";
import BlueLightFilter from "./components/BlueLightFilter";
import { setHapticEnabled } from "./lib/haptics";
import { setSoundEnabled } from "./lib/sounds";

const DashboardPage = React.lazy(() => import("./pages/DashboardPage"));
const QuestsPage = React.lazy(() => import("./pages/QuestsPage"));
const AIPage = React.lazy(() => import("./pages/AIPage"));
const ChronilogPage = React.lazy(() => import("./pages/ChronilogPage"));
const TimelinePage = React.lazy(() => import("./pages/TimelinePage"));
const TimelineDetailPage = React.lazy(() => import("./pages/TimelineDetailPage"));
const OnboardingPage = React.lazy(() => import("./pages/OnboardingPage"));
const CeremonyPage = React.lazy(() => import("./pages/CeremonyPage"));
const ProfilePage = React.lazy(() => import("./pages/ProfilePage"));
const MissionDetailPage = React.lazy(() => import("./pages/MissionDetailPage"));
const MissionReviewPage = React.lazy(() => import("./pages/MissionReviewPage"));
const KanbanBoardPage = React.lazy(() => import("./pages/KanbanBoardPage"));
const StreakDetailPage = React.lazy(() => import("./pages/StreakDetailPage"));
const EfficiencyDetailPage = React.lazy(() => import("./pages/EfficiencyDetailPage"));
const EnergyDetailPage = React.lazy(() => import("./pages/EnergyDetailPage"));
const HealthDetailPage = React.lazy(() => import("./pages/HealthDetailPage"));
const WealthDetailPage = React.lazy(() => import("./pages/WealthDetailPage"));
const AttentionDetailPage = React.lazy(() => import("./pages/AttentionDetailPage"));
const TimeDetailPage = React.lazy(() => import("./pages/TimeDetailPage"));
const ExperienceDetailPage = React.lazy(() => import("./pages/ExperienceDetailPage"));
const NotFound = React.lazy(() => import("./pages/not-found"));
const EnhancedMissionPage = React.lazy(() => import("./pages/EnhancedMissionPage"));
const LoginPage = React.lazy(() => import("./pages/LoginPage"));
const RegisterPage = React.lazy(() => import("./pages/RegisterPage"));
const JournalArchivePage = React.lazy(() => import("./pages/JournalArchivePage"));
const MissionArchivePage = React.lazy(() => import("./pages/MissionArchivePage"));
const RitualsArchivePage = React.lazy(() => import("./pages/RitualsArchivePage"));
const KnowledgeArchivePage = React.lazy(() => import("./pages/KnowledgeArchivePage"));
const GoalsArchivePage = React.lazy(() => import("./pages/GoalsArchivePage"));
const AnalyticsPage = React.lazy(() => import("./pages/AnalyticsPage"));
const ForgotPasswordPage = React.lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = React.lazy(() => import("./pages/ResetPasswordPage"));
const LoginSuccessPage = React.lazy(() => import("./pages/LoginSuccessPage"));
const SubscriptionPage = React.lazy(() => import("./pages/SubscriptionPage"));
const LandingPage = React.lazy(() => import("./pages/LandingPage"));
const RolodexPage = React.lazy(() => import("./pages/RolodexPage"));
const DocumentVaultPage = React.lazy(() => import("./pages/DocumentVaultPage"));
const SpreadsheetsPage = React.lazy(() => import("./pages/SpreadsheetsPage"));
const SpreadsheetEditorPage = React.lazy(() => import("./pages/SpreadsheetEditorPage"));
const CanvasesPage = React.lazy(() => import("./pages/CanvasesPage"));
const CanvasEditorPage = React.lazy(() => import("./pages/CanvasEditorPage"));
const SearchPage = React.lazy(() => import("./pages/SearchPage"));
const TablesPage = React.lazy(() => import("./pages/TablesPage"));
const TableEditorPage = React.lazy(() => import("./pages/TableEditorPage"));
const FormPage = React.lazy(() => import("./pages/FormPage"));
const AutomationsPage = React.lazy(() => import("./pages/AutomationsPage"));
const ProjectsPage = React.lazy(() => import("./pages/ProjectsPage"));
const MessagesPage = React.lazy(() => import("./pages/MessagesPage"));
const WaitlistPage = React.lazy(() => import("./pages/WaitlistPage"));
const WaitlistThankYouPage = React.lazy(() => import("./pages/WaitlistThankYouPage"));

const isTouchDevice = () =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

function setAccessCookie(value: string) {
  document.cookie = `lyfeos_access=${value}; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`;
}

function getAccessCookie(): boolean {
  return document.cookie.split(';').some(c => c.trim().startsWith('lyfeos_access=true'));
}

function isStandaloneMode(): boolean {
  return (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
}

function hasAccess(): boolean {
  if (isStandaloneMode() && !window.location.pathname.startsWith('/waitlist')) {
    grantAccess();
    return true;
  }
  return localStorage.getItem('lyfeos_access') === 'true' || getAccessCookie();
}

function grantAccess() {
  localStorage.setItem('lyfeos_access', 'true');
  setAccessCookie('true');
}

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
  const root = document.getElementById('root');
  if (root) root.style.visibility = 'visible';
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

function RouteLoadingScreen() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-7 w-7 rounded-full animate-spin border-2 border-primary border-t-transparent" />
        <span className="text-sm">Loading LyfeOS…</span>
      </div>
    </div>
  );
}

function HapticInit() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    fetch("/api/profile", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setHapticEnabled(data.hapticFeedback !== false);
          setSoundEnabled(data.soundEffects !== false);
        }
      })
      .catch(() => {});
  }, [user?.id]);
  return null;
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
        }, 2500);

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

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      hideAppPreloader();
    }
  }, [isAuthenticated, isLoading]);

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
  
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('access') === 'beta') {
      grantAccess();
      searchParams.delete('access');
      const cleanUrl = window.location.pathname + (searchParams.toString() ? '?' + searchParams.toString() : '');
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);

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

    if (currentPath.startsWith('/review-mission')) {
      grantAccess();
    }

    if (isAuthenticated) {
      grantAccess();
    }

    const userHasAccess = hasAccess();
    const isWaitlistPath = currentPath.startsWith('/waitlist');

    if (!userHasAccess && !isAuthenticated && !isWaitlistPath) {
      navigate('/waitlist', { replace: true });
      return;
    }

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
      } else if (userHasAccess) {
        console.log('Not authenticated at root, redirecting to login');
        navigate('/login', { replace: true });
      } else {
        console.log('No access at root, redirecting to waitlist');
        navigate('/waitlist', { replace: true });
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
    const publicPaths = ['/login', '/register', '/login-success', '/waitlist', '/review-mission'];
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
    <Suspense fallback={<RouteLoadingScreen />}>
    <Switch>
      {/* Public routes */}
      <Route path="/login">
        {isLoading && localStorage.getItem('lyfeos-oauth-mode') ? (
          <OAuthLoadingScreen />
        ) : <LoginPage />}
      </Route>
      <Route path="/register" component={RegisterPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/login-success" component={LoginSuccessPage} />
      <Route path="/review-mission" component={MissionReviewPage} />
      
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

      <Route path="/calendar">
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
            <ProjectsPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/projects">
        <ProtectedRoute><RootLayout><ProjectsPage /></RootLayout></ProtectedRoute>
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
      
      <Route path="/wealth">
        <ProtectedRoute>
          <RootLayout>
            <WealthDetailPage />
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

      <Route path="/waitlist/thank-you" component={WaitlistThankYouPage} />
      <Route path="/waitlist" component={WaitlistPage} />

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

      <Route path="/document-vault">
        <ProtectedRoute>
          <RootLayout>
            <DocumentVaultPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/messages">
        <ProtectedRoute>
          <RootLayout>
            <MessagesPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/spreadsheets/new">
        <ProtectedRoute><RootLayout><SpreadsheetEditorPage /></RootLayout></ProtectedRoute>
      </Route>

      <Route path="/spreadsheets/:spreadsheetId">
        <ProtectedRoute><RootLayout><SpreadsheetEditorPage /></RootLayout></ProtectedRoute>
      </Route>

      <Route path="/spreadsheets">
        <ProtectedRoute><RootLayout><SpreadsheetsPage /></RootLayout></ProtectedRoute>
      </Route>

      <Route path="/canvases/new">
        <ProtectedRoute><RootLayout><CanvasEditorPage /></RootLayout></ProtectedRoute>
      </Route>

      <Route path="/canvases/:canvasId">
        <ProtectedRoute><RootLayout><CanvasEditorPage /></RootLayout></ProtectedRoute>
      </Route>

      <Route path="/canvases">
        <ProtectedRoute><RootLayout><CanvasesPage /></RootLayout></ProtectedRoute>
      </Route>

      <Route path="/search">
        <ProtectedRoute><RootLayout><SearchPage /></RootLayout></ProtectedRoute>
      </Route>

      <Route path="/databases/:databaseId">
        <ProtectedRoute><RootLayout><TableEditorPage /></RootLayout></ProtectedRoute>
      </Route>

      <Route path="/databases">
        <ProtectedRoute><RootLayout><TablesPage /></RootLayout></ProtectedRoute>
      </Route>

      <Route path="/forms/:formId">
        <ProtectedRoute><RootLayout><FormPage /></RootLayout></ProtectedRoute>
      </Route>

      <Route path="/automations">
        <ProtectedRoute><RootLayout><AutomationsPage /></RootLayout></ProtectedRoute>
      </Route>
      
      {/* Redirect to dashboard if authenticated, or login if not */}
      <Route path="/">
        {isAuthenticated ? (
          <RootLayout>
            <DashboardPage />
          </RootLayout>
        ) : isLoading && localStorage.getItem('lyfeos-oauth-mode') && !hasAccess() ? (
          <OAuthLoadingScreen />
        ) : <LoginPage />}
      </Route>
      
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
    </Suspense>
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
              <HapticInit />
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
