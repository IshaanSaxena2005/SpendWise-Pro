import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { About } from './components/About';
import { DashboardCarousel } from './components/DashboardCarousel';
import { AIIntelligence } from './components/AIIntelligence';
import { CTA } from './components/CTA';
import { Footer } from './components/Footer';
import { AuthModal } from './components/AuthModal';

// Mock components until created
import { DashboardLayout } from './components/dashboard/DashboardLayout';
import { DashboardOverview } from './components/dashboard/DashboardOverview';

function LandingPage() {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');

  const openAuth = (view: 'login' | 'signup') => {
    setAuthView(view);
    setIsAuthOpen(true);
  };

  return (
    <div className="flex flex-col bg-[#F5F5F5] min-h-screen">
      <div className="h-screen flex flex-col overflow-hidden relative">
        <Navbar onOpenAuth={openAuth} />
        <Hero onOpenAuth={openAuth} />
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

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardOverview />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
