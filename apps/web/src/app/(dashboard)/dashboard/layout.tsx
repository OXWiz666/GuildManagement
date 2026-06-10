"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { SocketProvider } from "@/components/providers/socket-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, isSessionReady } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router, mounted]);

  if (!mounted || isLoading || !isAuthenticated || !isSessionReady) {
    return (
      <div className="min-h-screen bg-[#08080a] flex flex-col items-center justify-center gap-6 animate-fade-in relative overflow-hidden">
        {/* Ambient background glows */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle 350px at 50% 50%, rgba(245,158,11,0.08) 0%, transparent 100%)",
            filter: "blur(60px)",
          }}
        />

        {/* Premium Spinner and Brand Slot */}
        <div className="relative flex flex-col items-center gap-6 z-10">
          
          {/* Glowing Spinner Container */}
          <div className="relative h-24 w-24 flex items-center justify-center">
            
            {/* Outer Slow Ambient Orbit */}
            <div className="absolute -inset-3.5 rounded-full border border-amber-500/5 premium-loader-spin-slow" />
            
            {/* Outer Orbiting Dot (butter smooth) */}
            <div className="absolute -inset-3.5 rounded-full premium-loader-spin-reverse pointer-events-none">
              <span className="absolute h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_12px_3px_rgba(245,158,11,0.7)] top-0 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>

            {/* Inner Ring Glass Shield */}
            <div className="absolute inset-0 rounded-2xl border border-white/[0.04] bg-white/[0.01] backdrop-blur-sm" />
            
            {/* Elegant Spinning Arc (GPU-accelerated SVG) */}
            <svg className="absolute inset-0 h-full w-full premium-loader-spin" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="spinner-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="1" />
                  <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                </linearGradient>
              </defs>
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke="url(#spinner-grad)"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
                strokeDasharray="180 100"
              />
            </svg>

            {/* Center Brand Icon (Breathing Shield) */}
            <svg
              className="h-7 w-7 text-amber-400 premium-loader-pulse relative z-10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M8 9h8" />
              <path d="M10 9v4l-2 2h8l-2-2V9" />
            </svg>
          </div>

          {/* Typing/Shimmering Branding */}
          <div className="flex flex-col items-center gap-2">
            <h2
              className="text-[17px] font-extrabold uppercase tracking-[0.16em] leading-none"
              style={{
                background: "linear-gradient(90deg, #fff, #f6e3a9, #f59e0b)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              ForgeKeep
            </h2>
            <div className="relative">
              <p className="text-[10px] text-amber-500/50 font-bold tracking-[0.35em] uppercase premium-loader-pulse">
                Entering Session
              </p>
              {/* Gold dots loading indicator */}
              <span className="absolute -right-6 bottom-0.5 flex gap-1 items-center">
                <span className="h-1 w-1 rounded-full bg-amber-400/80 animate-ping animate-duration-1000" style={{ animationDelay: '0ms' }} />
                <span className="h-1 w-1 rounded-full bg-amber-400/80 animate-ping animate-duration-1000" style={{ animationDelay: '300ms' }} />
                <span className="h-1 w-1 rounded-full bg-amber-400/80 animate-ping animate-duration-1000" style={{ animationDelay: '600ms' }} />
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SocketProvider>
      <div className="min-h-screen bg-[#08080a] flex">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 flex flex-col min-w-0 relative">
          <TopBar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
          <main className="flex-1 p-6 lg:p-8 xl:p-10 overflow-auto relative">
            {children}
          </main>
        </div>
      </div>
    </SocketProvider>
  );
}
