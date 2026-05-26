"use client";

import Link from "next/link";
import { Reveal, SectionLabel } from "./LandingHelpers";

const PRICING_PLANS = [
  {
    name: "Recruit",
    price: "₱0",
    period: "forever",
    desc: "For new factions beginning their journey.",
    features: [
      "1 active guild",
      "Up to 20 members",
      "Basic activity points",
      "7-day audit history",
      "Standard Discord support",
    ],
    cta: "Start for free",
    href: "/register",
    popular: false,
  },
  {
    name: "Officer",
    price: "₱499",
    period: "per month",
    desc: "For active guilds with regular raids and DKP management.",
    features: [
      "3 active guilds",
      "Unlimited members",
      "Advanced DKP & ledger",
      "Infinite audit history",
      "Custom payout rules",
      "GCash integrations",
      "Priority Discord support",
    ],
    cta: "Get Officer",
    href: "/register",
    popular: true,
  },
  {
    name: "Guild Master",
    price: "₱1,499",
    period: "per month",
    desc: "For multi-guild organizations and alliances.",
    features: [
      "Unlimited guilds",
      "Multi-tenant organization",
      "Custom branding & domain",
      "Developer API & webhooks",
      "Automated audits",
      "Dedicated account officer",
      "24/7 VIP support",
    ],
    cta: "Establish alliance",
    href: "/register",
    popular: false,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="pt-12 pb-32 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <Reveal className="text-center mb-20">
          <SectionLabel>Pricing</SectionLabel>
          <h2 className="mt-6 text-4xl sm:text-5xl lg:text-[56px] leading-[1.05] font-semibold text-white tracking-[-0.022em]">
            Simple, fair pricing.
            <span className="block text-white/40">Built for any size.</span>
          </h2>
          <p className="mt-6 text-base text-white/50 max-w-xl mx-auto">
            Choose your tier. Upgrade or cancel anytime. No surprises.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
          {PRICING_PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 100} className="h-full">
              <div
                className={`relative rounded-2xl p-8 h-full flex flex-col transition-all duration-300 ${
                  plan.popular
                    ? "border border-white/[0.18] bg-white/[0.03]"
                    : "border border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.025]"
                }`}
              >
                {/* Popular ribbon */}
                {plan.popular && (
                  <div className="absolute -top-px left-1/2 -translate-x-1/2 px-3 py-1 rounded-b-md bg-white text-black text-[10px] font-semibold uppercase tracking-[0.18em]">
                    Recommended
                  </div>
                )}

                {/* Header */}
                <div className="mb-6">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/40 font-mono mb-2">
                    Tier {i + 1}
                  </div>
                  <h3 className="text-2xl font-semibold text-white tracking-tight mb-2">
                    {plan.name}
                  </h3>
                  <p className="text-sm text-white/50 leading-relaxed min-h-[48px]">
                    {plan.desc}
                  </p>
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-2 mb-8 pb-8 border-b border-white/[0.06]">
                  <span className="text-5xl font-semibold text-white tracking-[-0.025em]">
                    {plan.price}
                  </span>
                  <span className="text-sm text-white/40">/ {plan.period}</span>
                </div>

                {/* Features */}
                <ul className="space-y-3.5 mb-10 flex-1">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-3 text-sm text-white/75">
                      <svg
                        className="h-4 w-4 shrink-0 mt-0.5 text-white/50"
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
                  className={`block w-full py-3 px-6 rounded-xl text-center font-medium text-sm transition-all duration-200 ${
                    plan.popular
                      ? "bg-white text-black hover:bg-white/90"
                      : "border border-white/[0.10] text-white hover:bg-white/[0.05] hover:border-white/20"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Footnote */}
        <Reveal delay={400} className="mt-12 text-center">
          <p className="text-xs text-white/35">
            All plans include encrypted storage, daily backups, and SOC 2-ready infrastructure.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
