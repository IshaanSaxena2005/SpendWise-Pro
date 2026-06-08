import { Mail } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-white px-6 py-16 border-t border-black/10">
      <div className="max-w-[88rem] mx-auto grid grid-cols-1 md:grid-cols-5 gap-10 mb-16">
        <div className="col-span-1 md:col-span-2">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center">
              <span className="text-white text-sm font-bold tracking-wider">SW</span>
            </div>
            <span className="text-xl font-semibold text-black">SpendWise Pro</span>
          </div>
          <p className="text-black/60 max-w-sm mb-6 leading-relaxed">
            The intelligent system for tracking expenses, managing budgets, and forecasting your financial future.
          </p>
          <div className="flex items-center gap-4">
            <a href="#" className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center text-black hover:bg-black hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" /></svg>
            </a>
            <a href="#" className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center text-black hover:bg-black hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" clipRule="evenodd" /></svg>
            </a>
            <a href="#" className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center text-black hover:bg-black hover:text-white transition-colors">
              <Mail className="w-5 h-5" />
            </a>
          </div>
        </div>
        
        <div>
          <h4 className="text-black font-semibold mb-6">Product</h4>
          <ul className="space-y-4">
            <li><a href="#features" className="text-black/60 hover:text-black transition-colors">Features</a></li>
            <li><a href="#analytics" className="text-black/60 hover:text-black transition-colors">Analytics</a></li>
            <li><a href="#ai-insights" className="text-black/60 hover:text-black transition-colors">AI Insights</a></li>
            <li><a href="/login" className="text-black/60 hover:text-black transition-colors">Launch Dashboard</a></li>
          </ul>
        </div>
        
        <div>
          <h4 className="text-black font-semibold mb-6">Technology</h4>
          <ul className="space-y-4">
            <li><a href="#technology" className="text-black/60 hover:text-black transition-colors">Architecture</a></li>
            <li><a href="#about" className="text-black/60 hover:text-black transition-colors">Security</a></li>
            <li><a href="#" className="text-black/60 hover:text-black transition-colors">Machine Learning</a></li>
          </ul>
        </div>
        
        <div>
          <h4 className="text-black font-semibold mb-6">Resources</h4>
          <ul className="space-y-4">
            <li><a href="#contact" className="text-black/60 hover:text-black transition-colors">Contact Support</a></li>
            <li><a href="#" className="text-black/60 hover:text-black transition-colors">Privacy Policy</a></li>
            <li><a href="#" className="text-black/60 hover:text-black transition-colors">Terms of Service</a></li>
          </ul>
        </div>
      </div>
      
      <div className="max-w-[88rem] mx-auto pt-8 border-t border-black/10 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-black/40 text-sm font-medium">
          &copy; {new Date().getFullYear()} SpendiWise Pro. All rights reserved.
        </div>
        <div className="text-black/40 text-sm font-medium">
          Designed with precision and intelligence.
        </div>
      </div>
    </footer>
  );
}
