import { Search, BarChart3, Lightbulb, TrendingUp } from 'lucide-react';

const steps = [
  {
    icon: <Search className="w-6 h-6 text-black" />,
    title: 'Track Expenses',
    description: 'Connect your accounts securely. We automatically import and categorize your transactions.'
  },
  {
    icon: <BarChart3 className="w-6 h-6 text-black" />,
    title: 'Analyze Spending',
    description: 'Visualize where your money goes with beautiful, interactive charts and reports.'
  },
  {
    icon: <Lightbulb className="w-6 h-6 text-black" />,
    title: 'Receive AI Insights',
    description: 'Our AI analyzes your patterns to find savings opportunities and predict future expenses.'
  },
  {
    icon: <TrendingUp className="w-6 h-6 text-black" />,
    title: 'Improve Health',
    description: 'Take actionable steps recommended by the system to increase your net worth.'
  }
];

export function HowItWorks() {
  return (
    <section className="bg-white px-6 py-24">
      <div className="max-w-[88rem] mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-medium text-black mb-4" style={{ letterSpacing: '-0.02em' }}>
            How it works
          </h2>
          <p className="text-black/60 text-lg">
            A simple, streamlined process to get you from financial chaos to total clarity.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
          <div className="hidden lg:block absolute top-12 left-[12%] right-[12%] h-[1px] bg-black/10 z-0"></div>
          
          {steps.map((step, index) => (
            <div key={index} className="relative z-10 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-white border border-black/10 shadow-sm flex items-center justify-center mb-6 relative group">
                <div className="w-16 h-16 rounded-full bg-[#F5F5F5] flex items-center justify-center group-hover:scale-110 transition-transform">
                  {step.icon}
                </div>
              </div>
              <div className="text-xs font-bold text-black/40 mb-2 tracking-widest uppercase">Step {index + 1}</div>
              <h4 className="text-xl font-medium text-black mb-3">{step.title}</h4>
              <p className="text-black/60 max-w-xs">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
