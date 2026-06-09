import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';

export function Navbar({ onOpenAuth }: { onOpenAuth: (view: 'login' | 'signup') => void }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Home', href: '#' },
    { name: 'Features', href: '#ai-insights' },
    { name: 'Contact', href: '#contact' }
  ];

  return (
    <nav 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled 
          ? 'bg-white/80 backdrop-blur-md border-b border-black/5 shadow-sm py-3' 
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-[88rem] mx-auto px-6 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 z-50">
          <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center">
            <span className="text-white text-sm font-bold tracking-wider">SW</span>
          </div>
          <span className={`text-xl font-semibold tracking-tight ${isScrolled ? 'text-black' : 'text-white md:text-black'}`}>
            SpendWise Pro
          </span>
        </a>

        {/* Desktop Nav */}
        <div className="hidden lg:flex items-center gap-8">
          <ul className="flex items-center gap-6">
            {navLinks.map((link) => (
              <li key={link.name}>
                <a 
                  href={link.href} 
                  className={`text-sm font-medium transition-colors hover:text-black/70 ${isScrolled ? 'text-black/60' : 'text-black/60'}`}
                >
                  {link.name}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => onOpenAuth('login')}
              className="inline-flex items-center justify-center text-black text-sm font-medium px-5 py-2.5 rounded-full hover:bg-black/5 transition-colors"
            >
              Login
            </button>
            <button 
              onClick={() => onOpenAuth('signup')}
              className="inline-flex items-center justify-center bg-black text-white text-sm font-medium px-5 py-2.5 rounded-full hover:bg-gray-800 transition-colors"
            >
              Sign Up
            </button>
          </div>
        </div>

        {/* Mobile Toggle */}
        <button 
          className="lg:hidden z-50 p-2 text-black"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      <div 
        className={`fixed inset-0 bg-white z-40 flex flex-col pt-24 px-6 transition-transform duration-300 lg:hidden ${
          mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <ul className="flex flex-col gap-6 mb-8">
          {navLinks.map((link) => (
            <li key={link.name}>
              <a 
                href={link.href} 
                className="text-2xl font-medium text-black"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.name}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 mt-4">
          <button 
            onClick={() => { setMobileMenuOpen(false); onOpenAuth('login'); }}
            className="w-full inline-flex items-center justify-center border border-black/10 text-black text-lg font-medium px-6 py-4 rounded-full"
          >
            Login
          </button>
          <button 
            onClick={() => { setMobileMenuOpen(false); onOpenAuth('signup'); }}
            className="w-full inline-flex items-center justify-center bg-black text-white text-lg font-medium px-6 py-4 rounded-full"
          >
            Sign Up
          </button>
        </div>
      </div>
    </nav>
  );
}
