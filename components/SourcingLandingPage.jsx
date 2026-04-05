import React from 'react';
import { TrendingDown, Building2, DollarSign, ArrowRight } from 'lucide-react';

/** 与 App 主题一致；桌面端 Why / How 同列宽模板，保证 6 个卡片等宽 */
const sectionTint = { backgroundColor: 'color-mix(in srgb, var(--primary) 10%, var(--theme-card-bg, #fff))' };
const iconCircle = { backgroundColor: 'color-mix(in srgb, var(--primary) 14%, var(--theme-card-bg, #fff))' };

const cardShell =
  'rounded-lg border text-center flex flex-col items-center h-full min-h-[120px] md:min-h-[128px] ' +
  'px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] bg-[var(--theme-card-bg,#fff)]';

/** How It Works：区块用淡色底，卡片略抬升，避免与页面底同色糊成一片 */
const howCardShell =
  'rounded-lg border text-center flex flex-col items-center h-full min-h-[120px] md:min-h-[128px] ' +
  'px-3 py-3 bg-[var(--theme-card-bg,#fff)] shadow-[0_2px_12px_rgba(15,23,42,0.08)]';

const cardBorder = { borderColor: 'var(--theme-border)' };

function SectionTitle({ children }) {
  return (
    <h2
      className="text-center font-bold tracking-tight mb-3 md:mb-4 text-[16px] md:text-[17px]"
      style={{ color: 'var(--primary)' }}
    >
      {children}
    </h2>
  );
}

/** 桌面 5 列：卡 | 2rem | 卡 | 2rem | 卡 — Why 中间空缝、How 放箭头，六卡等宽 */
function FiveSlotRow({ children }) {
  return (
    <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)_2rem_minmax(0,1fr)] md:gap-x-2 md:gap-y-0 md:items-stretch max-w-[min(100%,1040px)] mx-auto">
      {children}
    </div>
  );
}

function MidSlot({ children }) {
  return (
    <div className="hidden md:flex w-8 flex-shrink-0 items-center justify-center self-center" aria-hidden>
      {children}
    </div>
  );
}

export function SourcingLandingPage() {
  const whyCards = [
    {
      Icon: TrendingDown,
      title: 'Direct-to-Factory Pricing',
      text: 'Cut out the middlemen. We connect you directly to the source to maximize your profit margins and lower your COGS.',
    },
    {
      Icon: Building2,
      title: 'Vetted & Reliable Suppliers',
      text: 'Our agents verify every factory on-site. Eliminate quality risks and communication barriers instantly.',
    },
    {
      Icon: DollarSign,
      title: '100% Free Sourcing',
      text: 'Pay $0 for our sourcing expertise. You only pay for the products when you are ready to scale.',
    },
  ];

  const howSteps = [
    {
      n: 1,
      title: 'Submit Your Specs',
      text: 'Upload images, links, or a simple description of your target product.',
    },
    {
      n: 2,
      title: 'Expert Matching',
      text: 'We tap into our exclusive network to find the best-matched supplier for your needs.',
    },
    {
      n: 3,
      title: 'Review & Scale',
      text: 'Review your custom quote, check the margins, and add the product to your store with one click.',
    },
  ];

  return (
    <div className="bg-[var(--theme-card-bg,#fff)] text-center">
      {/* Hero */}
      <section className="px-4 pt-3 pb-4 md:pt-4 md:pb-5 bg-[var(--theme-card-bg,#fff)]">
        <div className="max-w-[560px] mx-auto">
          <h1
            className="font-bold tracking-tight mb-2 md:mb-2.5 leading-snug text-[20px] sm:text-[22px] md:text-[24px]"
            style={{ color: 'var(--primary)' }}
          >
            Find Your Next Winning Product
          </h1>
          <p
            className="text-[12px] md:text-[13px] leading-relaxed mb-3 max-w-[520px] mx-auto"
            style={{ color: 'var(--theme-text-secondary)' }}
          >
            Stop Wasting Hours On Manual Research. Describe Your Ideal Product, And Our Expert Agents Will Source It
            Directly From Top-Tier, Vetted Factories.
          </p>
          <a
            href="https://wa.me/8615906600531"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm font-medium text-white rounded-lg px-6 py-2.5 transition-all hover:brightness-105 shadow-sm"
            style={{
              background: 'linear-gradient(180deg, var(--tb-brand-light) 0%, var(--brand-primary-fixed) 100%)',
              border: '1px solid rgba(255,255,255,0.28)',
            }}
          >
            Request A Free Quote
          </a>
          <p className="mt-2 text-[11px] md:text-[12px]" style={{ color: 'var(--theme-text-muted)' }}>
            <span className="mr-1" aria-hidden>
              ⚡
            </span>
            Get A Detailed Response Within 24 Hours.
          </p>
        </div>
      </section>

      {/* Why — 与 How 相同 5 列栅格，中间缝占位，桌面端与 How 卡片同宽 */}
      <section className="px-4 py-4 md:py-5" style={sectionTint}>
        <div className="max-w-[min(100%,1040px)] mx-auto">
          <SectionTitle>Why Source With Us</SectionTitle>
          <FiveSlotRow>
            {whyCards.map(({ Icon, title, text }, i) => (
              <React.Fragment key={title}>
                {i > 0 ? <MidSlot /> : null}
                <div className={`${cardShell} min-w-0`} style={cardBorder}>
                  <div
                    className="w-9 h-9 rounded-full mb-2 flex items-center justify-center flex-shrink-0"
                    style={iconCircle}
                  >
                    <Icon className="w-[18px] h-[18px]" strokeWidth={2} style={{ color: 'var(--brand-primary-fixed)' }} />
                  </div>
                  <h3 className="text-[13px] font-semibold mb-1.5 leading-snug w-full" style={{ color: 'var(--primary)' }}>
                    {title}
                  </h3>
                  <p className="text-[11px] md:text-xs leading-snug w-full" style={{ color: 'var(--theme-text-secondary)' }}>
                    {text}
                  </p>
                </div>
              </React.Fragment>
            ))}
          </FiveSlotRow>
        </div>
      </section>

      {/* How — 与 Why 相同淡色区底 + 白卡片，层次更清晰 */}
      <section className="px-4 py-4 md:py-5" style={sectionTint}>
        <div className="max-w-[min(100%,1040px)] mx-auto">
          <SectionTitle>How It Works</SectionTitle>
          <FiveSlotRow>
            {howSteps.map((step, idx) => (
              <React.Fragment key={step.n}>
                {idx > 0 ? (
                  <>
                    <MidSlot>
                      <ArrowRight className="w-[18px] h-[18px] flex-shrink-0" style={{ color: 'var(--brand-primary-fixed)' }} />
                    </MidSlot>
                    <div className="flex md:hidden justify-center py-0.5">
                      <span className="text-[10px]" style={{ color: 'var(--theme-text-muted)' }}>
                        ↓
                      </span>
                    </div>
                  </>
                ) : null}
                <div className={`${howCardShell} min-w-0`} style={cardBorder}>
                  <div
                    className="w-9 h-9 rounded-full mb-2 flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ ...iconCircle, color: 'var(--brand-primary-fixed)' }}
                  >
                    {step.n}
                  </div>
                  <h3 className="text-[13px] font-semibold mb-1 leading-snug w-full" style={{ color: 'var(--primary)' }}>
                    {step.title}
                  </h3>
                  <p
                    className="text-[11px] md:text-xs leading-snug flex-1 w-full"
                    style={{ color: 'var(--theme-text-secondary)' }}
                  >
                    {step.text}
                  </p>
                </div>
              </React.Fragment>
            ))}
          </FiveSlotRow>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-4 py-4 md:py-5 pb-5" style={sectionTint}>
        <div className="max-w-[560px] mx-auto">
          <p className="text-[12px] md:text-[13px] mb-2" style={{ color: 'var(--theme-text-secondary)' }}>
            Ready To Optimize Your Supply Chain?
          </p>
          <a
            href="https://dropshipping.tangbuy.com/en-US/source/inProgress"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm font-medium text-white rounded-lg px-6 py-2.5 transition-all hover:brightness-105 shadow-sm"
            style={{
              background: 'linear-gradient(180deg, var(--tb-brand-light) 0%, var(--brand-primary-fixed) 100%)',
              border: '1px solid rgba(255,255,255,0.28)',
            }}
          >
            Start My Sourcing Request
          </a>
          <p className="mt-2 text-[11px] md:text-xs" style={{ color: 'var(--theme-text-muted)' }}>
            Join 1,000+ E-Commerce Sellers Scaling With Factory-Direct Pricing.
          </p>
        </div>
      </section>
    </div>
  );
}

export default SourcingLandingPage;
