"use client";

import Link from "next/link";
import { Reveal, Scroll3D, SpotlightCard } from "./LandingHelpers";

const PRICING_PLANS = [
  {
    name: "Starter",
    price: "₱0",
    period: "forever",
    desc: "For new factions beginning their journey.",
    features: [
      "1 active guild workspace",
      "Up to 25 member roster",
      "Basic raid attendance logs",
      "Guild Points (GP) rankings",
      "7-day ledger audit history",
      "Standard Discord support",
    ],
    cta: "Start for free",
    href: "/register",
    popular: false,
  },
  {
    name: "Guild Pro",
    price: "₱499",
    period: "per month",
    desc: "For active guilds with regular raids, timers, and GP payouts.",
    features: [
      "3 active guild workspaces",
      "Unlimited members roster",
      "Live boss spawn timers",
      "Boss rotation priority queue",
      "Interactive DKP bidding auctions",
      "GCash automated payout splits",
      "Priority Discord channel support",
    ],
    cta: "Get Guild Pro",
    href: "/register",
    popular: true,
  },
  {
    name: "Alliance",
    price: "₱1,499",
    period: "per month",
    desc: "For massive multi-guild coalitions and gaming alliances.",
    features: [
      "Unlimited guild workspaces",
      "Multi-guild coalitions & alliances",
      "Custom domain & guild branding",
      "Tamper-proof on-chain audit logs",
      "Developer APIs & webhook sync",
      "Dedicated guild manager account",
      "24/7 VIP priority support",
    ],
    cta: "Establish alliance",
    href: "/register",
    popular: false,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="pt-12 pb-32 relative overflow-hidden bg-[#050608]">
      <div className="absolute inset-0 bg-grid opacity-10 bg-grid-fade pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-r from-[#d4a853]/5 to-[#f5c542]/5 blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <Reveal className="mb-20 text-center">
          <h2 className="font-fantasy text-4xl font-semibold tracking-[-0.02em] text-white sm:text-5xl lg:text-6xl">
            Simple, transparent tribute.
            <span className="mt-2 block text-gold-sheen">Sized for any division.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[#8B8F98]">
            Pick your operations tier, claim boss loops, coordinate payouts, and
            track guild points. Upgrade or cancel anytime.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch max-w-5xl mx-auto">
          {PRICING_PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 100} className="h-full">
              <Scroll3D rotateX={4} rotateY={plan.popular ? 2 : 0} scaleFrom={0.96} liftFrom={25} className="h-full">
                <SpotlightCard
                  style={plan.popular ? { overflow: "visible" } : undefined}
                  className={`rounded-2xl p-8 h-full flex flex-col transition-all duration-300 card-obsidian border border-white/[0.05] ${
                    plan.popular
                      ? "border-[#d4a853]/45 glow-gold bg-[#0d0d14]/85 scale-[1.02] z-10 shadow-[0_20px_50px_rgba(212,168,83,0.1)]"
                      : "bg-[#0b0b10]/80 hover:border-white/[0.12] hover:bg-white/[0.02]"
                  }`}
                >
                  {/* Popular ribbon */}
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-[#d4a853] to-[#f5c542] text-black text-[9px] font-extrabold uppercase tracking-[0.2em] shadow-[0_0_12px_rgba(212,168,83,0.4)]">
                      RECOMMENDED
                    </div>
                  )}

                  {/* Header */}
                  <div className="mb-6">
                    <div className="text-[9px] uppercase tracking-[0.22em] text-[#d4a853] font-mono mb-2">
                      Tier {i + 1}
                    </div>
                    <h3 className="text-2xl font-bold text-white font-fantasy tracking-wider mb-2">
                      {plan.name}
                    </h3>
                    <p className="text-xs text-[#8B8F98] leading-relaxed min-h-[48px]">
                      {plan.desc}
                    </p>
                  </div>

                  {/* Price */}
                  <div className="flex items-baseline gap-2 mb-8 pb-8 border-b border-white/[0.06]">
                    <span className={`inline-flex items-baseline ${plan.popular ? "text-gold-sheen" : "text-gold-gradient"}`}>
                      <span className="font-sans text-3xl font-bold leading-none mr-0.5">₱</span>
                      <span className="text-5xl font-extrabold tracking-wide font-fantasy leading-none">
                        {plan.price.replace("₱", "")}
                      </span>
                    </span>
                    <span className="text-xs text-white/40 font-mono">/ {plan.period}</span>
                  </div>

                  {/* Features */}
                  <ul className="space-y-4 mb-10 flex-1">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-3 text-xs text-white/85">
                        <svg
                          className="h-4 w-4 shrink-0 mt-0.5 text-[#f5c542]"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <Link
                    href={plan.href}
                    className={`beam-host relative block w-full py-3 px-6 rounded-xl text-center font-bold text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                      plan.popular
                        ? "btn-primary shadow-[0_0_16px_rgba(212,168,83,0.25)]"
                        : "border border-white/[0.08] text-white hover:bg-white/[0.05] hover:border-white/20"
                    }`}
                  >
                    <span className="beam" aria-hidden />
                    {plan.cta}
                  </Link>
                </SpotlightCard>
              </Scroll3D>
            </Reveal>
          ))}
        </div>

        {/* Footnote */}
        <Reveal delay={400} className="mt-16 flex items-center justify-center">
          <p className="inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-[#8B8F98]/40 font-mono">
            <svg className="h-3 w-3 text-[#d4a853]/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            Every plan secured with RSA-4096 encryption and SOC-2 compliant ledgers
          </p>
        </Reveal>
      </div>
    </section>
  );
}

