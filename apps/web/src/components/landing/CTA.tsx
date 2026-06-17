"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Reveal, Magnetic, Scroll3D } from "./LandingHelpers";

function CircularRunes() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const rotationA = scrollY * 0.04;
  const rotationB = scrollY * -0.03;
  const dashoffset = scrollY * 0.22;

  return (
    <div
      className="absolute left-1/2 top-1/2 w-[600px] h-[600px] pointer-events-none opacity-[0.05] select-none -z-10 transition-transform duration-200 ease-out"
      style={{
        transform: "translate3d(-50%, -50%, 0)"
      }}
    >
      <svg
        viewBox="0 0 200 200"
        className="w-full h-full text-[#d4a853]"
      >
        <circle 
          cx="100" 
          cy="100" 
          r="95" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="0.3" 
          strokeDasharray="4, 5" 
          strokeDashoffset={dashoffset}
        />
        <circle 
          cx="100" 
          cy="100" 
          r="85" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="0.5" 
          strokeDasharray="30, 8, 4, 8" 
          strokeDashoffset={-dashoffset * 1.3}
        />
        <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="0.2" strokeDasharray="6, 2" />
        
        <polygon 
          points="100,15 173.6,142.5 26.4,142.5" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="0.3" 
          style={{
            transform: `rotate(${rotationA}deg)`,
            transformOrigin: "100px 100px",
          }}
          className="transition-transform duration-200 ease-out"
        />
        <polygon 
          points="100,185 173.6,57.5 26.4,57.5" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="0.3" 
          style={{
            transform: `rotate(${rotationB}deg)`,
            transformOrigin: "100px 100px",
          }}
          className="transition-transform duration-200 ease-out"
        />
        <circle cx="100" cy="100" r="12" fill="none" stroke="currentColor" strokeWidth="0.5" />
      </svg>
    </div>
  );
}

function FloatingEmbers() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="absolute inset-0 pointer-events-none overflow-hidden select-none -z-10" />;
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none -z-10">
      {Array.from({ length: 12 }).map((_, i) => {
        const size = Math.random() * 2.5 + 1.2;
        const left = Math.random() * 100;
        const top = Math.random() * 60 + 20;
        const delay = Math.random() * 5;
        const duration = Math.random() * 6 + 7;
        const driftX = (Math.random() - 0.5) * 35;
        return (
          <div
            key={i}
            className="absolute rounded-full bg-[#f5c542]/20 blur-[0.5px] animate-particle"
            style={{
              width: size,
              height: size,
              left: `${left}%`,
              top: `${top}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              "--drift-x": `${driftX}px`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

export default function CTA() {
  return (
    <section id="cta" className="py-32 relative overflow-hidden bg-[#050608]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal>
          <Scroll3D rotateX={6} scaleFrom={0.96} liftFrom={30}>
            <div className="relative rounded-3xl border border-white/[0.08] bg-[#0d0d14]/70 backdrop-blur-md overflow-hidden card-obsidian shadow-[0_20px_50px_rgba(0,0,0,0.85)]">
              <CircularRunes />
              <FloatingEmbers />
              
              {/* Inner edge highlight */}
              <div
                className="absolute inset-x-12 top-0 h-px"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(212, 168, 83, 0.3), transparent)",
                }}
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(212, 168, 83, 0.08) 0%, transparent 70%)",
                }}
              />

              <div className="relative p-12 lg:p-20 text-center space-y-8 z-10">
                <div className="text-[10px] text-[#d4a853] uppercase tracking-[0.24em] font-mono font-bold">
                  ESTABLISH YOUR GUILD NOW!
                </div>

                <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-white tracking-tight font-fantasy max-w-3xl mx-auto">
                  Level up your guild.<br />
                  <span className="text-gold-gradient mt-2 block">Command with absolute precision.</span>
                </h2>

                <p className="text-xs text-[#8B8F98] max-w-xl mx-auto leading-relaxed">
                  Join active factions tracking their Boss Schedules & Timer, Boss Attendance, Inventory Management, Alliance Boss Cycles, Accounting System and many more on ForgeKeep.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-2">
                  <Magnetic strength={8}>
                    <Link
                      href="/register"
                      className="group inline-flex items-center gap-2 px-8 h-12 rounded-xl font-bold text-xs uppercase tracking-wider btn-primary shadow-[0_0_16px_rgba(212,168,83,0.3)] transition-all cursor-pointer"
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
                    className="inline-flex items-center gap-2 px-6 h-12 rounded-xl font-semibold text-xs text-white/50 hover:text-white hover:bg-white/[0.03] border border-white/[0.05] transition-all"
                  >
                    Already have an account? Sign In
                  </Link>
                </div>

                <div className="pt-4 flex items-center justify-center gap-5 text-[10px] text-white/35 tracking-wider font-mono uppercase">
                  <span className="inline-flex items-center gap-1.5">
                    <svg className="h-3 w-3 text-[#10D99A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Free to start
                  </span>
                  <span className="h-3 w-px bg-white/10" />
                  <span className="inline-flex items-center gap-1.5">
                    <svg className="h-3 w-3 text-[#10D99A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    No credit card
                  </span>
                  <span className="h-3 w-px bg-white/10" />
                  <span className="inline-flex items-center gap-1.5">
                    <svg className="h-3 w-3 text-[#10D99A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
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
