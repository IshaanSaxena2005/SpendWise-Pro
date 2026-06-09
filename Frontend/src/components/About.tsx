import { Shield, LineChart, TrendingUp, Lightbulb } from 'lucide-react';

export function About() {
  const highlights = [
    { icon: <Shield className="w-5 h-5" />, title: 'Security' },
    { icon: <LineChart className="w-5 h-5" />, title: 'Analytics' },
    { icon: <TrendingUp className="w-5 h-5" />, title: 'Forecasting' },
    { icon: <Lightbulb className="w-5 h-5" />, title: 'Intelligence' }
  ];

  return (
    <section id="about" className="bg-white px-6 py-24 border-y border-black/5">
      <div className="max-w-[88rem] mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
        <div>
          <h2 className="text-4xl md:text-5xl font-medium text-black mb-8" style={{ letterSpacing: '-0.02em' }}>
            Why SpendWise Pro
          </h2>
          <p className="text-black/70 text-lg leading-relaxed mb-8">
            SpendiWise Pro helps individuals understand, improve, and predict their financial behavior through analytics, forecasting, and intelligent recommendations.
          </p>
          <p className="text-black/70 text-lg leading-relaxed mb-10">
            We believe that managing your money shouldn't require complex spreadsheets or a degree in finance. By harnessing the power of artificial intelligence, we do the heavy lifting for you.
          </p>
          
          <div className="grid grid-cols-2 gap-6">
            {highlights.map((h, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center text-black shrink-0">
                  {h.icon}
                </div>
                <span className="font-medium text-black">{h.title}</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="relative h-[500px] rounded-3xl bg-[#F5F5F5] overflow-hidden p-8 flex flex-col justify-end">
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent z-10"></div>
          <img 
            src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop" 
            alt="Data Analytics" 
            className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-50"
          />
          <div className="relative z-20">
            <h3 className="text-2xl font-medium text-white mb-2">Data-Driven Decisions</h3>
            <p className="text-white/80">Empowering your financial journey with clarity.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
