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
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#08080a] flex flex-col items-center justify-center gap-5 animate-fade-in relative overflow-hidden">
        {/* Ambient halo */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 50% 40% at 50% 50%, oklch(0.62 0.035 234 / 0.16) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />

        {/* Orbiting authenticate ring */}
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 rounded-2xl border border-white/10" />
          <div
            className="absolute inset-0 rounded-2xl border-t border-r border-white/60 animate-spin"
            style={{ animationDuration: "1.4s" }}
          />
          <div
            className="absolute -inset-3 rounded-3xl border border-white/[0.04]"
            style={{ animation: "spin-slow 8s linear infinite" }}
          >
            <span className="absolute h-1 w-1 rounded-full bg-emerald-400/90 shadow-[0_0_8px_2px_rgba(52,211,153,0.45)] top-0 left-1/2 -translate-x-1/2" />
          </div>
          <svg
            className="absolute inset-0 m-auto h-5 w-5 text-white/80"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>

        <div className="relative flex flex-col items-center gap-1">
          <h2 className="text-sm font-semibold text-white tracking-tight">
            ForgeKeep
          </h2>
          <p className="text-[10px] text-white/40 font-medium tracking-[0.3em] uppercase animate-pulse">
            Entering session!
          </p>
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
