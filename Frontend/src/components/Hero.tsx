export function Hero() {
  return (
    <section className="flex-1 px-6 pt-24 pb-6 flex items-end">
      <div className="relative w-full rounded-2xl overflow-hidden" style={{ height: 'calc(100vh - 120px)' }}>
        <video 
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260423_161253_c72b1869-400f-45ed-ac0c-52f68c2ed5bd.mp4"
          autoPlay muted loop playsInline
          className="object-cover absolute inset-0 w-full h-full"
        />
        
        <div className="absolute inset-0 bg-white/10"></div>

        <div className="relative z-10 flex flex-col items-start justify-start h-full p-10 md:p-16 pt-24 md:pt-32">
          <h1 
            className="text-black text-5xl md:text-7xl font-medium leading-[1.1] max-w-2xl mb-6"
            style={{ letterSpacing: '-0.04em' }}
          >
            Take Control of Every Rupee You Spend
          </h1>
          <p 
            className="text-black/70 text-lg md:text-xl max-w-xl mb-10 leading-relaxed font-medium"
            style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
          >
            Track expenses, manage budgets, forecast future spending, and receive AI-powered financial insights—all in one intelligent platform.
          </p>
        </div>
      </div>
    </section>
  );
}
