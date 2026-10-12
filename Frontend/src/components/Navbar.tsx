import { useState, useEffect, useRef } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';

export function Navbar({ onOpenAuth }: { onOpenAuth: (view: 'login' | 'signup') => void }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('home');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  // Track which landing-page section is currently visible so the matching
  // nav link can show a subtle active state.
  useEffect(() => {
    // Honour a section anchor present on initial load (e.g. /#ai-insights).
    const initialHash = window.location.hash.replace('#', '');
    if (initialHash) setActiveSection(initialHash);

    const sectionIds = ['preview', 'ai-insights', 'about'];
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Activate the section with the largest visible area in the band.
        let best: IntersectionObserverEntry | null = null;
        let bestRatio = 0;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            best = entry;
            bestRatio = entry.intersectionRatio;
          }
        }
        if (best) setActiveSection(best.target.id);
      },
      // Watch a band in the upper-middle of the viewport; the hero is
      // h-screen, so 'home' is handled separately below.
      { rootMargin: '-20% 0px -60% 0px', threshold: [0, 0.05, 0.25, 0.5] }
    );
    observerRef.current = observer;
    sections.forEach((section) => observer.observe(section));

    // Scrolling back near the top always means the Home section.
    const onScroll = () => {
      if (window.scrollY < window.innerHeight * 0.5) setActiveSection('home');
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      observer.disconnect();
      observerRef.current = null;
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const navLinks = [
    { name: 'Home', href: '#' },
    { name: 'Dashboard Preview', href: '#preview', isScrollLink: true },
    { name: 'AI Insights', href: '#ai-insights' },
    { name: 'About', href: '#about' }
  ];

  const NAVBAR_HEIGHT = 80; // matches h-20 on the nav row

  // Shared landing-page button variants — shape/behavior shared here, colors
  // kept at each usage site so the unscrolled transparent-nav variants apply.
  const outlineBtn =
    'inline-flex items-center justify-center rounded-full border font-medium transition-all duration-300 active:scale-95';
  const primaryBtn =
    'inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-all duration-300 active:scale-95';

  const scrollToElement = (element: HTMLElement) => {
    const y = element.getBoundingClientRect().top + window.scrollY - NAVBAR_HEIGHT;
    window.scrollTo({ top: y, behavior: 'smooth' });
  };

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string, isScrollLink?: boolean) => {
    setMobileMenuOpen(false);
    // Give the clicked link immediate active feedback.
    const clickedId = href === '#' ? 'home' : href.slice(1);
    if (clickedId === 'home' || document.getElementById(clickedId)) {
      setActiveSection(clickedId);
    }
    if (href === '#') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (isScrollLink || href.startsWith('#')) {
      e.preventDefault();
      const targetId = href.replace('#', '');
      let element = document.getElementById(targetId);

      // Fallback: find by section id or text content
      if (!element && targetId === 'preview') {
        const sections = document.getElementsByTagName('section');
        for (let i = 0; i < sections.length; i++) {
          if (sections[i].id === 'preview' || sections[i].textContent?.includes('Dashboard That Works')) {
            element = sections[i];
            break;
          }
        }
      }

      if (element) {
        scrollToElement(element);
      }
    }
  };

  return (
    <>
      <nav 
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-in-out ${
          isScrolled 
            ? 'bg-white/75 backdrop-blur-xl border-b border-black/5 shadow-md' 
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
          {/* Brand Logo & Name */}
          <a href="/" onClick={(e) => handleLinkClick(e, '#')} className="flex items-center gap-3 z-50 group h-full">
            <img 
              src="/logo2.png" 
              alt="SpendWise Pro Logo" 
              className="h-full w-auto object-contain transition-transform duration-300 group-hover:scale-105"
              style={{ maxHeight: '72px' }}
            />
            <span className={`text-2xl font-extrabold tracking-tight leading-none transition-colors duration-300 ${
              isScrolled ? 'text-black' : 'text-white md:text-black'
            }`}>
              SpendWise Pro
            </span>
          </a>

          {/* Center Navigation Links */}
          <div className="hidden lg:flex items-center gap-8">
            <ul className="flex items-center gap-8">
              {navLinks.map((link) => {
                const linkId = link.href === '#' ? 'home' : link.href.slice(1);
                const isActive = activeSection === linkId;
                return (
                  <li key={link.name}>
                    <a 
                      href={link.href} 
                      onClick={(e) => handleLinkClick(e, link.href, link.isScrollLink)}
                      aria-current={isActive ? 'true' : undefined}
                      className={`text-sm relative py-1 transition-colors duration-300 group ${
                        isActive
                          ? `font-semibold ${isScrolled ? 'text-black' : 'text-white md:text-black'}`
                          : `font-medium ${
                              isScrolled 
                                ? 'text-black/60 hover:text-black' 
                                : 'text-white/70 hover:text-white md:text-black/60 md:hover:text-black'
                            }`
                      }`}
                    >
                      {link.name}
                      <span className={`absolute bottom-0 left-0 w-full h-[1.5px] transition-transform duration-300 origin-left ${
                        isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                      } ${isScrolled ? 'bg-black' : 'bg-white md:bg-black'}`} />
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Right CTA Actions */}
          <div className="hidden lg:flex items-center gap-4">
            <button 
              onClick={() => onOpenAuth('login')}
              className={`${outlineBtn} text-sm px-5 py-2.5 ${
                isScrolled 
                  ? 'text-black border-black/20 bg-white hover:bg-black/5' 
                  : 'text-white border-white/30 bg-white/10 hover:bg-white/20 md:text-black md:border-black/20 md:bg-white md:hover:bg-black/5'
              }`}
            >
              Login
            </button>
            <button 
              onClick={() => onOpenAuth('signup')}
              className={`${primaryBtn} bg-black text-white text-sm px-5 py-2.5 shadow-sm hover:bg-black/80 hover:scale-105`}
            >
              Get Started Free
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile Toggle Button */}
          <button 
            className={`lg:hidden z-50 p-2 rounded-full transition-colors ${
              mobileMenuOpen 
                ? 'text-black hover:bg-black/5' 
                : isScrolled ? 'text-black hover:bg-black/5' : 'text-white hover:bg-white/10 md:text-black md:hover:bg-black/5'
            }`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-out Mobile Menu */}
      <div 
        className={`fixed inset-y-0 right-0 w-full max-w-sm bg-white z-40 flex flex-col justify-between pt-24 pb-8 px-8 border-l border-black/5 shadow-2xl transition-transform duration-500 ease-in-out lg:hidden ${
          mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <ul className="flex flex-col gap-6">
          {navLinks.map((link) => {
            const linkId = link.href === '#' ? 'home' : link.href.slice(1);
            const isActive = activeSection === linkId;
            return (
              <li key={link.name} className="border-b border-black/5 pb-3">
                <a 
                  href={link.href} 
                  aria-current={isActive ? 'true' : undefined}
                  className={`text-xl transition-colors ${
                    isActive ? 'font-semibold text-black' : 'font-medium text-black/80 hover:text-black'
                  }`}
                  onClick={(e) => handleLinkClick(e, link.href, link.isScrollLink)}
                >
                  {link.name}
                </a>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-3 mt-auto">
          <button 
            onClick={() => { setMobileMenuOpen(false); onOpenAuth('login'); }}
            className={`${outlineBtn} w-full border-black/20 bg-white text-black text-base px-6 py-3.5 hover:bg-black/5`}
          >
            Login
          </button>
          <button 
            onClick={() => { setMobileMenuOpen(false); onOpenAuth('signup'); }}
            className={`${primaryBtn} w-full bg-black text-white text-base px-6 py-3.5 hover:bg-black/80`}
          >
            Get Started Free
          </button>
        </div>
      </div>
    </>
  );
}
