"use client";

import Link from "next/link";
import { Reveal, Magnetic, Scroll3D } from "./LandingHelpers";
import { guildApi } from "@/lib/api"; 

export default function CTA() {
  return (
    <section className="py-32 relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <Scroll3D rotateX={6} scaleFrom={0.96} liftFrom={30}>
          <div className="relative rounded-3xl border border-white/[0.08] bg-white/[0.015] overflow-hidden">
            {/* Inner edge highlight */}
            <div
              className="absolute inset-x-12 top-0 h-px"
              style={{
                background: "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.25), transparent)",
              }}
            />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse 60% 50% at 50% 0%, oklch(0.62 0.035 234 / 0.10) 0%, transparent 70%)",
              }}
            />

            <div className="relative p-12 lg:p-20 text-center space-y-8">
              <div className="text-[10px] text-white/40 uppercase tracking-[0.24em]">
                Ready when you are
              </div>

              <h2 className="text-4xl sm:text-5xl lg:text-[64px] leading-[1.02] font-semibold text-white tracking-[-0.025em] max-w-3xl mx-auto">
                Level up your guild.<br />
                <span className="text-white/40">Start in five minutes.</span>
              </h2>

              <p className="text-base text-white/55 max-w-xl mx-auto leading-relaxed">
                Join 50+ guilds already running their treasury, attendance, and raids on GuildMaster.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center pt-2">
                <Magnetic strength={8}>
                  <Link
                    href="/register"
                    className="group inline-flex items-center gap-2 px-7 h-12 rounded-full font-medium text-sm bg-white text-black hover:bg-white/90 transition-colors"
                  >
                    Create your guild
                    <svg
                      className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1"
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </Link>
                </Magnetic>

                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 px-7 h-12 rounded-full font-medium text-sm text-white/70 hover:text-white transition-colors"
                >
                  Already have an account?
                </Link>
              </div>

              <div className="pt-4 flex items-center justify-center gap-5 text-[11px] text-white/35 tracking-wide">
                <span className="inline-flex items-center gap-1.5">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Free to start
                </span>
                <span className="h-3 w-px bg-white/10" />
                <span className="inline-flex items-center gap-1.5">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  No credit card
                </span>
                <span className="h-3 w-px bg-white/10" />
                <span className="inline-flex items-center gap-1.5">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Cancel anytime
                </span>
              </div>
            </div>
          </div>
          </Scroll3D>
        </Reveal>
      </div>
    </section>
  );
}
