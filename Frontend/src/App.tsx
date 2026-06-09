import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState } from 'react';

// Landing page components (untouched)
import { Navbar }           from './components/Navbar';
import { Hero }             from './components/Hero';
import { About }            from './components/About';
import { DashboardCarousel} from './components/DashboardCarousel';
import { AIIntelligence }   from './components/AIIntelligence';
import { CTA }              from './components/CTA';
import { Footer }           from './components/Footer';
import { AuthModal }        from './components/AuthModal';

// Dashboard shell
import { DashboardLayout }  from './components/dashboard/DashboardLayout';

// Dashboard pages
import { DashboardOverview} from './components/dashboard/DashboardOverview';
import { ExpensesPage }     from './components/dashboard/ExpensesPage';
import { BudgetsPage }      from './components/dashboard/BudgetsPage';
import { AnalyticsPage }    from './components/dashboard/AnalyticsPage';
import { InsightsPage }     from './components/dashboard/InsightsPage';

// ─── Landing Page (video hero kept exactly as-is) ────────────────────────────
function LandingPage() {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authView, setAuthView]     = useState<'login' | 'signup'>('login');

  const openAuth = (view: 'login' | 'signup') => {
    setAuthView(view);
    setIsAuthOpen(true);
  };

  return (
    <div className="flex flex-col bg-[#F5F5F5] min-h-screen">
      <div className="h-screen flex flex-col overflow-hidden relative">
        <Navbar onOpenAuth={openAuth} />
        <Hero  onOpenAuth={openAuth} />
      </div>

      <About />
      <DashboardCarousel />
      <AIIntelligence />
      <CTA />
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
        {/* Landing page — video hero preserved */}
        <Route path="/" element={<LandingPage />} />

        {/* Dashboard — all inner pages nested under shared layout */}
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index                   element={<DashboardOverview />} />
          <Route path="expenses"         element={<ExpensesPage />} />
          <Route path="budgets"          element={<BudgetsPage />} />
          <Route path="analytics"        element={<AnalyticsPage />} />
          <Route path="insights"         element={<InsightsPage />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
