import React, { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { LYFEOSProvider } from "./lib/context";
import { AuthProvider, useAuth } from "./lib/authContext";
import { ThemeProvider } from "./lib/themeContext";
import DashboardPage from "./pages/DashboardPage";
import QuestsPage from "./pages/QuestsPage";
import AIPage from "./pages/AIPage";
import ChronilogPage from "./pages/ChronilogPage";
import SystemsPage from "./pages/SystemsPage";
import OnboardingPage from "./pages/OnboardingPage";
import ProfilePage from "./pages/ProfilePage";
import StatDetailPage from "./pages/StatDetailPage";
import MissionDetailPage from "./pages/MissionDetailPage";
import CalendarPage from "./pages/CalendarPage";
import KanbanPage from "./pages/KanbanPage";
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
import { ContactsPage } from "./pages/ContactsPage";
import { ContactDetailPage } from "./pages/ContactDetailPage";
import SpreadsheetsPage from "./pages/SpreadsheetsPage";
import SpreadsheetDetailPage from "./pages/SpreadsheetDetailPage";
import SpreadsheetNewPage from "./pages/SpreadsheetNewPage";
import CanvasesPage from "./pages/CanvasesPage";
import CanvasDetailPage from "./pages/CanvasDetailPage";
import CanvasNewPage from "./pages/CanvasNewPage";
import GraphsPage from "./pages/GraphsPage";
import GraphDetailPage from "./pages/GraphDetailPage";
import GraphNewPage from "./pages/GraphNewPage";
import TemplatesPage from "./pages/TemplatesPage";
import TemplateDetail from "./pages/TemplateDetail";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  
  // Redirect to login if user is not authenticated and not loading
  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      navigate("/login");
    }
  }, [isAuthenticated, isLoading, navigate]);
  
  // Show empty div while checking authentication
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
    </div>;
  }
  
  // If authenticated, render the children
  return isAuthenticated ? <>{children}</> : null;
}

function Router() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  
  // Redirect from root to dashboard if authenticated, or to login if not
  useEffect(() => {
    if (window.location.pathname === '/') {
      if (isAuthenticated) {
        navigate('/dashboard');
      } else {
        navigate('/login');
      }
    }
  }, [isAuthenticated, navigate]);

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      
      {/* Protected routes with authentication */}
      <Route path="/onboarding">
        <ProtectedRoute>
          <OnboardingPage />
        </ProtectedRoute>
      </Route>
      
      {/* Wrap main app routes in the layout component */}
      <Route path="/dashboard">
        <ProtectedRoute>
          <RootLayout>
            <DashboardPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/quests">
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
      
      {/* Keep old route for compatibility, redirects to new route */}
      <Route path="/codex">
        <ProtectedRoute>
          <RootLayout>
            <ChronilogPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/systems">
        <ProtectedRoute>
          <RootLayout>
            <SystemsPage />
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
      
      {/* Contacts routes */}
      <Route path="/contacts">
        <ProtectedRoute>
          <RootLayout>
            <ContactsPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/contacts/:id">
        <ProtectedRoute>
          <RootLayout>
            <ContactDetailPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      {/* Spreadsheets routes */}
      <Route path="/spreadsheets">
        <ProtectedRoute>
          <RootLayout>
            <SpreadsheetsPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/spreadsheets/new">
        <ProtectedRoute>
          <RootLayout>
            <SpreadsheetNewPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/spreadsheets/:id">
        <ProtectedRoute>
          <RootLayout>
            <SpreadsheetDetailPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      {/* Canvas routes */}
      <Route path="/canvases">
        <ProtectedRoute>
          <RootLayout>
            <CanvasesPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/canvases/new">
        <ProtectedRoute>
          <RootLayout>
            <CanvasNewPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/canvases/:id">
        <ProtectedRoute>
          <RootLayout>
            <CanvasDetailPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      {/* Graph routes */}
      <Route path="/graphs">
        <ProtectedRoute>
          <RootLayout>
            <GraphsPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/graphs/new">
        <ProtectedRoute>
          <RootLayout>
            <GraphNewPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/graphs/:id">
        <ProtectedRoute>
          <RootLayout>
            <GraphDetailPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      {/* Templates routes */}
      <Route path="/templates">
        <ProtectedRoute>
          <RootLayout>
            <TemplatesPage />
          </RootLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/templates/:id">
        <ProtectedRoute>
          <RootLayout>
            <TemplateDetail />
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
      <LYFEOSProvider>
        <ThemeProvider>
          <Router />
          <Toaster />
        </ThemeProvider>
      </LYFEOSProvider>
    </AuthProvider>
  );
}

export default App;
