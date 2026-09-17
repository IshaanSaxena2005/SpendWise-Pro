import { Mail } from 'lucide-react';
import { Link } from 'react-router-dom';

// lucide-react v1.x dropped brand icons, so GitHub/LinkedIn use matching
// inline SVGs (24×24 viewBox, currentColor) to stay consistent with Mail.
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

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
                aria-label="SpendWise Pro on GitHub"
                className="text-sm font-medium text-black/55 hover:text-black transition-colors duration-200 inline-flex items-center gap-1.5"
              >
                <GithubIcon className="w-3.5 h-3.5 opacity-60" />
                GitHub
              </a>
            </li>
            <li>
              <a
                href="https://www.linkedin.com/in/ishaan-saxena2005/"
                target="_blank" rel="noopener noreferrer"
                aria-label="SpendWise Pro developer on LinkedIn"
                className="text-sm font-medium text-black/55 hover:text-black transition-colors duration-200 inline-flex items-center gap-1.5"
              >
                <LinkedinIcon className="w-3.5 h-3.5 opacity-60" />
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
