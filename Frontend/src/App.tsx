import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState } from 'react';

// Landing page components
import { Navbar }            from './components/Navbar';
import { Hero }              from './components/Hero';
import { DashboardCarousel } from './components/DashboardCarousel';
import { AIIntelligence }    from './components/AIIntelligence';
import { About }             from './components/About';
import { ProjectHighlights } from './components/ProjectHighlights';
import { Footer }            from './components/Footer';
import { AuthModal }         from './components/AuthModal';

// Dashboard layout
import { DashboardLayout }   from './components/dashboard/DashboardLayout';

// Dashboard pages
import { DashboardOverview } from './components/dashboard/DashboardOverview';
import { ExpensesPage }      from './components/dashboard/ExpensesPage';
import { BudgetsPage }       from './components/dashboard/BudgetsPage';
import { AnalyticsPage }     from './components/dashboard/AnalyticsPage';
import { InsightsPage }      from './components/dashboard/InsightsPage';
import { ProfilePage }       from './components/dashboard/ProfilePage';
import { SettingsPage }      from './components/dashboard/SettingsPage';

// ─── Landing Page ────────────────────────────────────────────────────────────
function LandingPage() {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authView, setAuthView]     = useState<'login' | 'signup'>('login');

  const openAuth = (view: 'login' | 'signup') => {
    setAuthView(view);
    setIsAuthOpen(true);
  };

  return (
    <div className="flex flex-col bg-white min-h-screen">
      {/* 1. Navbar */}
      <div className="h-screen flex flex-col overflow-hidden relative">
        <Navbar onOpenAuth={openAuth} />
        {/* 2. Hero Section */}
        <Hero />
      </div>

      {/* 3. Dashboard Preview Section */}
      <DashboardCarousel />

      {/* 4. AI Insights Section */}
      <AIIntelligence />

      {/* 5. How SpendWise Works Section */}
      <About />

      {/* 6. Project Highlights Section */}
      <ProjectHighlights />

      {/* 7. Footer */}
      <Footer />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        initialView={authView}
      />
    </div>
  );
}

// ─── App Router ──────────────────────────────────────────────────────────────
function App() {
  return (
    <Router>
      <Routes>
        {/* Landing page */}
        <Route path="/" element={<LandingPage />} />

        {/* Dashboard — all inner pages nested under shared layout */}
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index                   element={<DashboardOverview />} />
          <Route path="expenses"         element={<ExpensesPage />} />
          <Route path="budgets"          element={<BudgetsPage />} />
          <Route path="analytics"        element={<AnalyticsPage />} />
          <Route path="insights"         element={<InsightsPage />} />
          <Route path="profile"          element={<ProfilePage />} />
          <Route path="settings"         element={<SettingsPage />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
