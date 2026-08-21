import { Mail } from 'lucide-react';
import { Link } from 'react-router-dom';

const stats = [
  { value: '6+',  label: 'Core Features' },
  { value: '2',   label: 'ML Models' },
  { value: '10+', label: 'REST APIs' },
  { value: 'JWT', label: 'Secured' },
];

const quickLinks = [
  { name: 'Home',               href: '#' },
  { name: 'Dashboard Preview',  href: '#preview' },
  { name: 'AI Insights',        href: '#ai-insights' },
  { name: 'About',              href: '#about' },
  { name: 'Privacy Policy',     href: '/privacy', isRoute: true },
  { name: 'Terms of Service',   href: '/terms', isRoute: true },
];

const techStack = ['React', 'Node.js', 'MySQL', 'Python', 'Flask', 'Scikit-Learn'];

export function Footer() {
  const handleScroll = (href: string) => {
    if (href === '#') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (href.startsWith('#')) {
      const el = document.getElementById(href.replace('#', ''));
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <footer className="bg-white border-t border-black/5">

      {/* ── Stats Strip ─────────────────────────────────────────── */}
      <div className="border-b border-black/5">
        <div className="max-w-[1400px] mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex flex-col items-center justify-center bg-[#F5F5F5] rounded-2xl py-5 px-4 border border-black/5"
            >
              <span className="text-2xl font-extrabold text-black tracking-tight">{s.value}</span>
              <span className="text-xs font-medium text-black/40 mt-1 uppercase tracking-widest">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 3-Column Body ───────────────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto px-6 py-14 grid grid-cols-1 md:grid-cols-3 gap-12">

        {/* Col 1 — Brand */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo2.png" alt="SpendWise Pro" className="w-10 h-10 object-contain rounded-xl" />
            <span className="text-lg font-extrabold text-black tracking-tight">SpendWise Pro</span>
          </div>
          <p className="text-sm text-black/45 leading-relaxed max-w-xs">
            AI-Powered Personal Finance Intelligence
          </p>
          <p className="text-xs text-black/30 leading-relaxed max-w-xs">
            A full-stack portfolio project demonstrating end-to-end financial management with machine learning capabilities.
          </p>
        </div>

        {/* Col 2 — Quick Links */}
        <div>
          <h4 className="text-xs font-bold text-black/30 uppercase tracking-widest mb-5">Quick Links</h4>
          <ul className="flex flex-col gap-3">
            {quickLinks.map((link) => (
              <li key={link.name}>
                {link.isRoute ? (
                  <Link
                    to={link.href}
                    className="text-sm font-medium text-black/55 hover:text-black transition-colors duration-200"
                  >
                    {link.name}
                  </Link>
                ) : (
                  <a
                    href={link.href}
                    onClick={(e) => {
                      if (link.href.startsWith('#')) {
                        e.preventDefault();
                        handleScroll(link.href);
                      }
                    }}
                    className="text-sm font-medium text-black/55 hover:text-black transition-colors duration-200"
                  >
                    {link.name}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Col 3 — Developer */}
        <div>
          <h4 className="text-xs font-bold text-black/30 uppercase tracking-widest mb-5">Developer</h4>
          <ul className="flex flex-col gap-3">
            <li>
              <a
                href="https://github.com/IshaanSaxena2005"
                target="_blank" rel="noopener noreferrer"
                className="text-sm font-medium text-black/55 hover:text-black transition-colors duration-200"
              >
                GitHub
              </a>
            </li>
            <li>
              <a
                href="https://www.linkedin.com/in/ishaan-saxena2005/"
                target="_blank" rel="noopener noreferrer"
                className="text-sm font-medium text-black/55 hover:text-black transition-colors duration-200"
              >
                LinkedIn
              </a>
            </li>
            <li>
              <a
                href="mailto:saxenaishaan3@gmail.com"
                className="text-sm font-medium text-black/55 hover:text-black transition-colors duration-200 inline-flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5 opacity-60" />
                Email
              </a>
            </li>
          </ul>
        </div>
      </div>

      {/* ── Bottom Bar ──────────────────────────────────────────── */}
      <div className="border-t border-black/5">
        <div className="max-w-[1400px] mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">

          <div className="text-xs text-black/40 font-medium">
            SpendWise Pro • Personal Finance Management
          </div>

          {/* Tech stack badges */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {techStack.map((tech) => (
              <span
                key={tech}
                className="text-[10px] font-semibold bg-[#F0F0F0] text-black/50 px-2.5 py-1 rounded-full border border-black/5"
              >
                {tech}
              </span>
            ))}
          </div>

          {/* Copyright */}
          <div className="text-xs text-black/35 font-medium whitespace-nowrap">
            &copy; 2026 Ishaan Saxena — SpendWise Pro
          </div>
        </div>
      </div>

    </footer>
  );
}
