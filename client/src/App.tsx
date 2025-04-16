import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { LYFEOSProvider } from "./lib/context";
import DashboardPage from "./pages/DashboardPage";
import QuestsPage from "./pages/QuestsPage";
import AIPage from "./pages/AIPage";
import CodexPage from "./pages/CodexPage";
import SystemsPage from "./pages/SystemsPage";
import OnboardingPage from "./pages/OnboardingPage";
import ProfilePage from "./pages/ProfilePage";
import StatDetailPage from "./pages/StatDetailPage";
import MissionDetailPage from "./pages/MissionDetailPage";
import CalendarPage from "./pages/CalendarPage";
import NotFound from "./pages/not-found";
import MissionPage from "./components/markdown/MissionPage";
import RootLayout from "./components/layout/RootLayout";

function Router() {
  return (
    <Switch>
      <Route path="/onboarding" component={OnboardingPage} />
      
      {/* Wrap main app routes in the layout component */}
      <Route path="/dashboard">
        <RootLayout>
          <DashboardPage />
        </RootLayout>
      </Route>
      
      <Route path="/quests">
        <RootLayout>
          <QuestsPage />
        </RootLayout>
      </Route>
      
      <Route path="/ai">
        <RootLayout>
          <AIPage />
        </RootLayout>
      </Route>
      
      <Route path="/codex">
        <RootLayout>
          <CodexPage />
        </RootLayout>
      </Route>
      
      <Route path="/systems">
        <RootLayout>
          <SystemsPage />
        </RootLayout>
      </Route>
      
      <Route path="/calendar">
        <RootLayout>
          <CalendarPage />
        </RootLayout>
      </Route>
      
      <Route path="/attention">
        <RootLayout>
          <StatDetailPage stat="attention" />
        </RootLayout>
      </Route>
      
      <Route path="/time">
        <RootLayout>
          <StatDetailPage stat="time" />
        </RootLayout>
      </Route>
      
      <Route path="/energy">
        <RootLayout>
          <StatDetailPage stat="energy" />
        </RootLayout>
      </Route>
      
      <Route path="/health">
        <RootLayout>
          <StatDetailPage stat="health" />
        </RootLayout>
      </Route>
      
      <Route path="/experience">
        <RootLayout>
          <StatDetailPage stat="experience" />
        </RootLayout>
      </Route>
      
      <Route path="/profile">
        <ProfilePage />
      </Route>
      
      <Route path="/mission/:missionId">
        <RootLayout>
          <MissionDetailPage />
        </RootLayout>
      </Route>
      
      {/* Mission Page route with slug */}
      <Route path="/mission-page/:slug">
        <RootLayout>
          <div className="container max-w-4xl py-6">
            <MissionPage />
          </div>
        </RootLayout>
      </Route>
      
      {/* Redirect to dashboard from root */}
      <Route path="/">
        <RootLayout>
          <DashboardPage />
        </RootLayout>
      </Route>
      
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <LYFEOSProvider>
      <Router />
      <Toaster />
    </LYFEOSProvider>
  );
}

export default App;
