export function BackedBy() {
  return (
    <section className="bg-[#F5F5F5] px-6 py-12">
      <div className="max-w-[88rem] mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 items-center">
        <div className="md:col-span-1">
          <p className="text-black/70 text-base leading-relaxed whitespace-pre-line">
            {"Trusted by top investors\nand modern fintech leaders."}
          </p>
        </div>
        <div className="md:col-span-3 overflow-hidden">
          <div className="backers-track">
            {[1, 2].map((i) => (
              <div key={i} className="flex">
                <span className="mx-10 shrink-0 text-black/50 whitespace-nowrap" style={{ fontFamily: '"Times New Roman", serif', fontWeight: 400, letterSpacing: '0.02em', fontSize: '14px' }}>Sequoia</span>
                <span className="mx-10 shrink-0 text-black/50 whitespace-nowrap uppercase" style={{ fontFamily: '"Arial Black", sans-serif', fontWeight: 900, letterSpacing: '0.08em', fontSize: '16px' }}>STRIPE</span>
                <span className="mx-10 shrink-0 text-black/50 whitespace-nowrap" style={{ fontFamily: 'Impact, sans-serif', fontWeight: 700, letterSpacing: '0.05em', fontSize: '18px' }}>Y Combinator</span>
                <span className="mx-10 shrink-0 text-black/50 whitespace-nowrap" style={{ fontFamily: 'Georgia, serif', fontWeight: 600, letterSpacing: '-0.02em', fontSize: '17px' }}>Andreessen</span>
                <span className="mx-10 shrink-0 text-black/50 whitespace-nowrap" style={{ fontFamily: 'Helvetica, sans-serif', fontWeight: 700, letterSpacing: '-0.01em', fontSize: '15px' }}>Founders Fund</span>
                <span className="mx-10 shrink-0 text-black/50 whitespace-nowrap uppercase" style={{ fontFamily: 'Verdana, sans-serif', fontWeight: 700, letterSpacing: '0.06em', fontSize: '14px' }}>INDEX</span>
                <span className="mx-10 shrink-0 text-black/50 whitespace-nowrap" style={{ fontFamily: '"Courier New", monospace', fontWeight: 700, letterSpacing: '0.18em', fontSize: '14px' }}>ACCEL</span>
                <span className="mx-10 shrink-0 text-black/50 whitespace-nowrap" style={{ fontFamily: 'Palatino, serif', fontWeight: 500, letterSpacing: '0.03em', fontSize: '15px' }}>Lightspeed</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
