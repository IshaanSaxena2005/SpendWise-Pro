import { BrowserRouter as Router, Routes, Route, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';

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
import { ExpensesPage } from './components/dashboard/ExpensesPage';
import { BudgetsPage } from './components/dashboard/BudgetsPage';
import { AnalyticsPage } from './components/dashboard/AnalyticsPage';
import { InsightsPage } from './components/dashboard/InsightsPage';
import { ProfilePage } from './components/dashboard/ProfilePage';
import { SettingsPage } from './components/dashboard/SettingsPage';

// ─── Landing Page ────────────────────────────────────────────────────────────
function LandingPage() {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authView, setAuthView]     = useState<'login' | 'signup' | 'forgot-password' | 'reset-password'>('login');
  const [searchParams, setSearchParams] = useSearchParams();
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [deletedToast, setDeletedToast] = useState(false);

  useEffect(() => {
    let shouldUpdateParams = false;

    if (searchParams.get('verified') === 'true') {
      setTimeout(() => {
      setAuthView('login');
      setVerificationSuccess(true);
      setIsAuthOpen(true);
    }, 0);
    searchParams.delete('verified');
    shouldUpdateParams = true;
    }

    if (searchParams.has('reset_token')) {
      // Delay state updates to avoid React warning about synchronous setState in useEffect
      setTimeout(() => {
        setAuthView('reset-password');
        setIsAuthOpen(true);
      }, 0);
    }



    if (searchParams.get('deleted') === 'true') {
      setTimeout(() => setDeletedToast(true), 0);
      searchParams.delete('deleted');
      shouldUpdateParams = true;
      setTimeout(() => setDeletedToast(false), 5000);
    }

    if (shouldUpdateParams) {
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const openAuth = (view: 'login' | 'signup' | 'forgot-password' | 'reset-password') => {
    setAuthView(view);
    setIsAuthOpen(true);
    setVerificationSuccess(false);
  };

  return (
    <div className="flex flex-col bg-white min-h-screen relative">
      {/* Deleted Account Toast */}
      {deletedToast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] bg-emerald-50 border border-emerald-200 text-emerald-800 px-6 py-3 rounded-full shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium text-sm">Your account and all associated data have been permanently deleted.</span>
        </div>
      )}

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
        onClose={() => {
          setIsAuthOpen(false);
          // Clean up reset_token from URL on close if present
          if (searchParams.has('reset_token')) {
            searchParams.delete('reset_token');
            setSearchParams(searchParams, { replace: true });
          }
        }}
        initialView={authView}
        verificationSuccess={verificationSuccess}
        resetToken={searchParams.get('reset_token')}
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
