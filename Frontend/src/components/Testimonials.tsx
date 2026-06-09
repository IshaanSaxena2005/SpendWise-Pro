import { Star } from 'lucide-react';

const testimonials = [
  {
    name: 'Sarah Jenkins',
    role: 'Freelance Designer',
    text: 'Since using Smart Financial Intelligence, I have finally been able to predict my variable income and manage my taxes without stress. The AI insights are incredibly accurate.',
    avatar: 'SJ'
  },
  {
    name: 'David Chen',
    role: 'Software Engineer',
    text: 'The automated categorization is flawless. It caught three duplicate subscriptions I had forgotten about within the first day of connecting my accounts.',
    avatar: 'DC'
  },
  {
    name: 'Emily & Mark',
    role: 'New Parents',
    text: 'Budgeting for our first child was overwhelming. The forecasting feature helped us see exactly how much we needed to save and where we could cut back.',
    avatar: 'EM'
  }
];

export function Testimonials() {
  return (
    <section className="bg-white px-6 py-24 border-t border-black/5">
      <div className="max-w-[88rem] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-medium text-black mb-4" style={{ letterSpacing: '-0.02em' }}>
            Loved by thousands of users
          </h2>
          <p className="text-black/60 text-lg">
            See how our platform is changing financial lives.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((t, i) => (
            <div key={i} className="bg-[#F5F5F5] rounded-2xl p-8 border border-black/5 hover:shadow-xl hover:shadow-black/5 transition-all duration-300">
              <div className="flex text-black mb-4">
                {[...Array(5)].map((_, j) => <Star key={j} className="w-5 h-5 fill-current" />)}
              </div>
              <p className="text-black/80 mb-6 italic leading-relaxed">"{t.text}"</p>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white border border-black/10 text-black font-medium flex items-center justify-center shadow-sm">
                  {t.avatar}
                </div>
                <div>
                  <h4 className="font-medium text-black">{t.name}</h4>
                  <p className="text-sm text-black/50">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
